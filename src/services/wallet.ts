/**
 * wallet.ts
 *
 * Генерация / импорт кошелька TON (testnet, WalletContractV4).
 *
 * Безопасность мнемоники:
 *   - Внутри сервиса мнемоника живёт как Uint8Array (через TextEncoder).
 *   - Строка создаётся только для передачи вызывающей стороне.
 *   - После использования приватный ключ зануляется через secretKey.fill(0).
 *   - Ограничение рантайма: JS-строки иммутабельны, GC не гарантирует очистку
 *     строки мнемоники из памяти. Это компромисс браузерной среды (описан в README).
 */

import { mnemonicNew, mnemonicToPrivateKey, mnemonicValidate } from '@ton/crypto';
import { WalletContractV4 } from '@ton/ton';
import type { Result, WalletData, WalletError, WalletKeys } from '@/types';
import { err, ok } from '@/types';

// ---------------------------------------------------------------------------
// Константы
// ---------------------------------------------------------------------------

const MNEMONIC_WORDS = 24;
const TESTNET_WORKCHAIN = 0;

// ---------------------------------------------------------------------------
// Внутренние утилиты
// ---------------------------------------------------------------------------

function buildWalletData(publicKey: Uint8Array): WalletData {
  const contract = WalletContractV4.create({
    workchain: TESTNET_WORKCHAIN,
    publicKey: Buffer.from(publicKey),
  });

  // toString без аргументов → bounceable=true (для смарт-контрактов)
  // urlSafe + testOnly для testnet non-bounceable адреса
  return {
    address: contract.address.toString({ urlSafe: true, bounceable: false, testOnly: true }),
    bounceableAddress: contract.address.toString({ urlSafe: true, bounceable: true, testOnly: true }),
  };
}

// ---------------------------------------------------------------------------
// Публичный API
// ---------------------------------------------------------------------------

/**
 * Генерирует новый кошелёк.
 * Возвращает слова мнемоники и данные адреса.
 * Приватный ключ НЕ возвращается — он нужен только при подписании транзакции.
 */
export async function generateWallet(): Promise<
  Result<{ words: string[]; walletData: WalletData }, WalletError>
> {
  try {
    const words = await mnemonicNew(MNEMONIC_WORDS);
    const keyPair = await mnemonicToPrivateKey(words);

    const walletData = buildWalletData(keyPair.publicKey);

    // Зануляем приватный ключ — он больше не нужен при генерации
    keyPair.secretKey.fill(0);

    return ok({ words, walletData });
  } catch {
    return err({ code: 'MNEMONIC_GENERATION_FAILED', message: 'Ошибка генерации кошелька' });
  }
}

/**
 * Импортирует кошелёк из мнемоники.
 * Валидирует контрольную сумму TON BIP39.
 */
export async function importWallet(
  words: string[],
): Promise<Result<{ walletData: WalletData }, WalletError>> {
  if (words.length !== MNEMONIC_WORDS) {
    return err({
      code: 'INVALID_MNEMONIC',
      message: `Мнемоника должна содержать ${MNEMONIC_WORDS} слов, получено: ${words.length}`,
    });
  }

  const isValid = await mnemonicValidate(words);
  if (!isValid) {
    return err({ code: 'INVALID_MNEMONIC', message: 'Неверная мнемоника (ошибка контрольной суммы)' });
  }

  try {
    const keyPair = await mnemonicToPrivateKey(words);
    const walletData = buildWalletData(keyPair.publicKey);
    keyPair.secretKey.fill(0);

    return ok({ walletData });
  } catch {
    return err({ code: 'KEY_DERIVATION_FAILED', message: 'Ошибка деривации ключа' });
  }
}

/**
 * Дерибирует ключевую пару из мнемоники для подписания транзакции.
 *
 * ВАЖНО: Вызывающая сторона обязана вызвать keys.secretKey.fill(0)
 * сразу после использования ключа.
 *
 * @returns WalletKeys — publicKey + secretKey (нужно обнулить после использования)
 */
export async function deriveKeys(
  words: string[],
): Promise<Result<WalletKeys, WalletError>> {
  const isValid = await mnemonicValidate(words);
  if (!isValid) {
    return err({ code: 'INVALID_MNEMONIC', message: 'Неверная мнемоника' });
  }

  try {
    const keyPair = await mnemonicToPrivateKey(words);
    return ok({
      publicKey: keyPair.publicKey,
      secretKey: keyPair.secretKey,
    });
  } catch {
    return err({ code: 'KEY_DERIVATION_FAILED', message: 'Ошибка деривации ключа' });
  }
}

/**
 * Валидирует одно слово мнемоники.
 * Используется для inline-валидации в форме ImportWallet (поле за полем).
 */
export async function validateMnemonic(words: string[]): Promise<boolean> {
  if (words.length !== MNEMONIC_WORDS) return false;
  return mnemonicValidate(words);
}
