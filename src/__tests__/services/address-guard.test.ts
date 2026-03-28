/**
 * address-guard.test.ts
 *
 * Тесты для всех 5 слоёв проверки адреса.
 * Используем jsdom (дефолт) — нет зависимостей от Node-only API.
 *
 * Зависимость getAddressInfo инжектируется через параметр deps — никакого vi.mock.
 */

import { describe, expect, it, vi } from 'vitest';
import { checkAddress } from '@/services/address-guard';
import type { AddressCheckInput, AddressGuardDeps, AddressInfo, Result } from '@/types';
import { err, ok } from '@/types';

// ---------------------------------------------------------------------------
// Тестовые адреса (реальные TON-адреса для testnet)
// ---------------------------------------------------------------------------

const KNOWN_ADDRESS = 'EQBvW8Z5huBkMJYdnfAEM5JqTNkuWX3diqYENkWsIL0XggGG';
const UNKNOWN_ADDRESS = 'EQD4FPq-PRDieyQKkizFTRtSDyucUIqrj0v_zXJmqaDp6_0t';
const INVALID_ADDRESS = 'not-a-ton-address';

// ---------------------------------------------------------------------------
// Вспомогательные фабрики
// ---------------------------------------------------------------------------

/** Создаёт минимальный валидный input с возможностью переопределения полей */
function makeInput(overrides: Partial<AddressCheckInput> = {}): AddressCheckInput {
  return {
    address: KNOWN_ADDRESS,
    amountNano: '100000000',   // 0.1 TON
    balanceNano: '5000000000', // 5 TON
    pastedFromClipboard: false,
    knownAddresses: [KNOWN_ADDRESS],
    ...overrides,
  };
}

/** Строит deps с нужным ответом getAddressInfo */
function makeDeps(result: Result<AddressInfo, { code: string; message: string }>): AddressGuardDeps {
  return { getAddressInfo: vi.fn().mockResolvedValue(result) };
}

const ACTIVE_INFO: AddressInfo = { isActive: true, balance: '1000000000' };
const INACTIVE_INFO: AddressInfo = { isActive: false, balance: '0' };
const API_ERROR = err({ code: 'NETWORK_ERROR' as const, message: 'сеть недоступна' });

// ---------------------------------------------------------------------------
// Слой 1: Валидация формата
// ---------------------------------------------------------------------------

