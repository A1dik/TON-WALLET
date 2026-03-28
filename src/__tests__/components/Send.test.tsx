/**
 * Send.test.tsx
 *
 * Стратегия: гибрид B+C.
 *   B — реальный Zustand стор (createUnlockedState), сервисы мокируются.
 *   C — useSendTransaction НЕ мокируется — мы тестируем его FSM через UI.
 *       Вместо этого мокируем сервисы, которые он вызывает:
 *         - @/services/address-guard  → checkAddress
 *         - @/services/ton-api       → sendTransaction, getWalletContract, getWalletProvider
 *
 * Что проверяем:
 *   - Рендер формы (поля адреса, суммы, кнопки)
 *   - Валидация: ошибки для пустых полей, неверного адреса, суммы сверх баланса
 *   - Clipboard-детектор: paste → warning на экране подтверждения
 *   - Переход к экрану подтверждения с warnings из address-guard
 *   - Чекбокс "Я проверил адрес" — кнопка Отправить заблокирована без него
 *   - Успешная отправка → Modal → navigate('dashboard')
 *   - Ошибка отправки → Modal с сообщением → retry/cancel
 */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Send } from '@/components/screens/Send';
import { __resetStore, useWalletStore } from '@/store/wallet-store';
import { createUnlockedState } from '@/__tests__/factories/wallet.factory';
import { RECIPIENT_ADDRESS } from '@/__tests__/fixtures/wallet.fixture';
import type { AddressCheckResult } from '@/types';

// ---------------------------------------------------------------------------
// Моки сервисов (стратегия B)
// ---------------------------------------------------------------------------

const mockCheckAddress = vi.hoisted(() => vi.fn<() => Promise<AddressCheckResult>>());
const mockSendTransaction = vi.hoisted(() => vi.fn());
const mockGetWalletContract = vi.hoisted(() => vi.fn());
const mockGetWalletProvider = vi.hoisted(() => vi.fn());

vi.mock('@/services/address-guard', () => ({
  checkAddress: mockCheckAddress,
}));

vi.mock('@/services/ton-api', () => ({
  sendTransaction: mockSendTransaction,
  getWalletContract: mockGetWalletContract,
  getWalletProvider: mockGetWalletProvider,
}));

// ---------------------------------------------------------------------------
// Дефолтные реализации моков
// ---------------------------------------------------------------------------

/** Ответ address-guard без предупреждений */
const NO_WARNINGS: AddressCheckResult = {
  warnings: [],
  isKnown: true,
  isValidFormat: true,
};

/** Ответ address-guard с предупреждением о clipboard */
const CLIPBOARD_WARNING: AddressCheckResult = {
  warnings: [
    {
      code: 'CLIPBOARD_PASTE',
      severity: 'warning',
      message: 'Адрес вставлен из буфера обмена. Убедитесь, что он не был подменён вредоносным ПО.',
    },
  ],
  isKnown: false,
  isValidFormat: true,
};

/** Ответ address-guard с danger-предупреждением */
const HIGH_AMOUNT_WARNING: AddressCheckResult = {
  warnings: [
    {
      code: 'HIGH_AMOUNT',
      severity: 'danger',
      message: 'Вы отправляете 90% от вашего баланса. Дважды проверьте адрес получателя.',
    },
  ],
  isKnown: true,
  isValidFormat: true,
};

// ---------------------------------------------------------------------------
// Настройка
// ---------------------------------------------------------------------------

