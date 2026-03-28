/**
 * wallet-store.ts
 *
 * Центральный стор приложения (Zustand).
 *
 * Архитектура:
 *   - Стор не знает о таймерах автоблокировки — это зона useActivityTracker (SRP).
 *   - sessionKeys хранятся только в памяти (не персистируются).
 *   - При lock() sessionKeys зануляются через fill(0) перед удалением из стейта.
 *   - Транзакции дедуплицируются через Map<id, Transaction> внутри стора.
 *
 * Персистентность:
 *   - Зашифрованная мнемоника и адрес — в localStorage (через keystore.ts).
 *   - Баланс и транзакции — только в памяти (polling при каждой сессии).
 */

import { create } from 'zustand';
import { deriveKeys } from '@/services/wallet';
import { hasWallet, loadStoredWallet, unlockWallet } from '@/services/keystore';
import type {
  KeystoreError,
  Result,
  Screen,
  SessionKeys,
  Transaction,
  WalletActions,
  WalletState,
} from '@/types';
import { err, ok } from '@/types';

// ---------------------------------------------------------------------------
// Внутреннее расширенное состояние — Map для O(1) дедупликации
// ---------------------------------------------------------------------------

interface InternalState extends WalletState {
  /** Map для быстрой дедупликации при merge */
  _transactionsById: Map<string, Transaction>;
}

type StoreState = InternalState & WalletActions;

// ---------------------------------------------------------------------------
// Утилиты
// ---------------------------------------------------------------------------

function zeroAndClear(keys: SessionKeys | null): null {
  if (keys !== null) {
    keys.secretKey.fill(0);
    keys.publicKey.fill(0);
  }
  return null;
}

function deriveTransactionsArray(map: Map<string, Transaction>): Transaction[] {
  return Array.from(map.values()).sort((a, b) => b.timestamp - a.timestamp);
}

// ---------------------------------------------------------------------------
// Начальное состояние
// ---------------------------------------------------------------------------

const INITIAL_STATE: InternalState = {
  status: 'no-wallet',
  screen: 'onboarding',
  address: null,
  bounceableAddress: null,
  balance: null,
  transactions: [],
  sessionKeys: null,
  pendingMnemonic: null,
  _transactionsById: new Map(),
};

// ---------------------------------------------------------------------------
// Утилита для тестов — полный сброс стора
// ---------------------------------------------------------------------------

/** @internal Только для тестов — сбрасывает стор в начальное состояние */
export function __resetStore(): void {
  useWalletStore.setState({
    ...INITIAL_STATE,
    _transactionsById: new Map(),
    pendingMnemonic: null,
  });
}

// ---------------------------------------------------------------------------
// Стор
// ---------------------------------------------------------------------------

export const useWalletStore = create<StoreState>((set, get) => ({
  ...INITIAL_STATE,

  init() {
    if (!hasWallet()) {
      set({ status: 'no-wallet', screen: 'onboarding' });
      return;
    }

    const walletResult = loadStoredWallet();
    if (!walletResult.ok) {
      // Данные повреждены — сбрасываем в начальное состояние
      set({ status: 'no-wallet', screen: 'onboarding' });
      return;
    }

    set({
      status: 'locked',
      screen: 'unlock',
      address: walletResult.value.address,
      bounceableAddress: walletResult.value.bounceableAddress,
    });
  },

  navigate(screen: Screen) {
    set({ screen });
  },

  setPendingMnemonic(words: string[]) {
    set({ pendingMnemonic: words });
  },

  clearPendingMnemonic() {
    const current = get().pendingMnemonic;
    if (current !== null) {
      // Зануляем строки в массиве (JS-строки иммутабельны, GC-компромисс)
      current.fill('');
    }
    set({ pendingMnemonic: null });
  },

  async unlock(password: string): Promise<Result<void, KeystoreError>> {
    // 1. Дешифруем мнемонику (включает rate-limit проверку)
    const mnemonicResult = await unlockWallet(password);
    if (!mnemonicResult.ok) return mnemonicResult;

    const words = mnemonicResult.value;

    // 2. Деривируем ключи из мнемоники
    const keysResult = await deriveKeys(words);

    // Зануляем слова сразу — они больше не нужны
    // (JS-строки иммутабельны, fill не применим — это компромисс браузерной среды)
    words.fill('');

    if (!keysResult.ok) {
      return err({ code: 'CORRUPTED', message: 'Ошибка деривации ключа из мнемоники' });
    }

    // 3. Читаем адрес из localStorage (нужен при первом создании, когда init() ещё не вызывался)
    const walletData = loadStoredWallet();
    const address = walletData.ok ? walletData.value.address : get().address;
    const bounceableAddress = walletData.ok ? walletData.value.bounceableAddress : get().bounceableAddress;

    // 4. Зануляем предыдущие сессионные ключи (если были)
    zeroAndClear(get().sessionKeys);

    set({
      status: 'unlocked',
      screen: 'dashboard',
      address,
      bounceableAddress,
      sessionKeys: {
        publicKey: keysResult.value.publicKey,
        secretKey: keysResult.value.secretKey,
      },
    });

    return ok(undefined);
  },

  lock() {
    // Зануляем ключи перед удалением из стейта
    zeroAndClear(get().sessionKeys);

    set({
      status: 'locked',
      screen: 'unlock',
      sessionKeys: null,
      // Баланс и транзакции сбрасываем — получим свежие при следующей разблокировке
      balance: null,
      transactions: [],
      _transactionsById: new Map(),
    });
  },

  setBalance(balance: string) {
    if (get().status !== 'unlocked') return;
    set({ balance });
  },

  mergeTransactions(incoming: Transaction[]) {
    if (get().status !== 'unlocked') return;
    if (incoming.length === 0) return;

    const map = new Map(get()._transactionsById);
    for (const tx of incoming) {
      map.set(tx.id, tx);
    }

    set({
      _transactionsById: map,
      transactions: deriveTransactionsArray(map),
    });
  },
}));

// ---------------------------------------------------------------------------
// Селекторы — мемоизированные срезы состояния для компонентов
// ---------------------------------------------------------------------------

export const selectStatus = (s: StoreState) => s.status;
export const selectScreen = (s: StoreState) => s.screen;
export const selectAddress = (s: StoreState) => s.address;
export const selectBounceableAddress = (s: StoreState) => s.bounceableAddress;
export const selectBalance = (s: StoreState) => s.balance;
export const selectTransactions = (s: StoreState) => s.transactions;
export const selectSessionKeys = (s: StoreState) => s.sessionKeys;
export const selectPendingMnemonic = (s: StoreState) => s.pendingMnemonic;
export const selectIsUnlocked = (s: StoreState) => s.status === 'unlocked';
export const selectIsLocked = (s: StoreState) => s.status === 'locked';
export const selectHasWallet = (s: StoreState) => s.status !== 'no-wallet';
