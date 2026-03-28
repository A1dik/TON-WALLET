/**
 * Фабрика транзакций для тестов.
 *
 * createTransaction(overrides?) — создаёт Transaction с разумными дефолтами.
 * Любое поле можно переопределить через overrides.
 *
 * Счётчик id автоинкрементируется, поэтому каждый вызов возвращает уникальный объект.
 * Вызов resetTransactionCounter() в beforeEach гарантирует детерминированность тестов.
 */

import type { Transaction } from '@/types';

let counter = 0;

export function resetTransactionCounter(): void {
  counter = 0;
}

export function createTransaction(overrides: Partial<Transaction> = {}): Transaction {
  counter++;
  return {
    id: `tx-${counter}`,
    timestamp: 1705312800 + counter * 100,
    direction: 'in',
    address: 'EQBvW8Z5huBkMJYdnfAEM5JqTNkuWX3diqYENkWsIL0XggGG',
    amount: '1000000000',
    ...overrides,
  };
}

/** Создаёт массив транзакций с нарастающими id */
export function createTransactions(
  count: number,
  overrides: Partial<Transaction> = {},
): Transaction[] {
  return Array.from({ length: count }, () => createTransaction(overrides));
}
