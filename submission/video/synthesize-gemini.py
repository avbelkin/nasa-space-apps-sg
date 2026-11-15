"""One user-authorized alternate voice audition through the existing OpenRouter gateway."""
import argparse
import importlib.util
import json
from pathlib import Path
import re
import subprocess
import sys
import wave

p = argparse.ArgumentParser()
p.add_argument('--gateway-root', type=Path, required=True)
p.add_argument('--output', type=Path, required=True)
p.add_argument('--voice', default='Puck')
args = p.parse_args()
args.output.mkdir(parents=True, exist_ok=True)
manifest = args.output / 'speech-run.json'
if manifest.exists():
    raise SystemExit('Existing manifest: collect its generation instead of resubmitting.')
spec = importlib.util.spec_from_file_location('lama_gateway', args.gateway_root / 'tools/scripts/external_services.py')
g = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = g
spec.loader.exec_module(g)
model = 'google/gemini-3.8-flash-tts'
text = 'I’m Lama. I help Alexey. Mostly. Same planet. Same day. But MODIS and VIIRS see different hotspots.'
direction = '''Voice the fictional little BOY alpaca Lama, character age about seven to nine. He must sound unmistakably like a prepubescent cartoon boy: small bright forward nasal resonance, a light boyish rasp, expressive curious intonation and playful confidence. Think of skilled cartoon acting with a clearly BOYISH result. Avoid an adult woman's breathy or feminine narrator sound, an adult man's chest resonance, baby talk, and chipmunk effects. He is little but clever, proudly explaining his favorite map to a friend. Warm energetic conversational delivery; a knowing little pause before Mostly. Clear standard English. Pronounce Alexey uh-LEK-say, MODIS MOH-diss, VIIRS veers. Speak the provided text exactly once, without adding commentary or reading these directions.'''
estimate = 0.02  # Conservative reserve for this short token-priced audio audition.
state = {'model': model, 'voice': args.voice, 'text': text, 'instructions': direction, 'provider': 'Google', 'route': 'OpenRouter synchronous speech', 'estimated_usd': estimate, 'status': 'starting'}
def save():
    manifest.write_text(json.dumps(state, indent=2) + '\n')
with g.ExternalServices() as api:
    if not api.configured('openrouter'):
        raise SystemExit('OpenRouter is not configured.')
    reservation = api._reserve('openrouter', model, {'usd': estimate}, out_dir=str(args.output), persistent=True)
    state.update(status='submitted', reservation_id=reservation)
    save()
    headers = {'Authorization': 'Bearer ' + api.env['OPENROUTER_API_KEY']}
    r = api.client.post('https://openrouter.ai/api/v1/audio/speech', headers=headers, json={'model': model, 'voice': args.voice, 'input': text, 'instructions': direction, 'response_format': 'pcm'}, timeout=120)
    state.update(http_status=r.status_code, generation_id=r.headers.get('x-generation-id'), content_type=r.headers.get('content-type'))
    if r.status_code >= 400:
        definitive = 400 <= r.status_code < 500 and r.status_code != 408
        state.update(status='rejected' if definitive else 'submission_unknown', error=api.redact_text(r.text)[:1000])
        if definitive:
            api._release(reservation)
        save()
        raise SystemExit(state['error'])
    (args.output / 'response.pcm').write_bytes(r.content)
    content_type = state['content_type'] or ''
    rate = re.search(r'rate=(\d+)', content_type)
    channels = re.search(r'channels=(\d+)', content_type)
    if 'audio/pcm' not in content_type or not rate or not channels or len(r.content) < 1000:
        state.update(status='collected_unparsed', accounting_pending=True)
        save()
        raise SystemExit('Raw response retained; verify PCM format and billing before completion.')
    rate, channels = int(rate.group(1)), int(channels.group(1))
    with wave.open(str(args.output / 'raw.wav'), 'wb') as wav:
        wav.setnchannels(channels)
        wav.setsampwidth(2)
        wav.setframerate(rate)
        wav.writeframes(r.content)
    state.update(status='completed', sample_rate=rate, channels=channels, bytes=len(r.content), duration=len(r.content)/(rate*channels*2))
    save()
    billing = api.client.get('https://openrouter.ai/api/v1/generation', headers=headers, params={'id': state['generation_id']}, timeout=30)
    measured = None
    if billing.status_code == 200:
        data = billing.json()['data']
        measured = data.get('total_cost')
        (args.output / 'billing.json').write_text(json.dumps({k: data.get(k) for k in ['id', 'model', 'provider_name', 'total_cost']}, indent=2) + '\n')
    api._settle([{'time': g.utc_now(), 'provider': 'openrouter', 'model': model, 'mode': 'speech-sync', 'item': state['generation_id'], 'list_cost_usd': measured if measured is not None else estimate, 'provider_cost_usd': measured, 'work': 'Lama boy voice audition; alternate TTS explicitly authorized'}], reservation_id=reservation)
    state.update(measured_usd=measured, accounting_pending=measured is None)
    save()
comment = f'Synthetic voice audition: Google Gemini 3.8 Flash TTS, {args.voice}, through OpenRouter. Little-boy cartoon performance direction. Temporary copy; no pitch or tempo processing. User listening acceptance pending.'
subprocess.run(['/opt/homebrew/bin/ffmpeg', '-v', 'error', '-y', '-i', str(args.output / 'raw.wav'), '-c:a', 'copy', '-metadata', 'comment=' + comment, str(args.output / 'audition.wav')], check=True)
print(json.dumps({k: state.get(k) for k in ['generation_id', 'status', 'duration', 'measured_usd', 'content_type']}))
