// @vitest-environment node

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { withRetry } from '@/utils/retry';

beforeEach(() => {
  // Fake timers только там, где нужен контроль задержек
});

afterEach(() => {
  vi.useRealTimers();
});

describe('withRetry', () => {
  it('должен вернуть результат при успешном первом вызове', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    expect(await withRetry(fn)).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('должен ретраить при ошибке и вернуть результат на второй попытке', async () => {
    vi.useFakeTimers();
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValue('ok');

    const promise = withRetry(fn, { maxAttempts: 3, baseDelayMs: 100 });
    await vi.runAllTimersAsync();
    expect(await promise).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('должен выбросить ошибку после исчерпания всех попыток', async () => {
    // baseDelayMs: 0 — без задержек, без fake timers; проверяем кол-во вызовов
    const fn = vi.fn().mockImplementation(() => Promise.reject(new Error('persistent failure')));
    await expect(withRetry(fn, { maxAttempts: 3, baseDelayMs: 0 })).rejects.toThrow(
      'persistent failure',
    );
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('не должен ретраить если shouldRetry возвращает false', async () => {
    // shouldRetry=false означает нет задержки → fake timers не нужны
    const fn = vi.fn().mockRejectedValue(new Error('no retry'));

    await expect(
      withRetry(fn, { maxAttempts: 3, shouldRetry: () => false }),
    ).rejects.toThrow('no retry');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('должен применять shouldRetry только к ретраируемым ошибкам', async () => {
    class RetryableError extends Error {}
    class FatalError extends Error {}

    const fn = vi
      .fn()
      .mockImplementationOnce(() => Promise.reject(new RetryableError('retry me')))
      .mockImplementationOnce(() => Promise.reject(new FatalError('fatal')));

    await expect(
      withRetry(fn, {
        maxAttempts: 5,
        baseDelayMs: 0,
        shouldRetry: (e) => e instanceof RetryableError,
      }),
    ).rejects.toBeInstanceOf(FatalError);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('должен использовать maxAttempts = 1 без retry', async () => {
    // maxAttempts=1 → нет задержки → fake timers не нужны
    const fn = vi.fn().mockRejectedValue(new Error('fail'));
    await expect(withRetry(fn, { maxAttempts: 1 })).rejects.toThrow('fail');
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
