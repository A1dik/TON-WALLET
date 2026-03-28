/**
 * Onboarding.tsx
 *
 * Первый экран — выбор Create / Import.
 * Отображается только когда status === 'no-wallet'.
 */

import { useWalletStore } from '@/store/wallet-store';
import { Button } from '@/components/ui/Button';

export function Onboarding() {
  const navigate = useWalletStore((s) => s.navigate);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-6 gap-8">
      {/* Лого */}
      <div className="flex flex-col items-center gap-3">
        <div className="size-16 rounded-2xl bg-accent flex items-center justify-center text-3xl font-bold">
          T
        </div>
        <h1 className="text-2xl font-bold">TON Кошелёк</h1>
        <p className="text-white/50 text-sm text-center max-w-xs">
          Безопасный кошелёк для тестовой сети TON
        </p>
      </div>

      {/* Кнопки */}
      <div className="flex flex-col gap-3 w-full max-w-xs">
        <Button
          size="lg"
          fullWidth
          onClick={() => navigate('create-wallet')}
        >
          Создать кошелёк
        </Button>
        <Button
          size="lg"
          variant="secondary"
          fullWidth
          onClick={() => navigate('import-wallet')}
        >
          Импортировать кошелёк
        </Button>
      </div>
    </div>
  );
}
