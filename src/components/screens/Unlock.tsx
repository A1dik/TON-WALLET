/**
 * Unlock.tsx
 *
 * Экран разблокировки кошелька.
 * Показывает rate-limit таймер при блокировке.
 * При успехе — unlock переводит status→unlocked и screen→dashboard (через стор).
 */

import { useCallback, useEffect, useState } from 'react';
import { getRateLimitStatus } from '@/services/keystore';
import { useWalletStore } from '@/store/wallet-store';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { formatCountdown } from '@/utils/formatters';

export function Unlock() {
  const unlock = useWalletStore((s) => s.unlock);

  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState(0);

  // Проверяем и отображаем rate-limit таймер
  useEffect(() => {
    const status = getRateLimitStatus();
    if (status.isLocked) {
      setCountdown(status.retryAfterSeconds);
    }
  }, []);

  // Тикаем таймер каждую секунду
  useEffect(() => {
    if (countdown <= 0) return;
    const id = setInterval(() => {
      setCountdown((prev) => {
        const next = prev - 1;
        if (next <= 0) clearInterval(id);
        return Math.max(0, next);
      });
    }, 1000);
    return () => clearInterval(id);
  }, [countdown]);

  const handleUnlock = useCallback(async () => {
    if (!password || loading || countdown > 0) return;

    setError(null);
    setLoading(true);

    const result = await unlock(password);

    setLoading(false);

    if (!result.ok) {
      if (result.error.code === 'RATE_LIMITED' && result.error.retryAfterSeconds) {
        setCountdown(result.error.retryAfterSeconds);
        setError(result.error.message);
      } else {
        setError(result.error.message);
      }
      setPassword('');
    }
    // При успехе стор сам меняет screen → 'dashboard'
  }, [password, loading, countdown, unlock]);

  const isBlocked = countdown > 0;

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-6">
      <div className="w-full max-w-xs space-y-6">
        {/* Лого */}
        <div className="flex flex-col items-center gap-3">
          <div className="size-14 rounded-2xl bg-accent flex items-center justify-center text-2xl font-bold">
            T
          </div>
          <h1 className="text-xl font-semibold">Введите пароль</h1>
        </div>

        {/* Форма */}
        <div className="space-y-4">
          <Input
            type="password"
            placeholder="Пароль"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setError(null);
            }}
            onKeyDown={(e) => e.key === 'Enter' && handleUnlock()}
            autoComplete="current-password"
            autoFocus
            disabled={isBlocked}
            error={error ?? undefined}
          />

          {isBlocked && (
            <div className="bg-danger/10 border border-danger/30 rounded-xl px-4 py-3 text-center">
              <p className="text-danger text-sm font-medium">
                Слишком много попыток
              </p>
              <p className="text-danger/70 text-xs mt-1">
                Попробуйте через {formatCountdown(countdown)}
              </p>
            </div>
          )}

          <Button
            fullWidth
            size="lg"
            onClick={handleUnlock}
            loading={loading}
            disabled={!password || isBlocked}
          >
            Разблокировать
          </Button>
        </div>
      </div>
    </div>
  );
}
