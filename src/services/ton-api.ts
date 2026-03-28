/**
 * ton-api.ts
 *
 * Blockchain-сервис для TON testnet.
 * Базовый URL: https://testnet.toncenter.com/api/v2
 *
 * Стек защиты:
 *   TonClient (SDK) → withRetry (3 попытки + jitter) → CircuitBreaker (3 ошибки → 30с cooldown)
 *
 * CB видит итоговый результат после всех retry — это корректно:
 * retry = тактические попытки, CB = стратегическое решение "сервис живой?"
 *
 * Все публичные функции возвращают Result<T, ApiError> — никаких исключений наружу.
 */

import { Address, TonClient, WalletContractV4 } from '@ton/ton';
import { CircuitBreaker, CircuitBreakerOpenError } from '@/utils/circuit-breaker';
import { withRetry } from '@/utils/retry';
import type { AddressInfo, ApiError, Result, Transaction } from '@/types';
import { err, ok } from '@/types';

// ---------------------------------------------------------------------------
// Конфигурация
// ---------------------------------------------------------------------------

const TESTNET_ENDPOINT = 'https://testnet.toncenter.com/api/v2/jsonRPC';
const TONCENTER_API_KEY = import.meta.env.VITE_TONCENTER_API_KEY as string | undefined;
const TRANSACTIONS_DEFAULT_LIMIT = 20;
const TESTNET_WORKCHAIN = 0;

// ---------------------------------------------------------------------------
// Singleton: один клиент и один CB на всё приложение
// ---------------------------------------------------------------------------

const client = new TonClient({
  endpoint: TESTNET_ENDPOINT,
  ...(TONCENTER_API_KEY ? { apiKey: TONCENTER_API_KEY } : {}),
});

const breaker = new CircuitBreaker({
  name: 'toncenter',
  failureThreshold: 3,
  cooldownMs: 30_000,
});

// ---------------------------------------------------------------------------
// Внутренние утилиты
// ---------------------------------------------------------------------------

/**
 * Выполняет fn через CB + retry.
 * Маппит все ошибки в ApiError.
 */
async function callApi<T>(fn: () => Promise<T>): Promise<Result<T, ApiError>> {
  try {
    const result = await breaker.execute(() =>
      withRetry(fn, { maxAttempts: 3, baseDelayMs: 300, shouldRetry: isRetryable }),
    );
    return ok(result);
  } catch (error) {
    return err(toApiError(error));
  }
}

/** HTTP 429 — API вернул rate limit, ретраить бессмысленно */
class RateLimitError extends Error {
  constructor() {
    super('Too Many Requests');
    this.name = 'RateLimitError';
  }
}

function toApiError(error: unknown): ApiError {
  if (error instanceof CircuitBreakerOpenError) {
    const match = /Retry after (\d+)ms/.exec(error.message);
    const retryAfterMs = match ? parseInt(match[1], 10) : 30_000;
    return { code: 'CIRCUIT_OPEN', message: 'Сервис временно недоступен', retryAfterMs };
  }

  if (error instanceof RateLimitError) {
    return { code: 'RATE_LIMITED', message: 'Превышен лимит запросов. Попробуйте через несколько секунд.' };
  }

  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    if (msg.includes('429') || msg.includes('too many requests') || msg.includes('rate limit')) {
      return { code: 'RATE_LIMITED', message: 'Превышен лимит запросов. Попробуйте через несколько секунд.' };
    }
    if (msg.includes('invalid address') || msg.includes('wrong address')) {
      return { code: 'INVALID_ADDRESS', message: 'Неверный адрес' };
    }
    if (msg.includes('network') || msg.includes('fetch') || msg.includes('timeout')) {
      return { code: 'NETWORK_ERROR', message: 'Ошибка сети' };
    }
  }

  return { code: 'UNKNOWN', message: 'Неизвестная ошибка' };
}

/**
 * Проверяет, стоит ли ретраить ошибку.
 * 429 и невалидный адрес — не ретраим (детерминированные ошибки).
 */
function isRetryable(error: unknown): boolean {
  if (error instanceof RateLimitError) return false;
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    if (msg.includes('429') || msg.includes('too many requests')) return false;
    if (msg.includes('invalid address') || msg.includes('wrong address')) return false;
  }
  return true;
}

/**
 * Парсит адрес TON. Выбрасывает при невалидном адресе (пойдёт в toApiError).
 */
function parseAddress(address: string): Address {
  return Address.parse(address);
}

// ---------------------------------------------------------------------------
// Маппинг транзакций @ton/ton SDK → наш Transaction
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SdkTx = any; // SDK-тип слишком глубоко вложен — используем any + runtime проверки

/**
 * Извлекает комментарий из тела сообщения.
 * opcode 0 = текстовый комментарий (стандарт TON).
 */
