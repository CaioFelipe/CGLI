use rand::RngCore;
use std::sync::Mutex;

pub const CROCKFORD_BASE32: &[u8; 32] = b"0123456789ABCDEFGHJKMNPQRSTVWXYZ";

static ULID_STATE: Mutex<Option<(u64, [u8; 10])>> = Mutex::new(None);

pub fn encode_time(mut time: u64, len: usize) -> String {
    let mut chars = vec![b'0'; len];
    for i in (0..len).rev() {
        chars[i] = CROCKFORD_BASE32[(time % 32) as usize];
        time /= 32;
    }
    String::from_utf8(chars).unwrap()
}

pub fn encode_random(buf: &[u8; 10]) -> String {
    let mut s = String::with_capacity(16);
    let mut buffer: u32 = 0;
    let mut bits: u32 = 0;

    for &byte in buf {
        buffer = (buffer << 8) | (byte as u32);
        bits += 8;
        while bits >= 5 {
            bits -= 5;
            s.push(CROCKFORD_BASE32[((buffer >> bits) & 31) as usize] as char);
        }
    }

    if bits > 0 {
        s.push(CROCKFORD_BASE32[((buffer << (5 - bits)) & 31) as usize] as char);
    }

    s.truncate(16);
    s
}

pub fn increment_random(buf: &mut [u8; 10]) {
    for byte in buf.iter_mut().rev() {
        if *byte < 255 {
            *byte += 1;
            return;
        }
        *byte = 0;
    }
}

/// Gera ULID monotônico de 26 caracteres Crockford Base32
/// (48 bits de tempo em ms + 80 bits criptográficos aleatórios,
/// incrementando big-endian se chamado no mesmo milissegundo).
pub fn generate_id() -> String {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64;

    let mut guard = ULID_STATE.lock().unwrap();
    let (time, random_buf) = match guard.as_mut() {
        Some((last_time, last_rand)) if *last_time >= now => {
            increment_random(last_rand);
            (*last_time, *last_rand)
        }
        _ => {
            let mut rand_buf = [0u8; 10];
            rand::thread_rng().fill_bytes(&mut rand_buf);
            *guard = Some((now, rand_buf));
            (now, rand_buf)
        }
    };
    drop(guard);

    format!("{}{}", encode_time(time, 10), encode_random(&random_buf))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_ulid_format() {
        let id = generate_id();
        assert_eq!(id.len(), 26);
        for c in id.chars() {
            assert!(
                CROCKFORD_BASE32.contains(&(c as u8)),
                "Invalid Crockford char: {}",
                c
            );
        }
    }

    #[test]
    fn test_ulid_monotonicity() {
        let mut ids = Vec::new();
        for _ in 0..100 {
            ids.push(generate_id());
        }
        for i in 1..ids.len() {
            assert!(
                ids[i] > ids[i - 1],
                "ULIDs must be strictly monotonic: {} vs {}",
                ids[i - 1],
                ids[i]
            );
        }
    }
}
