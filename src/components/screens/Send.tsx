/**
 * Send.tsx
 *
 * Экран отправки TON.
 * FSM: idle → validating → confirming → sending → success/error
 * Управляется через useSendTransaction.
 *
 * На экране confirming — показываем все предупреждения + чекбокс подтверждения.
 */

import { useCallback, useRef, useState } from 'react';
import {
  useSendTransaction,
  type ConfirmData,
  type SendFormData,
} from '@/hooks/useSendTransaction';
import type { AddressWarning } from '@/types';
import {
  selectBalance,
  useWalletStore,
} from '@/store/wallet-store';
import { AddressDisplay } from '@/components/ui/AddressDisplay';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { WarningBanner } from '@/components/ui/WarningBanner';
import { formatTon } from '@/utils/formatters';
import {
  validateAmount,
  validateTonAddress,
} from '@/utils/validation';

// ---------------------------------------------------------------------------
// Форма отправки (step: idle / validating)
// ---------------------------------------------------------------------------

interface SendFormProps {
  balance: string | null;
  onSubmit: (form: SendFormData) => Promise<void>;
  onBack: () => void;
  isValidating: boolean;
}

function SendForm({ balance, onSubmit, onBack, isValidating }: SendFormProps) {
  const [address, setAddress] = useState('');
  const [amount, setAmount] = useState('');
  const [pastedFromClipboard, setPastedFromClipboard] = useState(false);
  const [addressError, setAddressError] = useState<string | undefined>();
  const [amountError, setAmountError] = useState<string | undefined>();

  // Clipboard-детектор: флаг выставляется при paste в поле адреса
  const handleAddressPaste = useCallback(() => {
    setPastedFromClipboard(true);
  }, []);

  const handleAddressChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setAddress(e.target.value);
      setAddressError(undefined);
      // Если пользователь редактирует вручную после paste — сбрасываем флаг
      if (pastedFromClipboard) setPastedFromClipboard(false);
    },
    [pastedFromClipboard],
  );

  const validateForm = (): boolean => {
    const addrResult = validateTonAddress(address);
    const balanceNano = balance ?? '0';
    const amtResult = validateAmount(amount, balanceNano);

    setAddressError(addrResult.error);
    setAmountError(amtResult.error);

    return addrResult.valid && amtResult.valid;
  };

  const handleSubmit = () => {
    if (!validateForm()) return;
    onSubmit({ toAddress: address, amount, pastedFromClipboard });
  };

  return (
    <div className="space-y-4">
      {/* Поле адреса */}
      <div>
        <Input
          label="Адрес получателя"
          value={address}
          onChange={handleAddressChange}
          onPaste={handleAddressPaste}
          placeholder="EQ... или UQ..."
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          error={addressError}
        />
        {/* Подсветка адреса при вводе */}
        {address && !addressError && validateTonAddress(address).valid && (
          <div className="mt-2 px-1">
            <AddressDisplay address={address} compact />
          </div>
        )}
      </div>

      {/* Поле суммы */}
      <Input
        label="Сумма (TON)"
        value={amount}
        onChange={(e) => {
          setAmount(e.target.value);
          setAmountError(undefined);
        }}
        placeholder="0.5"
        type="text"
        inputMode="decimal"
        hint={balance ? `Доступно: ${formatTon(balance)}` : undefined}
        error={amountError}
      />

      <div className="flex gap-3 pt-2">
        <Button variant="secondary" onClick={onBack} fullWidth>
          Отмена
        </Button>
        <Button
          onClick={handleSubmit}
          loading={isValidating}
          fullWidth
        >
          Далее
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Экран подтверждения (step: confirming)
// ---------------------------------------------------------------------------

interface ConfirmScreenProps {
  toAddress: string;
  amountTon: string;
  warnings: AddressWarning[];
  onConfirm: () => void;
  onBack: () => void;
  isSending: boolean;
}

function ConfirmScreen({
  toAddress,
  amountTon,
  warnings,
  onConfirm,
  onBack,
  isSending,
}: ConfirmScreenProps) {
  const [checked, setChecked] = useState(false);
  const hasDanger = warnings.some((w) => w.severity === 'danger');

  return (
    <div className="space-y-5">
      <h2 className="text-lg font-semibold">Подтвердите отправку</h2>

      {/* Предупреждения */}
      {warnings.length > 0 && (
        <div className="space-y-2">
          {warnings.map((w) => (
            <WarningBanner key={w.code} severity={w.severity} message={w.message} />
          ))}
        </div>
      )}

      {/* Детали транзакции */}
      <div className="bg-white/5 rounded-xl p-4 space-y-3">
        <div>
          <p className="text-white/40 text-xs mb-1">Получатель</p>
          <AddressDisplay address={toAddress} />
        </div>
        <div className="border-t border-white/10" />
        <div>
          <p className="text-white/40 text-xs mb-1">Сумма</p>
          <p className="text-2xl font-semibold">{amountTon} TON</p>
        </div>
      </div>

      {/* Чекбокс подтверждения */}
      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => setChecked(e.target.checked)}
          className="mt-0.5 accent-accent size-4 shrink-0 cursor-pointer"
        />
        <span className={[
          'text-sm',
          hasDanger ? 'text-danger' : 'text-white/70',
        ].join(' ')}>
          Я проверил адрес получателя и подтверждаю отправку
        </span>
      </label>

      <div className="flex gap-3">
        <Button variant="secondary" onClick={onBack} fullWidth disabled={isSending}>
          Назад
        </Button>
        <Button
          variant={hasDanger ? 'danger' : 'primary'}
          onClick={onConfirm}
          loading={isSending}
          disabled={!checked}
          fullWidth
        >
          Отправить
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Основной компонент
// ---------------------------------------------------------------------------

export function Send() {
  const navigate = useWalletStore((s) => s.navigate);
  const balance = useWalletStore(selectBalance);

  const { state, validate, confirm, reset } = useSendTransaction();

  // Снимок данных из confirming — нужен чтобы показывать UI пока step === 'sending'
  const sendingSnapshotRef = useRef<ConfirmData | null>(null);

  if (state.step === 'confirming') {
    sendingSnapshotRef.current = state.data;
  }

  const sendingSnapshot = sendingSnapshotRef.current;

  const handleBack = useCallback(() => {
    reset();
    navigate('dashboard');
  }, [reset, navigate]);

  const handleConfirmBack = useCallback(() => {
    reset();
  }, [reset]);

  // После успеха — возвращаем на Dashboard
  const handleSuccessClose = useCallback(() => {
    reset();
    navigate('dashboard');
  }, [reset, navigate]);

  const isSending = state.step === 'sending';

  return (
    <div className="min-h-screen p-6 max-w-md mx-auto flex flex-col">
      {/* Хедер */}
      <div className="flex items-center gap-3 mb-8">
        <button
          onClick={handleBack}
          className="text-white/50 hover:text-white transition-colors cursor-pointer disabled:opacity-30"
          disabled={isSending}
          aria-label="Назад"
        >
          ←
        </button>
        <h1 className="text-xl font-semibold">Отправить TON</h1>
      </div>

      {/* Форма */}
      {(state.step === 'idle' || state.step === 'validating') && (
        <SendForm
          balance={balance}
          onSubmit={validate}
          onBack={handleBack}
          isValidating={state.step === 'validating'}
        />
      )}

      {/* Подтверждение */}
      {state.step === 'confirming' && (
        <ConfirmScreen
          toAddress={state.data.toAddress}
          amountTon={state.data.amountTon}
          warnings={state.data.warnings}
          onConfirm={confirm}
          onBack={handleConfirmBack}
          isSending={false}
        />
      )}

      {state.step === 'sending' && sendingSnapshot && (
        <ConfirmScreen
          toAddress={sendingSnapshot.toAddress}
          amountTon={sendingSnapshot.amountTon}
          warnings={sendingSnapshot.warnings}
          onConfirm={confirm}
          onBack={handleConfirmBack}
          isSending={true}
        />
      )}

      {/* Модал успеха */}
      <Modal
        open={state.step === 'success'}
        onClose={handleSuccessClose}
        title="Транзакция отправлена"
      >
        <div className="space-y-4">
          <div className="text-center py-4">
            <div className="text-4xl mb-3">✓</div>
            <p className="text-white/70 text-sm">
              Транзакция принята сетью. Баланс обновится через несколько секунд.
            </p>
          </div>
          <Button fullWidth onClick={handleSuccessClose}>
            На главную
          </Button>
        </div>
      </Modal>

      {/* Модал ошибки */}
      <Modal
        open={state.step === 'error'}
        onClose={handleBack}
        title="Ошибка отправки"
      >
        <div className="space-y-4">
          <p className="text-white/70 text-sm">
            {state.step === 'error' ? state.message : ''}
          </p>
          <div className="flex gap-3">
            <Button variant="secondary" onClick={handleBack} fullWidth>
              Отмена
            </Button>
            <Button onClick={reset} fullWidth>
              Попробовать снова
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
