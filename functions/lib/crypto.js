const encoder = new TextEncoder();
const decoder = new TextDecoder();

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

const normalizeKeyBytes = (rawKey) => {
  if (!rawKey) {
    throw new Error('PROVIDER_SETTINGS_ENCRYPTION_KEY saknas');
  }

  if (rawKey.startsWith('base64:')) {
    const decoded = decodeBase64(rawKey.replace('base64:', ''));
    if (decoded.length !== 32) {
      throw new Error('PROVIDER_SETTINGS_ENCRYPTION_KEY måste vara 32 byte (base64)');
    }
    return decoded;
  }

  try {
    const decoded = decodeBase64(rawKey);
    if (decoded.length === 32) {
      return decoded;
    }
  } catch (error) {
    // Ignore base64 decode errors, fall back to raw string.
  }

  const rawBytes = encoder.encode(rawKey);
  if (rawBytes.length < 32) {
    throw new Error('PROVIDER_SETTINGS_ENCRYPTION_KEY måste vara minst 32 tecken');
  }

  return rawBytes.slice(0, 32);
};

const getAesKey = async (env) => {
  const rawKey = env.PROVIDER_SETTINGS_ENCRYPTION_KEY;
  const keyBytes = normalizeKeyBytes(rawKey);

  return crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt']
  );
};

export const encryptSecret = async (env, plaintext) => {
  if (!plaintext) return null;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await getAesKey(env);
  const cipher = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(plaintext)
  );

  return `${encodeBase64(iv)}.${encodeBase64(new Uint8Array(cipher))}`;
};

export const decryptSecret = async (env, payload) => {
  if (!payload) return null;
  const [ivBase64, cipherBase64] = payload.split('.');
  if (!ivBase64 || !cipherBase64) {
    throw new Error('Ogiltigt krypterat värde');
  }
  const iv = decodeBase64(ivBase64);
  const cipher = decodeBase64(cipherBase64);
  const key = await getAesKey(env);
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    cipher
  );

  return decoder.decode(plaintext);
};
