/**
 * Тесты wallet-store.
 *
 * Окружение: jsdom (дефолт) — localStorage доступен.
 * Зависимости мокируются:
 *   - @/services/keystore — избегаем реального localStorage-манипуляций
 *   - @/services/wallet   — избегаем @ton/crypto в jsdom
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Моки — объявляем до импорта стора (vi.mock hoisting)
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  hasWallet: vi.fn<() => boolean>(),
  loadStoredWallet: vi.fn(),
  unlockWallet: vi.fn(),
  deriveKeys: vi.fn(),
}));

vi.mock('@/services/keystore', () => ({
  hasWallet: mocks.hasWallet,
  loadStoredWallet: mocks.loadStoredWallet,
  unlockWallet: mocks.unlockWallet,
}));

vi.mock('@/services/wallet', () => ({
  deriveKeys: mocks.deriveKeys,
}));

// ---------------------------------------------------------------------------
// Импорт стора — после объявления моков
// ---------------------------------------------------------------------------

import { useWalletStore, __resetStore } from '@/store/wallet-store';
import type { SessionKeys, Transaction } from '@/types';
import { VALID_MNEMONIC_WORDS, TEST_PASSWORD, WRONG_PASSWORD } from '../fixtures/wallet.fixture';

// ---------------------------------------------------------------------------
// Вспомогательные данные
// ---------------------------------------------------------------------------

const MOCK_ADDRESS = 'UQTestAddress123';
const MOCK_BOUNCEABLE = 'EQTestAddress123';

const MOCK_SESSION_KEYS: SessionKeys = {
  publicKey: new Uint8Array(32).fill(1),
  secretKey: new Uint8Array(64).fill(2),
};

const MOCK_STORED_WALLET = {
  encryptedMnemonic: { ciphertext: 'abc', iv: 'def', salt: 'ghi' },
  address: MOCK_ADDRESS,
  bounceableAddress: MOCK_BOUNCEABLE,
};

function makeTx(id: string, timestamp = 1000): Transaction {
  return {
    id,
    timestamp,
    direction: 'in',
    address: 'UQSomeAddress',
    amount: '1000000000',
  };
}

// ---------------------------------------------------------------------------
// Сброс стора между тестами
// ---------------------------------------------------------------------------

beforeEach(() => {
  // Zustand — singleton: сбрасываем стор в начальное состояние перед каждым тестом
  __resetStore();
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Тесты
// ---------------------------------------------------------------------------

describe('wallet-store — init', () => {
  it('устанавливает no-wallet если кошелёк не найден', () => {
    mocks.hasWallet.mockReturnValue(false);

    act(() => {
      useWalletStore.getState().init();
    });

    expect(useWalletStore.getState().status).toBe('no-wallet');
  });

  it('устанавливает locked с адресом если кошелёк найден', () => {
    mocks.hasWallet.mockReturnValue(true);
    mocks.loadStoredWallet.mockReturnValue({ ok: true, value: MOCK_STORED_WALLET });

    act(() => {
      useWalletStore.getState().init();
    });

    const state = useWalletStore.getState();
    expect(state.status).toBe('locked');
    expect(state.address).toBe(MOCK_ADDRESS);
    expect(state.bounceableAddress).toBe(MOCK_BOUNCEABLE);
  });

  it('устанавливает no-wallet если данные повреждены', () => {
    mocks.hasWallet.mockReturnValue(true);
    mocks.loadStoredWallet.mockReturnValue({
      ok: false,
      error: { code: 'CORRUPTED', message: 'Данные повреждены' },
    });

    act(() => {
      useWalletStore.getState().init();
    });

    expect(useWalletStore.getState().status).toBe('no-wallet');
  });
});

describe('wallet-store — unlock', () => {
  beforeEach(() => {
    // Начинаем с locked состояния
    mocks.hasWallet.mockReturnValue(true);
    mocks.loadStoredWallet.mockReturnValue({ ok: true, value: MOCK_STORED_WALLET });
    act(() => {
      useWalletStore.getState().init();
    });
  });

  it('переходит в unlocked при правильном пароле', async () => {
    mocks.unlockWallet.mockResolvedValue({
      ok: true,
      value: [...VALID_MNEMONIC_WORDS],
    });
    mocks.deriveKeys.mockResolvedValue({
      ok: true,
      value: {
        publicKey: MOCK_SESSION_KEYS.publicKey,
        secretKey: MOCK_SESSION_KEYS.secretKey,
      },
    });

    let result!: Awaited<ReturnType<typeof useWalletStore.getState.prototype.unlock>>;
    await act(async () => {
      result = await useWalletStore.getState().unlock(TEST_PASSWORD);
    });

    expect(result.ok).toBe(true);
    const state = useWalletStore.getState();
    expect(state.status).toBe('unlocked');
    expect(state.sessionKeys).not.toBeNull();
    expect(state.sessionKeys?.secretKey).toEqual(MOCK_SESSION_KEYS.secretKey);
  });

  it('остаётся locked при неверном пароле', async () => {
    mocks.unlockWallet.mockResolvedValue({
      ok: false,
      error: { code: 'INVALID_PASSWORD', message: 'Неверный пароль' },
    });

    let result!: Awaited<ReturnType<typeof useWalletStore.getState.prototype.unlock>>;
    await act(async () => {
      result = await useWalletStore.getState().unlock(WRONG_PASSWORD);
    });

    expect(result.ok).toBe(false);
    expect(useWalletStore.getState().status).toBe('locked');
    expect(useWalletStore.getState().sessionKeys).toBeNull();
  });

  it('возвращает RATE_LIMITED если превышен лимит попыток', async () => {
    mocks.unlockWallet.mockResolvedValue({
      ok: false,
      error: { code: 'RATE_LIMITED', message: 'Подождите', retryAfterSeconds: 60 },
    });

    let result!: Awaited<ReturnType<typeof useWalletStore.getState.prototype.unlock>>;
    await act(async () => {
      result = await useWalletStore.getState().unlock(WRONG_PASSWORD);
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('RATE_LIMITED');
    }
  });

  it('возвращает CORRUPTED если деривация ключей не удалась', async () => {
    mocks.unlockWallet.mockResolvedValue({
      ok: true,
      value: [...VALID_MNEMONIC_WORDS],
    });
    mocks.deriveKeys.mockResolvedValue({
      ok: false,
      error: { code: 'KEY_DERIVATION_FAILED', message: 'Ошибка' },
    });

    let result!: Awaited<ReturnType<typeof useWalletStore.getState.prototype.unlock>>;
    await act(async () => {
      result = await useWalletStore.getState().unlock(TEST_PASSWORD);
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('CORRUPTED');
    }
    expect(useWalletStore.getState().status).toBe('locked');
  });

  it('зануляет слова мнемоники после деривации', async () => {
    const words: string[] = [...VALID_MNEMONIC_WORDS];
    mocks.unlockWallet.mockResolvedValue({ ok: true, value: words });
    mocks.deriveKeys.mockResolvedValue({
      ok: true,
      value: { publicKey: new Uint8Array(32), secretKey: new Uint8Array(64) },
    });

    await act(async () => {
      await useWalletStore.getState().unlock(TEST_PASSWORD);
    });

    // Проверяем что слова, переданные deriveKeys, были занулены после вызова
    expect(words.every((w) => w === '')).toBe(true);
  });
});

describe('wallet-store — lock', () => {
  beforeEach(async () => {
    // Стартуем с unlocked состояния
    mocks.hasWallet.mockReturnValue(true);
    mocks.loadStoredWallet.mockReturnValue({ ok: true, value: MOCK_STORED_WALLET });
    act(() => {
      useWalletStore.getState().init();
    });

    mocks.unlockWallet.mockResolvedValue({ ok: true, value: [...VALID_MNEMONIC_WORDS] });
    mocks.deriveKeys.mockResolvedValue({
      ok: true,
      value: {
        publicKey: new Uint8Array(32).fill(1),
        secretKey: new Uint8Array(64).fill(2),
      },
    });
    await act(async () => {
      await useWalletStore.getState().unlock(TEST_PASSWORD);
    });
  });

  it('переводит статус в locked', () => {
    act(() => {
      useWalletStore.getState().lock();
    });

    expect(useWalletStore.getState().status).toBe('locked');
  });

  it('зануляет sessionKeys', () => {
    const keysBefore = useWalletStore.getState().sessionKeys;
    expect(keysBefore).not.toBeNull();

    act(() => {
      useWalletStore.getState().lock();
    });

    // sessionKeys убраны из стейта
    expect(useWalletStore.getState().sessionKeys).toBeNull();
    // Байты оригинального Uint8Array занулены
    expect(keysBefore!.secretKey.every((b) => b === 0)).toBe(true);
    expect(keysBefore!.publicKey.every((b) => b === 0)).toBe(true);
  });

  it('сбрасывает баланс и транзакции', () => {
    act(() => {
      useWalletStore.getState().setBalance('5000000000');
      useWalletStore.getState().mergeTransactions([makeTx('tx1')]);
    });

    act(() => {
      useWalletStore.getState().lock();
    });

    const state = useWalletStore.getState();
    expect(state.balance).toBeNull();
    expect(state.transactions).toHaveLength(0);
  });

  it('не меняет адрес при блокировке (адрес нужен для отображения на экране Locked)', () => {
    act(() => {
      useWalletStore.getState().lock();
    });

    expect(useWalletStore.getState().address).toBe(MOCK_ADDRESS);
  });
});

describe('wallet-store — setBalance', () => {
  beforeEach(async () => {
    mocks.hasWallet.mockReturnValue(true);
    mocks.loadStoredWallet.mockReturnValue({ ok: true, value: MOCK_STORED_WALLET });
    act(() => {
      useWalletStore.getState().init();
    });
    mocks.unlockWallet.mockResolvedValue({ ok: true, value: [...VALID_MNEMONIC_WORDS] });
    mocks.deriveKeys.mockResolvedValue({
      ok: true,
      value: { publicKey: new Uint8Array(32), secretKey: new Uint8Array(64) },
    });
    await act(async () => {
      await useWalletStore.getState().unlock(TEST_PASSWORD);
    });
  });

  it('обновляет баланс когда разблокирован', () => {
    act(() => {
      useWalletStore.getState().setBalance('3000000000');
    });

    expect(useWalletStore.getState().balance).toBe('3000000000');
  });

  it('игнорирует вызов когда заблокирован', () => {
    act(() => {
      useWalletStore.getState().lock();
      useWalletStore.getState().setBalance('9999');
    });

    expect(useWalletStore.getState().balance).toBeNull();
  });
});

describe('wallet-store — mergeTransactions', () => {
  beforeEach(async () => {
    mocks.hasWallet.mockReturnValue(true);
    mocks.loadStoredWallet.mockReturnValue({ ok: true, value: MOCK_STORED_WALLET });
    act(() => {
      useWalletStore.getState().init();
    });
    mocks.unlockWallet.mockResolvedValue({ ok: true, value: [...VALID_MNEMONIC_WORDS] });
    mocks.deriveKeys.mockResolvedValue({
      ok: true,
      value: { publicKey: new Uint8Array(32), secretKey: new Uint8Array(64) },
    });
    await act(async () => {
      await useWalletStore.getState().unlock(TEST_PASSWORD);
    });
  });

  it('добавляет новые транзакции', () => {
    act(() => {
      useWalletStore.getState().mergeTransactions([makeTx('tx1', 1000), makeTx('tx2', 2000)]);
    });

    expect(useWalletStore.getState().transactions).toHaveLength(2);
  });

  it('дедуплицирует транзакции с одинаковым id', () => {
    act(() => {
      useWalletStore.getState().mergeTransactions([makeTx('tx1', 1000)]);
    });
    act(() => {
      // Повторный merge с тем же id — не должен дублироваться
      useWalletStore.getState().mergeTransactions([makeTx('tx1', 1000), makeTx('tx2', 2000)]);
    });

    expect(useWalletStore.getState().transactions).toHaveLength(2);
  });

  it('сортирует транзакции по убыванию timestamp', () => {
    act(() => {
      useWalletStore.getState().mergeTransactions([
        makeTx('tx1', 1000),
        makeTx('tx3', 3000),
        makeTx('tx2', 2000),
      ]);
    });

    const txs = useWalletStore.getState().transactions;
    expect(txs[0].id).toBe('tx3');
    expect(txs[1].id).toBe('tx2');
    expect(txs[2].id).toBe('tx1');
  });

  it('игнорирует пустой массив', () => {
    act(() => {
      useWalletStore.getState().mergeTransactions([makeTx('tx1')]);
    });
    act(() => {
      useWalletStore.getState().mergeTransactions([]);
    });

    expect(useWalletStore.getState().transactions).toHaveLength(1);
  });

  it('игнорирует вызов когда заблокирован', () => {
    act(() => {
      useWalletStore.getState().lock();
      useWalletStore.getState().mergeTransactions([makeTx('tx1')]);
    });

    expect(useWalletStore.getState().transactions).toHaveLength(0);
  });
});

describe('wallet-store — селекторы', () => {
  it('selectHasWallet возвращает false для no-wallet', () => {
    mocks.hasWallet.mockReturnValue(false);
    act(() => {
      useWalletStore.getState().init();
    });

    const { result } = renderHook(() =>
      useWalletStore((s) => s.status !== 'no-wallet'),
    );
    expect(result.current).toBe(false);
  });

  it('selectIsUnlocked возвращает true только для unlocked', async () => {
    mocks.hasWallet.mockReturnValue(true);
    mocks.loadStoredWallet.mockReturnValue({ ok: true, value: MOCK_STORED_WALLET });
    act(() => {
      useWalletStore.getState().init();
    });

    const { result } = renderHook(() =>
      useWalletStore((s) => s.status === 'unlocked'),
    );
    expect(result.current).toBe(false);

    mocks.unlockWallet.mockResolvedValue({ ok: true, value: [...VALID_MNEMONIC_WORDS] });
    mocks.deriveKeys.mockResolvedValue({
      ok: true,
      value: { publicKey: new Uint8Array(32), secretKey: new Uint8Array(64) },
    });

    await act(async () => {
      await useWalletStore.getState().unlock(TEST_PASSWORD);
    });

    expect(result.current).toBe(true);
  });
});
