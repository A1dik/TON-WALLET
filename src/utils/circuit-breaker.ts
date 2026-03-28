/**
 * circuit-breaker.ts
 *
 * Минималистичный Circuit Breaker: closed → open → half-open → closed.
 *
 * Защищает от каскадных ошибок при недоступности downstream-сервиса.
 * В half-open состоянии пропускает ровно один "probe"-запрос:
 *   - успех → closed (сбрасываем счётчик ошибок)
 *   - ошибка → снова open (начинаем новый cooldown)
 */

export type CircuitState = 'closed' | 'open' | 'half-open';

export interface CircuitBreakerOptions {
  /** Число ошибок подряд для перехода closed → open. Default: 3 */
  failureThreshold?: number;
  /** Задержка в мс перед переходом open → half-open. Default: 30_000 */
  cooldownMs?: number;
  /** Имя для отладки / логов. Default: 'default' */
  name?: string;
}

export class CircuitBreakerOpenError extends Error {
  constructor(name: string, retryAfterMs: number) {
    super(`Circuit breaker '${name}' is open. Retry after ${retryAfterMs}ms.`);
    this.name = 'CircuitBreakerOpenError';
  }
}

const DEFAULT_FAILURE_THRESHOLD = 3;
const DEFAULT_COOLDOWN_MS = 30_000;

export class CircuitBreaker {
  private state: CircuitState = 'closed';
  private failureCount = 0;
  private openedAt: number | null = null;

  private readonly failureThreshold: number;
  private readonly cooldownMs: number;
  private readonly name: string;

  constructor(options: CircuitBreakerOptions = {}) {
    this.failureThreshold = options.failureThreshold ?? DEFAULT_FAILURE_THRESHOLD;
    this.cooldownMs = options.cooldownMs ?? DEFAULT_COOLDOWN_MS;
    this.name = options.name ?? 'default';
  }

  get currentState(): CircuitState {
    return this.resolveState();
  }

  /**
   * Выполняет fn через circuit breaker.
   * Бросает CircuitBreakerOpenError если цепь разомкнута.
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    const state = this.resolveState();

    if (state === 'open') {
      const retryAfterMs = this.retryAfterMs();
      throw new CircuitBreakerOpenError(this.name, retryAfterMs);
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  // ---------------------------------------------------------------------------
  // Приватные методы
  // ---------------------------------------------------------------------------

  /**
   * Актуализирует состояние: если open и cooldown истёк → half-open.
   * Вызывается при каждом обращении — lazy transition без таймеров.
   */
  private resolveState(): CircuitState {
    if (this.state === 'open' && this.openedAt !== null) {
      const elapsed = Date.now() - this.openedAt;
      if (elapsed >= this.cooldownMs) {
        this.state = 'half-open';
      }
    }
    return this.state;
  }

  private onSuccess(): void {
    this.failureCount = 0;
    this.openedAt = null;
    this.state = 'closed';
  }

  private onFailure(): void {
    this.failureCount += 1;

    if (this.state === 'half-open' || this.failureCount >= this.failureThreshold) {
      this.state = 'open';
      this.openedAt = Date.now();
    }
  }

  private retryAfterMs(): number {
    if (this.openedAt === null) return this.cooldownMs;
    const elapsed = Date.now() - this.openedAt;
    return Math.max(0, this.cooldownMs - elapsed);
  }
}
