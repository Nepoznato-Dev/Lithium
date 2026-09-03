"""Lightweight Fernet encryption for API keys stored in SQLite.

Derives a machine-specific key on first run and persists it to a local
.key file.  All subsequent reads use the same key.  If the key file is
lost, previously encrypted values are unrecoverable — the user must
re-enter their API keys.

The ``cryptography`` package is a hard requirement.  If it is not
installed the backend will refuse to start — run ``pip install cryptography``
to fix it.
"""
import base64
import hashlib
import logging
import os
import platform
import socket
from pathlib import Path

log = logging.getLogger(__name__)

try:
    from cryptography.fernet import Fernet
except ImportError as exc:
    raise RuntimeError(
        'The "cryptography" package is required for API-key encryption. '
        'Run:  pip install cryptography'
    ) from exc

_KEY_FILE = Path(__file__).resolve().parent.parent / '.encryption_key'
_fernet = None


def _derive_key() -> bytes:
    """Derive a Fernet key from machine-specific identifiers."""
    seed = f'{socket.gethostname()}|{os.getlogin()}|{platform.node()}'
    digest = hashlib.sha256(seed.encode()).digest()
    return base64.urlsafe_b64encode(digest)


def _get_fernet():
    """Load or create the encryption key file and return a Fernet instance."""
    global _fernet

    if _fernet is not None:
        return _fernet

    if _KEY_FILE.exists():
        raw = _KEY_FILE.read_bytes().strip()
    else:
        raw = _derive_key()
        _KEY_FILE.write_bytes(raw)
        # Restrict permissions — only the owner can read the key
        try:
            os.chmod(_KEY_FILE, 0o600)
        except OSError:
            pass  # Windows doesn't support chmod the same way
        log.info('Generated new encryption key at %s', _KEY_FILE)

    _fernet = Fernet(raw)
    return _fernet


def encrypt_value(plaintext: str) -> str:
    """Encrypt *plaintext* and return a base64-encoded ciphertext string."""
    f = _get_fernet()
    return f.encrypt(plaintext.encode('utf-8')).decode('ascii')


def decrypt_value(ciphertext: str) -> str:
    """Decrypt a ciphertext produced by :func:`encrypt_value`.

    If decryption fails (e.g. the value was stored before encryption was
    enabled), the raw value is returned as a migration convenience.
    """
    f = _get_fernet()
    try:
        return f.decrypt(ciphertext.encode('ascii')).decode('utf-8')
    except Exception:
        log.warning('Failed to decrypt value — returning raw plaintext')
        return ciphertext
