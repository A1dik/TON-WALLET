/**
 * ErrorBoundary.tsx
 *
 * Оборачивает всё приложение — ловит JavaScript-исключения в дереве компонентов.
 * Показывает понятный fallback-экран вместо белого экрана смерти.
 * Кнопка «Перезагрузить» восстанавливает приложение.
 *
 * Реализован как class-компонент — React требует componentDidCatch.
 */

import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from './Button';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: unknown): State {
    const message =
      error instanceof Error ? error.message : 'Неизвестная ошибка';
    return { hasError: true, errorMessage: message };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // В production здесь был бы Sentry или аналог.
    // Намеренно не логируем в console.error в production,
    // но для dev-режима это допустимо.
    if (import.meta.env.DEV) {
      console.error('[ErrorBoundary]', error, info.componentStack);
    }
  }

  private handleReload = (): void => {
    window.location.reload();
  };

  render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center p-4">
        <div className="max-w-sm w-full text-center space-y-6">
          <div className="text-5xl">💥</div>
          <div className="space-y-2">
            <h1 className="text-xl font-semibold">Что-то пошло не так</h1>
            <p className="text-white/50 text-sm">
              Произошла непредвиденная ошибка. Ваши средства в безопасности —
              они защищены шифрованием.
            </p>
          </div>
          {import.meta.env.DEV && (
            <pre className="text-left text-xs bg-white/5 rounded-lg p-3 text-danger overflow-auto max-h-32">
              {this.state.errorMessage}
            </pre>
          )}
          <Button onClick={this.handleReload} fullWidth>
            Перезагрузить
          </Button>
        </div>
      </div>
    );
  }
}
