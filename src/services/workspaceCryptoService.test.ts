/**
 * workspaceCryptoService.test.ts
 * Self-check verification for WorkspaceCryptoService.
 * Validates AES-256-GCM key generation, encryption, decryption, envelope safety, and tampering defense.
 */
import { WorkspaceCryptoService } from './workspaceCryptoService';

export async function runWorkspaceCryptoServiceSelfCheck(): Promise<boolean> {
  // Test 1: Key generation format
  const key1 = await WorkspaceCryptoService.generateKey();
  const key2 = await WorkspaceCryptoService.generateKey();
  if (!key1 || !key2 || key1 === key2) {
    throw new Error('Key generation failed or generated non-unique keys');
  }

  // Test 2: Encrypt and decrypt roundtrip
  const testPayload = JSON.stringify({
    title: "S'mores Cookies",
    ingredients: ['marshmallow', 'chocolate', 'graham cracker'],
    emoji: '🍪🔥',
    nested: { steps: 12, notes: 'Rich text test with special characters: "quotes", \\backslashes, newline \n' }
  });

  const encrypted = await WorkspaceCryptoService.encryptData(testPayload, key1);
  if (!WorkspaceCryptoService.isEncrypted(encrypted)) {
    throw new Error('Encryption envelope missing v1: prefix');
  }

  const decrypted = await WorkspaceCryptoService.decryptData(encrypted, key1);
  if (decrypted !== testPayload) {
    throw new Error('Decrypted content does not match original plaintext');
  }

  // Test 3: IV non-repeatability (encrypting same text produces different ciphertext)
  const encryptedSecond = await WorkspaceCryptoService.encryptData(testPayload, key1);
  if (encrypted === encryptedSecond) {
    throw new Error('Deterministic IV vulnerability: repeated encryption produced identical ciphertext');
  }

  // Test 4: Decryption failure with wrong key
  let wrongKeyFailed = false;
  try {
    await WorkspaceCryptoService.decryptData(encrypted, key2);
  } catch {
    wrongKeyFailed = true;
  }
  if (!wrongKeyFailed) {
    throw new Error('Decryption succeeded with invalid key (authentication tag failed to protect payload)');
  }

  // Test 5: Tamper resistance (tampering with ciphertext payload)
  let tamperFailed = false;
  try {
    const tampered = encrypted.slice(0, -4) + 'AAAA';
    await WorkspaceCryptoService.decryptData(tampered, key1);
  } catch {
    tamperFailed = true;
  }
  if (!tamperFailed) {
    throw new Error('Decryption succeeded on tampered ciphertext');
  }

  return true;
}

if ((import.meta as unknown as Record<string, unknown>).main) {
  runWorkspaceCryptoServiceSelfCheck()
    .then(() => {
      console.log('workspaceCryptoService self-check passed.');
    })
    .catch((err) => {
      console.error('workspaceCryptoService self-check failed:', err);
      const proc = (globalThis as Record<string, unknown>).process as { exit?: (code: number) => void } | undefined;
      proc?.exit?.(1);
    });
}
