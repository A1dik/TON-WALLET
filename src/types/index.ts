// ---------------------------------------------------------------------------
// Result type — явный контракт вместо исключений
// ---------------------------------------------------------------------------

export type Ok<T> = { ok: true; value: T };
export type Err<E> = { ok: false; error: E };
export type Result<T, E> = Ok<T> | Err<E>;

export const ok = <T>(value: T): Ok<T> => ({ ok: true, value });
export const err = <E>(error: E): Err<E> => ({ ok: false, error });

// ---------------------------------------------------------------------------
// Crypto errors
// ---------------------------------------------------------------------------

export type CryptoErrorCode =
  | 'KEY_DERIVATION_FAILED'
  | 'ENCRYPTION_FAILED'
  | 'DECRYPTION_FAILED'
  | 'INVALID_PASSWORD';

export interface CryptoError {
  code: CryptoErrorCode;
  message: string;
}

// ---------------------------------------------------------------------------
// Keystore errors
// ---------------------------------------------------------------------------

export type KeystoreErrorCode =
  | 'NOT_FOUND'
  | 'CORRUPTED'
  | 'RATE_LIMITED'
  | 'INVALID_PASSWORD';

export interface KeystoreError {
  code: KeystoreErrorCode;
  message: string;
  /** Секунды до следующей попытки (только для RATE_LIMITED) */
  retryAfterSeconds?: number;
}

// ---------------------------------------------------------------------------
// Wallet errors
// ---------------------------------------------------------------------------

export type WalletErrorCode =
  | 'INVALID_MNEMONIC'
  | 'MNEMONIC_GENERATION_FAILED'
  | 'KEY_DERIVATION_FAILED';

export interface WalletError {
  code: WalletErrorCode;
  message: string;
}

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

export interface EncryptedBlob {
  /** Base64-encoded ciphertext + auth tag */
  ciphertext: string;
  /** Base64-encoded IV (96 bit) */
  iv: string;
  /** Base64-encoded salt для PBKDF2 */
  salt: string;
}

export interface WalletKeys {
  /** Публичный ключ — Uint8Array 32 байта */
  publicKey: Uint8Array;
  /** Приватный ключ — Uint8Array 64 байта; зануляется после использования */
  secretKey: Uint8Array;
}

export interface WalletData {
  /** Адрес в non-bounceable формате (для получения) */
  address: string;
  /** Адрес в bounceable формате (для смарт-контрактов) */
  bounceableAddress: string;
}

export interface StoredWallet {
  encryptedMnemonic: EncryptedBlob;
  address: string;
  bounceableAddress: string;
}

export interface Transaction {
  id: string;
  /** Unix timestamp в секундах */
  timestamp: number;
  /** 'in' | 'out' | 'failed' */
  direction: 'in' | 'out' | 'failed';
  /** Адрес контрагента */
  address: string;
  /** Сумма в нано-TON (строка, чтобы не терять точность) */
  amount: string;
  /** Комиссия в нано-TON */
  fee?: string;
  /** Комментарий к транзакции */
  comment?: string;
}

// ---------------------------------------------------------------------------
// TON API types
// ---------------------------------------------------------------------------

export type ApiErrorCode =
  | 'NETWORK_ERROR'
  | 'INVALID_ADDRESS'
  | 'INSUFFICIENT_BALANCE'
  | 'RATE_LIMITED'
  | 'CIRCUIT_OPEN'
  | 'UNKNOWN';

export interface ApiError {
  code: ApiErrorCode;
  message: string;
  /** Мс до следующей попытки (только для CIRCUIT_OPEN) */
  retryAfterMs?: number;
}

export interface AddressInfo {
  /** Адрес активен (хотя бы одна транзакция прошла) */
  isActive: boolean;
  /** Баланс в нано-TON */
  balance: string;
}

// ---------------------------------------------------------------------------
// Address Guard types
// ---------------------------------------------------------------------------

/** Уровень серьёзности предупреждения */
export type WarningSeverity = 'warning' | 'danger';

