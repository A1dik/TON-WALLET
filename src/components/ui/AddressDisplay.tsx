/**
 * AddressDisplay.tsx
 *
 * Ключевой компонент безопасности — визуальная подсветка адреса.
 *
 * Цель: приучить пользователя проверять начало и конец адреса.
 * Первые 4 и последние 4 символа — увеличенный шрифт, акцентный цвет.
 * Средняя часть — моноширинный, приглушённый цвет.
 *
 * Вариант compact — для использования в списках (меньший размер).
 */

import { splitAddressForDisplay } from '@/utils/formatters';

interface AddressDisplayProps {
  address: string;
  compact?: boolean;
}

export function AddressDisplay({ address, compact = false }: AddressDisplayProps) {
  const [start, middle, end] = splitAddressForDisplay(address);

  const highlightClass = compact
    ? 'text-accent font-mono font-semibold text-sm'
    : 'text-accent font-mono font-semibold text-base';

  const middleClass = compact
    ? 'text-white/40 font-mono text-xs'
    : 'text-white/50 font-mono text-sm';

  return (
    <span className="inline-flex items-baseline flex-wrap break-all" aria-label={`Адрес: ${address}`}>
      <span className={highlightClass}>{start}</span>
      <span className={middleClass}>{middle}</span>
      <span className={highlightClass}>{end}</span>
    </span>
  );
}
