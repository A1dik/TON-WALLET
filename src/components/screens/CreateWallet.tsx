/**
 * CreateWallet.tsx
 *
 * Этапы:
 *   show    — показываем 24 слова мнемоники в сетке 4×6
 *   confirm — проверка: пользователь кликает 3 правильных слова в правильном порядке
 *
 * После подтверждения — переход на SetPassword.
 * Мнемоника сохраняется в pendingMnemonic стора (зануляется в SetPassword).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { generateWallet } from '@/services/wallet';
import {
  selectPendingMnemonic,
  useWalletStore,
} from '@/store/wallet-store';
import { Button } from '@/components/ui/Button';

// ---------------------------------------------------------------------------
// Типы
// ---------------------------------------------------------------------------

type Step = 'show' | 'confirm';

interface ConfirmWord {
  word: string;
  index: number; // индекс в оригинальной мнемонике (0-based)
}

// ---------------------------------------------------------------------------
// Утилиты
// ---------------------------------------------------------------------------

/** Выбирает N случайных уникальных элементов из массива */
function sampleUnique<T>(arr: T[], count: number): T[] {
  const copy = [...arr];
  const result: T[] = [];
  for (let i = 0; i < count && copy.length > 0; i++) {
    const idx = Math.floor(Math.random() * copy.length);
    result.push(copy.splice(idx, 1)[0]);
  }
  return result;
}

/** Тасует массив (Fisher-Yates) */
function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// Количество слов для подтверждения и ложных вариантов
const CONFIRM_WORDS_COUNT = 3;
const DECOY_WORDS_COUNT = 3;

// ---------------------------------------------------------------------------
// Экран показа мнемоники
// ---------------------------------------------------------------------------

interface ShowMnemonicProps {
  words: string[];
  onContinue: () => void;
}

