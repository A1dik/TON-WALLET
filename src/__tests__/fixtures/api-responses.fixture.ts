/**
 * Моковые ответы @ton/ton SDK для тестов.
 * Структура соответствует объектам, возвращаемым TonClient.getTransactions().
 */

export const MOCK_BALANCE = BigInt('5000000000'); // 5 TON в нано-TON

// ---------------------------------------------------------------------------
// Хелперы для создания SDK-совместимых объектов
// ---------------------------------------------------------------------------

function createSdkMessage(
  type: 'internal' | 'external-in',
  opts: {
    src?: string;
    dest?: string;
    value?: bigint;
    comment?: string;
  } = {},
) {
  const body = opts.comment != null
    ? {
        beginParse: () => ({
          remainingBits: 40, // > 32 — есть opcode
          loadUint: () => 0, // opcode 0 = text comment
          loadStringTail: () => opts.comment!,
        }),
      }
    : {
        beginParse: () => ({
          remainingBits: 0,
        }),
      };

  return {
    info: {
      type,
      src: opts.src ? { toString: () => opts.src } : undefined,
      dest: opts.dest ? { toString: () => opts.dest } : undefined,
      value: opts.value != null ? { coins: opts.value } : { coins: 0n },
    },
    body,
  };
}

function createOutMessages(msgs: ReturnType<typeof createSdkMessage>[]) {
  return {
    values: () => msgs,
  };
}

// ---------------------------------------------------------------------------
// Моковые транзакции
// ---------------------------------------------------------------------------

export const MOCK_TX_INCOMING = {
  lt: 1000000n,
  hash: () => Buffer.from('aabbccdd', 'hex'),
  now: 1700000000,
  totalFees: { coins: 10000n },
  inMessage: createSdkMessage('internal', {
    src: 'EQBvW8Z5huBkMJYdnfAEM5JqTNkuWX3diqYENkWsIL0XggGG',
    dest: 'EQD__________________________________________0vo',
    value: 1000000000n,
    comment: 'привет',
  }),
  outMessages: createOutMessages([]),
};

export const MOCK_TX_OUTGOING = {
  lt: 2000000n,
  hash: () => Buffer.from('eeff0011', 'hex'),
  now: 1700001000,
  totalFees: { coins: 15000n },
  inMessage: createSdkMessage('external-in', {
    dest: 'EQD__________________________________________0vo',
  }),
  outMessages: createOutMessages([
    createSdkMessage('internal', {
      src: 'EQD__________________________________________0vo',
      dest: 'EQBvW8Z5huBkMJYdnfAEM5JqTNkuWX3diqYENkWsIL0XggGG',
      value: 500000000n,
      comment: 'оплата',
    }),
  ]),
};

export const MOCK_TX_FAILED = {
  lt: 3000000n,
  hash: () => Buffer.from('22334455', 'hex'),
  now: 1700002000,
  totalFees: { coins: 5000n },
  inMessage: createSdkMessage('external-in', {
    dest: 'EQD__________________________________________0vo',
  }),
  outMessages: createOutMessages([]),
};

export const MOCK_CONTRACT_STATE_ACTIVE = {
  state: 'active' as const,
  balance: BigInt('5000000000'),
  code: null,
  data: null,
  lastTransaction: null,
  storageStats: null,
};

export const MOCK_CONTRACT_STATE_UNINIT = {
  state: 'uninit' as const,
  balance: BigInt('0'),
  code: null,
  data: null,
  lastTransaction: null,
  storageStats: null,
};