/** Коды предупреждений — строго типизированный enum-like */
export type WarningCode =
  | 'CLIPBOARD_PASTE'       // адрес вставлен из буфера обмена
  | 'UNKNOWN_ADDRESS'       // адреса нет в адресной книге
  | 'INACTIVE_ADDRESS'      // адрес никогда не использовался
  | 'HIGH_AMOUNT'           // сумма > 50% баланса
  | 'ADDRESS_CHECK_FAILED'; // не удалось проверить активность (API недоступен)

export interface AddressWarning {
  code: WarningCode;
  severity: WarningSeverity;
  message: string;
}

export interface AddressCheckInput {
  /** Адрес получателя */
  address: string;
  /** Сумма перевода в нано-TON */
  amountNano: string;
  /** Текущий баланс кошелька в нано-TON */
  balanceNano: string;
  /** Был ли адрес вставлен из буфера обмена */
  pastedFromClipboard: boolean;
  /** Адресная книга (сохранённые контакты) */
  knownAddresses: readonly string[];
}

export interface AddressCheckResult {
  /** Все предупреждения, найденные при проверке */
  warnings: AddressWarning[];
  /** Адрес найден в адресной книге */
  isKnown: boolean;
  /** Адрес прошёл базовую валидацию формата */
  isValidFormat: boolean;
}

/** Зависимости сервиса — инжектируются для тестируемости */
export interface AddressGuardDeps {
  getAddressInfo: (address: string) => Promise<Result<AddressInfo, ApiError>>;
}

// ---------------------------------------------------------------------------
// Wallet Store types
// ---------------------------------------------------------------------------

/** Статус кошелька в приложении */
export type WalletStatus = 'no-wallet' | 'locked' | 'unlocked';

/**
 * Экраны приложения — state-machine роутер.
 * Переходы управляются через navigate() в сторе.
 */
export type Screen =
  | 'onboarding'
  | 'create-wallet'
  | 'import-wallet'
  | 'set-password'
  | 'dashboard'
  | 'send'
  | 'receive'
  | 'unlock';

/**
 * Сессионные ключи — живут только в памяти, не персистируются.
 * secretKey зануляется при lock().
 */
export interface SessionKeys {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
}

export interface WalletState {
  status: WalletStatus;
  /** Текущий экран приложения */
  screen: Screen;
  /** Адрес в non-bounceable формате (для отображения и получения) */
  address: string | null;
  /** Адрес в bounceable формате (для смарт-контрактов) */
  bounceableAddress: string | null;
  /** Баланс в нано-TON */
  balance: string | null;
  /** Транзакции — дедуплицированы по id */
  transactions: Transaction[];
  /** Ключи сессии (только при status === 'unlocked') */
  sessionKeys: SessionKeys | null;
  /**
   * Мнемоника в памяти — только между CreateWallet/ImportWallet → SetPassword.
   * Зануляется сразу после сохранения в keystore.
   */
  pendingMnemonic: string[] | null;
}

export interface WalletActions {
  /**
   * Инициализирует стор на основе localStorage.
   * Вызывается один раз при старте приложения.
   */
  init: () => void;
  /**
   * Разблокирует кошелёк: дешифрует мнемонику, деривирует ключи,
   * сохраняет sessionKeys в памяти, мнемонику зануляет.
   */
  unlock: (password: string) => Promise<Result<void, KeystoreError>>;
  /** Зануляет sessionKeys, переводит в locked */
  lock: () => void;
  setBalance: (balance: string) => void;
  /** Мёрджит новые транзакции с существующими без дублей */
  mergeTransactions: (incoming: Transaction[]) => void;
  /** Переходит на указанный экран */
  navigate: (screen: Screen) => void;
  /**
   * Сохраняет мнемонику в памяти для передачи на SetPassword.
   * Должна быть занулена после saveWallet().
   */
  setPendingMnemonic: (words: string[]) => void;
  /** Зануляет и удаляет pendingMnemonic из состояния */
  clearPendingMnemonic: () => void;
}
