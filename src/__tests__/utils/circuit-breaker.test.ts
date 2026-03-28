// @vitest-environment node

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CircuitBreaker, CircuitBreakerOpenError } from '@/utils/circuit-breaker';

vi.useFakeTimers();

beforeEach(() => {
  vi.clearAllTimers();
});

describe('CircuitBreaker', () => {
  describe('closed state', () => {
    it('должен пропускать запросы и возвращать результат', async () => {
      const cb = new CircuitBreaker();
      const result = await cb.execute(() => Promise.resolve('data'));
      expect(result).toBe('data');
    });

    it('состояние должно быть closed изначально', () => {
      const cb = new CircuitBreaker();
      expect(cb.currentState).toBe('closed');
    });
  });

  describe('переход closed → open', () => {
    it('должен открыться после failureThreshold ошибок подряд', async () => {
      const cb = new CircuitBreaker({ failureThreshold: 3, cooldownMs: 30_000 });

      for (let i = 0; i < 3; i++) {
        await expect(
          cb.execute(() => Promise.reject(new Error('fail'))),
        ).rejects.toThrow('fail');
      }

      expect(cb.currentState).toBe('open');
    });

    it('должен бросать CircuitBreakerOpenError когда open', async () => {
      const cb = new CircuitBreaker({ failureThreshold: 2, cooldownMs: 30_000 });

      for (let i = 0; i < 2; i++) {
        await expect(cb.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();
      }

      await expect(cb.execute(() => Promise.resolve('ok'))).rejects.toBeInstanceOf(
        CircuitBreakerOpenError,
      );
    });

    it('должен сбрасывать счётчик ошибок при успешном запросе', async () => {
      const cb = new CircuitBreaker({ failureThreshold: 3 });

      // 2 ошибки
      await expect(cb.execute(() => Promise.reject(new Error()))).rejects.toThrow();
      await expect(cb.execute(() => Promise.reject(new Error()))).rejects.toThrow();

      // успех — счётчик сбрасывается
      await cb.execute(() => Promise.resolve('ok'));

      // ещё 2 ошибки — должны быть ниже порога, цепь должна оставаться closed
      await expect(cb.execute(() => Promise.reject(new Error()))).rejects.toThrow();
      await expect(cb.execute(() => Promise.reject(new Error()))).rejects.toThrow();
      expect(cb.currentState).toBe('closed');
    });
  });

  describe('переход open → half-open → closed', () => {
    it('должен перейти в half-open после истечения cooldown', async () => {
      const cb = new CircuitBreaker({ failureThreshold: 2, cooldownMs: 5_000 });

      for (let i = 0; i < 2; i++) {
        await expect(cb.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();
      }
      expect(cb.currentState).toBe('open');

      vi.advanceTimersByTime(5_001);
      expect(cb.currentState).toBe('half-open');
    });

    it('успешный probe в half-open должен закрыть цепь', async () => {
      const cb = new CircuitBreaker({ failureThreshold: 2, cooldownMs: 5_000 });

      for (let i = 0; i < 2; i++) {
        await expect(cb.execute(() => Promise.reject(new Error()))).rejects.toThrow();
      }

      vi.advanceTimersByTime(5_001);
      expect(cb.currentState).toBe('half-open');

      await cb.execute(() => Promise.resolve('probe ok'));
      expect(cb.currentState).toBe('closed');
    });

    it('ошибка в half-open должна снова открыть цепь', async () => {
      const cb = new CircuitBreaker({ failureThreshold: 2, cooldownMs: 5_000 });

      for (let i = 0; i < 2; i++) {
        await expect(cb.execute(() => Promise.reject(new Error()))).rejects.toThrow();
      }

      vi.advanceTimersByTime(5_001);
      await expect(cb.execute(() => Promise.reject(new Error('probe fail')))).rejects.toThrow();

      expect(cb.currentState).toBe('open');
    });
  });

  describe('CircuitBreakerOpenError', () => {
    it('должен содержать имя цепи и retryAfterMs > 0', async () => {
      const cb = new CircuitBreaker({ failureThreshold: 1, cooldownMs: 10_000, name: 'test-api' });
      await expect(cb.execute(() => Promise.reject(new Error()))).rejects.toThrow();

      try {
        await cb.execute(() => Promise.resolve());
      } catch (e) {
        expect(e).toBeInstanceOf(CircuitBreakerOpenError);
        expect((e as CircuitBreakerOpenError).message).toContain('test-api');
        expect((e as CircuitBreakerOpenError).message).toMatch(/Retry after \d+ms/);
      }
    });
  });
});
