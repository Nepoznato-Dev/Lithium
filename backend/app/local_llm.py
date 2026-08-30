# Local GGUF model store + pluggable inference engines.
#
# The store lives in backend/models_store/ (GGUF files + manifest.json).
# Inference engines, tried in order:
#   1. llama-cpp-python  — native serving, if installed
#   2. Ollama            — uploaded GGUFs are imported via `ollama create`
# The store and metadata work even with no engine present; chat then returns
# a clear, actionable error.
import json
import re
import shutil
import subprocess
import tempfile
import time
from pathlib import Path

import httpx

from . import providers

MODELS_DIR = Path(__file__).resolve().parent.parent / 'models_store'
MANIFEST = MODELS_DIR / 'manifest.json'

_loaded = {}  # file name → llama_cpp.Llama instance


def ensure_dir():
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    if not MANIFEST.exists():
        MANIFEST.write_text('{}', encoding='utf-8')


def _read_manifest():
    ensure_dir()
    try:
        return json.loads(MANIFEST.read_text(encoding='utf-8'))
    except (json.JSONDecodeError, OSError):
        return {}


def _write_manifest(manifest):
    ensure_dir()
    MANIFEST.write_text(json.dumps(manifest, indent=2), encoding='utf-8')


def safe_name(name):
    """Filesystem-safe, extension-preserving model file name."""
    cleaned = re.sub(r'[^\w\-. ]+', '_', name).strip().replace(' ', '_')
    return cleaned or 'model.gguf'


def slugify(name):
    slug = re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-')
    return slug[:48] or 'model'


# ---------- Engines ----------

def llama_cpp_available():
    try:
        import llama_cpp  # noqa: F401
        return True
    except ImportError:
        return False


def ollama_cli_available():
    return shutil.which('ollama') is not None


async def ollama_running():
    return await providers.ollama_reachable()


async def engine_status():
    return {
        'llamaCpp': llama_cpp_available(),
        'ollamaCli': ollama_cli_available(),
        'ollamaRunning': await ollama_running(),
        'modelsDir': str(MODELS_DIR),
    }


def _ollama_name(model_id):
    return f'lithium-{model_id}'


def _clean_output(text):
    """Strip ANSI escape codes + carriage returns from CLI output."""
    return re.sub(r'\x1b\[[0-9;?]*[a-zA-Z]', '', text or '').replace('\r', '').strip()


def import_to_ollama(entry):
    """Register a stored GGUF with Ollama via a generated Modelfile (best effort)."""
    if not ollama_cli_available():
        return False, 'ollama CLI not found'
    modelfile = tempfile.NamedTemporaryFile('w', suffix='.modelfile', delete=False, encoding='utf-8')
    try:
        modelfile.write(f"FROM {entry['path']}\n")
        modelfile.close()
        result = subprocess.run(
            ['ollama', 'create', _ollama_name(entry['id']), '-f', modelfile.name],
            capture_output=True, text=True, timeout=600,
        )
        if result.returncode == 0:
            return True, ''
        return False, _clean_output(result.stderr or result.stdout)[:300]
    except (subprocess.TimeoutExpired, OSError) as err:
        return False, str(err)
    finally:
        Path(modelfile.name).unlink(missing_ok=True)


def remove_from_ollama(model_id):
    if not ollama_cli_available():
        return
    try:
        subprocess.run(['ollama', 'rm', _ollama_name(model_id)], capture_output=True, timeout=60)
    except (subprocess.TimeoutExpired, OSError):
        pass  # best effort — the file is already gone


# ---------- Store ----------

def list_models():
    manifest = _read_manifest()
    entries = []
    for entry in manifest.values():
        path = Path(entry['path'])
        entries.append({
            **{k: entry.get(k) for k in ('id', 'name', 'file', 'size', 'uploadedAt', 'source')},
            'exists': path.exists(),
            'ollamaName': _ollama_name(entry['id']),
            'inOllama': bool(entry.get('inOllama')),
        })
    entries.sort(key=lambda e: e.get('uploadedAt') or 0, reverse=True)
    return entries


def get_model(model_id):
    entry = _read_manifest().get(model_id)
    if not entry:
        return None
    return entry


def add_model(model_id, name, file_name, path, source):
    manifest = _read_manifest()
    manifest[model_id] = {
        'id': model_id,
        'name': name,
        'file': file_name,
        'path': str(path),
        'size': path.stat().st_size,
        'uploadedAt': int(time.time() * 1000),
        'source': source,
        'inOllama': False,
    }
    _write_manifest(manifest)
    return manifest[model_id]


def delete_model(model_id):
    manifest = _read_manifest()
    entry = manifest.pop(model_id, None)
    if not entry:
        return False
    Path(entry['path']).unlink(missing_ok=True)
    _write_manifest(manifest)
    remove_from_ollama(model_id)
    _loaded.pop(entry['file'], None)
    return True


# ---------- Inference ----------

def _llama_instance(entry):
    from llama_cpp import Llama  # imported lazily — optional dependency
    if entry['file'] not in _loaded:
        _loaded[entry['file']] = Llama(model_path=entry['path'], n_ctx=8192, verbose=False)
    return _loaded[entry['file']]


def _llama_chat(entry, messages, temperature):
    result = _llama_instance(entry).create_chat_completion(
        messages=messages, temperature=temperature, max_tokens=1024,
    )
    return result['choices'][0]['message']['content']


async def _ollama_chat(entry, messages, temperature):
    if not await ollama_running():
        raise RuntimeError('Ollama is installed but not running — start the Ollama app first')
    return await providers.dispatch('ollama', _ollama_name(entry['id']), messages, temperature=temperature)


async def chat(model_id, messages, temperature=0.7):
    """Run chat with a stored local model using whichever engine is available."""
    entry = get_model(model_id)
    if not entry:
        raise RuntimeError(f"local model '{model_id}' not found")
    if not Path(entry['path']).exists():
        raise RuntimeError(f"model file missing from the store: {entry['file']}")

    if llama_cpp_available():
        import asyncio
        return await asyncio.to_thread(_llama_chat, entry, messages, temperature)
    if ollama_cli_available():
        if not entry.get('inOllama'):
            ok, err = import_to_ollama(entry)
            if not ok:
                raise RuntimeError(f'could not import the model into Ollama: {err}')
            manifest = _read_manifest()
            manifest[model_id]['inOllama'] = True
            _write_manifest(manifest)
            entry['inOllama'] = True
        return await _ollama_chat(entry, messages, temperature)

    raise RuntimeError(
        'no local inference engine available — install Ollama (recommended) or llama-cpp-python'
    )
