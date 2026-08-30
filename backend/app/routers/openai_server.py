# OpenAI-compatible model server (the "mini-Ollama").
#
# Point any tool at http://127.0.0.1:8734/v1 and it can list the local GGUF
# models stored by Lithium and chat with them — the same contract Ollama
# exposes at localhost:11434/v1.
import time
import uuid
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from .. import local_llm

router = APIRouter(prefix='/v1')


class ChatIn(BaseModel):
    model: str
    messages: list
    temperature: float = 0.7
    max_tokens: int | None = None


def _local_id(model):
    # Accept both "qwen3-0-6b-q4-k-m" and an explicit "local:qwen3-0-6b-q4-k-m".
    return model.split(':', 1)[1] if model.startswith('local:') else model


@router.get('/models')
def list_models():
    data = [
        {
            'id': f"local:{model['id']}",
            'object': 'model',
            'created': model.get('uploadedAt', 0) // 1000,
            'owned_by': 'lithium',
        }
        for model in local_llm.list_models()
        if model.get('exists')
    ]
    return {'object': 'list', 'data': data}


@router.post('/chat/completions')
async def chat_completions(body: ChatIn):
    model_id = _local_id(body.model)
    if not body.messages:
        raise HTTPException(400, 'messages must not be empty')
    try:
        content = await local_llm.chat(model_id, body.messages, temperature=body.temperature)
    except RuntimeError as err:
        raise HTTPException(503, str(err)) from err
    return {
        'id': f'chatcmpl-{uuid.uuid4().hex}',
        'object': 'chat.completion',
        'created': int(time.time()),
        'model': f'local:{model_id}',
        'choices': [{
            'index': 0,
            'message': {'role': 'assistant', 'content': content},
            'finish_reason': 'stop',
        }],
        'usage': {'prompt_tokens': 0, 'completion_tokens': 0, 'total_tokens': 0},
    }
