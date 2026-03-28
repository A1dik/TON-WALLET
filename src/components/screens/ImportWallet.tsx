/**
 * ImportWallet.tsx
 *
 * Ввод 24 слов мнемоники.
 * Поддерживает: одно textarea (paste со split) или 24 отдельных поля.
 * Валидация через validateMnemonic из wallet.ts.
 */

import { useCallback, useState } from 'react';
import { validateMnemonic } from '@/services/wallet';
import { useWalletStore } from '@/store/wallet-store';
import { Button } from '@/components/ui/Button';

const WORDS_COUNT = 24;

// ---------------------------------------------------------------------------
// Режим ввода — textarea
// ---------------------------------------------------------------------------

interface PasteInputProps {
  onWords: (words: string[]) => void;
  onBack: () => void;
}

function PasteInput({ onWords, onBack }: PasteInputProps) {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [validating, setValidating] = useState(false);

  const handleSubmit = async () => {
    const words = value
      .trim()
      .split(/[\s,]+/)
      .map((w) => w.trim().toLowerCase())
      .filter(Boolean);

    if (words.length !== WORDS_COUNT) {
      setError(`Необходимо ${WORDS_COUNT} слов, введено: ${words.length}`);
      return;
    }

    setValidating(true);
    const isValid = await validateMnemonic(words);
    setValidating(false);

    if (!isValid) {
      setError('Неверная секретная фраза. Проверьте слова и порядок.');
      return;
    }

    onWords(words);
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-white/50 text-sm">
        Введите 24 слова через пробел или запятую.
      </p>
      <textarea
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setError(null);
        }}
        placeholder="слово1 слово2 слово3 …"
        rows={5}
        className={[
          'w-full bg-white/5 border rounded-xl px-4 py-3 text-white placeholder:text-white/30',
          'font-mono text-sm resize-none',
          'focus:outline-none focus:ring-2',
          'transition-colors duration-150',
          error
            ? 'border-danger/60 focus:ring-danger/40'
            : 'border-white/10 focus:ring-accent/40 focus:border-accent/60',
        ].join(' ')}
      />
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <div className="flex gap-3">
        <Button variant="secondary" onClick={onBack} fullWidth>
          Назад
        </Button>
        <Button
          onClick={handleSubmit}
          loading={validating}
          disabled={value.trim().length === 0}
          fullWidth
        >
          Проверить
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Режим ввода — 24 отдельных поля
// ---------------------------------------------------------------------------

interface FieldsInputProps {
  onWords: (words: string[]) => void;
  onBack: () => void;
}

function FieldsInput({ onWords, onBack }: FieldsInputProps) {
  const [fields, setFields] = useState<string[]>(Array(WORDS_COUNT).fill(''));
  const [error, setError] = useState<string | null>(null);
  const [validating, setValidating] = useState(false);

  const updateField = useCallback((index: number, value: string) => {
    setError(null);
    setFields((prev) => {
      const next = [...prev];
      next[index] = value.trim().toLowerCase();
      return next;
    });
  }, []);

  // Обработка paste в любое поле — если вставили 24+ слов, разбрасываем по полям
  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLInputElement>, startIndex: number) => {
      const text = e.clipboardData.getData('text');
      const words = text
        .trim()
        .split(/[\s,]+/)
        .map((w) => w.trim().toLowerCase())
        .filter(Boolean);

      if (words.length > 1) {
        e.preventDefault();
        setFields((prev) => {
          const next = [...prev];
          words.slice(0, WORDS_COUNT - startIndex).forEach((w, i) => {
            next[startIndex + i] = w;
          });
          return next;
        });
      }
    },
    [],
  );

  const handleSubmit = async () => {
    const words = fields.map((w) => w.trim().toLowerCase());
    const empty = words.filter((w) => !w).length;
    if (empty > 0) {
      setError(`Заполните все ${WORDS_COUNT} слов (пустых: ${empty})`);
      return;
    }

    setValidating(true);
    const isValid = await validateMnemonic(words);
    setValidating(false);

    if (!isValid) {
      setError('Неверная секретная фраза. Проверьте слова и порядок.');
      return;
    }

    onWords(words);
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-white/50 text-sm">
        Введите слова по одному или вставьте всю фразу в первое поле.
      </p>
      <div className="grid grid-cols-3 gap-2">
        {fields.map((value, i) => (
          <div key={i} className="relative">
            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-white/30 text-xs">
              {i + 1}.
            </span>
            <input
              type="text"
              value={value}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              onChange={(e) => updateField(i, e.target.value)}
              onPaste={(e) => handlePaste(e, i)}
              className={[
                'w-full bg-white/5 border rounded-lg pl-7 pr-2 py-1.5',
                'text-sm font-mono text-white placeholder:text-white/20',
                'focus:outline-none focus:ring-1 focus:ring-accent/40 focus:border-accent/60',
                'border-white/10 transition-colors',
              ].join(' ')}
            />
          </div>
        ))}
      </div>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <div className="flex gap-3">
        <Button variant="secondary" onClick={onBack} fullWidth>
          Назад
        </Button>
        <Button
          onClick={handleSubmit}
          loading={validating}
          fullWidth
        >
          Импортировать
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Основной компонент
// ---------------------------------------------------------------------------

export function ImportWallet() {
  const navigate = useWalletStore((s) => s.navigate);
  const setPendingMnemonic = useWalletStore((s) => s.setPendingMnemonic);

  const [inputMode, setInputMode] = useState<'paste' | 'fields'>('paste');

  const handleWords = useCallback(
    (words: string[]) => {
      setPendingMnemonic(words);
      navigate('set-password');
    },
    [setPendingMnemonic, navigate],
  );

  return (
    <div className="min-h-screen p-6 max-w-md mx-auto flex flex-col justify-center">
      <button
        onClick={() => navigate('onboarding')}
        className="self-start text-white/50 hover:text-white mb-6 text-sm transition-colors cursor-pointer"
      >
        ← Назад
      </button>

      <div className="space-y-6">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold">Импорт кошелька</h2>
          <p className="text-white/50 text-sm">
            Введите вашу секретную фразу из 24 слов.
          </p>
        </div>

        {/* Переключатель режима */}
        <div className="flex gap-1 p-1 bg-white/5 rounded-xl">
          <button
            onClick={() => setInputMode('paste')}
            className={[
              'flex-1 py-1.5 rounded-lg text-sm transition-colors cursor-pointer',
              inputMode === 'paste'
                ? 'bg-white/10 text-white'
                : 'text-white/40 hover:text-white/70',
            ].join(' ')}
          >
            Вставить текст
          </button>
          <button
            onClick={() => setInputMode('fields')}
            className={[
              'flex-1 py-1.5 rounded-lg text-sm transition-colors cursor-pointer',
              inputMode === 'fields'
                ? 'bg-white/10 text-white'
                : 'text-white/40 hover:text-white/70',
            ].join(' ')}
          >
            По полям
          </button>
        </div>

        {inputMode === 'paste' ? (
          <PasteInput onWords={handleWords} onBack={() => navigate('onboarding')} />
        ) : (
          <FieldsInput onWords={handleWords} onBack={() => navigate('onboarding')} />
        )}
      </div>
    </div>
  );
}
