/**
 * workspaceCryptoService.ts
 * Native Web Crypto API (SubtleCrypto) AES-256-GCM encryption for client-side recipe workspaces.
 * Operates purely in-memory with zero third-party dependencies.
 */

function bufferToBase64(buffer: Uint8Array): string {
  let binary = '';
  const len = buffer.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(buffer[i]);
  }
  return btoa(binary);
}

function base64ToBuffer(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function getCrypto(): Crypto {
  const c = typeof window !== 'undefined' ? window.crypto : globalThis.crypto;
  if (!c?.subtle) {
    throw new Error('Web Crypto API is unavailable in this environment');
  }
  return c;
}

export class WorkspaceCryptoService {
  private static cachedCryptoKey: { base64: string; key: CryptoKey } | null = null;

  /**
   * Generates a cryptographically strong 256-bit AES-GCM key, exported as Base64.
   */
  static async generateKey(): Promise<string> {
    const crypto = getCrypto();
    const key = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
    );
    const raw = await crypto.subtle.exportKey('raw', key);
    return bufferToBase64(new Uint8Array(raw));
  }

  /**
   * Imports or retrieves cached CryptoKey from a Base64 string.
   */
  private static async getCryptoKey(base64Key: string): Promise<CryptoKey> {
    if (this.cachedCryptoKey && this.cachedCryptoKey.base64 === base64Key) {
      return this.cachedCryptoKey.key;
    }
    const crypto = getCrypto();
    const rawBytes = base64ToBuffer(base64Key);
    const key = await crypto.subtle.importKey(
      'raw',
      rawBytes.buffer.slice(rawBytes.byteOffset, rawBytes.byteOffset + rawBytes.byteLength) as ArrayBuffer,
      { name: 'AES-GCM' },
      false,
      ['encrypt', 'decrypt']
    );
    this.cachedCryptoKey = { base64: base64Key, key };
    return key;
  }

  /**
   * Checks whether a raw storage string is encrypted with the v1 AES-GCM envelope.
   */
  static isEncrypted(payload: string): boolean {
    return typeof payload === 'string' && payload.startsWith('v1:');
  }

  /**
   * Encrypts plaintext string using AES-256-GCM with a freshly generated 12-byte IV.
   * Format: `v1:<base64(iv + ciphertext)>`
   */
  static async encryptData(plaintext: string, base64Key: string): Promise<string> {
    const crypto = getCrypto();
    const key = await this.getCryptoKey(base64Key);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(plaintext);

    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      encoded.buffer.slice(encoded.byteOffset, encoded.byteOffset + encoded.byteLength) as ArrayBuffer
    );

    const combined = new Uint8Array(iv.byteLength + ciphertext.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(ciphertext), iv.byteLength);

    return `v1:${bufferToBase64(combined)}`;
  }

  /**
   * Decrypts a `v1:<base64>` bundle back into plaintext string.
   */
  static async decryptData(encryptedBundle: string, base64Key: string): Promise<string> {
    if (!this.isEncrypted(encryptedBundle)) {
      throw new Error('Invalid encryption envelope');
    }

    const rawBase64 = encryptedBundle.slice(3);
    const combined = base64ToBuffer(rawBase64);
    if (combined.byteLength < 13) {
      throw new Error('Malformed ciphertext bundle');
    }

    const iv = combined.slice(0, 12);
    const ciphertext = combined.slice(12);
    const crypto = getCrypto();
    const key = await this.getCryptoKey(base64Key);

    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      ciphertext.buffer.slice(ciphertext.byteOffset, ciphertext.byteOffset + ciphertext.byteLength) as ArrayBuffer
    );

    return new TextDecoder().decode(decrypted);
  }

  /**
   * Purges cached CryptoKey from memory.
   */
  static clearCache(): void {
    this.cachedCryptoKey = null;
  }
}
