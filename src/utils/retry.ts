/**
 * retry.ts
 *
 * withRetry — универсальная обёртка с экспоненциальным backoff + full jitter.
 *
 * Full jitter формула: delay = random(0, baseDelayMs * 2^attempt)
 * — устраняет thundering herd даже при параллельных запросах одного клиента.
 *
 * Ретраится только при сетевых ошибках (NetworkError).
 * Бизнес-ошибки (невалидный адрес, недостаточно баланса) — не ретраятся.
 */

export interface RetryOptions {
  /** Максимальное количество попыток (включая первую). Default: 3 */
  maxAttempts?: number;
  /** Базовая задержка в мс. Default: 300 */
  baseDelayMs?: number;
  /** Максимальная задержка в мс (cap для экспоненты). Default: 10_000 */
  maxDelayMs?: number;
  /** Предикат: стоит ли ретраить эту ошибку. Default: всегда true */
  shouldRetry?: (error: unknown) => boolean;
}

const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_BASE_DELAY_MS = 300;
const DEFAULT_MAX_DELAY_MS = 10_000;

function calcDelay(attempt: number, baseDelayMs: number, maxDelayMs: number): number {
  // Экспоненциальный cap: baseDelay * 2^attempt
  const exponentialCap = baseDelayMs * Math.pow(2, attempt);
  const capped = Math.min(exponentialCap, maxDelayMs);
  // Full jitter: равномерное распределение [0, cap]
  return Math.random() * capped;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Выполняет fn с retry при ошибке.
 *
 * @example
 * const result = await withRetry(() => client.getBalance(address));
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const {
    maxAttempts = DEFAULT_MAX_ATTEMPTS,
    baseDelayMs = DEFAULT_BASE_DELAY_MS,
    maxDelayMs = DEFAULT_MAX_DELAY_MS,
    shouldRetry = () => true,
  } = options;

  let lastError: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      const isLastAttempt = attempt === maxAttempts - 1;
      if (isLastAttempt || !shouldRetry(error)) {
        throw error;
      }

      const delay = calcDelay(attempt, baseDelayMs, maxDelayMs);
      await sleep(delay);
    }
  }

  // Unreachable, но TypeScript требует явного throw
  throw lastError;
}
