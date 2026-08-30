"""API key management — stored server-side; per-request keys take priority."""
import time
from fastapi import APIRouter
from pydantic import BaseModel

from .. import db

router = APIRouter(prefix='/api')


class KeyIn(BaseModel):
    provider: str
    key: str


@router.get('/keys')
def list_keys():
    with db.connect() as conn:
        rows = conn.execute('SELECT provider, updated_at FROM keys ORDER BY provider').fetchall()
    return [{'provider': row['provider'], 'updatedAt': row['updated_at']} for row in rows]


@router.post('/keys')
def save_key(body: KeyIn):
    with db.connect() as conn:
        conn.execute(
            'INSERT INTO keys (provider, key, updated_at) VALUES (?, ?, ?)'
            ' ON CONFLICT(provider) DO UPDATE SET key = excluded.key, updated_at = excluded.updated_at',
            (body.provider, body.key, int(time.time() * 1000)),
        )
    return {'ok': True}


@router.delete('/keys/{provider}')
def delete_key(provider: str):
    with db.connect() as conn:
        conn.execute('DELETE FROM keys WHERE provider = ?', (provider,))
    return {'ok': True}


def stored_key(provider):
    with db.connect() as conn:
        row = conn.execute('SELECT key FROM keys WHERE provider = ?', (provider,)).fetchone()
    return row['key'] if row else None
