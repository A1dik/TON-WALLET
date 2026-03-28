/**
 * App.tsx
 *
 * Корень приложения.
 * - Инициализирует стор при монтировании
 * - Запускает useActivityTracker (авто-блокировка при неактивности)
 * - State-machine роутер: рендерит нужный экран по store.screen
 *
 * ErrorBoundary оборачивает всё приложение — ловит крэши компонентов.
 */

import { useEffect } from 'react';
import { useActivityTracker } from '@/hooks/useActivityTracker';
import { selectScreen, useWalletStore } from '@/store/wallet-store';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { CreateWallet } from '@/components/screens/CreateWallet';
import { Dashboard } from '@/components/screens/Dashboard';
import { ImportWallet } from '@/components/screens/ImportWallet';
import { Onboarding } from '@/components/screens/Onboarding';
import { Receive } from '@/components/screens/Receive';
import { Send } from '@/components/screens/Send';
import { SetPassword } from '@/components/screens/SetPassword';
import { Unlock } from '@/components/screens/Unlock';

// ---------------------------------------------------------------------------
// Роутер — отдельный компонент для изоляции ре-рендеров
// ---------------------------------------------------------------------------

function Router() {
  const screen = useWalletStore(selectScreen);

  switch (screen) {
    case 'onboarding':    return <Onboarding />;
    case 'create-wallet': return <CreateWallet />;
    case 'import-wallet': return <ImportWallet />;
    case 'set-password':  return <SetPassword />;
    case 'dashboard':     return <Dashboard />;
    case 'send':          return <Send />;
    case 'receive':       return <Receive />;
    case 'unlock':        return <Unlock />;
  }
}

// ---------------------------------------------------------------------------
// Внутренний компонент — хуки требуют монтирования внутри ErrorBoundary
// ---------------------------------------------------------------------------

function AppInner() {
  const init = useWalletStore((s) => s.init);

  // Инициализируем один раз при старте
  useEffect(() => {
    init();
  }, [init]);

  // Трекер активности — запускается автоматически когда status === 'unlocked'
  useActivityTracker();

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <Router />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Публичный экспорт
// ---------------------------------------------------------------------------

export default function App() {
  return (
    <ErrorBoundary>
      <AppInner />
    </ErrorBoundary>
  );
}
