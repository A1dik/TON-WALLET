/**
 * formatters.ts
 *
 * Форматирование данных для отображения в UI.
 * Все функции — чистые, без side-эффектов.
 */

import { nanoToTon } from './validation';

// ---------------------------------------------------------------------------
// TON сумма
// ---------------------------------------------------------------------------

/**
 * Форматирует нано-TON в читаемую строку TON.
 * Примеры: "1500000000" → "1.5 TON", "0" → "0 TON"
 */
export function formatTon(nanoStr: string): string {
  try {
    return `${nanoToTon(nanoStr)} TON`;
  } catch {
    return '— TON';
  }
}

/**
 * Форматирует нано-TON для знака суммы транзакции.
 * Примеры: "1500000000", "in" → "+1.5 TON", "out" → "−1.5 TON"
 */
export function formatTransactionAmount(nanoStr: string, direction: 'in' | 'out' | 'failed'): string {
  try {
    const ton = nanoToTon(nanoStr);
    if (direction === 'in') return `+${ton} TON`;
    if (direction === 'out') return `−${ton} TON`;
    return `${ton} TON`;
  } catch {
    return '— TON';
  }
}

// ---------------------------------------------------------------------------
// TON адрес
// ---------------------------------------------------------------------------

/**
 * Сокращает адрес для отображения в списке: первые 6 + ... + последние 6.
 * "EQD1h4...Ab3f" — достаточно для идентификации.
 */
export function truncateAddress(address: string): string {
  if (address.length <= 16) return address;
  return `${address.slice(0, 6)}...${address.slice(-6)}`;
}

/**
 * Разбивает адрес на три части для AddressDisplay (подсветка начала/конца).
 * Возвращает [первые 4, середина, последние 4].
 */
export function splitAddressForDisplay(address: string): [string, string, string] {
  if (address.length <= 8) return [address, '', ''];
  return [address.slice(0, 4), address.slice(4, -4), address.slice(-4)];
}

// ---------------------------------------------------------------------------
// Дата и время
// ---------------------------------------------------------------------------

const DATE_FORMAT = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

const TIME_FORMAT = new Intl.DateTimeFormat('ru-RU', {
  hour: '2-digit',
  minute: '2-digit',
});

/**
 * Форматирует Unix timestamp (секунды) в дату: "27.03.2026".
 */
export function formatDate(timestampSeconds: number): string {
  return DATE_FORMAT.format(new Date(timestampSeconds * 1000));
}

/**
 * Форматирует Unix timestamp (секунды) в дату+время: "27.03.2026, 14:32".
 */
export function formatDateTime(timestampSeconds: number): string {
  const date = new Date(timestampSeconds * 1000);
  return `${DATE_FORMAT.format(date)}, ${TIME_FORMAT.format(date)}`;
}

/**
 * Форматирует Unix timestamp (секунды) в относительное время.
 * "только что", "5 минут назад", "2 часа назад", "вчера", или полную дату.
 */
export function formatRelativeTime(timestampSeconds: number): string {
  const now = Date.now();
  const diffMs = now - timestampSeconds * 1000;
  const diffMin = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMs / 3_600_000);
  const diffDays = Math.floor(diffMs / 86_400_000);

  if (diffMin < 1) return 'только что';
  if (diffMin < 60) return `${diffMin} мин назад`;
  if (diffHours < 24) return `${diffHours} ч назад`;
  if (diffDays === 1) return 'вчера';
  return formatDate(timestampSeconds);
}

// ---------------------------------------------------------------------------
// Таймер rate-limit
// ---------------------------------------------------------------------------

/**
 * Форматирует секунды в читаемый таймер: "1:23" или "45 с".
 */
export function formatCountdown(seconds: number): string {
  if (seconds >= 60) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }
  return `${seconds} с`;
}
