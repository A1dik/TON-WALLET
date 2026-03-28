// @vitest-environment node
// Web Crypto API (window.crypto.subtle) доступен в Node.js 19+ глобально.
// node-окружение предпочтительно для чистых сервисов без DOM-зависимостей.

import { describe, it, expect } from 'vitest';
import { encrypt, decrypt } from '@/services/encryption';
import { TEST_PASSWORD, WRONG_PASSWORD } from '../fixtures/wallet.fixture';

describe('encryption service', () => {
  describe('encrypt + decrypt round-trip', () => {
    it('должен корректно зашифровать и дешифровать строку', async () => {
      const plaintext = 'hello world мнемоника тест';
      const encResult = await encrypt(plaintext, TEST_PASSWORD);

      expect(encResult.ok).toBe(true);
      if (!encResult.ok) return;

      const decResult = await decrypt(encResult.value, TEST_PASSWORD);
      expect(decResult.ok).toBe(true);
      if (!decResult.ok) return;

      expect(decResult.value).toBe(plaintext);
    });

    it('должен возвращать уникальные IV при каждом шифровании', async () => {
      const encA = await encrypt('same plaintext', TEST_PASSWORD);
      const encB = await encrypt('same plaintext', TEST_PASSWORD);

      expect(encA.ok).toBe(true);
      expect(encB.ok).toBe(true);
      if (!encA.ok || !encB.ok) return;

      expect(encA.value.iv).not.toBe(encB.value.iv);
      expect(encA.value.salt).not.toBe(encB.value.salt);
      expect(encA.value.ciphertext).not.toBe(encB.value.ciphertext);
    });

    it('должен корректно шифровать длинную мнемонику (24 слова)', async () => {
      const mnemonic = Array(24).fill('abandon').join(' ');
      const encResult = await encrypt(mnemonic, TEST_PASSWORD);
      expect(encResult.ok).toBe(true);
      if (!encResult.ok) return;

      const decResult = await decrypt(encResult.value, TEST_PASSWORD);
      expect(decResult.ok).toBe(true);
      if (!decResult.ok) return;

      expect(decResult.value).toBe(mnemonic);
    });
  });

  describe('decrypt с неверным паролем', () => {
    it('должен возвращать INVALID_PASSWORD при неверном пароле', async () => {
      const encResult = await encrypt('secret data', TEST_PASSWORD);
      expect(encResult.ok).toBe(true);
      if (!encResult.ok) return;

      const decResult = await decrypt(encResult.value, WRONG_PASSWORD);
      expect(decResult.ok).toBe(false);
      if (decResult.ok) return;

      expect(decResult.error.code).toBe('INVALID_PASSWORD');
    });
  });

  describe('decrypt с повреждёнными данными', () => {
    it('должен возвращать DECRYPTION_FAILED при битом ciphertext', async () => {
      const encResult = await encrypt('data', TEST_PASSWORD);
      expect(encResult.ok).toBe(true);
      if (!encResult.ok) return;

      const corrupted = { ...encResult.value, ciphertext: 'aGVsbG8=' /* "hello" base64 */ };
      const decResult = await decrypt(corrupted, TEST_PASSWORD);

      expect(decResult.ok).toBe(false);
      if (decResult.ok) return;

      // Повреждённый ciphertext → auth tag mismatch → INVALID_PASSWORD
      expect(['INVALID_PASSWORD', 'DECRYPTION_FAILED']).toContain(decResult.error.code);
    });
  });

  describe('структура EncryptedBlob', () => {
    it('должен содержать ciphertext, iv, salt как непустые строки', async () => {
      const result = await encrypt('test', TEST_PASSWORD);
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const { ciphertext, iv, salt } = result.value;
      expect(ciphertext.length).toBeGreaterThan(0);
      expect(iv.length).toBeGreaterThan(0);
      expect(salt.length).toBeGreaterThan(0);
    });
  });
});
