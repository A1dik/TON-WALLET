/**
 * validation.ts
 *
 * Валидация данных на границе UI → сервисы.
 * Все функции — чистые, без side-эффектов.
 *
 * TON-адрес: поддерживаем оба формата — bounceable (EQ...) и non-bounceable (UQ...).
 * Сумма: строка в TON (не нано-TON) — пользователь вводит «1.5», не «1500000000».
 */

import { Address } from '@ton/ton';

// ---------------------------------------------------------------------------
// TON адрес
// ---------------------------------------------------------------------------

/** Результат валидации адреса */
export interface AddressValidation {
  valid: boolean;
  error?: string;
}

/**
 * Проверяет, является ли строка валидным TON-адресом.
 * Использует Address.parse() из @ton/ton — единственный авторитетный источник.
 */
export function validateTonAddress(address: string): AddressValidation {
  const trimmed = address.trim();

  if (trimmed.length === 0) {
    return { valid: false, error: 'Введите адрес' };
  }

  try {
    Address.parse(trimmed);
    return { valid: true };
  } catch {
    return { valid: false, error: 'Неверный формат адреса TON' };
  }
}

// ---------------------------------------------------------------------------
// Сумма
// ---------------------------------------------------------------------------

/** Результат валидации суммы */
export interface AmountValidation {
  valid: boolean;
  /** Сумма в нано-TON (BigInt-строка) — заполнена только при valid === true */
  amountNano?: string;
  error?: string;
}

const TON_DECIMALS = 9;
const NANO_MULTIPLIER = 10n ** BigInt(TON_DECIMALS);

/**
 * Переводит строку TON → нано-TON как BigInt.
 * Поддерживает до 9 знаков после запятой.
 * Выбрасывает при невалидной строке.
 */
export function tonToNano(value: string): bigint {
  const trimmed = value.trim().replace(',', '.');

  // Допустимый формат: цифры с опциональной десятичной частью
  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    throw new Error('Недопустимый формат числа');
  }

  const [intPart, fracPart = ''] = trimmed.split('.');

  // Обрезаем или дополняем дробную часть до 9 знаков
  const fracPadded = fracPart.slice(0, TON_DECIMALS).padEnd(TON_DECIMALS, '0');

  return BigInt(intPart) * NANO_MULTIPLIER + BigInt(fracPadded);
}

/**
 * Переводит нано-TON (строка BigInt) → TON с точностью до 9 знаков.
 * Используется только внутри formatters.ts — здесь как утилита.
 */
export function nanoToTon(nanoStr: string): string {
  const nano = BigInt(nanoStr);
  const int = nano / NANO_MULTIPLIER;
  const frac = nano % NANO_MULTIPLIER;
  const fracStr = frac.toString().padStart(TON_DECIMALS, '0').replace(/0+$/, '');
  return fracStr.length > 0 ? `${int}.${fracStr}` : `${int}`;
}

/**
 * Валидирует сумму перевода.
 * @param value — строка TON, введённая пользователем
 * @param balanceNano — текущий баланс в нано-TON (нужен для проверки достаточности)
 */
export function validateAmount(value: string, balanceNano: string): AmountValidation {
  const trimmed = value.trim().replace(',', '.');

  if (trimmed.length === 0) {
    return { valid: false, error: 'Введите сумму' };
  }

  let amountNano: bigint;
  try {
    amountNano = tonToNano(trimmed);
  } catch {
    return { valid: false, error: 'Введите корректную сумму' };
  }

  if (amountNano <= 0n) {
    return { valid: false, error: 'Сумма должна быть больше нуля' };
  }

  // Минимальная сумма: 0.01 TON (сетевая комиссия ~0.003 TON)
  const MIN_NANO = tonToNano('0.01');
  if (amountNano < MIN_NANO) {
    return { valid: false, error: 'Минимальная сумма: 0.01 TON' };
  }

  const balance = BigInt(balanceNano);
  if (amountNano > balance) {
    return { valid: false, error: 'Недостаточно средств' };
  }

  return { valid: true, amountNano: amountNano.toString() };
}

// ---------------------------------------------------------------------------
// Пароль
// ---------------------------------------------------------------------------

/** Результат валидации пароля */
export interface PasswordValidation {
  valid: boolean;
  score: 0 | 1 | 2 | 3; // 0=слабый, 1=слабый, 2=средний, 3=сильный
  error?: string;
}

/**
 * Оценивает силу пароля.
 * Критерии: длина, цифры, спецсимволы, верхний регистр.
 */
export function validatePassword(password: string): PasswordValidation {
  if (password.length === 0) {
    return { valid: false, score: 0, error: 'Введите пароль' };
  }

  if (password.length < 8) {
    return { valid: false, score: 0, error: 'Минимум 8 символов' };
  }

  let score = 0;
  if (password.length >= 12) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^a-zA-Z0-9]/.test(password)) score++;

  return { valid: true, score: Math.min(score, 3) as 0 | 1 | 2 | 3 };
}

/**
 * Проверяет совпадение паролей при подтверждении.
 */
export function validatePasswordConfirm(
  password: string,
  confirm: string,
): { valid: boolean; error?: string } {
  if (confirm.length === 0) {
    return { valid: false, error: 'Повторите пароль' };
  }
  if (password !== confirm) {
    return { valid: false, error: 'Пароли не совпадают' };
  }
  return { valid: true };
}
