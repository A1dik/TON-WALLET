/**
 * encryption.ts
 *
 * AES-256-GCM шифрование / дешифрование через нативный Web Crypto API.
 * PBKDF2 деривация ключа: 100 000 итераций, SHA-256, соль 128 бит.
 *
 * Зависимости: только browser Web Crypto — никаких npm-пакетов.
 */

import { type CryptoError, type EncryptedBlob, type Result, err, ok } from '@/types';

// ---------------------------------------------------------------------------
// Константы — все в одном месте, легко менять при ротации параметров
// ---------------------------------------------------------------------------

const PBKDF2_ITERATIONS = 100_000;
const PBKDF2_HASH = 'SHA-256';
const AES_KEY_LENGTH = 256; // бит
const SALT_BYTES = 16; // 128 бит
const IV_BYTES = 12; // 96 бит — рекомендация NIST для GCM

// ---------------------------------------------------------------------------
// Вспомогательные функции
// ---------------------------------------------------------------------------

function toBase64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  return btoa(String.fromCharCode(...bytes));
}

function fromBase64(b64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(b64);
  const buf = new ArrayBuffer(binary.length);
  const view = new Uint8Array(buf);
  for (let i = 0; i < binary.length; i++) {
    view[i] = binary.charCodeAt(i);
  }
  return view;
}

function randomBytes(length: number): Uint8Array<ArrayBuffer> {
  const buf = new Uint8Array(new ArrayBuffer(length));
  crypto.getRandomValues(buf);
  return buf;
}

async function deriveKey(
  password: string,
  salt: Uint8Array<ArrayBuffer>,
  usage: KeyUsage[],
): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  );

  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: PBKDF2_HASH },
    keyMaterial,
    { name: 'AES-GCM', length: AES_KEY_LENGTH },
    false,
    usage,
  );
}

// ---------------------------------------------------------------------------
// Публичный API
// ---------------------------------------------------------------------------

/**
 * Шифрует plaintext паролем.
 * Каждый вызов генерирует новую соль и IV — безопасно при повторном использовании пароля.
 */
export async function encrypt(
  plaintext: string,
  password: string,
): Promise<Result<EncryptedBlob, CryptoError>> {
  try {
    const salt = randomBytes(SALT_BYTES);
    const iv = randomBytes(IV_BYTES);
    const key = await deriveKey(password, salt, ['encrypt']);

    const enc = new TextEncoder();
    const ciphertextBuf = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      enc.encode(plaintext),
    );

    return ok({
      ciphertext: toBase64(ciphertextBuf),
      iv: toBase64(iv),
      salt: toBase64(salt),
    });
  } catch {
    return err({ code: 'ENCRYPTION_FAILED', message: 'Шифрование не удалось' });
  }
}

/**
 * Дешифрует blob паролем.
 * Возвращает INVALID_PASSWORD при неверном пароле (AES-GCM проверяет auth tag).
 */
export async function decrypt(
  blob: EncryptedBlob,
  password: string,
): Promise<Result<string, CryptoError>> {
  try {
    const salt = fromBase64(blob.salt);
    const iv = fromBase64(blob.iv);
    const ciphertext = fromBase64(blob.ciphertext);

    const key = await deriveKey(password, salt, ['decrypt']);

    const plaintextBuf = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      ciphertext,
    );

    return ok(new TextDecoder().decode(plaintextBuf));
  } catch (e) {
    // AES-GCM бросает DOMException при неверном пароле (auth tag mismatch)
    if (e instanceof DOMException && e.name === 'OperationError') {
      return err({ code: 'INVALID_PASSWORD', message: 'Неверный пароль' });
    }
    return err({ code: 'DECRYPTION_FAILED', message: 'Дешифрование не удалось' });
  }
}
