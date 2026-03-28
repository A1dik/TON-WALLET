/**
 * useActivityTracker.ts
 *
 * Трекинг активности пользователя → автоблокировка кошелька при неактивности.
 *
 * SRP: хук отвечает только за таймер и DOM-события.
 * lock() вызывается из стора — хук не знает деталей блокировки.
 *
 * Работает только когда кошелёк разблокирован (status === 'unlocked').
 * При lock/unlock эффект автоматически перезапускается через deps.
 */

import { useEffect, useRef } from 'react';
import { useWalletStore, selectIsUnlocked } from '@/store/wallet-store';

// ---------------------------------------------------------------------------
// Константы
// ---------------------------------------------------------------------------

const INACTIVITY_TIMEOUT_MS = 5 * 60 * 1000; // 5 минут

const TRACKED_EVENTS = ['mousemove', 'keydown', 'click', 'touchstart'] as const;

// ---------------------------------------------------------------------------
// Хук
// ---------------------------------------------------------------------------

export function useActivityTracker(): void {
  const isUnlocked = useWalletStore(selectIsUnlocked);
  const lock = useWalletStore((s) => s.lock);

  // Используем ref для таймера — изменение ref не вызывает ре-рендер
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isUnlocked) return;

    function clearTimer(): void {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    }

    function resetTimer(): void {
      clearTimer();
      timerRef.current = setTimeout(lock, INACTIVITY_TIMEOUT_MS);
    }

    // Запускаем таймер сразу при разблокировке
    resetTimer();

    // Сбрасываем таймер при любой активности
    for (const event of TRACKED_EVENTS) {
      window.addEventListener(event, resetTimer, { passive: true });
    }

    return () => {
      clearTimer();
      for (const event of TRACKED_EVENTS) {
        window.removeEventListener(event, resetTimer);
      }
    };
  }, [isUnlocked, lock]);
}
