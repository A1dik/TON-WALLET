/**
 * Input.tsx
 *
 * Единственный компонент поля ввода.
 * Поддерживает: label, hint, error, rightSlot (иконка/кнопка справа).
 */

import type { InputHTMLAttributes, ReactNode } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
  rightSlot?: ReactNode;
}

export function Input({
  label,
  hint,
  error,
  rightSlot,
  id,
  className = '',
  ...props
}: InputProps) {
  const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-');
  const hasError = Boolean(error);

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={inputId} className="text-sm text-white/70 font-medium">
          {label}
        </label>
      )}

      <div className="relative">
        <input
          id={inputId}
          aria-invalid={hasError}
          aria-describedby={
            hasError ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined
          }
          className={[
            'w-full bg-white/5 border rounded-xl px-4 py-2.5 text-white placeholder:text-white/30',
            'focus:outline-none focus:ring-2',
            'transition-colors duration-150',
            hasError
              ? 'border-danger/60 focus:ring-danger/40'
              : 'border-white/10 focus:ring-accent/40 focus:border-accent/60',
            rightSlot ? 'pr-12' : '',
            className,
          ]
            .filter(Boolean)
            .join(' ')}
          {...props}
        />
        {rightSlot && (
          <div className="absolute inset-y-0 right-0 flex items-center pr-3">
            {rightSlot}
          </div>
        )}
      </div>

      {hasError && (
        <p id={`${inputId}-error`} role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      {!hasError && hint && (
        <p id={`${inputId}-hint`} className="text-sm text-white/40">
          {hint}
        </p>
      )}
    </div>
  );
}
