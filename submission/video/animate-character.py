"""Generate and collect one bounded character-motion pilot through the existing gateway.

The manifest survives polling and process exits. Re-running collects the original job;
it never silently resubmits a generation. Only the generated character image is sent.
"""
import argparse
import base64
import importlib.util
import json
from pathlib import Path
import sys

parser = argparse.ArgumentParser()
parser.add_argument('--gateway-root', type=Path, required=True)
parser.add_argument('--directory', type=Path, required=True)
parser.add_argument('--reference', type=Path)
parser.add_argument('--prompt-file', type=Path)
parser.add_argument('--duration', type=int, choices=[4, 6, 8], default=8)
parser.add_argument('--output-name', default='lama-motion-green.mp4')
args = parser.parse_args()
if Path(args.output_name).name != args.output_name:
    parser.error('--output-name must be a filename inside --directory')
spec = importlib.util.spec_from_file_location('lama_gateway', args.gateway_root / 'tools/scripts/external_services.py')
gateway = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = gateway
spec.loader.exec_module(gateway)
args.directory.mkdir(parents=True, exist_ok=True)
manifest_file = args.directory / 'motion-job.json'
model = 'google/veo-3.1-lite'
duration = args.duration
prompt = '''Animate this exact cute small boy alpaca as a lively, intelligent TV weather presenter. A continuous full-body shot, locked camera, no cuts and no camera movement. Preserve his face, cream fur, orange/navy/ivory scarf and soft two-toed feet. He is a living animated character, not a plush toy or moving photograph. During the first second he blinks and gives a small friendly wave toward the camera. Then he takes one small step toward the viewer's LEFT, turns his head and upper body toward the viewer's RIGHT, and lifts one foreleg to point clearly at an imaginary display to the RIGHT. While gesturing he speaks with natural expressive mouth movement, lively ears and eyebrows, alternating eye contact between the camera and that imaginary display. Near the end he gives a small knowing nod and lowers his foreleg. His feet step naturally and remain visible, his scarf responds softly to his motion. Stay completely inside the frame with ears and feet never cropped. Keep the entire background EXACTLY flat chroma green, no shadows, no props, no display, no text. Only the single character moves. Polished 3D character animation, bright curious youthful energy, calm clear explanatory gestures. Silent output; narration will be added separately.'''
if args.prompt_file:
    prompt = args.prompt_file.read_text()

def save(state):
    manifest_file.write_text(json.dumps(state, indent=2) + '\n')

with gateway.ExternalServices() as api:
    headers = {'Authorization': 'Bearer ' + api.env['OPENROUTER_API_KEY']}
    if manifest_file.exists():
        state = json.loads(manifest_file.read_text())
    else:
        reference = args.reference or args.directory / 'lama-character-green.png'
        image = base64.b64encode(reference.read_bytes()).decode()
        mime = 'image/jpeg' if reference.suffix.lower() in {'.jpg', '.jpeg'} else 'image/png'
        models = api.client.get('https://openrouter.ai/api/v1/videos/models', timeout=30).json()['data']
        selected = next(m for m in models if m['id'] == model)
        rate = float(selected['pricing_skus']['duration_seconds_without_audio_720p'])
        estimate = rate * duration
        if estimate > 0.30 or duration not in selected['supported_durations']:
            raise SystemExit('The requested pilot exceeds the current run cap or supported duration.')
        reservation = api._reserve('openrouter', model, {'usd': estimate}, out_dir=str(args.directory), persistent=True)
        state = {'model': model, 'provider': 'Google Vertex via OpenRouter', 'estimated_usd': estimate, 'duration': duration, 'resolution': '720p', 'status': 'submitting', 'reservation_id': reservation, 'prompt': prompt, 'reference': reference.name, 'output_file': args.output_name}
        save(state)
        response = api.client.post('https://openrouter.ai/api/v1/videos', headers=headers, json={
            'model': model, 'prompt': prompt, 'duration': duration, 'resolution': '720p',
            'aspect_ratio': '16:9', 'generate_audio': False,
            'frame_images': [{'type': 'image_url', 'image_url': {'url': 'data:' + mime + ';base64,' + image}, 'frame_type': 'first_frame'}],
            'provider': {'only': ['google-vertex']},
        }, timeout=120)
        if response.status_code >= 400:
            definitive = 400 <= response.status_code < 500 and response.status_code != 408
            state.update(status='rejected' if definitive else 'submission_unknown', http_status=response.status_code, error=api.redact_text(response.text)[:1000])
            if definitive:
                api._release(reservation)
            save(state)
            raise SystemExit(state['error'])
        payload = response.json()
        state.update(id=payload['id'], status=payload['status'])
        save(state)
        print(json.dumps({'id': state['id'], 'status': state['status'], 'estimated_usd': estimate}), flush=True)
    if state['status'] == 'collected':
        print(json.dumps({'id': state['id'], 'status': 'collected', 'cost': state.get('measured_usd')}))
        raise SystemExit(0)
    if state['status'] in {'failed', 'cancelled', 'expired'}:
        print(json.dumps({'id': state['id'], 'status': state['status'], 'error': state.get('error')}))
        raise SystemExit(1)
    if not state.get('id'):
        raise SystemExit('No confirmed job ID; reconcile the saved submission before retrying.')
    response = api.client.get('https://openrouter.ai/api/v1/videos/' + state['id'], headers=headers, timeout=60)
    response.raise_for_status()
    result = response.json()
    state.update(status=result['status'], generation_id=result.get('generation_id'), usage=result.get('usage'))
    # Do not persist signed content URLs: collect through the fixed authenticated endpoint.
    if result['status'] == 'completed':
        video = api.client.get('https://openrouter.ai/api/v1/videos/' + state['id'] + '/content', headers=headers, timeout=120)
        video.raise_for_status()
        (args.directory / state.get('output_file', 'lama-motion-green.mp4')).write_bytes(video.content)
        measured = (result.get('usage') or {}).get('cost')
        api._settle([{'time': gateway.utc_now(), 'provider': 'openrouter', 'model': model, 'mode': 'async-video', 'item': state['id'], 'list_cost_usd': state['estimated_usd'], 'provider_cost_usd': measured, 'work': 'Lama weather-presenter motion pilot'}], reservation_id=state['reservation_id'])
        state.update(status='collected', measured_usd=measured, bytes=len(video.content))
    elif result['status'] in {'failed', 'cancelled', 'expired'}:
        state['error'] = result.get('error')
        measured = (result.get('usage') or {}).get('cost')
        api._settle([{'time': gateway.utc_now(), 'provider': 'openrouter', 'model': model, 'mode': 'async-video', 'item': state['id'], 'list_cost_usd': measured if measured is not None else state['estimated_usd'], 'provider_cost_usd': measured, 'work': 'Failed Lama motion pilot; inspect billing'}], reservation_id=state['reservation_id'])
    save(state)
    print(json.dumps({k: state.get(k) for k in ['id', 'status', 'measured_usd', 'bytes', 'error']}), flush=True)
