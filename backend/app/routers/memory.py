# Persistent model memory + context-window builder.
import time
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from .. import db

router = APIRouter(prefix='/api')

VALUE_CAP = 2000
KEY_CAP = 64
ENTRY_CAP = 200


class MemoryIn(BaseModel):
    key: str
    value: str


class SyncIn(BaseModel):
    entries: dict  # { key: { value, updatedAt } } — frontend localStorage shape


class ContextIn(BaseModel):
    messages: list  # [{ role, content }]
    max_tokens: int | None = None
    model_id: str | None = None
    include_memory: bool = True


# ---------- Memory ----------

@router.get('/memory')
def list_memory():
    with db.connect() as conn:
        rows = conn.execute('SELECT key, value, updated_at FROM memories ORDER BY updated_at DESC').fetchall()
    return {row['key']: {'value': row['value'], 'updatedAt': row['updated_at']} for row in rows}


@router.post('/memory')
def write_memory(body: MemoryIn):
    key = body.key.strip()[:KEY_CAP]
    if not key:
        raise HTTPException(400, 'memory key must not be empty')
    value = body.value[:VALUE_CAP]
    now = int(time.time() * 1000)
    with db.connect() as conn:
        conn.execute(
            'INSERT INTO memories (key, value, updated_at) VALUES (?, ?, ?)'
            ' ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at',
            (key, value, now),
        )
        # Evict oldest entries past the cap (mirrors the frontend store).
        rows = conn.execute('SELECT key FROM memories ORDER BY updated_at DESC').fetchall()
        for row in rows[ENTRY_CAP:]:
            conn.execute('DELETE FROM memories WHERE key = ?', (row['key'],))
    return {'ok': True, 'key': key}


@router.delete('/memory/{key}')
def delete_memory(key: str):
    with db.connect() as conn:
        result = conn.execute('DELETE FROM memories WHERE key = ?', (key,))
        if not result.rowcount:
            raise HTTPException(404, f"no memory entry '{key}'")
    return {'ok': True}


@router.get('/memory/search')
def search_memory(q: str = ''):
    needle = q.strip().lower()
    if not needle:
        return list_memory()
    memory = list_memory()
    hits = {k: v for k, v in memory.items() if needle in k.lower() or needle in v['value'].lower()}
    return hits


@router.post('/memory/sync')
def sync_memory(body: SyncIn):
    """Merge the frontend store into the backend (newer entry wins)."""
    stored = list_memory()
    now = int(time.time() * 1000)
    with db.connect() as conn:
        for key, entry in body.entries.items():
            clean_key = str(key).strip()[:KEY_CAP]
            if not clean_key:
                continue
            incoming_at = int(entry.get('updatedAt') or now)
            current = stored.get(clean_key)
            if current and current['updatedAt'] >= incoming_at:
                continue
            conn.execute(
                'INSERT INTO memories (key, value, updated_at) VALUES (?, ?, ?)'
                ' ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at',
                (clean_key, str(entry.get('value', ''))[:VALUE_CAP], incoming_at),
            )
    return list_memory()


def memory_block(max_entries=40):
    """Compact memory dump for prompt injection."""
    memory = list_memory()
    keys = list(memory.keys())[:max_entries]  # list_memory is already newest-first
    if not keys:
        return ''
    return 'Things you remember about the user:\n' + '\n'.join(f'- {key}: {memory[key]["value"]}' for key in keys)


# ---------- Context window ----------

def est_tokens(text):
    """Rough token estimate (~4 chars/token) — good enough for trimming."""
    return max(1, len(text or '') // 4)


@router.post('/context/build')
def build_context(body: ContextIn):
    """Fit a conversation into a model's context window.

    Keeps every system message and the latest user turn; injects memory into
    the system prompt; drops the oldest turns until the estimate fits.
    """
    if not body.messages:
        raise HTTPException(400, 'messages must not be empty')

    budget = body.max_tokens
    if not budget:
        budget = 8192
        if body.model_id:
            with db.connect() as conn:
                row = conn.execute('SELECT context_window FROM models WHERE id = ?', (body.model_id,)).fetchone()
            if row:
                budget = row['context_window']
    budget = max(1024, budget)
    reserve = 1024  # leave room for the reply

    messages = [dict(m) for m in body.messages]
    memory_text = memory_block() if body.include_memory else ''

    # Inject memory into the first system message (or create one).
    if memory_text:
        systems = [m for m in messages if m['role'] == 'system']
        if systems:
            systems[0]['content'] = f"{systems[0]['content']}\n\n{memory_text}"
        else:
            messages.insert(0, {'role': 'system', 'content': memory_text})

    total = sum(est_tokens(m['content']) for m in messages)
    dropped = 0
    while total > budget - reserve and len(messages) > 2:
        # Drop the oldest non-system message.
        for index, message in enumerate(messages):
            if message['role'] != 'system':
                total -= est_tokens(message['content'])
                del messages[index]
                dropped += 1
                break
        else:
            break

    return {
        'messages': messages,
        'tokens': total,
        'budget': budget,
        'dropped': dropped,
        'memoryInjected': bool(memory_text),
    }