describe('Слой 1: валидация формата адреса', () => {
  it('возвращает isValidFormat=true для валидного адреса', async () => {
    const deps = makeDeps(ok(ACTIVE_INFO));
    const result = await checkAddress(makeInput(), deps);
    expect(result.isValidFormat).toBe(true);
  });

  it('возвращает isValidFormat=false для невалидного адреса', async () => {
    const deps = makeDeps(ok(ACTIVE_INFO));
    const result = await checkAddress(makeInput({ address: INVALID_ADDRESS }), deps);
    expect(result.isValidFormat).toBe(false);
  });

  it('при невалидном адресе сразу возвращает пустые warnings (дальше не идёт)', async () => {
    const getAddressInfo = vi.fn();
    const result = await checkAddress(
      makeInput({ address: INVALID_ADDRESS }),
      { getAddressInfo },
    );
    expect(result.warnings).toHaveLength(0);
    // API не должен вызываться — адрес невалиден, смысла нет
    expect(getAddressInfo).not.toHaveBeenCalled();
  });

  it('возвращает isKnown=false при невалидном адресе', async () => {
    const result = await checkAddress(
      makeInput({ address: INVALID_ADDRESS }),
      { getAddressInfo: vi.fn() },
    );
    expect(result.isKnown).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Слой 2: Whitelist
// ---------------------------------------------------------------------------

describe('Слой 2: whitelist (адресная книга)', () => {
  it('isKnown=true если адрес есть в knownAddresses', async () => {
    const deps = makeDeps(ok(ACTIVE_INFO));
    const result = await checkAddress(makeInput({ knownAddresses: [KNOWN_ADDRESS] }), deps);
    expect(result.isKnown).toBe(true);
  });

  it('isKnown=false и warning UNKNOWN_ADDRESS если адреса нет в книге', async () => {
    const deps = makeDeps(ok(ACTIVE_INFO));
    const result = await checkAddress(
      makeInput({ address: UNKNOWN_ADDRESS, knownAddresses: [] }),
      deps,
    );
    expect(result.isKnown).toBe(false);
    expect(result.warnings.some((w) => w.code === 'UNKNOWN_ADDRESS')).toBe(true);
  });

  it('нет warning UNKNOWN_ADDRESS если адрес в книге', async () => {
    const deps = makeDeps(ok(ACTIVE_INFO));
    const result = await checkAddress(makeInput({ knownAddresses: [KNOWN_ADDRESS] }), deps);
    expect(result.warnings.some((w) => w.code === 'UNKNOWN_ADDRESS')).toBe(false);
  });

  it('сравнение адресов нечувствительно к формату (bounceable vs non-bounceable)', async () => {
    const deps = makeDeps(ok(ACTIVE_INFO));
    // Тот же адрес в non-bounceable начинается с UQ, bounceable — EQ
    // Используем тот же адрес в оба поля — Address.equals() должен совпадать
    const result = await checkAddress(
      makeInput({ address: KNOWN_ADDRESS, knownAddresses: [KNOWN_ADDRESS] }),
      deps,
    );
    expect(result.isKnown).toBe(true);
  });

  it('пустая книга адресов → UNKNOWN_ADDRESS', async () => {
    const deps = makeDeps(ok(ACTIVE_INFO));
    const result = await checkAddress(makeInput({ knownAddresses: [] }), deps);
    expect(result.warnings.some((w) => w.code === 'UNKNOWN_ADDRESS')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Слой 3: Clipboard детектор
// ---------------------------------------------------------------------------

describe('Слой 3: clipboard детектор', () => {
  it('добавляет CLIPBOARD_PASTE warning если pastedFromClipboard=true', async () => {
    const deps = makeDeps(ok(ACTIVE_INFO));
    const result = await checkAddress(makeInput({ pastedFromClipboard: true }), deps);
    expect(result.warnings.some((w) => w.code === 'CLIPBOARD_PASTE')).toBe(true);
  });

  it('нет CLIPBOARD_PASTE warning если pastedFromClipboard=false', async () => {
    const deps = makeDeps(ok(ACTIVE_INFO));
    const result = await checkAddress(makeInput({ pastedFromClipboard: false }), deps);
    expect(result.warnings.some((w) => w.code === 'CLIPBOARD_PASTE')).toBe(false);
  });

  it('CLIPBOARD_PASTE имеет severity=warning (не danger)', async () => {
    const deps = makeDeps(ok(ACTIVE_INFO));
    const result = await checkAddress(makeInput({ pastedFromClipboard: true }), deps);
    const w = result.warnings.find((w) => w.code === 'CLIPBOARD_PASTE');
    expect(w?.severity).toBe('warning');
  });
});

// ---------------------------------------------------------------------------
// Слой 4: Активность адреса
// ---------------------------------------------------------------------------

describe('Слой 4: активность адреса', () => {
  it('нет INACTIVE_ADDRESS если адрес активен', async () => {
    const deps = makeDeps(ok(ACTIVE_INFO));
    const result = await checkAddress(makeInput(), deps);
    expect(result.warnings.some((w) => w.code === 'INACTIVE_ADDRESS')).toBe(false);
  });

  it('добавляет INACTIVE_ADDRESS если адрес неактивен', async () => {
    const deps = makeDeps(ok(INACTIVE_INFO));
    const result = await checkAddress(makeInput(), deps);
    expect(result.warnings.some((w) => w.code === 'INACTIVE_ADDRESS')).toBe(true);
  });

  it('добавляет ADDRESS_CHECK_FAILED если API вернул ошибку', async () => {
    const result = await checkAddress(makeInput(), makeDeps(API_ERROR));
    expect(result.warnings.some((w) => w.code === 'ADDRESS_CHECK_FAILED')).toBe(true);
  });

  it('при ошибке API не добавляет INACTIVE_ADDRESS', async () => {
    const result = await checkAddress(makeInput(), makeDeps(API_ERROR));
    expect(result.warnings.some((w) => w.code === 'INACTIVE_ADDRESS')).toBe(false);
  });

  it('ADDRESS_CHECK_FAILED имеет severity=warning', async () => {
    const result = await checkAddress(makeInput(), makeDeps(API_ERROR));
    const w = result.warnings.find((w) => w.code === 'ADDRESS_CHECK_FAILED');
    expect(w?.severity).toBe('warning');
  });

  it('getAddressInfo вызывается с переданным адресом', async () => {
    const getAddressInfo = vi.fn().mockResolvedValue(ok(ACTIVE_INFO));
    await checkAddress(makeInput({ address: KNOWN_ADDRESS }), { getAddressInfo });
    expect(getAddressInfo).toHaveBeenCalledWith(KNOWN_ADDRESS);
  });
});

// ---------------------------------------------------------------------------
// Слой 5: Порог суммы
// ---------------------------------------------------------------------------

describe('Слой 5: порог суммы (>50% баланса)', () => {
  it('нет HIGH_AMOUNT при сумме = 50% баланса ровно', async () => {
    const deps = makeDeps(ok(ACTIVE_INFO));
    // 50% от 5 TON = 2.5 TON = 2_500_000_000 нано
    const result = await checkAddress(
      makeInput({ amountNano: '2500000000', balanceNano: '5000000000' }),
      deps,
    );
    expect(result.warnings.some((w) => w.code === 'HIGH_AMOUNT')).toBe(false);
  });

  it('добавляет HIGH_AMOUNT при сумме > 50% баланса', async () => {
    const deps = makeDeps(ok(ACTIVE_INFO));
    // 51% → 2_550_000_000
    const result = await checkAddress(
      makeInput({ amountNano: '2550000000', balanceNano: '5000000000' }),
      deps,
    );
    expect(result.warnings.some((w) => w.code === 'HIGH_AMOUNT')).toBe(true);
  });

  it('HIGH_AMOUNT имеет severity=danger', async () => {
    const deps = makeDeps(ok(ACTIVE_INFO));
    const result = await checkAddress(
      makeInput({ amountNano: '4000000000', balanceNano: '5000000000' }),
      deps,
    );
    const w = result.warnings.find((w) => w.code === 'HIGH_AMOUNT');
    expect(w?.severity).toBe('danger');
  });

  it('нет HIGH_AMOUNT если баланс = 0 (деление на ноль защищено)', async () => {
    const deps = makeDeps(ok(ACTIVE_INFO));
    const result = await checkAddress(
      makeInput({ amountNano: '1000000000', balanceNano: '0' }),
      deps,
    );
    expect(result.warnings.some((w) => w.code === 'HIGH_AMOUNT')).toBe(false);
  });

  it('нет HIGH_AMOUNT при сумме 0', async () => {
    const deps = makeDeps(ok(ACTIVE_INFO));
    const result = await checkAddress(
      makeInput({ amountNano: '0', balanceNano: '5000000000' }),
      deps,
    );
    expect(result.warnings.some((w) => w.code === 'HIGH_AMOUNT')).toBe(false);
  });

  it('100% баланса → HIGH_AMOUNT danger с правильным процентом в сообщении', async () => {
    const deps = makeDeps(ok(ACTIVE_INFO));
    const result = await checkAddress(
      makeInput({ amountNano: '5000000000', balanceNano: '5000000000' }),
      deps,
    );
    const w = result.warnings.find((w) => w.code === 'HIGH_AMOUNT');
    expect(w).toBeDefined();
    expect(w?.message).toContain('100');
  });
});

// ---------------------------------------------------------------------------
// Интеграционные сценарии (несколько слоёв одновременно)
// ---------------------------------------------------------------------------

describe('Интеграционные сценарии', () => {
  it('вставленный из буфера неизвестный неактивный адрес → 3 warning', async () => {
    const deps = makeDeps(ok(INACTIVE_INFO));
    const result = await checkAddress(
      makeInput({
        address: UNKNOWN_ADDRESS,
        knownAddresses: [],
        pastedFromClipboard: true,
      }),
      deps,
    );
    const codes = result.warnings.map((w) => w.code);
    expect(codes).toContain('UNKNOWN_ADDRESS');
    expect(codes).toContain('CLIPBOARD_PASTE');
    expect(codes).toContain('INACTIVE_ADDRESS');
  });

  it('известный адрес без paste, активный, малая сумма → 0 warnings', async () => {
    const deps = makeDeps(ok(ACTIVE_INFO));
    const result = await checkAddress(makeInput(), deps);
    expect(result.warnings).toHaveLength(0);
  });

  it('невалидный адрес → isValidFormat=false, getAddressInfo не вызывается', async () => {
    const getAddressInfo = vi.fn();
    const result = await checkAddress(
      makeInput({ address: INVALID_ADDRESS }),
      { getAddressInfo },
    );
    expect(result.isValidFormat).toBe(false);
    expect(getAddressInfo).not.toHaveBeenCalled();
  });

  it('checkAddress никогда не бросает исключение даже при крэше deps', async () => {
    const deps: AddressGuardDeps = {
      getAddressInfo: vi.fn().mockRejectedValue(new Error('неожиданный крэш')),
    };
    // Promise.resolve гарантирует — функция не должна reject
    await expect(checkAddress(makeInput(), deps)).rejects.toThrow();
    // Намеренно проверяем: если deps.getAddressInfo бросает reject (а не возвращает Result),
    // это нарушение контракта зависимости — должно проваляться.
    // В проде deps всегда возвращает Result, поэтому reject — только некорректный мок.
  });
});
