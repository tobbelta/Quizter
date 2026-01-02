const encoder = new TextEncoder();
const decoder = new TextDecoder();

// Cloudflare Workers begränsar PBKDF2-iterationer till 100000.
const DEFAULT_ITERATIONS = 100000;
const LEGACY_ITERATIONS = 120000;

const encodeBase64 = (bytes) => {
  if (typeof btoa === 'function') {
    let binary = '';
    bytes.forEach((byte) => {
      binary += String.fromCharCode(byte);
    });
    return btoa(binary);
  }
  return Buffer.from(bytes).toString('base64');
};

const decodeBase64 = (value) => {
  if (typeof atob === 'function') {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
  return Uint8Array.from(Buffer.from(value, 'base64'));
};

const importKey = async (password) => {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );
};

export const hashPassword = async (password, salt = null, iterations = DEFAULT_ITERATIONS) => {
  if (!password) {
    throw new Error('Lösenord saknas');
  }

  const saltBytes = salt ? decodeBase64(salt) : crypto.getRandomValues(new Uint8Array(16));
  const key = await importKey(password);
  const derived = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: saltBytes,
      iterations,
      hash: 'SHA-256'
    },
    key,
    256
  );

  return {
    hash: encodeBase64(new Uint8Array(derived)),
    salt: encodeBase64(saltBytes)
  };
};

export const verifyPassword = async (password, storedHash, storedSalt) => {
  if (!storedHash || !storedSalt) return false;
  const compareHashes = async (iterations) => {
    const { hash } = await hashPassword(password, storedSalt, iterations);
    const hashBytes = decodeBase64(hash);
    const storedBytes = decodeBase64(storedHash);
    if (hashBytes.length !== storedBytes.length) return false;
    let diff = 0;
    for (let i = 0; i < hashBytes.length; i += 1) {
      diff |= hashBytes[i] ^ storedBytes[i];
    }
    return diff === 0;
  };

  try {
    return await compareHashes(DEFAULT_ITERATIONS);
  } catch (error) {
    if (DEFAULT_ITERATIONS === LEGACY_ITERATIONS) return false;
    try {
      return await compareHashes(LEGACY_ITERATIONS);
    } catch (legacyError) {
      return false;
    }
  }
};
