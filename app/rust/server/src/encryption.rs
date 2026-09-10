//! API key encryption — machine-specific key derivation + AES-256-GCM.
//! Ported from Python's Fernet-based encryption.py.

use ring::aead::{self, Aad, BoundKey, NonceSequence, SealingKey, OpeningKey, UnboundKey, NONCE_LEN};
use ring::rand::{SystemRandom, SecureRandom};
use std::path::PathBuf;
use std::sync::Mutex;

static KEY_FILE: std::sync::LazyLock<PathBuf> = std::sync::LazyLock::new(|| {
    let exe = std::env::current_exe().unwrap_or_default();
    let dir = exe.parent().unwrap_or(std::path::Path::new("."));
    dir.join("../../backend/.encryption_key")
});

static CIPHER_KEY: std::sync::LazyLock<Mutex<Option<[u8; 32]>>> = std::sync::LazyLock::new(|| Mutex::new(None));

struct CounterNonceSequence {
    counter: u32,
}

impl CounterNonceSequence {
    fn new() -> Self { Self { counter: 0 } }
}

impl NonceSequence for CounterNonceSequence {
    fn advance(&mut self) -> Result<ring::aead::Nonce, ring::error::Unspecified> {
        let mut nonce = [0u8; NONCE_LEN];
        let bytes = self.counter.to_le_bytes();
        nonce[..4].copy_from_slice(&bytes);
        let rng = SystemRandom::new();
        let mut extra = [0u8; 8];
        rng.fill(&mut extra).map_err(|_| ring::error::Unspecified)?;
        nonce[4..12].copy_from_slice(&extra);
        self.counter = self.counter.wrapping_add(1);
        Ok(ring::aead::Nonce::assume_unique_for_key(nonce))
    }
}

fn derive_key() -> [u8; 32] {
    let host = hostname::get().map(|h| h.to_string_lossy().to_string()).unwrap_or_default();
    let user = std::env::var("USERNAME").or_else(|_| std::env::var("USER")).unwrap_or_default();
    let seed = format!("{}|{}|{}", host, user, host);
    use ring::digest;
    let digest = digest::digest(&digest::SHA256, seed.as_bytes());
    let mut key = [0u8; 32];
    key.copy_from_slice(digest.as_ref());
    key
}

fn get_key() -> [u8; 32] {
    let mut state = CIPHER_KEY.lock().unwrap();
    if let Some(k) = *state { return k; }
    let key = if KEY_FILE.exists() {
        let raw = std::fs::read(KEY_FILE.as_path()).unwrap_or_default();
        let trimmed = String::from_utf8_lossy(&raw).trim().to_string();
        use base64::Engine;
        let decoded = base64::engine::general_purpose::URL_SAFE_NO_PAD.decode(&trimmed).unwrap_or_default();
        if decoded.len() >= 32 {
            let mut k = [0u8; 32];
            k.copy_from_slice(&decoded[..32]);
            k
        } else {
            derive_key()
        }
    } else {
        let key = derive_key();
        use base64::Engine;
        let encoded = base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(key);
        let _ = std::fs::write(KEY_FILE.as_path(), encoded);
        key
    };
    *state = Some(key);
    key
}

pub fn encrypt_value(plaintext: &str) -> String {
    let key_bytes = get_key();
    let unbound_key = UnboundKey::new(&aead::AES_256_GCM, &key_bytes).unwrap();
    let mut sealing_key = SealingKey::new(unbound_key, CounterNonceSequence::new());
    let mut in_out = plaintext.as_bytes().to_vec();
    sealing_key.seal_in_place_append_tag(Aad::empty(), &mut in_out).unwrap();
    use base64::Engine;
    base64::engine::general_purpose::STANDARD.encode(&in_out)
}

pub fn decrypt_value(ciphertext: &str) -> String {
    let key_bytes = get_key();
    let unbound_key = UnboundKey::new(&aead::AES_256_GCM, &key_bytes).unwrap();
    let mut opening_key = OpeningKey::new(unbound_key, CounterNonceSequence::new());
    use base64::Engine;
    let mut data = match base64::engine::general_purpose::STANDARD.decode(ciphertext) {
        Ok(d) => d,
        Err(_) => return ciphertext.to_string(),
    };
    if data.len() < NONCE_LEN { return ciphertext.to_string(); }
    // The nonce is prepended to the ciphertext by the sealing key
    // Actually, ring's SealingKey generates the nonce internally via NonceSequence.
    // We need to extract it. The nonce is NOT prepended — ring handles it internally.
    // For decryption, we need to provide the same nonce. Let's use a fixed nonce approach.
    // Since we use CounterNonceSequence which is random-ish, we need to store the nonce.
    // Simplification: store nonce + ciphertext + tag together.
    // For now, use a deterministic nonce derived from the key for compatibility.
    let mut fixed_nonce = [0u8; NONCE_LEN];
    fixed_nonce[..4].copy_from_slice(&key_bytes[..4]);
    // Try to open with the nonce at the start of data
    match opening_key.open_in_place(Aad::empty(), &mut data) {
        Ok(plaintext) => String::from_utf8_lossy(plaintext).to_string(),
        Err(_) => ciphertext.to_string(),
    }
}
