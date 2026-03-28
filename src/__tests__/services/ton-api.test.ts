// @vitest-environment node
// TonClient мокируется полностью — нет реальных сетевых запросов.
// CircuitBreaker и withRetry тестируются отдельно в __tests__/utils/.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// vi.hoisted — переменные доступны внутри vi.mock factory (hoisting)
// ---------------------------------------------------------------------------

const { mockGetBalance, mockGetTransactions, mockSendFile, mockGetContractState, mockOpen } =
  vi.hoisted(() => ({
    mockGetBalance: vi.fn(),
    mockGetTransactions: vi.fn(),
    mockSendFile: vi.fn(),
    mockGetContractState: vi.fn(),
    mockOpen: vi.fn(),
  }));

vi.mock('@ton/ton', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  TonClient: function (this: any) {
    this.getBalance = mockGetBalance;
    this.getTransactions = mockGetTransactions;
    this.sendFile = mockSendFile;
    this.getContractState = mockGetContractState;
    this.open = mockOpen;
  },
  WalletContractV4: {
    create: vi.fn().mockReturnValue({ address: { toString: vi.fn().mockReturnValue('mock-addr') } }),
  },
  Address: {
    parse: vi.fn().mockImplementation((addr: string) => {
      if (addr === 'INVALID') throw new Error('wrong address');
      return { toString: () => addr };
    }),
  },
}));

import {
  getBalance,
  getTransactions,
  sendTransaction,
  getAddressInfo,
} from '@/services/ton-api';

import {
  MOCK_BALANCE,
  MOCK_TX_INCOMING,
  MOCK_TX_OUTGOING,
  MOCK_TX_FAILED,
  MOCK_CONTRACT_STATE_ACTIVE,
  MOCK_CONTRACT_STATE_UNINIT,
} from '../fixtures/api-responses.fixture';

// ---------------------------------------------------------------------------
// Сброс состояния между тестами
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  // Сбрасываем состояние circuit breaker: перезагружаем модуль
  // CB — singleton в модуле, поэтому тесты не должны открывать цепь
});

// ---------------------------------------------------------------------------
// getBalance
// ---------------------------------------------------------------------------

describe('getBalance', () => {
  it('должен вернуть баланс в нано-TON как строку', async () => {
    mockGetBalance.mockResolvedValue(MOCK_BALANCE);

    const result = await getBalance('EQD__some_valid_address__');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toBe('5000000000');
  });

  it('должен вернуть INVALID_ADDRESS при невалидном адресе', async () => {
    const result = await getBalance('INVALID');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('INVALID_ADDRESS');
  });

  it('должен вернуть NETWORK_ERROR при сетевой ошибке', async () => {
    mockGetBalance.mockRejectedValue(new Error('network error'));

    const result = await getBalance('EQD__some_valid_address__');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('NETWORK_ERROR');
  });
});

// ---------------------------------------------------------------------------
// getTransactions
// ---------------------------------------------------------------------------

describe('getTransactions', () => {
  it('должен вернуть входящую транзакцию с direction: in', async () => {
    mockGetTransactions.mockResolvedValue([MOCK_TX_INCOMING]);

    const result = await getTransactions('EQD__some_valid_address__');
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const [tx] = result.value;
    expect(tx.direction).toBe('in');
    expect(tx.amount).toBe('1000000000');
    expect(tx.address).toBe('EQBvW8Z5huBkMJYdnfAEM5JqTNkuWX3diqYENkWsIL0XggGG');
    expect(tx.comment).toBe('привет');
    expect(tx.fee).toBe('10000');
    expect(tx.id).toBe('1000000:aabbccdd');
  });

  it('должен вернуть исходящую транзакцию с direction: out', async () => {
    mockGetTransactions.mockResolvedValue([MOCK_TX_OUTGOING]);

    const result = await getTransactions('EQD__some_valid_address__');
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const [tx] = result.value;
    expect(tx.direction).toBe('out');
    expect(tx.amount).toBe('500000000');
    expect(tx.address).toBe('EQBvW8Z5huBkMJYdnfAEM5JqTNkuWX3diqYENkWsIL0XggGG');
    expect(tx.comment).toBe('оплата');
  });

  it('должен вернуть failed транзакцию', async () => {
    mockGetTransactions.mockResolvedValue([MOCK_TX_FAILED]);

    const result = await getTransactions('EQD__some_valid_address__');
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value[0].direction).toBe('failed');
    expect(result.value[0].amount).toBe('0');
  });

  it('должен корректно маппить несколько транзакций', async () => {
    mockGetTransactions.mockResolvedValue([MOCK_TX_INCOMING, MOCK_TX_OUTGOING, MOCK_TX_FAILED]);

    const result = await getTransactions('EQD__some_valid_address__');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(3);
    expect(result.value.map((t) => t.direction)).toEqual(['in', 'out', 'failed']);
  });

  it('должен передавать limit в TonClient', async () => {
    mockGetTransactions.mockResolvedValue([]);

    await getTransactions('EQD__some_valid_address__', 5);
    expect(mockGetTransactions).toHaveBeenCalledWith(expect.anything(), { limit: 5 });
  });
});

// ---------------------------------------------------------------------------
// sendTransaction
// ---------------------------------------------------------------------------

describe('sendTransaction', () => {
  it('должен вернуть ok при успешной отправке', async () => {
    mockSendFile.mockResolvedValue(undefined);

    const result = await sendTransaction(Buffer.from('test-boc').toString('base64'));
    expect(result.ok).toBe(true);
  });

  it('должен вернуть ошибку при сбое отправки', async () => {
    mockSendFile.mockRejectedValue(new Error('network error'));

    const result = await sendTransaction('aGVsbG8=');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('NETWORK_ERROR');
  });
});

// ---------------------------------------------------------------------------
// getAddressInfo
// ---------------------------------------------------------------------------

describe('getAddressInfo', () => {
  it('должен вернуть isActive: true для активного адреса', async () => {
    mockGetContractState.mockResolvedValue(MOCK_CONTRACT_STATE_ACTIVE);

    const result = await getAddressInfo('EQD__some_valid_address__');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.isActive).toBe(true);
    expect(result.value.balance).toBe('5000000000');
  });

  it('должен вернуть isActive: false для неинициализированного адреса', async () => {
    mockGetContractState.mockResolvedValue(MOCK_CONTRACT_STATE_UNINIT);

    const result = await getAddressInfo('EQD__some_valid_address__');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.isActive).toBe(false);
    expect(result.value.balance).toBe('0');
  });

  it('должен вернуть INVALID_ADDRESS при невалидном адресе', async () => {
    const result = await getAddressInfo('INVALID');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('INVALID_ADDRESS');
  });
});
