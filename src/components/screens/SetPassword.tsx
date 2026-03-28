/**
 * SetPassword.tsx
 *
 * Установка пароля — финальный шаг после Create / Import.
 * Шифрует мнемонику из pendingMnemonic и сохраняет через saveWallet.
 * После успеха зануляет pendingMnemonic и переходит на Dashboard.
 */

import { useCallback, useState } from 'react';
import { saveWallet } from '@/services/keystore';
import { importWallet } from '@/services/wallet';
import {
  selectPendingMnemonic,
  useWalletStore,
} from '@/store/wallet-store';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import {
  validatePassword,
  validatePasswordConfirm,
} from '@/utils/validation';

// ---------------------------------------------------------------------------
// Индикатор силы пароля
// ---------------------------------------------------------------------------

const STRENGTH_LABELS = ['', 'Слабый', 'Средний', 'Сильный'];
const STRENGTH_COLORS = ['', 'bg-danger', 'bg-warning', 'bg-green-500'];

function PasswordStrength({ score }: { score: 0 | 1 | 2 | 3 }) {
  if (score === 0) return null;
  return (
    <div className="flex items-center gap-2 mt-1">
      <div className="flex gap-1 flex-1">
        {[1, 2, 3].map((level) => (
          <div
            key={level}
            className={[
              'h-1 flex-1 rounded-full transition-colors duration-300',
              level <= score ? STRENGTH_COLORS[score] : 'bg-white/10',
            ].join(' ')}
          />
        ))}
      </div>
      <span className="text-xs text-white/40">{STRENGTH_LABELS[score]}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Компонент
// ---------------------------------------------------------------------------

export function SetPassword() {
  const navigate = useWalletStore((s) => s.navigate);
  const pendingMnemonic = useWalletStore(selectPendingMnemonic);
  const clearPendingMnemonic = useWalletStore((s) => s.clearPendingMnemonic);
  const unlock = useWalletStore((s) => s.unlock);

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const passwordValidation = validatePassword(password);
  const confirmValidation = confirm
    ? validatePasswordConfirm(password, confirm)
    : { valid: true };

  const canSubmit =
    passwordValidation.valid &&
    confirmValidation.valid &&
    confirm.length > 0 &&
    !saving;

  const handleSubmit = useCallback(async () => {
    if (!canSubmit || !pendingMnemonic) return;
    setError(null);
    setSaving(true);

    try {
      // Получаем адрес из мнемоники
      const walletResult = await importWallet(pendingMnemonic);
      if (!walletResult.ok) {
        setError(walletResult.error.message);
        return;
      }

      const { address, bounceableAddress } = walletResult.value.walletData;

      // Сохраняем зашифрованную мнемонику в localStorage
      const saveResult = await saveWallet(
        pendingMnemonic,
        address,
        bounceableAddress,
        password,
      );

      if (!saveResult.ok) {
        setError(saveResult.error.message);
        return;
      }

      // Зануляем мнемонику из памяти
      clearPendingMnemonic();

      // Сразу разблокируем — пользователю не нужно повторно вводить пароль
      const unlockResult = await unlock(password);
      if (!unlockResult.ok) {
        // Если разблокировка упала — перенаправляем на unlock
        navigate('unlock');
        return;
      }

      navigate('dashboard');
    } finally {
      setSaving(false);
    }
  }, [canSubmit, pendingMnemonic, password, clearPendingMnemonic, unlock, navigate]);

  // Защита: если нет мнемоники — отправляем назад
  if (!pendingMnemonic) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-6 p-6">
        <p className="text-white/50 text-center">Нет данных для сохранения.</p>
        <Button variant="secondary" onClick={() => navigate('onboarding')}>
          На главную
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6 max-w-md mx-auto flex flex-col justify-center">
      <div className="space-y-6">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold">Установите пароль</h2>
          <p className="text-white/50 text-sm">
            Пароль шифрует вашу секретную фразу. Минимум 8 символов.
          </p>
        </div>

        <div className="space-y-4">
          <div>
            <Input
              label="Пароль"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError(null);
              }}
              autoComplete="new-password"
              error={
                password && !passwordValidation.valid
                  ? passwordValidation.error
                  : undefined
              }
              rightSlot={
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="text-white/30 hover:text-white/70 transition-colors cursor-pointer"
                  aria-label={showPassword ? 'Скрыть пароль' : 'Показать пароль'}
                >
                  {showPassword ? '🙈' : '👁'}
                </button>
              }
            />
            {password && <PasswordStrength score={passwordValidation.score} />}
          </div>

          <Input
            label="Подтвердите пароль"
            type={showPassword ? 'text' : 'password'}
            value={confirm}
            onChange={(e) => {
              setConfirm(e.target.value);
              setError(null);
            }}
            autoComplete="new-password"
            error={
              confirm && !confirmValidation.valid
                ? confirmValidation.error
                : undefined
            }
          />
        </div>

        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}

        <Button
          fullWidth
          size="lg"
          onClick={handleSubmit}
          loading={saving}
          disabled={!canSubmit}
        >
          Создать кошелёк
        </Button>
      </div>
    </div>
  );
}