function extractComment(body: { remainingBits: number; loadUint: (n: number) => number; loadStringTail: () => string } | undefined): string | undefined {
  if (!body || body.remainingBits < 32) return undefined;
  try {
    const op = body.loadUint(32);
    if (op === 0) return body.loadStringTail() || undefined;
  } catch {
    // Не удалось распарсить — молча пропускаем
  }
  return undefined;
}

function mapSdkTransaction(tx: SdkTx): Transaction | null {
  try {
    const inMsg = tx.inMessage;
    const outMsgs: SdkTx[] = tx.outMessages ? [...tx.outMessages.values()] : [];

    // Определяем направление
    let direction: 'in' | 'out' | 'failed';
    if (outMsgs.length > 0 && outMsgs.some((m: SdkTx) => m.info?.type === 'internal')) {
      direction = 'out';
    } else if (inMsg?.info?.type === 'internal' && inMsg.info.value?.coins > 0n) {
      direction = 'in';
    } else {
      direction = 'failed';
    }

    // Адрес контрагента
    let counterparty = '';
    if (direction === 'out') {
      const outInternal = outMsgs.find((m: SdkTx) => m.info?.type === 'internal');
      if (outInternal?.info?.dest) {
        counterparty = outInternal.info.dest.toString();
      }
    } else if (direction === 'in' && inMsg?.info?.src) {
      counterparty = inMsg.info.src.toString();
    }

    // Сумма
    let amount = '0';
    if (direction === 'out') {
      const outInternal = outMsgs.find((m: SdkTx) => m.info?.type === 'internal');
      if (outInternal?.info?.value?.coins != null) {
        amount = outInternal.info.value.coins.toString();
      }
    } else if (direction === 'in' && inMsg?.info?.value?.coins != null) {
      amount = inMsg.info.value.coins.toString();
    }

    // Комментарий
    const commentMsg = direction === 'out'
      ? outMsgs.find((m: SdkTx) => m.info?.type === 'internal')
      : inMsg;
    const comment = commentMsg?.body
      ? extractComment(commentMsg.body.beginParse())
      : undefined;

    // Комиссия
    const fee = tx.totalFees?.coins?.toString() ?? '0';

    // ID: lt + hash
    const lt = tx.lt?.toString() ?? '0';
    const hash = tx.hash ? Buffer.from(tx.hash()).toString('hex') : '0';

    return {
      id: `${lt}:${hash}`,
      timestamp: tx.now ?? 0,
      direction,
      address: counterparty,
      amount,
      fee,
      comment,
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Публичный API
// ---------------------------------------------------------------------------

/**
 * Возвращает баланс адреса в нано-TON (строка для точности BigInt).
 */
export async function getBalance(address: string): Promise<Result<string, ApiError>> {
  return callApi(async () => {
    const parsed = parseAddress(address);
    const balance = await client.getBalance(parsed);
    return balance.toString();
  });
}

/**
 * Возвращает список транзакций адреса.
 * limit — максимальное количество записей (default 20).
 */
export async function getTransactions(
  address: string,
  limit = TRANSACTIONS_DEFAULT_LIMIT,
): Promise<Result<Transaction[], ApiError>> {
  return callApi(async () => {
    const parsed = parseAddress(address);
    const raw = await client.getTransactions(parsed, { limit });
    return raw
      .map(mapSdkTransaction)
      .filter((tx): tx is Transaction => tx !== null);
  });
}

/**
 * Отправляет подписанный BOC в сеть.
 * boc — base64-строка подписанного пакета.
 */
export async function sendTransaction(boc: string): Promise<Result<void, ApiError>> {
  return callApi(async () => {
    await client.sendFile(Buffer.from(boc, 'base64'));
  });
}

/**
 * Возвращает информацию об адресе: активность и баланс.
 * Используется в address-guard для предупреждения о неактивных адресах.
 */
export async function getAddressInfo(address: string): Promise<Result<AddressInfo, ApiError>> {
  return callApi(async () => {
    const parsed = parseAddress(address);
    const state = await client.getContractState(parsed);
    return {
      isActive: state.state === 'active',
      balance: state.balance.toString(),
    };
  });
}

/**
 * Строит и возвращает экземпляр WalletContractV4 для подписания транзакций.
 * Используется в Send flow: получаем seqno + отправляем transfer.
 */
export function getWalletContract(publicKey: Uint8Array): WalletContractV4 {
  return WalletContractV4.create({
    workchain: TESTNET_WORKCHAIN,
    publicKey: Buffer.from(publicKey),
  });
}

/**
 * Возвращает провайдер для взаимодействия с контрактом кошелька.
 * Нужен для получения seqno перед отправкой.
 */
export function getWalletProvider(contract: WalletContractV4) {
  return client.open(contract);
}
