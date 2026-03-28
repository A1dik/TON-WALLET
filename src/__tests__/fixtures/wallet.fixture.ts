/**
 * Детерминированные данные кошелька для тестов.
 *
 * ВАЖНО: TON использует собственный алгоритм мнемоники (не BIP39).
 * Слова генерируются через mnemonicNew() и содержат встроенную контрольную сумму.
 * Мнемоника ниже — тестовая, не для mainnet.
 */

export const VALID_MNEMONIC_WORDS = [
  'exhibit', 'filter', 'hazard', 'suggest',
  'cross', 'cheap', 'salad', 'dolphin',
  'canoe', 'banner', 'sun', 'put',
  'coyote', 'produce', 'flush', 'banner',
  'soldier', 'vacant', 'fire', 'piece',
  'milk', 'magnet', 'point', 'orphan',
] as const;

/** Реальная (случайная) мнемоника — не для детерминированных тестов адреса */
export const INVALID_MNEMONIC_WORDS = [
  'word', 'word', 'word', 'word',
  'word', 'word', 'word', 'word',
  'word', 'word', 'word', 'word',
  'word', 'word', 'word', 'word',
  'word', 'word', 'word', 'word',
  'word', 'word', 'word', 'word',
] as const;

export const TEST_PASSWORD = 'TestPassword123!';
export const WRONG_PASSWORD = 'WrongPassword456!';

/**
 * Тестовые адреса — используются в компонентных тестах и фабриках.
 * Non-bounceable (UQ...) — для отображения и получения.
 * Bounceable (EQ...) — для смарт-контрактов и отправки.
 */
export const TEST_ADDRESS = 'UQD__________________________________________0vo';
export const TEST_BOUNCEABLE_ADDRESS = 'EQD__________________________________________0vo';
export const RECIPIENT_ADDRESS = 'EQBvW8Z5huBkMJYdnfAEM5JqTNkuWX3diqYENkWsIL0XggGG';