function ShowMnemonic({ words, onContinue }: ShowMnemonicProps) {
  const [revealed, setRevealed] = useState(false);

  return (
    <div className="flex flex-col gap-6">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold">Секретная фраза</h2>
        <p className="text-white/50 text-sm">
          Запишите эти 24 слова в правильном порядке и храните в надёжном месте.
          Никому не показывайте — это единственный способ восстановить кошелёк.
        </p>
      </div>

      {/* Предупреждение */}
      <div className="bg-warning/10 border border-warning/30 rounded-xl px-4 py-3 text-warning text-sm">
        ⚠ Если вы потеряете эти слова — вы потеряете доступ к кошельку навсегда.
      </div>

      {/* Сетка слов */}
      <div className="relative">
        <div
          className={[
            'grid grid-cols-3 gap-2 transition-all duration-300',
            !revealed ? 'blur-md select-none pointer-events-none' : '',
          ].join(' ')}
        >
          {words.map((word, i) => (
            <div
              key={i}
              className="flex items-center gap-2 bg-white/5 rounded-lg px-3 py-2"
            >
              <span className="text-white/30 text-xs w-5 text-right shrink-0">{i + 1}.</span>
              <span className="font-mono text-sm">{word}</span>
            </div>
          ))}
        </div>

        {!revealed && (
          <button
            onClick={() => setRevealed(true)}
            className="absolute inset-0 flex items-center justify-center bg-gray-950/50 rounded-xl cursor-pointer"
          >
            <span className="bg-white/10 border border-white/20 rounded-xl px-6 py-3 text-sm font-medium hover:bg-white/20 transition-colors">
              Показать секретную фразу
            </span>
          </button>
        )}
      </div>

      <Button
        fullWidth
        size="lg"
        disabled={!revealed}
        onClick={onContinue}
      >
        Я записал — продолжить
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Экран подтверждения мнемоники
// ---------------------------------------------------------------------------

interface ConfirmMnemonicProps {
  words: string[];
  onSuccess: () => void;
  onBack: () => void;
}

function ConfirmMnemonic({ words, onSuccess, onBack }: ConfirmMnemonicProps) {
  // Выбираем 3 слова которые нужно угадать (с их реальными индексами)
  const targetWords = useMemo<ConfirmWord[]>(() => {
    const indices = sampleUnique(
      Array.from({ length: words.length }, (_, i) => i),
      CONFIRM_WORDS_COUNT,
    ).sort((a, b) => a - b); // сортируем по порядку в мнемонике

    return indices.map((index) => ({ word: words[index], index }));
  }, [words]);

  // Перемешанные варианты (правильные + ложные)
  const options = useMemo<ConfirmWord[]>(() => {
    const decoys = sampleUnique(
      words
        .map((word, index) => ({ word, index }))
        .filter((w) => !targetWords.some((t) => t.index === w.index)),
      DECOY_WORDS_COUNT,
    );

    return shuffle([...targetWords, ...decoys]);
  }, [targetWords, words]);

  const [selected, setSelected] = useState<ConfirmWord[]>([]);
  const [error, setError] = useState<string | null>(null);

  const handleSelect = (option: ConfirmWord) => {
    setError(null);

    if (selected.some((s) => s.index === option.index)) {
      // Убираем уже выбранное
      setSelected((prev) => prev.filter((s) => s.index !== option.index));
      return;
    }

    if (selected.length >= CONFIRM_WORDS_COUNT) return;

    setSelected((prev) => [...prev, option]);
  };

  const handleVerify = () => {
    // Проверяем порядок: selected должен совпадать с targetWords по index
    const sortedSelected = [...selected].sort((a, b) => a.index - b.index);
    const correct = sortedSelected.every(
      (s, i) => s.index === targetWords[i].index,
    );

    if (correct && selected.length === CONFIRM_WORDS_COUNT) {
      onSuccess();
    } else {
      setError('Неверный выбор. Попробуйте снова.');
      setSelected([]);
    }
  };

  const isSelected = (option: ConfirmWord) =>
    selected.some((s) => s.index === option.index);

  return (
    <div className="flex flex-col gap-6">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold">Подтвердите фразу</h2>
        <p className="text-white/50 text-sm">
          Выберите слова{' '}
          {targetWords.map((w) => `#${w.index + 1}`).join(', ')}{' '}
          в правильном порядке.
        </p>
      </div>

      {/* Слоты выбранных слов */}
      <div className="flex gap-2">
        {Array.from({ length: CONFIRM_WORDS_COUNT }, (_, i) => (
          <div
            key={i}
            className="flex-1 h-10 flex items-center justify-center rounded-lg border border-white/20 bg-white/5 text-sm font-mono"
          >
            {selected[i] ? (
              <span className="text-accent">{selected[i].word}</span>
            ) : (
              <span className="text-white/20">{i + 1}</span>
            )}
          </div>
        ))}
      </div>

      {/* Варианты для выбора */}
      <div className="grid grid-cols-3 gap-2">
        {options.map((option) => (
          <button
            key={option.index}
            onClick={() => handleSelect(option)}
            className={[
              'py-2 px-3 rounded-lg text-sm font-mono border transition-colors cursor-pointer',
              isSelected(option)
                ? 'bg-accent/20 border-accent text-accent'
                : 'bg-white/5 border-white/20 text-white hover:bg-white/10',
            ].join(' ')}
          >
            {option.word}
          </button>
        ))}
      </div>

      {error && (
        <p role="alert" className="text-danger text-sm text-center">
          {error}
        </p>
      )}

      <div className="flex gap-3">
        <Button variant="secondary" onClick={onBack} fullWidth>
          Назад
        </Button>
        <Button
          onClick={handleVerify}
          disabled={selected.length < CONFIRM_WORDS_COUNT}
          fullWidth
        >
          Проверить
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Основной компонент
// ---------------------------------------------------------------------------

export function CreateWallet() {
  const navigate = useWalletStore((s) => s.navigate);
  const setPendingMnemonic = useWalletStore((s) => s.setPendingMnemonic);
  const pendingMnemonic = useWalletStore(selectPendingMnemonic);

  const [step, setStep] = useState<Step>('show');
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);

  // Генерируем мнемонику один раз при монтировании
  useEffect(() => {
    // Если уже есть pendingMnemonic (напр., вернулись с экрана confirm) — не перегенерируем
    if (pendingMnemonic !== null) return;

    setGenerating(true);
    generateWallet()
      .then((result) => {
        if (result.ok) {
          setPendingMnemonic(result.value.words);
        } else {
          setGenError(result.error.message);
        }
      })
      .finally(() => setGenerating(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // намеренно пустой dep array — генерируем один раз

  const handleConfirmSuccess = useCallback(() => {
    navigate('set-password');
  }, [navigate]);

  if (generating) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex flex-col items-center gap-4">
          <div className="size-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          <p className="text-white/50 text-sm">Генерация кошелька…</p>
        </div>
      </div>
    );
  }

  if (genError || !pendingMnemonic) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-6 p-6">
        <p className="text-danger text-center">{genError ?? 'Ошибка генерации'}</p>
        <Button variant="secondary" onClick={() => navigate('onboarding')}>
          Назад
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6 max-w-md mx-auto flex flex-col justify-center">
      {/* Кнопка назад */}
      <button
        onClick={() => navigate('onboarding')}
        className="self-start text-white/50 hover:text-white mb-6 text-sm transition-colors cursor-pointer"
      >
        ← Назад
      </button>

      {step === 'show' ? (
        <ShowMnemonic
          words={pendingMnemonic}
          onContinue={() => setStep('confirm')}
        />
      ) : (
        <ConfirmMnemonic
          words={pendingMnemonic}
          onSuccess={handleConfirmSuccess}
          onBack={() => setStep('show')}
        />
      )}
    </div>
  );
}
