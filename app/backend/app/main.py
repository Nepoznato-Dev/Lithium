# Lithium Python backend — models, memory, context windows and chat proxy.
#
# Run:  double-click start-backend.cmd at the repo root (outside the IDE!),
#       or:  cd backend && python run.py
# Docs: http://localhost:8734/docs  (interactive Swagger UI)
import asyncio
import os
import socket
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import db, local_llm, providers
from .routers import chat, keys, local, memory, models, mcp, openai_server, web

VERSION = '1.0.0'


@asynccontextmanager
async def lifespan(_app):
    db.init()
    local_llm.ensure_dir()
    yield


app = FastAPI(title='Lithium Backend', version=VERSION, lifespan=lifespan)

# The desktop runs in a browser on the same machine — allow local origins only.
# Extra origins (e.g. production) can be supplied via ALLOWED_ORIGINS env var.
ALLOWED_ORIGINS = [
    'http://localhost:5173',   # Vite dev server
    'http://127.0.0.1:5173',
    'http://localhost:4173',   # vite preview
]
_extra = os.environ.get('ALLOWED_ORIGINS', '')
if _extra:
    ALLOWED_ORIGINS.extend(o.strip() for o in _extra.split(',') if o.strip())
app.add_middleware(CORSMiddleware, allow_origins=ALLOWED_ORIGINS, allow_methods=['*'], allow_headers=['*'])

app.include_router(models.router)
app.include_router(keys.router)
app.include_router(memory.router)
app.include_router(chat.router)
app.include_router(local.router)
app.include_router(openai_server.router)
app.include_router(mcp.router)
app.include_router(web.router)


@app.get('/api/health')
async def health():
    def _db_stats():
        with db.connect() as conn:
            model_count = conn.execute('SELECT COUNT(*) AS n FROM models').fetchone()['n']
            memory_count = conn.execute('SELECT COUNT(*) AS n FROM memories').fetchone()['n']
            default = conn.execute('SELECT id, name FROM models WHERE is_default = 1 LIMIT 1').fetchone()
        return model_count, memory_count, default

    model_count, memory_count, default = await asyncio.to_thread(_db_stats)
    # Self-diagnostic: can THIS process reach the internet? Sandboxed terminals
    # (e.g. the IDE's) block DNS for long-running apps while browsers work fine.
    loop = asyncio.get_running_loop()
    try:
        await loop.getaddrinfo('huggingface.co', 443)
        internet = True
    except OSError:
        internet = False
    return {
        'ok': True,
        'name': 'Lithium Backend',
        'version': VERSION,
        'models': model_count,
        'memories': memory_count,
        'defaultModel': dict(default) if default else None,
        'ollama': await providers.ollama_reachable(),
        'internet': internet,
    }
