/**
 * keystore.ts
 *
 * Хранилище кошелька: localStorage + rate limiting попыток разблокировки.
 *
 * Стратегия rate limiting:
 *   0–4 неудачные попытки → немедленный ответ
 *   5+  попытки          → блокировка с нарастающей задержкой (2^n минут, макс 60 мин)
 *
 * Ключи localStorage:
 *   ton_wallet_v1        — StoredWallet (JSON)
 *   ton_wallet_attempts  — RateLimitState (JSON)
 */

import { decrypt, encrypt } from './encryption';
import type { KeystoreError, Result, StoredWallet } from '@/types';
import { err, ok } from '@/types';

// ---------------------------------------------------------------------------
// Константы
// ---------------------------------------------------------------------------

const WALLET_KEY = 'ton_wallet_v1';
const ATTEMPTS_KEY = 'ton_wallet_attempts';
const MAX_FREE_ATTEMPTS = 5;
const MAX_LOCKOUT_MINUTES = 60;

// ---------------------------------------------------------------------------
// Внутренние типы (не экспортируются — детали реализации)
// ---------------------------------------------------------------------------

interface RateLimitState {
  count: number;
  lockedUntil: number; // Unix ms, 0 если не заблокирован
}

// ---------------------------------------------------------------------------
// Rate limiting — чистые функции, легко тестировать
// ---------------------------------------------------------------------------

function readRateLimit(): RateLimitState {
  try {
    const raw = localStorage.getItem(ATTEMPTS_KEY);
    if (!raw) return { count: 0, lockedUntil: 0 };
    return JSON.parse(raw) as RateLimitState;
  } catch {
    return { count: 0, lockedUntil: 0 };
  }
}

function saveRateLimit(state: RateLimitState): void {
  localStorage.setItem(ATTEMPTS_KEY, JSON.stringify(state));
}

/** Вычисляет lockout-период в мс для текущего количества нарушений */
function lockoutDurationMs(failedAttempts: number): number {
  const exponent = failedAttempts - MAX_FREE_ATTEMPTS;
  const minutes = Math.min(Math.pow(2, exponent), MAX_LOCKOUT_MINUTES);
  return minutes * 60 * 1000;
}

function checkRateLimit(): Result<void, KeystoreError> {
  const state = readRateLimit();
  if (state.count < MAX_FREE_ATTEMPTS) return ok(undefined);

  const now = Date.now();
  if (now < state.lockedUntil) {
    const retryAfterSeconds = Math.ceil((state.lockedUntil - now) / 1000);
    return err({
      code: 'RATE_LIMITED',
      message: `Слишком много попыток. Подождите ${retryAfterSeconds} сек.`,
      retryAfterSeconds,
    });
  }

  return ok(undefined);
}

function recordFailedAttempt(): void {
  const state = readRateLimit();
  const count = state.count + 1;
  const lockedUntil =
    count >= MAX_FREE_ATTEMPTS ? Date.now() + lockoutDurationMs(count) : 0;
  saveRateLimit({ count, lockedUntil });
}

function resetAttempts(): void {
  localStorage.removeItem(ATTEMPTS_KEY);
}

// ---------------------------------------------------------------------------
// Публичный API
// ---------------------------------------------------------------------------

export function hasWallet(): boolean {
  return localStorage.getItem(WALLET_KEY) !== null;
}

export async function saveWallet(
  mnemonicWords: string[],
  address: string,
  bounceableAddress: string,
  password: string,
): Promise<Result<void, KeystoreError>> {
  const mnemonicPlain = mnemonicWords.join(' ');
  const encResult = await encrypt(mnemonicPlain, password);

  if (!encResult.ok) {
    return err({ code: 'CORRUPTED', message: 'Ошибка шифрования мнемоники' });
  }

  const stored: StoredWallet = {
    encryptedMnemonic: encResult.value,
    address,
    bounceableAddress,
  };

  localStorage.setItem(WALLET_KEY, JSON.stringify(stored));
  return ok(undefined);
}

export function loadStoredWallet(): Result<StoredWallet, KeystoreError> {
  const raw = localStorage.getItem(WALLET_KEY);
  if (!raw) return err({ code: 'NOT_FOUND', message: 'Кошелёк не найден' });

  try {
    return ok(JSON.parse(raw) as StoredWallet);
  } catch {
    return err({ code: 'CORRUPTED', message: 'Данные кошелька повреждены' });
  }
}

/**
 * Разблокирует кошелёк: проверяет rate limit → дешифрует мнемонику → возвращает слова.
 * При успехе сбрасывает счётчик попыток.
 * При неудаче инкрементирует счётчик и устанавливает lockout.
 */
export async function unlockWallet(
  password: string,
): Promise<Result<string[], KeystoreError>> {
  const rateLimitCheck = checkRateLimit();
  if (!rateLimitCheck.ok) return rateLimitCheck;

  const walletResult = loadStoredWallet();
  if (!walletResult.ok) return walletResult;

  const decResult = await decrypt(walletResult.value.encryptedMnemonic, password);

  if (!decResult.ok) {
    recordFailedAttempt();

    // Проверяем снова — возможно, только что достигли лимита
    const newCheck = checkRateLimit();
    if (!newCheck.ok) return newCheck;

    return err({ code: 'INVALID_PASSWORD', message: 'Неверный пароль' });
  }

  resetAttempts();
  return ok(decResult.value.split(' '));
}

export function clearWallet(): void {
  localStorage.removeItem(WALLET_KEY);
  localStorage.removeItem(ATTEMPTS_KEY);
}

/**
 * Возвращает секунды до разблокировки, или 0 если не заблокирован.
 * Используется для UI-отображения таймера.
 */
export function getRateLimitStatus(): { isLocked: boolean; retryAfterSeconds: number } {
  const result = checkRateLimit();
  if (result.ok) return { isLocked: false, retryAfterSeconds: 0 };
  return { isLocked: true, retryAfterSeconds: result.error.retryAfterSeconds ?? 0 };
}
