/**
 * address-guard.ts
 *
 * Многослойная защита от адрес-подмены (clipboard hijacking, typosquatting и т.д.)
 *
 * Слои проверки (выполняются последовательно, все собираются в warnings[]):
 *   1. Валидация формата    — Address.parse() из @ton/ton
 *   2. Whitelist-проверка   — есть ли адрес в knownAddresses (адресная книга)
 *   3. Clipboard-детектор   — флаг pastedFromClipboard от UI-слоя
 *   4. Активность адреса    — запрос к API (мягкое предупреждение, не блокирует)
 *   5. Порог суммы          — > 50% баланса → предупреждение danger
 *
 * Слой 4 не блокирует остальные: если API недоступен → предупреждение ADDRESS_CHECK_FAILED.
 * Функция НИКОГДА не бросает исключение наружу — все ошибки внутри warnings[].
 *
 * DI через параметр deps (defaultDeps для прода, мок для тестов):
 *   checkAddress(input, { getAddressInfo: mockFn })
 */

import { Address } from '@ton/ton';
import type {
  AddressCheckInput,
  AddressCheckResult,
  AddressGuardDeps,
  AddressWarning,
} from '@/types';
import { getAddressInfo as defaultGetAddressInfo } from './ton-api';

// ---------------------------------------------------------------------------
// Константы
// ---------------------------------------------------------------------------

/** Порог суммы: > HIGH_AMOUNT_THRESHOLD_PCT% баланса → предупреждение */
const HIGH_AMOUNT_THRESHOLD_PCT = 50n;

const PROD_DEPS: AddressGuardDeps = {
  getAddressInfo: defaultGetAddressInfo,
};

// ---------------------------------------------------------------------------
// Внутренние проверки — каждая возвращает AddressWarning | null
// ---------------------------------------------------------------------------

function checkFormat(address: string): boolean {
  try {
    Address.parse(address);
    return true;
  } catch {
    return false;
  }
}

function checkKnown(address: string, knownAddresses: readonly string[]): boolean {
  // Нормализуем оба адреса через Address.parse для устойчивости к формату
  // (bounceable vs non-bounceable — один и тот же адрес)
  try {
    const parsed = Address.parse(address);
    return knownAddresses.some((known) => {
      try {
        return Address.parse(known).equals(parsed);
      } catch {
        return false;
      }
    });
  } catch {
    return false;
  }
}

function buildClipboardWarning(): AddressWarning {
  return {
    code: 'CLIPBOARD_PASTE',
    severity: 'warning',
    message:
      'Адрес вставлен из буфера обмена. Убедитесь, что он не был подменён вредоносным ПО.',
  };
}

function buildUnknownWarning(): AddressWarning {
  return {
    code: 'UNKNOWN_ADDRESS',
    severity: 'warning',
    message: 'Адрес не найден в вашей адресной книге. Проверьте получателя.',
  };
}

function buildInactiveWarning(): AddressWarning {
  return {
    code: 'INACTIVE_ADDRESS',
    severity: 'warning',
    message: 'Этот адрес никогда не использовался. Убедитесь, что он принадлежит получателю.',
  };
}

function buildCheckFailedWarning(): AddressWarning {
  return {
    code: 'ADDRESS_CHECK_FAILED',
    severity: 'warning',
    message: 'Не удалось проверить активность адреса. Действуйте с осторожностью.',
  };
}

function buildHighAmountWarning(pct: bigint): AddressWarning {
  return {
    code: 'HIGH_AMOUNT',
    severity: 'danger',
    message: `Вы отправляете ${pct}% от вашего баланса. Дважды проверьте адрес получателя.`,
  };
}

/** Вычисляет процент суммы от баланса (целое, BigInt).
 *  Возвращает null если баланс = 0 (деление на ноль невозможно). */
function calcAmountPercent(amountNano: string, balanceNano: string): bigint | null {
  const amount = BigInt(amountNano);
  const balance = BigInt(balanceNano);
  if (balance === 0n) return null;
  // Умножаем на 100 перед делением чтобы получить целый процент
  return (amount * 100n) / balance;
}

// ---------------------------------------------------------------------------
// Публичный API
// ---------------------------------------------------------------------------

/**
 * Выполняет все проверки адреса и возвращает предупреждения.
 *
 * @param input  — данные для проверки (адрес, сумма, баланс, флаги)
 * @param deps   — инжектируемые зависимости (по умолчанию — продовые)
 */
export async function checkAddress(
  input: AddressCheckInput,
  deps: AddressGuardDeps = PROD_DEPS,
): Promise<AddressCheckResult> {
  const { address, amountNano, balanceNano, pastedFromClipboard, knownAddresses } = input;
  const warnings: AddressWarning[] = [];

  // Слой 1: Валидация формата
  const isValidFormat = checkFormat(address);
  if (!isValidFormat) {
    // Невалидный формат — дальнейшие проверки не имеют смысла
    return { warnings, isKnown: false, isValidFormat: false };
  }

  // Слой 2: Whitelist
  const isKnown = checkKnown(address, knownAddresses);
  if (!isKnown) {
    warnings.push(buildUnknownWarning());
  }

  // Слой 3: Clipboard
  if (pastedFromClipboard) {
    warnings.push(buildClipboardWarning());
  }

  // Слой 4: Активность адреса (async, не блокирует при ошибке)
  const infoResult = await deps.getAddressInfo(address);
  if (infoResult.ok) {
    if (!infoResult.value.isActive) {
      warnings.push(buildInactiveWarning());
    }
  } else {
    warnings.push(buildCheckFailedWarning());
  }

  // Слой 5: Порог суммы
  const pct = calcAmountPercent(amountNano, balanceNano);
  if (pct !== null && pct > HIGH_AMOUNT_THRESHOLD_PCT) {
    warnings.push(buildHighAmountWarning(pct));
  }

  return { warnings, isKnown, isValidFormat: true };
}
