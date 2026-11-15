"""Bounded ElevenLabs speech adapter using the existing research gateway's credentials and ledger.

The user explicitly selected ElevenLabs through OpenRouter for this video. The research
gateway has no binary speech endpoint; this adapter retains its shared budget reservation,
HTTP client and redaction without changing its text-model allowlist or installing packages.
"""
import argparse
import importlib.util
import json
from pathlib import Path
import sys
import uuid

parser = argparse.ArgumentParser()
parser.add_argument('--gateway-root', type=Path, required=True)
parser.add_argument('--output', type=Path, required=True)
parser.add_argument('--lines', type=Path, required=True)
parser.add_argument('--pilot', action='store_true')
selected_voice = json.loads(Path(__file__).with_name('voice-selection.json').read_text())
parser.add_argument('--voice', default=selected_voice['voice_id'])
parser.add_argument('--delivery', default='cheerfully')
parser.add_argument('--stability', type=float, choices=[0.0, 0.5, 1.0])
parser.add_argument('--similarity', type=float)
args = parser.parse_args()
if args.similarity is not None and not 0 <= args.similarity <= 1:
    parser.error('--similarity must be between 0 and 1')
spec = importlib.util.spec_from_file_location('lama_gateway', args.gateway_root / 'tools/scripts/external_services.py')
gateway = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = gateway
spec.loader.exec_module(gateway)
lines = json.loads(args.lines.read_text())
if args.pilot:
    lines = lines[:1]
model = 'elevenlabs/eleven-v4'
voice = args.voice
inputs = ['[' + args.delivery + '] ' + text for text in lines]
voice_settings = {}
if args.stability is not None:
    voice_settings['stability'] = args.stability
if args.similarity is not None:
    voice_settings['similarity_boost'] = args.similarity
options = {'seed': 38}
if voice_settings:
    options['voice_settings'] = voice_settings
estimate = round(sum(len(text) for text in inputs) * 0.00008, 8)
if estimate > 0.30:
    raise SystemExit('Run exceeds the existing $0.30 cap.')
args.output.mkdir(parents=True, exist_ok=True)
manifest_path = args.output / ('pilot.json' if args.pilot else 'speech-run.json')
if manifest_path.exists():
    raise SystemExit('A manifest already exists; collect its result instead of resubmitting.')
manifest = {'id': str(uuid.uuid4()), 'provider': 'ElevenLabs', 'route': 'OpenRouter synchronous speech', 'model': model, 'voice': voice, 'delivery': args.delivery, 'provider_options': options, 'estimated_usd': estimate, 'status': 'starting', 'items': []}
def save():
    manifest_path.write_text(json.dumps(manifest, indent=2) + '\n')
with gateway.ExternalServices() as api:
    if not api.configured('openrouter'):
        raise SystemExit('OpenRouter is not configured.')
    reservation = api._reserve('openrouter', model, {'usd': estimate}, out_dir=str(args.output), persistent=True)
    manifest['reservation_id'] = reservation
    save()
    entries = []
    try:
        for i, text in enumerate(inputs):
            filename = args.output / (f'pilot-{voice}.mp3' if args.pilot else f'voice-{i + 1}.mp3')
            row = {'item': i + 1, 'text': lines[i], 'characters': len(text), 'estimated_usd': round(len(text) * 0.00008, 8), 'status': 'submitted'}
            manifest['items'].append(row); save()
            response = api.client.post('https://openrouter.ai/api/v1/audio/speech', headers={'Authorization': 'Bearer ' + api.env['OPENROUTER_API_KEY']}, json={'model': model, 'input': text, 'voice': voice, 'response_format': 'mp3', 'provider': {'options': {'elevenlabs': options}}}, timeout=120)
            row['http_status'] = response.status_code
            row['generation_id'] = response.headers.get('x-generation-id')
            row['request_id'] = response.headers.get('x-request-id')
            if response.status_code >= 400:
                definitive = 400 <= response.status_code < 500 and response.status_code != 408
                row['status'] = 'rejected' if definitive else 'submission_unknown'
                row['error'] = api.redact_text(response.text)[:1000]
                save()
                raise RuntimeError(f'Speech request rejected: HTTP {response.status_code}')
            if 'audio' not in response.headers.get('content-type', '') or len(response.content) < 1000:
                row['status'] = 'invalid_response'; save()
                raise RuntimeError('Expected complete binary audio.')
            filename.write_bytes(response.content)
            row.update(status='completed', file=filename.name, bytes=len(response.content))
            entries.append({'time': gateway.utc_now(), 'provider': 'openrouter', 'model': model, 'mode': 'speech-sync', 'item': row['generation_id'] or f"{manifest['id']}:{i + 1}", 'list_cost_usd': row['estimated_usd'], 'provider_cost_usd': None, 'cost_basis': 'Estimated at $80 per million characters; provider billing not yet collected', 'work': 'Lama video narration'})
            save()
            print(json.dumps({k:row[k] for k in ['item', 'status', 'generation_id', 'bytes', 'estimated_usd']}), flush=True)
        manifest['status'] = 'completed'
        api._settle(entries, reservation_id=reservation)
    except Exception as exc:
        manifest['status'] = 'failed'
        manifest['error'] = api.redact_text(str(exc))
        # Definitive HTTP rejection can be settled; an uncertain network outcome keeps its reserve.
        if manifest['items'] and manifest['items'][-1]['status'] == 'rejected':
            api._settle(entries, reservation_id=reservation)
        else:
            manifest['accounting_pending'] = True
        save()
        raise SystemExit(manifest['error']) from None
    save()
