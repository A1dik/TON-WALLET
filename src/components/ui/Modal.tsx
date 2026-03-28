/**
 * Modal.tsx
 *
 * Модальное окно на основе нативного <dialog>.
 * Нативный dialog: встроенный focus trap, Escape-закрытие, backdrop.
 * Используется для clipboard-подтверждения и критических действий.
 */

import { useEffect, useRef, type ReactNode } from 'react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

export function Modal({ open, onClose, title, children }: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  // Синхронизируем open prop с нативным dialog API
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  // Закрытие по Escape (нативный dialog уже делает это, но нам нужно обновить стейт)
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const handleCancel = (e: Event) => {
      e.preventDefault();
      onClose();
    };

    dialog.addEventListener('cancel', handleCancel);
    return () => dialog.removeEventListener('cancel', handleCancel);
  }, [onClose]);

  // Закрытие по клику на backdrop (area вне dialog)
  function handleBackdropClick(e: React.MouseEvent<HTMLDialogElement>) {
    const rect = dialogRef.current?.getBoundingClientRect();
    if (!rect) return;
    const { clientX, clientY } = e;
    const clickedOutside =
      clientX < rect.left ||
      clientX > rect.right ||
      clientY < rect.top ||
      clientY > rect.bottom;
    if (clickedOutside) onClose();
  }

  return (
    <dialog
      ref={dialogRef}
      onClick={handleBackdropClick}
      className={[
        'bg-gray-900 text-white rounded-2xl p-6 max-w-sm w-full shadow-2xl',
        'backdrop:bg-black/60 backdrop:backdrop-blur-sm',
        'open:animate-fade-in',
      ].join(' ')}
    >
      {/* Останавливаем propagation — клики внутри не закрывают модал */}
      <div onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold mb-4">{title}</h2>
        {children}
      </div>
    </dialog>
  );
}
