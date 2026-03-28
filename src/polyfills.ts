/**
 * polyfills.ts
 *
 * Node.js-полифиллы для @ton/ton в браузере.
 * Этот файл инжектируется Vite как первый модуль (inject в vite.config.ts),
 * что гарантирует выполнение ДО парсинга любых других модулей.
 */

import { Buffer } from 'buffer';

// @ton/ton обращается к globalThis.Buffer на уровне инициализации модуля
(globalThis as unknown as Record<string, unknown>).Buffer = Buffer;
