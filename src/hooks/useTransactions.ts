/**
 * useTransactions.ts
 *
 * Polling транзакций кошелька каждые 15 секунд.
 * Мёрджит новые транзакции в стор без дублей (через mergeTransactions).
 * Работает только когда кошелёк разблокирован и есть адрес.
 */

import { useCallback, useEffect, useState } from 'react';
import { getTransactions } from '@/services/ton-api';
import {
  selectAddress,
  selectIsUnlocked,
  useWalletStore,
} from '@/store/wallet-store';

const POLL_INTERVAL_MS = 30_000;
/** Сдвиг старта polling транзакций — чтобы не совпадать с polling баланса */
const POLL_INITIAL_DELAY_MS = 3_000;
const TX_LIMIT = 20;

export interface UseTransactionsResult {
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useTransactions(): UseTransactionsResult {
  const isUnlocked = useWalletStore(selectIsUnlocked);
  const address = useWalletStore(selectAddress);
  const mergeTransactions = useWalletStore((s) => s.mergeTransactions);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTransactions = useCallback(async (): Promise<void> => {
    if (!isUnlocked || !address) return;

    const result = await getTransactions(address, TX_LIMIT);

    if (result.ok) {
      mergeTransactions(result.value);
      setError(null);
    } else {
      setError(result.error.message);
      if (import.meta.env.DEV) {
        console.warn('[useTransactions] Ошибка получения транзакций:', result.error);
      }
    }
  }, [isUnlocked, address, mergeTransactions]);

  useEffect(() => {
    if (!isUnlocked || !address) return;

    // Первый запрос через небольшой сдвиг — чтобы не совпасть с запросом баланса
    setLoading(true);
    const delayId = setTimeout(() => {
      fetchTransactions().finally(() => setLoading(false));
    }, POLL_INITIAL_DELAY_MS);

    const intervalId = setInterval(fetchTransactions, POLL_INTERVAL_MS);

    return () => {
      clearTimeout(delayId);
      clearInterval(intervalId);
    };
  }, [isUnlocked, address, fetchTransactions]);

  return { loading, error, refetch: fetchTransactions };
}