beforeEach(() => {
  __resetStore();
  useWalletStore.setState(createUnlockedState({ balance: '5000000000' }));

  // Дефолты моков — чистый случай
  mockCheckAddress.mockResolvedValue(NO_WARNINGS);
  mockSendTransaction.mockResolvedValue({ ok: true, value: 'boc-hash' });

  // getWalletContract / getWalletProvider — минимальные стабы для confirm()
  const mockContract = {
    createTransfer: vi.fn().mockReturnValue({
      toBoc: vi.fn().mockReturnValue(Buffer.from('test-boc')),
    }),
  };
  const mockProvider = {
    getSeqno: vi.fn().mockResolvedValue(1),
  };
  mockGetWalletContract.mockReturnValue(mockContract);
  mockGetWalletProvider.mockReturnValue(mockProvider);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Хелперы
// ---------------------------------------------------------------------------

function renderSend() {
  return render(<Send />);
}

function fillAddress(address: string) {
  fireEvent.change(screen.getByLabelText('Адрес получателя'), {
    target: { value: address },
  });
}

function fillAmount(amount: string) {
  fireEvent.change(screen.getByLabelText('Сумма (TON)'), {
    target: { value: amount },
  });
}

function clickDaleeButton() {
  fireEvent.click(screen.getByText('Далее'));
}

// ---------------------------------------------------------------------------
// Тесты — рендер формы
// ---------------------------------------------------------------------------

describe('Send — форма', () => {
  it('рендерит поля адреса и суммы', () => {
    renderSend();
    expect(screen.getByLabelText('Адрес получателя')).toBeInTheDocument();
    expect(screen.getByLabelText('Сумма (TON)')).toBeInTheDocument();
  });

  it('показывает доступный баланс под полем суммы', () => {
    renderSend();
    // formatTon('5000000000') === '5 TON'
    expect(screen.getByText('Доступно: 5 TON')).toBeInTheDocument();
  });

  it('кнопка "Отмена" переходит на dashboard', () => {
    renderSend();
    // В форме есть одна кнопка Отмена (в моде успеха/ошибки — другой контент)
    const cancelButtons = screen.getAllByText('Отмена');
    fireEvent.click(cancelButtons[0]);
    expect(useWalletStore.getState().screen).toBe('dashboard');
  });
});

// ---------------------------------------------------------------------------
// Тесты — валидация формы
// ---------------------------------------------------------------------------

describe('Send — валидация', () => {
  it('показывает ошибку при пустом адресе', async () => {
    renderSend();
    fillAmount('1');
    clickDaleeButton();

    await waitFor(() => {
      expect(screen.getByText('Введите адрес')).toBeInTheDocument();
    });
  });

  it('показывает ошибку при невалидном адресе', async () => {
    renderSend();
    fillAddress('not-a-valid-address');
    fillAmount('1');
    clickDaleeButton();

    await waitFor(() => {
      expect(screen.getByText('Неверный формат адреса TON')).toBeInTheDocument();
    });
  });

  it('показывает ошибку при пустой сумме', async () => {
    renderSend();
    fillAddress(RECIPIENT_ADDRESS);
    clickDaleeButton();

    await waitFor(() => {
      expect(screen.getByText('Введите сумму')).toBeInTheDocument();
    });
  });

  it('показывает ошибку если сумма превышает баланс', async () => {
    renderSend();
    fillAddress(RECIPIENT_ADDRESS);
    fillAmount('100');
    clickDaleeButton();

    await waitFor(() => {
      expect(screen.getByText('Недостаточно средств')).toBeInTheDocument();
    });
  });

  it('показывает AddressDisplay при валидном адресе', () => {
    renderSend();
    fillAddress(RECIPIENT_ADDRESS);
    // Первые 4 символа EQBv отображаются через AddressDisplay
    expect(screen.getByText('EQBv')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Тесты — переход к подтверждению
// ---------------------------------------------------------------------------

describe('Send — экран подтверждения', () => {
  it('переходит к экрану подтверждения при валидных данных', async () => {
    renderSend();
    fillAddress(RECIPIENT_ADDRESS);
    fillAmount('1');
    clickDaleeButton();

    await waitFor(() => {
      expect(screen.getByText('Подтвердите отправку')).toBeInTheDocument();
    });
  });

  it('показывает адрес получателя на экране подтверждения', async () => {
    renderSend();
    fillAddress(RECIPIENT_ADDRESS);
    fillAmount('1');
    clickDaleeButton();

    await waitFor(() => {
      expect(screen.getByText('Получатель')).toBeInTheDocument();
      // Первые 4 символа адреса в AddressDisplay
      expect(screen.getByText('EQBv')).toBeInTheDocument();
    });
  });

  it('показывает сумму на экране подтверждения', async () => {
    renderSend();
    fillAddress(RECIPIENT_ADDRESS);
    fillAmount('1.5');
    clickDaleeButton();

    await waitFor(() => {
      expect(screen.getByText('1.5 TON')).toBeInTheDocument();
    });
  });

  it('кнопка "Назад" возвращает к форме', async () => {
    renderSend();
    fillAddress(RECIPIENT_ADDRESS);
    fillAmount('1');
    clickDaleeButton();

    await waitFor(() => screen.getByText('Подтвердите отправку'));

    fireEvent.click(screen.getByText('Назад'));

    await waitFor(() => {
      expect(screen.getByLabelText('Адрес получателя')).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// Тесты — предупреждения
// ---------------------------------------------------------------------------

describe('Send — предупреждения address-guard', () => {
  it('показывает warning о clipboard при paste', async () => {
    mockCheckAddress.mockResolvedValue(CLIPBOARD_WARNING);

    renderSend();
    // Имитируем paste в поле адреса
    fireEvent.paste(screen.getByLabelText('Адрес получателя'));
    fillAddress(RECIPIENT_ADDRESS);
    fillAmount('1');
    clickDaleeButton();

    await waitFor(() => {
      expect(
        screen.getByText(/Адрес вставлен из буфера обмена/),
      ).toBeInTheDocument();
    });
  });

  it('показывает danger-предупреждение при большой сумме', async () => {
    mockCheckAddress.mockResolvedValue(HIGH_AMOUNT_WARNING);

    renderSend();
    fillAddress(RECIPIENT_ADDRESS);
    fillAmount('4.5');
    clickDaleeButton();

    await waitFor(() => {
      expect(screen.getByText(/90% от вашего баланса/)).toBeInTheDocument();
    });
  });

  it('не показывает предупреждений при известном адресе без danger', async () => {
    mockCheckAddress.mockResolvedValue(NO_WARNINGS);

    renderSend();
    fillAddress(RECIPIENT_ADDRESS);
    fillAmount('1');
    clickDaleeButton();

    await waitFor(() => screen.getByText('Подтвердите отправку'));

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Тесты — чекбокс и кнопка отправки
// ---------------------------------------------------------------------------

describe('Send — чекбокс подтверждения', () => {
  async function goToConfirm() {
    renderSend();
    fillAddress(RECIPIENT_ADDRESS);
    fillAmount('1');
    clickDaleeButton();
    await waitFor(() => screen.getByText('Подтвердите отправку'));
  }

  it('кнопка "Отправить" disabled без чекбокса', async () => {
    await goToConfirm();
    const sendButton = screen.getByText('Отправить');
    expect(sendButton).toBeDisabled();
  });

  it('кнопка "Отправить" активна после отметки чекбокса', async () => {
    await goToConfirm();
    fireEvent.click(screen.getByRole('checkbox'));
    expect(screen.getByText('Отправить')).not.toBeDisabled();
  });
});

// ---------------------------------------------------------------------------
// Тесты — успешная отправка
// ---------------------------------------------------------------------------

describe('Send — успешная отправка', () => {
  it('показывает модал успеха после отправки', async () => {
    renderSend();
    fillAddress(RECIPIENT_ADDRESS);
    fillAmount('1');
    clickDaleeButton();

    await waitFor(() => screen.getByText('Подтвердите отправку'));

    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByText('Отправить'));

    await waitFor(() => {
      expect(screen.getByText('Транзакция отправлена')).toBeInTheDocument();
    });
  });

  it('кнопка "На главную" переходит на dashboard', async () => {
    renderSend();
    fillAddress(RECIPIENT_ADDRESS);
    fillAmount('1');
    clickDaleeButton();

    await waitFor(() => screen.getByText('Подтвердите отправку'));

    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByText('Отправить'));

    await waitFor(() => screen.getByText('На главную'));

    fireEvent.click(screen.getByText('На главную'));

    expect(useWalletStore.getState().screen).toBe('dashboard');
  });
});

// ---------------------------------------------------------------------------
// Тесты — ошибка отправки
// ---------------------------------------------------------------------------

describe('Send — ошибка отправки', () => {
  it('показывает модал ошибки при сбое sendTransaction', async () => {
    mockSendTransaction.mockResolvedValue({
      ok: false,
      error: { code: 'NETWORK_ERROR', message: 'Соединение прервано' },
    });

    renderSend();
    fillAddress(RECIPIENT_ADDRESS);
    fillAmount('1');
    clickDaleeButton();

    await waitFor(() => screen.getByText('Подтвердите отправку'));

    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByText('Отправить'));

    await waitFor(() => {
      expect(screen.getByText('Ошибка отправки')).toBeInTheDocument();
      expect(screen.getByText('Соединение прервано')).toBeInTheDocument();
    });
  });

  it('кнопка "Попробовать снова" возвращает к форме', async () => {
    mockSendTransaction.mockResolvedValue({
      ok: false,
      error: { code: 'NETWORK_ERROR', message: 'Ошибка сети' },
    });

    renderSend();
    fillAddress(RECIPIENT_ADDRESS);
    fillAmount('1');
    clickDaleeButton();

    await waitFor(() => screen.getByText('Подтвердите отправку'));
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByText('Отправить'));

    await waitFor(() => screen.getByText('Ошибка отправки'));
    fireEvent.click(screen.getByText('Попробовать снова'));

    await waitFor(() => {
      expect(screen.getByLabelText('Адрес получателя')).toBeInTheDocument();
    });
  });
});
