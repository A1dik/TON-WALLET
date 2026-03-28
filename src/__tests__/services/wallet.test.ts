// @vitest-environment node
// Сервис использует @ton/crypto → tweetnacl, который требует настоящий Node.js Uint8Array.
// jsdom-окружение создаёт Buffer-полифилл, несовместимый с tweetnacl.

import { describe, it, expect } from 'vitest';
import { generateWallet, importWallet, validateMnemonic, deriveKeys } from '@/services/wallet';
import {
  VALID_MNEMONIC_WORDS,
  INVALID_MNEMONIC_WORDS,
} from '../fixtures/wallet.fixture';

describe('wallet service', () => {
  describe('generateWallet', () => {
    it('должен генерировать кошелёк с 24 словами мнемоники', async () => {
      const result = await generateWallet();
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.words).toHaveLength(24);
      result.value.words.forEach((word) => expect(typeof word).toBe('string'));
    });

    it('должен возвращать корректный TON-адрес (testnet)', async () => {
      const result = await generateWallet();
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const { address, bounceableAddress } = result.value.walletData;

      // Non-bounceable testnet адрес начинается с 0Q или kQ (url-safe base64)
      expect(address).toMatch(/^[0-9A-Za-z_-]{48}$/);
      // Bounceable testnet адрес
      expect(bounceableAddress).toMatch(/^[0-9A-Za-z_-]{48}$/);
      // Они не должны совпадать
      expect(address).not.toBe(bounceableAddress);
    });

    it('должен генерировать уникальные кошельки при каждом вызове', async () => {
      const [a, b] = await Promise.all([generateWallet(), generateWallet()]);
      expect(a.ok && b.ok).toBe(true);
      if (!a.ok || !b.ok) return;

      expect(a.value.words.join(' ')).not.toBe(b.value.words.join(' '));
      expect(a.value.walletData.address).not.toBe(b.value.walletData.address);
    });
  });

  describe('importWallet', () => {
    it('должен принимать валидную мнемонику', async () => {
      const result = await importWallet([...VALID_MNEMONIC_WORDS]);
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.walletData.address).toBeTruthy();
      expect(result.value.walletData.bounceableAddress).toBeTruthy();
    });

    it('должен отклонять неверные слова мнемоники', async () => {
      const result = await importWallet([...INVALID_MNEMONIC_WORDS]);
      expect(result.ok).toBe(false);
      if (result.ok) return;

      expect(result.error.code).toBe('INVALID_MNEMONIC');
    });

    it('должен отклонять мнемонику неверной длины', async () => {
      const result = await importWallet(['word', 'word', 'word']);
      expect(result.ok).toBe(false);
      if (result.ok) return;

      expect(result.error.code).toBe('INVALID_MNEMONIC');
      expect(result.error.message).toContain('24');
    });

    it('должен быть детерминированным — одинаковая мнемоника → одинаковый адрес', async () => {
      const [a, b] = await Promise.all([
        importWallet([...VALID_MNEMONIC_WORDS]),
        importWallet([...VALID_MNEMONIC_WORDS]),
      ]);
      expect(a.ok && b.ok).toBe(true);
      if (!a.ok || !b.ok) return;

      expect(a.value.walletData.address).toBe(b.value.walletData.address);
    });
  });

  describe('validateMnemonic', () => {
    it('должен возвращать true для валидной мнемоники', async () => {
      const result = await validateMnemonic([...VALID_MNEMONIC_WORDS]);
      expect(result).toBe(true);
    });

    it('должен возвращать false для невалидных слов', async () => {
      const result = await validateMnemonic([...INVALID_MNEMONIC_WORDS]);
      expect(result).toBe(false);
    });

    it('должен возвращать false для неверной длины', async () => {
      const result = await validateMnemonic(['abandon', 'art']);
      expect(result).toBe(false);
    });
  });

  describe('deriveKeys', () => {
    it('должен возвращать ключи для валидной мнемоники', async () => {
      const result = await deriveKeys([...VALID_MNEMONIC_WORDS]);
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.publicKey).toBeInstanceOf(Uint8Array);
      expect(result.value.secretKey).toBeInstanceOf(Uint8Array);
      expect(result.value.publicKey.length).toBe(32);
      expect(result.value.secretKey.length).toBe(64);

      // Важно: тест сам обнуляет ключ (как и должны делать все вызывающие)
      result.value.secretKey.fill(0);
      expect(result.value.secretKey.every((b) => b === 0)).toBe(true);
    });

    it('должен отклонять невалидную мнемонику', async () => {
      const result = await deriveKeys([...INVALID_MNEMONIC_WORDS]);
      expect(result.ok).toBe(false);
      if (result.ok) return;

      expect(result.error.code).toBe('INVALID_MNEMONIC');
    });
  });
});
