/**
 * useSendTransaction.ts
 *
 * FSM для отправки транзакции:
 *   idle → validating → confirming → sending → success
 *                                             ↘ error
 *
 * - idle:        начальное состояние, форма доступна
 * - validating:  проверяем адрес через address-guard, вычисляем warnings
 * - confirming:  показываем экран подтверждения с warnings и чекбоксом
 * - sending:     отправляем BOC в сеть
 * - success:     транзакция принята, редирект на Dashboard
 * - error:       ошибка сети или подписания
 *
 * Хук не знает о UI — он только управляет состоянием и вызывает сервисы.
 * Компонент Send.tsx рендерит разные варианты UI по state.step.
 */

import { useCallback, useState } from 'react';
import { internal } from '@ton/ton';
import { checkAddress } from '@/services/address-guard';
import { getWalletContract, getWalletProvider, sendTransaction } from '@/services/ton-api';
import {
  selectBalance,
  selectBounceableAddress,
  selectSessionKeys,
  useWalletStore,
} from '@/store/wallet-store';
import type { AddressCheckResult, AddressWarning } from '@/types';
import { validateAmount, validateTonAddress } from '@/utils/validation';

// ---------------------------------------------------------------------------
// Типы FSM
// ---------------------------------------------------------------------------

export type SendStep = 'idle' | 'validating' | 'confirming' | 'sending' | 'success' | 'error';

export interface SendFormData {
  toAddress: string;
  amount: string;
  pastedFromClipboard: boolean;
}

export interface ConfirmData {
  toAddress: string;
  /** Сумма в нано-TON */
  amountNano: string;
  /** Сумма в TON (строка для отображения) */
  amountTon: string;
  warnings: AddressWarning[];
}

export type SendState =
  | { step: 'idle' }
  | { step: 'validating' }
  | { step: 'confirming'; data: ConfirmData }
  | { step: 'sending' }
  | { step: 'success'; txId: string }
  | { step: 'error'; message: string };

export interface UseSendTransactionResult {
  state: SendState;
  /** Переход idle → validating → confirming: запускает все проверки */
  validate: (form: SendFormData) => Promise<void>;
  /** Переход confirming → sending → success/error */
  confirm: () => Promise<void>;
  /** Сброс в idle (отмена) */
  reset: () => void;
}

// ---------------------------------------------------------------------------
// Константы
// ---------------------------------------------------------------------------

const INITIAL_STATE: SendState = { step: 'idle' };

// ---------------------------------------------------------------------------
// Хук
// ---------------------------------------------------------------------------

export function useSendTransaction(): UseSendTransactionResult {
  const [state, setState] = useState<SendState>(INITIAL_STATE);

  const balance = useWalletStore(selectBalance);
  const bounceableAddress = useWalletStore(selectBounceableAddress);
  const sessionKeys = useWalletStore(selectSessionKeys);

  const reset = useCallback(() => setState(INITIAL_STATE), []);

  /**
   * Шаг 1: валидация формы + запуск address-guard.
   * idle → validating → confirming (или остаёмся в idle при ошибке валидации формы).
   */
  const validate = useCallback(
    async (form: SendFormData): Promise<void> => {
      // Базовая валидация формы (синхронная)
      const addressValidation = validateTonAddress(form.toAddress);
      if (!addressValidation.valid) {
        // Не меняем state — ошибки формы показывает компонент локально
        return;
      }

      const balanceNano = balance ?? '0';
      const amountValidation = validateAmount(form.amount, balanceNano);
      if (!amountValidation.valid || !amountValidation.amountNano) {
        return;
      }

      setState({ step: 'validating' });

      // Запускаем address-guard
      let checkResult: AddressCheckResult;
      try {
        checkResult = await checkAddress({
          address: form.toAddress,
          amountNano: amountValidation.amountNano,
          balanceNano,
          pastedFromClipboard: form.pastedFromClipboard,
          // TODO Этап 6.5 — адресная книга из keystore
          knownAddresses: [],
        });
      } catch {
        // Если guard упал — считаем что warnings пустые, не блокируем
        checkResult = { warnings: [], isKnown: false, isValidFormat: true };
      }

      setState({
        step: 'confirming',
        data: {
          toAddress: form.toAddress,
          amountNano: amountValidation.amountNano,
          amountTon: form.amount.trim(),
          warnings: checkResult.warnings,
        },
      });
    },
    [balance],
  );

  /**
   * Шаг 2: подписание и отправка.
   * confirming → sending → success / error
   */
  const confirm = useCallback(async (): Promise<void> => {
    if (state.step !== 'confirming') return;

    if (!sessionKeys || !bounceableAddress) {
      setState({ step: 'error', message: 'Кошелёк заблокирован. Перезайдите.' });
      return;
    }

    const { toAddress, amountNano } = state.data;

    setState({ step: 'sending' });

    try {
      const contract = getWalletContract(sessionKeys.publicKey);
      const provider = getWalletProvider(contract);

      // Получаем seqno
      const seqno = await provider.getSeqno();

      // Подписываем и сериализуем транзакцию
      const transfer = contract.createTransfer({
        seqno,
        secretKey: Buffer.from(sessionKeys.secretKey),
        messages: [
          internal({
            to: toAddress,
            value: BigInt(amountNano),
            bounce: false,
          }),
        ],
      });

      // Сериализуем в BOC
      const boc = transfer.toBoc().toString('base64');

      const result = await sendTransaction(boc);

      if (result.ok) {
        // txId — используем timestamp как псевдо-идентификатор
        // (реальный hash станет известен через polling транзакций)
        setState({ step: 'success', txId: Date.now().toString() });
      } else {
        setState({ step: 'error', message: result.error.message });
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Неизвестная ошибка при отправке';
      setState({ step: 'error', message });
    }
  }, [state, sessionKeys, bounceableAddress]);

  return { state, validate, confirm, reset };
}
