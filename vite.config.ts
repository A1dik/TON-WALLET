import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import type { Plugin } from 'vite'

/**
 * Вставляет `import { Buffer } from 'buffer'; globalThis.Buffer = Buffer;`
 * в начало файла @ton/ton при его загрузке браузером (dev) и сборке (prod).
 *
 * Это единственный надёжный способ в Vite 8 (Rolldown):
 * - `@ton/ton` использует Buffer как глобал без импорта
 * - `optimizeDeps.esbuildOptions.inject` устарело в Vite 8
 * - `define` работает только для статических строк, не для объектов
 */
function injectBufferIntoTon(): Plugin {
  return {
    name: 'inject-buffer-into-ton',
    transform(code, id) {
      // Перехватываем все модули из @ton/* экосистемы
      if (!id.includes('@ton/')) return null
      if (!code.includes('Buffer')) return null

      return {
        code: `import { Buffer } from 'buffer';\nglobalThis.Buffer ??= Buffer;\n${code}`,
        map: null,
      }
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    injectBufferIntoTon(),
    react(),
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@services': resolve(__dirname, 'src/services'),
      '@store': resolve(__dirname, 'src/store'),
      '@components': resolve(__dirname, 'src/components'),
      '@hooks': resolve(__dirname, 'src/hooks'),
      '@utils': resolve(__dirname, 'src/utils'),
      '@types': resolve(__dirname, 'src/types'),
      buffer: 'buffer',
    },
  },
  optimizeDeps: {
    include: ['buffer', '@ton/ton', '@ton/crypto'],
  },
})
