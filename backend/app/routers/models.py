"""Model registry — CRUD for registered AI models."""
import time
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from .. import db

router = APIRouter(prefix='/api')


class ModelIn(BaseModel):
    id: str | None = None
    name: str
    provider: str
    model_name: str
    context_window: int = 8192
    temperature: float = 0.7
    is_default: bool = False


# ---------- Models ----------

@router.get('/models')
def list_models():
    with db.connect() as conn:
        rows = conn.execute('SELECT * FROM models ORDER BY is_default DESC, created_at').fetchall()
    return [dict(row) for row in rows]


@router.get('/models/{model_id}')
def get_model(model_id: str):
    with db.connect() as conn:
        row = conn.execute('SELECT * FROM models WHERE id = ?', (model_id,)).fetchone()
    if not row:
        raise HTTPException(404, f"model '{model_id}' not found")
    return dict(row)


@router.post('/models')
def create_model(body: ModelIn):
    model_id = body.id or f'{body.provider}-{body.model_name}'.replace('/', '-').replace('.', '-')
    now = int(time.time() * 1000)
    with db.connect() as conn:
        if body.is_default:
            conn.execute('UPDATE models SET is_default = 0')
        conn.execute(
            'INSERT INTO models (id, name, provider, model_name, context_window, temperature, is_default, created_at)'
            ' VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            (model_id, body.name, body.provider, body.model_name, body.context_window, body.temperature, int(body.is_default), now),
        )
        row = conn.execute('SELECT * FROM models WHERE id = ?', (model_id,)).fetchone()
    return dict(row)


@router.put('/models/{model_id}')
def update_model(model_id: str, body: ModelIn):
    with db.connect() as conn:
        existing = conn.execute('SELECT * FROM models WHERE id = ?', (model_id,)).fetchone()
        if not existing:
            raise HTTPException(404, f"model '{model_id}' not found")
        if body.is_default:
            conn.execute('UPDATE models SET is_default = 0')
        conn.execute(
            'UPDATE models SET name = ?, provider = ?, model_name = ?, context_window = ?, temperature = ?, is_default = ? WHERE id = ?',
            (body.name, body.provider, body.model_name, body.context_window, body.temperature, int(body.is_default), model_id),
        )
        row = conn.execute('SELECT * FROM models WHERE id = ?', (model_id,)).fetchone()
    return dict(row)


@router.delete('/models/{model_id}')
def delete_model(model_id: str):
    with db.connect() as conn:
        result = conn.execute('DELETE FROM models WHERE id = ?', (model_id,))
        if not result.rowcount:
            raise HTTPException(404, f"model '{model_id}' not found")
    return {'ok': True}
