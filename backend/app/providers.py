"""Provider dispatch — one entry point, every chat backend.

Supported providers:
  openai / groq / xai  → OpenAI-compatible /chat/completions
  anthropic            → /v1/messages
  google               → generativelanguage generateContent
  ollama               → local http://localhost:11434 (GGUF-class models)
"""
import httpx

OPENAI_COMPAT = {
    'openai': 'https://api.openai.com/v1',
    'groq': 'https://api.groq.com/openai/v1',
    'xai': 'https://api.x.ai/v1',
}
OLLAMA_BASE = 'http://localhost:11434'
TIMEOUT = httpx.Timeout(120.0, connect=10.0)


async def dispatch(provider, model_name, messages, key=None, temperature=0.7):
    """Run a chat completion. Returns the assistant text."""
    if provider in OPENAI_COMPAT:
        return await _openai_compat(provider, model_name, messages, key, temperature)
    if provider == 'anthropic':
        return await _anthropic(model_name, messages, key)
    if provider == 'google':
        return await _google(model_name, messages, key)
    if provider == 'ollama':
        return await _ollama(model_name, messages, temperature)
    if provider == 'local-gguf':
        # GGUFs stored in backend/models_store — see local_llm for engines.
        from . import local_llm  # lazy import to avoid a cycle
        return await local_llm.chat(model_name, messages, temperature=temperature)
    raise ValueError(f"unknown provider '{provider}'")


async def ollama_reachable():
    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            response = await client.get(f'{OLLAMA_BASE}/api/tags')
            return response.status_code == 200
    except httpx.HTTPError:
        return False


def _raise_for(provider, response):
    if response.status_code >= 400:
        try:
            body = response.json()
            detail = body.get('error', {})
            detail = detail.get('message', detail) if isinstance(detail, dict) else detail
        except ValueError:
            detail = response.text[:200]
        raise RuntimeError(f'{provider}: {detail}')


async def _openai_compat(provider, model_name, messages, key, temperature):
    if not key:
        raise RuntimeError(f'{provider}: no API key stored')
    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        response = await client.post(
            f'{OPENAI_COMPAT[provider]}/chat/completions',
            headers={'Authorization': f'Bearer {key}'},
            json={'model': model_name, 'messages': messages, 'temperature': temperature},
        )
    _raise_for(provider, response)
    return response.json()['choices'][0]['message']['content']


async def _anthropic(model_name, messages, key):
    if not key:
        raise RuntimeError('anthropic: no API key stored')
    system = '\n'.join(m['content'] for m in messages if m['role'] == 'system')
    turns = [m for m in messages if m['role'] != 'system']
    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        response = await client.post(
            'https://api.anthropic.com/v1/messages',
            headers={'x-api-key': key, 'anthropic-version': '2023-06-01'},
            json={'model': model_name, 'max_tokens': 1024, 'system': system or None, 'messages': turns},
        )
    _raise_for('anthropic', response)
    return ''.join(block.get('text', '') for block in response.json().get('content', []))


async def _google(model_name, messages, key):
    if not key:
        raise RuntimeError('google: no API key stored')
    system = '\n'.join(m['content'] for m in messages if m['role'] == 'system')
    turns = [m for m in messages if m['role'] != 'system']
    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        response = await client.post(
            f'https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={key}',
            json={
                'systemInstruction': {'parts': [{'text': system}]} if system else None,
                'contents': [
                    {'role': 'model' if m['role'] == 'assistant' else 'user', 'parts': [{'text': m['content']}]}
                    for m in turns
                ],
            },
        )
    _raise_for('google', response)
    candidates = response.json().get('candidates', [])
    return ''.join(part.get('text', '') for part in candidates[0]['content']['parts']) if candidates else ''


async def _ollama(model_name, messages, temperature):
    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        response = await client.post(
            f'{OLLAMA_BASE}/api/chat',
            json={'model': model_name, 'messages': messages, 'stream': False, 'options': {'temperature': temperature}},
        )
    _raise_for('ollama', response)
    return response.json()['message']['content']
