/**
 * useBalance.ts
 *
 * Polling баланса кошелька каждые 15 секунд.
 * Работает только когда кошелёк разблокирован и есть адрес.
 * Также экспортирует ручное обновление (refetch).
 *
 * SRP: хук только получает данные и пишет в стор.
 * Ошибки API логируются в DEV, но не показываются пользователю напрямую —
 * Dashboard отображает последний известный баланс.
 */

import { useCallback, useEffect, useState } from 'react';
import { getBalance } from '@/services/ton-api';
import {
  selectAddress,
  selectIsUnlocked,
  useWalletStore,
} from '@/store/wallet-store';

const POLL_INTERVAL_MS = 30_000;

export interface UseBalanceResult {
  /** true во время первого (начального) запроса */
  loading: boolean;
  /** Последняя ошибка при получении баланса */
  error: string | null;
  /** Ручное обновление баланса */
  refetch: () => Promise<void>;
}

export function useBalance(): UseBalanceResult {
  const isUnlocked = useWalletStore(selectIsUnlocked);
  const address = useWalletStore(selectAddress);
  const setBalance = useWalletStore((s) => s.setBalance);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchBalance = useCallback(async (): Promise<void> => {
    if (!isUnlocked || !address) return;

    const result = await getBalance(address);

    if (result.ok) {
      setBalance(result.value);
      setError(null);
    } else {
      setError(result.error.message);
      if (import.meta.env.DEV) {
        console.warn('[useBalance] Ошибка получения баланса:', result.error);
      }
    }
  }, [isUnlocked, address, setBalance]);

  useEffect(() => {
    if (!isUnlocked || !address) return;

    // Немедленный первый запрос при монтировании
    setLoading(true);
    fetchBalance().finally(() => setLoading(false));

    const intervalId = setInterval(fetchBalance, POLL_INTERVAL_MS);
    return () => clearInterval(intervalId);
  }, [isUnlocked, address, fetchBalance]);

  return { loading, error, refetch: fetchBalance };
}
