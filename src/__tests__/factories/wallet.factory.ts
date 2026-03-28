/**
 * Фабрика состояний кошелька для тестов.
 *
 * createUnlockedState() — стор настроен как «разблокирован».
 * createLockedState()   — стор настроен как «заблокирован».
 * createNoWalletState() — стор в начальном состоянии (нет кошелька).
 *
 * Использование: вызывать __resetStore() в beforeEach, затем применять нужную фабрику
 * через useWalletStore.setState(factory()).
 */

import type { Transaction } from '@/types';
import { TEST_ADDRESS, TEST_BOUNCEABLE_ADDRESS } from '@/__tests__/fixtures/wallet.fixture';

/** Публичный ключ-заглушка (32 байта) — для тестов, не для реальных операций */
const STUB_PUBLIC_KEY = new Uint8Array(32).fill(1);
/** Секретный ключ-заглушка (64 байта) */
const STUB_SECRET_KEY = new Uint8Array(64).fill(2);

interface UnlockedStateOverrides {
  balance?: string | null;
  transactions?: Transaction[];
}

export function createUnlockedState(overrides: UnlockedStateOverrides = {}) {
  return {
    status: 'unlocked' as const,
    screen: 'dashboard' as const,
    address: TEST_ADDRESS,
    bounceableAddress: TEST_BOUNCEABLE_ADDRESS,
    // Явная проверка через 'balance' in — чтобы null тоже применялся как override
    balance: 'balance' in overrides ? overrides.balance : '5000000000',
    transactions: overrides.transactions ?? [],
    sessionKeys: {
      publicKey: STUB_PUBLIC_KEY,
      secretKey: STUB_SECRET_KEY,
    },
    pendingMnemonic: null,
  };
}

export function createLockedState() {
  return {
    status: 'locked' as const,
    screen: 'unlock' as const,
    address: TEST_ADDRESS,
    bounceableAddress: TEST_BOUNCEABLE_ADDRESS,
    balance: null,
    transactions: [],
    sessionKeys: null,
    pendingMnemonic: null,
  };
}

export function createNoWalletState() {
  return {
    status: 'no-wallet' as const,
    screen: 'onboarding' as const,
    address: null,
    bounceableAddress: null,
    balance: null,
    transactions: [],
    sessionKeys: null,
    pendingMnemonic: null,
  };
}
