/**
 * validation.test.ts
 *
 * Тесты чистых функций валидации — среда node, так как Address.parse() из @ton/ton
 * использует те же нативные буферы, что и @ton/crypto.
 *
 * @vitest-environment node
 */

import { describe, expect, it } from 'vitest';
import {
  nanoToTon,
  tonToNano,
  validateAmount,
  validatePassword,
  validatePasswordConfirm,
  validateTonAddress,
} from '@/utils/validation';

// ---------------------------------------------------------------------------
// validateTonAddress
// ---------------------------------------------------------------------------

describe('validateTonAddress', () => {
  // EQ/UQ — два формата одного и того же адреса (bounceable / non-bounceable).
  // Оба должны проходить валидацию.
  // Адрес EQ — реальный testnet, UQ — тот же адрес в non-bounceable формате.
  const VALID_EQ = 'EQBvW8Z5huBkMJYdnfAEM5JqTNkuWX3diqYENkWsIL0XggGG'; // bounceable
  const VALID_UQ = 'UQBvUDMVgzdZgf0xqwQ6_0LnD4EKEDbZb2UOaIdmtnJMZLK6'; // non-bounceable

  it('принимает адрес в EQ-формате (bounceable)', () => {
    const result = validateTonAddress(VALID_EQ);
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('принимает адрес в UQ-формате (non-bounceable)', () => {
    expect(validateTonAddress(VALID_UQ).valid).toBe(true);
  });

  it('обрезает пробелы вокруг адреса', () => {
    expect(validateTonAddress(`  ${VALID_EQ}  `).valid).toBe(true);
  });

  it('отклоняет пустую строку', () => {
    const result = validateTonAddress('');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Введите адрес');
  });

  it('отклоняет строку из пробелов', () => {
    expect(validateTonAddress('   ').valid).toBe(false);
  });

  it('отклоняет произвольную строку', () => {
    const result = validateTonAddress('not-an-address');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Неверный формат адреса TON');
  });

  it('отклоняет Ethereum-адрес', () => {
    expect(validateTonAddress('0x742d35Cc6634C0532925a3b844Bc454e4438f44e').valid).toBe(false);
  });

  it('отклоняет слишком короткий base64', () => {
    expect(validateTonAddress('EQabc').valid).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// tonToNano / nanoToTon
// ---------------------------------------------------------------------------

describe('tonToNano', () => {
  it('конвертирует целое число', () => {
    expect(tonToNano('1')).toBe(1_000_000_000n);
  });

  it('конвертирует дробное число', () => {
    expect(tonToNano('1.5')).toBe(1_500_000_000n);
  });

  it('конвертирует 0.01', () => {
    expect(tonToNano('0.01')).toBe(10_000_000n);
  });

  it('принимает запятую как разделитель', () => {
    expect(tonToNano('1,5')).toBe(1_500_000_000n);
  });

  it('обрезает дробную часть до 9 знаков', () => {
    // 1.1234567891 → обрезаем до 1.123456789
    expect(tonToNano('1.1234567891')).toBe(1_123_456_789n);
  });

  it('дополняет короткую дробную часть нулями', () => {
    expect(tonToNano('1.1')).toBe(1_100_000_000n);
  });

  it('выбрасывает при невалидной строке', () => {
    expect(() => tonToNano('abc')).toThrow();
  });

  it('выбрасывает при отрицательном значении', () => {
    expect(() => tonToNano('-1')).toThrow();
  });
});

describe('nanoToTon', () => {
  it('конвертирует 1 TON', () => {
    expect(nanoToTon('1000000000')).toBe('1');
  });

  it('конвертирует 1.5 TON', () => {
    expect(nanoToTon('1500000000')).toBe('1.5');
  });

  it('конвертирует 0', () => {
    expect(nanoToTon('0')).toBe('0');
  });

  it('убирает незначащие нули в дробной части', () => {
    expect(nanoToTon('1100000000')).toBe('1.1');
  });

  it('сохраняет все значащие цифры', () => {
    expect(nanoToTon('1123456789')).toBe('1.123456789');
  });

  it('round-trip: tonToNano → nanoToTon', () => {
    const original = '2.5';
    expect(nanoToTon(tonToNano(original).toString())).toBe(original);
  });
});

// ---------------------------------------------------------------------------
// validateAmount
// ---------------------------------------------------------------------------

describe('validateAmount', () => {
  const BALANCE_5_TON = '5000000000'; // 5 TON

  it('принимает корректную сумму в пределах баланса', () => {
    const result = validateAmount('1', BALANCE_5_TON);
    expect(result.valid).toBe(true);
    expect(result.amountNano).toBe('1000000000');
  });

  it('принимает дробную сумму', () => {
    const result = validateAmount('0.5', BALANCE_5_TON);
    expect(result.valid).toBe(true);
    expect(result.amountNano).toBe('500000000');
  });

  it('принимает сумму равную балансу', () => {
    expect(validateAmount('5', BALANCE_5_TON).valid).toBe(true);
  });

  it('принимает минимальную допустимую сумму 0.01', () => {
    expect(validateAmount('0.01', BALANCE_5_TON).valid).toBe(true);
  });

  it('отклоняет пустую строку', () => {
    const result = validateAmount('', BALANCE_5_TON);
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Введите сумму');
  });

  it('отклоняет нечисловую строку', () => {
    const result = validateAmount('abc', BALANCE_5_TON);
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Введите корректную сумму');
  });

  it('отклоняет нулевую сумму', () => {
    const result = validateAmount('0', BALANCE_5_TON);
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Сумма должна быть больше нуля');
  });

  it('отклоняет сумму ниже минимума (0.001)', () => {
    const result = validateAmount('0.001', BALANCE_5_TON);
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Минимальная сумма: 0.01 TON');
  });

  it('отклоняет сумму сверх баланса', () => {
    const result = validateAmount('6', BALANCE_5_TON);
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Недостаточно средств');
  });

  it('принимает запятую как разделитель', () => {
    expect(validateAmount('1,5', BALANCE_5_TON).valid).toBe(true);
  });

  it('обрезает пробелы', () => {
    expect(validateAmount('  1  ', BALANCE_5_TON).valid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// validatePassword
// ---------------------------------------------------------------------------

describe('validatePassword', () => {
  it('отклоняет пустой пароль', () => {
    const result = validatePassword('');
    expect(result.valid).toBe(false);
    expect(result.score).toBe(0);
    expect(result.error).toBe('Введите пароль');
  });

  it('отклоняет пароль короче 8 символов', () => {
    const result = validatePassword('abc123');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Минимум 8 символов');
  });

  it('принимает пароль из 8 символов без бонусов — score 0', () => {
    const result = validatePassword('abcdefgh');
    expect(result.valid).toBe(true);
    expect(result.score).toBe(0);
  });

  it('даёт score 1 за длину >= 12', () => {
    const result = validatePassword('abcdefghijkl');
    expect(result.valid).toBe(true);
    expect(result.score).toBe(1);
  });

  it('даёт score 2 за длину >= 12 и цифры', () => {
    const result = validatePassword('abcdefghij12');
    expect(result.valid).toBe(true);
    expect(result.score).toBe(2);
  });

  it('даёт score 3 за длину >= 12, цифры и спецсимвол', () => {
    const result = validatePassword('Abcdefgh12!@');
    expect(result.valid).toBe(true);
    expect(result.score).toBe(3);
  });

  it('не превышает score 3', () => {
    const result = validatePassword('Abc123!@#$%^&*Long');
    expect(result.score).toBeLessThanOrEqual(3);
  });
});

// ---------------------------------------------------------------------------
// validatePasswordConfirm
// ---------------------------------------------------------------------------

describe('validatePasswordConfirm', () => {
  it('принимает совпадающие пароли', () => {
    const result = validatePasswordConfirm('password123', 'password123');
    expect(result.valid).toBe(true);
  });

  it('отклоняет пустое подтверждение', () => {
    const result = validatePasswordConfirm('password123', '');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Повторите пароль');
  });

  it('отклоняет несовпадающие пароли', () => {
    const result = validatePasswordConfirm('password123', 'different456');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Пароли не совпадают');
  });

  it('чувствителен к регистру', () => {
    const result = validatePasswordConfirm('Password', 'password');
    expect(result.valid).toBe(false);
  });
});
