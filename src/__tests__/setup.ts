import '@testing-library/jest-dom';

// jsdom не реализует нативный <dialog> API — полифилл для тестов компонентов.
// showModal/close — минимальная эмуляция через атрибут open.
// Полифилл применяется безусловно: в Node-среде HTMLDialogElement отсутствует
// (тесты сервисов не используют компоненты), в jsdom — определён, но без showModal.
Object.assign(globalThis.HTMLDialogElement?.prototype ?? {}, {
  showModal() {
    (this as HTMLDialogElement).setAttribute('open', '');
  },
  close() {
    (this as HTMLDialogElement).removeAttribute('open');
  },
});
