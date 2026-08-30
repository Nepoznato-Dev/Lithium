# Chat completions — resolve a registered model (or raw provider), then dispatch.
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from .. import db, providers
from .keys import stored_key

router = APIRouter(prefix='/api')

# Default model per provider when the caller passes a provider instead of a model id.
PROVIDER_DEFAULTS = {
    'openai': 'gpt-4o-mini',
    'groq': 'llama-3.3-70b-versatile',
    'anthropic': 'claude-3-5-haiku-latest',
    'google': 'gemini-2.0-flash',
    'xai': 'grok-3-mini',
    'ollama': 'qwen3:0.6b',
}


class ChatIn(BaseModel):
    messages: list  # [{ role, content }]
    model_id: str | None = None
    provider: str | None = None
    model: str | None = None  # raw model name override
    keys: dict | None = None  # optional per-request keys {provider: key}
    temperature: float = 0.7


@router.post('/chat')
async def chat(body: ChatIn):
    if not body.messages:
        raise HTTPException(400, 'messages must not be empty')

    provider = body.provider
    model_name = body.model
    resolved_model = None

    if body.model_id:
        with db.connect() as conn:
            row = conn.execute('SELECT * FROM models WHERE id = ?', (body.model_id,)).fetchone()
        if not row:
            raise HTTPException(404, f"model '{body.model_id}' not found")
        provider = row['provider']
        model_name = row['model_name']
        resolved_model = dict(row)

    if not provider:
        # No model id, no provider → use the default model in the registry.
        with db.connect() as conn:
            row = conn.execute('SELECT * FROM models WHERE is_default = 1 LIMIT 1').fetchone()
        if not row:
            raise HTTPException(400, 'no model_id/provider given and no default model set')
        provider = row['provider']
        model_name = row['model_name']
        resolved_model = dict(row)

    if not model_name:
        model_name = PROVIDER_DEFAULTS.get(provider)
    if not model_name:
        raise HTTPException(400, f"no model known for provider '{provider}'")

    key = (body.keys or {}).get(provider) or stored_key(provider)

    try:
        content = await providers.dispatch(provider, model_name, body.messages, key=key, temperature=body.temperature)
    except RuntimeError as err:
        raise HTTPException(502, str(err)) from err
    except providers.httpx.HTTPError as err:
        raise HTTPException(502, f'{provider}: network error ({err.__class__.__name__})') from err

    return {
        'content': content,
        'provider': provider,
        'model': model_name,
        'modelId': resolved_model['id'] if resolved_model else None,
    }
