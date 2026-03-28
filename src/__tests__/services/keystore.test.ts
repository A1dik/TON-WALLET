// Тест использует jsdom (дефолт) — localStorage доступен.
// generateWallet мокируется через фикстуру чтобы не тянуть @ton/crypto в jsdom.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  hasWallet,
  saveWallet,
  loadStoredWallet,
  unlockWallet,
  clearWallet,
  getRateLimitStatus,
} from '@/services/keystore';
import {
  VALID_MNEMONIC_WORDS,
  TEST_PASSWORD,
  WRONG_PASSWORD,
} from '../fixtures/wallet.fixture';

// Мок wallet.ts — тест keystore не должен тестировать криптографию ключей
vi.mock('@/services/wallet', () => ({
  generateWallet: vi.fn().mockResolvedValue({
    ok: true,
    value: {
      words: [...VALID_MNEMONIC_WORDS],
      walletData: { address: 'UQMockAddress', bounceableAddress: 'EQMockAddress' },
    },
  }),
}));

import { generateWallet } from '@/services/wallet';

// jsdom предоставляет localStorage, но нужно чистить между тестами
beforeEach(() => {
  localStorage.clear();
  vi.useRealTimers();
});

describe('keystore service', () => {
  describe('hasWallet', () => {
    it('возвращает false когда кошелёк не сохранён', () => {
      expect(hasWallet()).toBe(false);
    });

    it('возвращает true после сохранения кошелька', async () => {
      const words = [...VALID_MNEMONIC_WORDS];
      await saveWallet(words, 'UQ_address', 'EQ_address', TEST_PASSWORD);
      expect(hasWallet()).toBe(true);
    });
  });

  describe('saveWallet + loadStoredWallet', () => {
    it('должен сохранить и загрузить данные кошелька', async () => {
      const words = [...VALID_MNEMONIC_WORDS];
      const address = 'UQTestAddress';
      const bounceableAddress = 'EQTestAddress';

      const saveResult = await saveWallet(words, address, bounceableAddress, TEST_PASSWORD);
      expect(saveResult.ok).toBe(true);

      const loadResult = loadStoredWallet();
      expect(loadResult.ok).toBe(true);
      if (!loadResult.ok) return;

      expect(loadResult.value.address).toBe(address);
      expect(loadResult.value.bounceableAddress).toBe(bounceableAddress);
      // Мнемоника должна быть зашифрована (не в открытом виде)
      const storedRaw = JSON.stringify(loadResult.value);
      expect(storedRaw).not.toContain(words[0]);
    });
  });

  describe('loadStoredWallet', () => {
    it('возвращает NOT_FOUND когда кошелёк не сохранён', () => {
      const result = loadStoredWallet();
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe('NOT_FOUND');
    });

    it('возвращает CORRUPTED при повреждённых данных', () => {
      localStorage.setItem('ton_wallet_v1', 'not-valid-json{{{');
      const result = loadStoredWallet();
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe('CORRUPTED');
    });
  });

  describe('unlockWallet', () => {
    beforeEach(async () => {
      const genResult = await generateWallet();
      if (!genResult.ok) throw new Error('generateWallet failed in test setup');
      const { words, walletData } = genResult.value;
      await saveWallet(words, walletData.address, walletData.bounceableAddress, TEST_PASSWORD);
    });

    it('должен разблокировать кошелёк с правильным паролем', async () => {
      const result = await unlockWallet(TEST_PASSWORD);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toHaveLength(24);
    });

    it('должен отклонять неверный пароль', async () => {
      const result = await unlockWallet(WRONG_PASSWORD);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe('INVALID_PASSWORD');
    });

    it('должен сбросить счётчик попыток при успешном входе', async () => {
      // 2 неудачные попытки
      await unlockWallet(WRONG_PASSWORD);
      await unlockWallet(WRONG_PASSWORD);

      // Успешная
      const result = await unlockWallet(TEST_PASSWORD);
      expect(result.ok).toBe(true);

      // После успеха — счётчик сброшен
      const status = getRateLimitStatus();
      expect(status.isLocked).toBe(false);
    });
  });

  describe('rate limiting', () => {
    beforeEach(async () => {
      const genResult = await generateWallet();
      if (!genResult.ok) throw new Error('generateWallet failed in test setup');
      const { words, walletData } = genResult.value;
      await saveWallet(words, walletData.address, walletData.bounceableAddress, TEST_PASSWORD);
    });

    it('должен заблокировать после 5 неудачных попыток', async () => {
      for (let i = 0; i < 5; i++) {
        await unlockWallet(WRONG_PASSWORD);
      }

      const result = await unlockWallet(WRONG_PASSWORD);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe('RATE_LIMITED');
      expect(result.error.retryAfterSeconds).toBeGreaterThan(0);
    });

    it('getRateLimitStatus должен показывать блокировку', async () => {
      for (let i = 0; i < 5; i++) {
        await unlockWallet(WRONG_PASSWORD);
      }

      const status = getRateLimitStatus();
      expect(status.isLocked).toBe(true);
      expect(status.retryAfterSeconds).toBeGreaterThan(0);
    });

    it('должен разблокироваться после истечения таймаута', async () => {
      vi.useFakeTimers();

      for (let i = 0; i < 5; i++) {
        await unlockWallet(WRONG_PASSWORD);
      }

      // Перематываем время вперёд на 2 минуты (первый lockout = 2^0 = 1 минута)
      vi.advanceTimersByTime(2 * 60 * 1000);

      const result = await unlockWallet(TEST_PASSWORD);
      expect(result.ok).toBe(true);
    });
  });

  describe('clearWallet', () => {
    it('должен удалить все данные кошелька', async () => {
      await saveWallet([...VALID_MNEMONIC_WORDS], 'addr', 'baddr', TEST_PASSWORD);
      expect(hasWallet()).toBe(true);

      clearWallet();
      expect(hasWallet()).toBe(false);
      expect(loadStoredWallet().ok).toBe(false);
    });
  });
});
