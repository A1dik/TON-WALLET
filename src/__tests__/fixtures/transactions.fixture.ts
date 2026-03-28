/**
 * Готовые Transaction-объекты для тестов.
 *
 * Используются как есть (fixtures) или как основа для фабрик (factories).
 * Все данные детерминированы — id, timestamp, адреса фиксированы.
 */

import type { Transaction } from '@/types';

// Фиксированный timestamp чтобы formatRelativeTime возвращал предсказуемый результат
// 2024-01-15 12:00:00 UTC
const BASE_TIMESTAMP = 1705312800;

export const TX_INCOMING: Transaction = {
  id: 'tx-in-1',
  timestamp: BASE_TIMESTAMP,
  direction: 'in',
  address: 'EQBvW8Z5huBkMJYdnfAEM5JqTNkuWX3diqYENkWsIL0XggGG',
  amount: '1000000000', // 1 TON
  fee: '10000',
  comment: 'привет',
};

export const TX_OUTGOING: Transaction = {
  id: 'tx-out-1',
  timestamp: BASE_TIMESTAMP - 3600,
  direction: 'out',
  address: 'EQBvW8Z5huBkMJYdnfAEM5JqTNkuWX3diqYENkWsIL0XggGG',
  amount: '500000000', // 0.5 TON
  fee: '15000',
  comment: 'оплата',
};

export const TX_FAILED: Transaction = {
  id: 'tx-failed-1',
  timestamp: BASE_TIMESTAMP - 7200,
  direction: 'failed',
  address: '',
  amount: '0',
  fee: '5000',
};

export const TX_LARGE_AMOUNT: Transaction = {
  id: 'tx-large-1',
  timestamp: BASE_TIMESTAMP - 86400,
  direction: 'out',
  address: 'EQBvUDMVgzdZgf0xqwQ6_0LnD4EKEDbZb2UOaIdmtnJMZO9_',
  amount: '4000000000', // 4 TON
  fee: '20000',
};

/** Набор из всех типов транзакций — сортированы по убыванию timestamp */
export const ALL_TRANSACTIONS: Transaction[] = [
  TX_INCOMING,
  TX_OUTGOING,
  TX_FAILED,
  TX_LARGE_AMOUNT,
];
