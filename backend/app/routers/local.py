# Local GGUF model store endpoints: upload, download-from-URL, list, delete.
import asyncio
import re
import uuid
from urllib.parse import urlparse
from fastapi import APIRouter, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from .. import local_llm
from ..url_guard import safe_get

router = APIRouter(prefix='/api/llm')

# Active server-side downloads: job_id → {url, name, received, total, status, error, modelId}
DOWNLOADS = {}


class DownloadIn(BaseModel):
    url: str
    name: str | None = None


@router.get('/status')
async def status():
    return await local_llm.engine_status()


@router.get('/models')
def models():
    return {'models': local_llm.list_models(), 'downloads': list(DOWNLOADS.values())}


@router.post('/models/upload')
async def upload(file: UploadFile):
    """Stream a GGUF from the browser into the model store."""
    file_name = local_llm.safe_name(file.filename or 'model.gguf')
    if not file_name.lower().endswith('.gguf'):
        raise HTTPException(400, 'only .gguf files are supported')
    local_llm.ensure_dir()
    target = local_llm.MODELS_DIR / file_name
    size = 0
    with target.open('wb') as out:
        while chunk := await file.read(8 * 1024 * 1024):
            out.write(chunk)
            size += len(chunk)
    entry = local_llm.add_model(local_llm.slugify(file_name[:-5]), file_name[:-5], file_name, target, 'upload')
    # Register with Ollama in the background so the response isn't blocked.
    asyncio.create_task(_try_ollama_import(entry['id']))
    return entry


@router.post('/models/download')
async def download(body: DownloadIn):
    """Download a GGUF from a URL (e.g. Hugging Face) straight into the store."""
    if not re.match(r'^https?://', body.url):
        raise HTTPException(400, 'url must be http(s)')
    file_name = local_llm.safe_name(body.name or body.url.split('?')[0].split('/')[-1] or 'model.gguf')
    if not file_name.lower().endswith('.gguf'):
        file_name += '.gguf'
    job_id = uuid.uuid4().hex[:8]
    job = {
        'jobId': job_id, 'url': body.url, 'name': file_name,
        'received': 0, 'total': 0, 'status': 'downloading', 'error': '', 'modelId': None,
    }
    DOWNLOADS[job_id] = job
    asyncio.create_task(_download_job(job_id, body.url, file_name))
    return job


@router.delete('/models/{model_id}')
def delete(model_id: str):
    if not local_llm.delete_model(model_id):
        raise HTTPException(404, f"local model '{model_id}' not found")
    return {'ok': True}


@router.post('/models/{model_id}/import')
async def import_model(model_id: str):
    """(Re)import a stored GGUF into Ollama."""
    entry = local_llm.get_model(model_id)
    if not entry:
        raise HTTPException(404, f"local model '{model_id}' not found")
    ok, err = await asyncio.to_thread(local_llm.import_to_ollama, entry)
    if not ok:
        raise HTTPException(502, err or 'import failed')
    manifest = local_llm._read_manifest()
    manifest[model_id]['inOllama'] = True
    local_llm._write_manifest(manifest)
    return {'ok': True, 'ollamaName': local_llm._ollama_name(model_id)}


async def _try_ollama_import(model_id):
    entry = local_llm.get_model(model_id)
    if not entry or not local_llm.ollama_cli_available():
        return
    ok, _ = await asyncio.to_thread(local_llm.import_to_ollama, entry)
    if ok:
        manifest = local_llm._read_manifest()
        if model_id in manifest:
            manifest[model_id]['inOllama'] = True
            local_llm._write_manifest(manifest)


async def _download_job(job_id, url, file_name):
    import httpx
    job = DOWNLOADS[job_id]
    local_llm.ensure_dir()
    target = local_llm.MODELS_DIR / file_name
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(60.0, read=None), follow_redirects=True) as client:
            async with client.stream('GET', url) as response:
                response.raise_for_status()
                job['total'] = int(response.headers.get('content-length') or 0)
                with target.open('wb') as out:
                    async for chunk in response.aiter_bytes(8 * 1024 * 1024):
                        out.write(chunk)
                        job['received'] += len(chunk)
        entry = local_llm.add_model(local_llm.slugify(file_name[:-5]), file_name[:-5], file_name, target, url)
        job['status'] = 'done'
        job['modelId'] = entry['id']
        await _try_ollama_import(entry['id'])
    except Exception as err:  # surface any failure to the polling client
        job['status'] = 'error'
        job['error'] = str(err)[:300]
        target.unlink(missing_ok=True)


# ---------- Download proxy ----------
# Browsers block many cross-origin fetches (CORS). This streams any URL
# server-side so the site can pull files into OPFS anyway. The server binds
# to 127.0.0.1 only, so the proxy is reachable from this machine alone.


@router.get('/proxy')
async def proxy(url: str):
    import httpx
    parsed = urlparse(url)
    host = parsed.hostname or ''
    # api.huggingface.co doesn't resolve on many networks — the API also lives
    # on the main host, so transparently rewrite it.
    if host == 'api.huggingface.co':
        url = url.replace('://api.huggingface.co', '://huggingface.co', 1)
        host = 'huggingface.co'
    if parsed.scheme not in ('http', 'https') or not host:
        raise HTTPException(400, 'the proxy only allows http(s) URLs')

    client = httpx.AsyncClient(timeout=httpx.Timeout(60.0, read=None))
    try:
        upstream = await safe_get(client, url, stream=True)
    except ValueError as err:
        await client.aclose()
        raise HTTPException(400, str(err)) from err
    except httpx.HTTPError as err:
        await client.aclose()
        raise HTTPException(502, f'upstream unreachable ({err.__class__.__name__}: {err})') from err

    if upstream.status_code >= 400:
        await upstream.aclose()
        await client.aclose()
        raise HTTPException(upstream.status_code, f'upstream returned HTTP {upstream.status_code}')

    async def stream():
        try:
            async for chunk in upstream.aiter_bytes(1024 * 1024):
                yield chunk
        finally:
            await upstream.aclose()
            await client.aclose()

    headers = {}
    length = upstream.headers.get('content-length')
    if length:
        headers['Content-Length'] = length
    return StreamingResponse(stream(), media_type='application/octet-stream', headers=headers)
