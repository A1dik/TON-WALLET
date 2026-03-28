/**
 * WarningBanner.tsx
 *
 * Заметные предупреждения, которые нельзя проигнорировать.
 * Используется в Send для отображения warnings из address-guard.
 *
 * severity="warning" → жёлтый фон
 * severity="danger"  → красный фон
 *
 * Не исчезает автоматически — только явное действие пользователя.
 */

import type { WarningSeverity } from '@/types';

interface WarningBannerProps {
  severity: WarningSeverity;
  message: string;
}

const SEVERITY_CLASSES: Record<WarningSeverity, string> = {
  warning: 'bg-warning/15 border-warning/40 text-warning',
  danger: 'bg-danger/15 border-danger/40 text-danger',
};

const SEVERITY_ICONS: Record<WarningSeverity, string> = {
  warning: '⚠',
  danger: '⛔',
};

export function WarningBanner({ severity, message }: WarningBannerProps) {
  return (
    <div
      role="alert"
      className={[
        'flex items-start gap-3 rounded-xl border px-4 py-3',
        SEVERITY_CLASSES[severity],
      ].join(' ')}
    >
      <span className="text-lg leading-none mt-0.5" aria-hidden="true">
        {SEVERITY_ICONS[severity]}
      </span>
      <p className="text-sm font-medium leading-snug">{message}</p>
    </div>
  );
}
