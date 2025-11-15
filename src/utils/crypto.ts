/**
 * Crypto Utilities for API Key Encryption
 *
 * Uses Web Crypto API (AES-GCM) for proper encryption of sensitive data like API keys.
 * This is production-ready encryption, unlike base64 encoding which is NOT secure.
 *
 * Security Features:
 * - AES-GCM 256-bit encryption
 * - PBKDF2 key derivation with 100,000 iterations
 * - Unique IV (Initialization Vector) per encryption
 * - Authenticated encryption (prevents tampering)
 */

/**
 * Encrypts an API key using AES-GCM encryption
 *
 * @param apiKey - The plain text API key to encrypt
 * @param masterKey - The master encryption key (from environment variable)
 * @param salt - Optional salt for key derivation (defaults to workspace-specific salt)
 * @returns Base64-encoded encrypted data (IV + ciphertext)
 */
export async function encryptAPIKey(
  apiKey: string,
  masterKey: string,
  salt: string = 'iofold-salt-v1'
): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(apiKey);

  // Derive encryption key from master key using PBKDF2
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(masterKey),
    'PBKDF2',
    false,
    ['deriveBits', 'deriveKey']
  );

  const key = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: encoder.encode(salt),
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );

  // Generate random IV (12 bytes is standard for AES-GCM)
  const iv = crypto.getRandomValues(new Uint8Array(12));

  // Encrypt the data
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    data
  );

  // Combine IV + encrypted data for storage
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(encrypted), iv.length);

  // Return as base64 for storage in database
  return btoa(String.fromCharCode(...combined));
}

/**
 * Decrypts an API key that was encrypted with encryptAPIKey
 *
 * @param encryptedData - Base64-encoded encrypted data (IV + ciphertext)
 * @param masterKey - The master encryption key (must match encryption key)
 * @param salt - Optional salt for key derivation (must match encryption salt)
 * @returns The decrypted API key in plain text
 * @throws Error if decryption fails (wrong key, corrupted data, etc.)
 */
export async function decryptAPIKey(
  encryptedData: string,
  masterKey: string,
  salt: string = 'iofold-salt-v1'
): Promise<string> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();

  // Decode base64 to bytes
  const combined = Uint8Array.from(atob(encryptedData), c => c.charCodeAt(0));

  // Extract IV (first 12 bytes) and encrypted data (rest)
  const iv = combined.slice(0, 12);
  const encrypted = combined.slice(12);

  // Derive decryption key (same process as encryption)
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(masterKey),
    'PBKDF2',
    false,
    ['deriveBits', 'deriveKey']
  );

  const key = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: encoder.encode(salt),
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );

  // Decrypt the data
  try {
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      encrypted
    );

    return decoder.decode(decrypted);
  } catch (error) {
    throw new Error('Failed to decrypt API key. Invalid encryption key or corrupted data.');
  }
}

/**
 * Checks if a string is encrypted (vs base64 encoded)
 *
 * This is a heuristic check - encrypted data should be at least 28 bytes
 * (12-byte IV + 16-byte auth tag minimum)
 *
 * @param data - The data to check
 * @returns true if data appears to be encrypted, false if it's likely base64
 */
export function isEncrypted(data: string): boolean {
  try {
    const bytes = Uint8Array.from(atob(data), c => c.charCodeAt(0));
    // Encrypted data: IV (12 bytes) + ciphertext + auth tag (16 bytes)
    // Minimum size is 28 bytes
    return bytes.length >= 28;
  } catch {
    return false;
  }
}

/**
 * Migration helper: Re-encrypt a base64-encoded API key with proper encryption
 *
 * Use this to migrate existing base64-encoded keys to AES-GCM encryption
 *
 * @param base64EncodedKey - The base64-encoded API key (old format)
 * @param masterKey - The master encryption key (from environment)
 * @returns Properly encrypted API key
 */
export async function migrateBase64ToEncrypted(
  base64EncodedKey: string,
  masterKey: string
): Promise<string> {
  // Decode the base64 to get the plain text API key
  const plainTextKey = atob(base64EncodedKey);

  // Encrypt it properly
  return encryptAPIKey(plainTextKey, masterKey);
}
