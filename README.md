# TON Testnet Wallet

Браузерный кошелёк для TON testnet. SPA на React + TypeScript, без бэкенда.

## Быстрый старт

```bash
npm install

# Настройка переменных окружения (опционально)
cp .env.example .env
# Вставить API-ключ TonCenter в .env (см. ниже)

npm run dev      # http://localhost:5173
npm run build    # production-сборка в dist/
npm test         # 190 тестов
```

### Переменные окружения

| Переменная | Описание | Обязательная |
|---|---|---|
| `VITE_TONCENTER_API_KEY` | API-ключ TonCenter (testnet) | Нет |

Без ключа кошелёк работает, но TonCenter может возвращать 429 (Too Many Requests) при частых запросах.

Получить бесплатный ключ: [@tonapibot](https://t.me/tonapibot) в Telegram → выбрать Network: **testnet**.

### Тестовые TON

Для получения тестовых токенов: [@testgiver_ton_bot](https://t.me/testgiver_ton_bot) в Telegram — отправь адрес кошелька.

---

## Архитектура

```
┌─────────────────────────────────────┐
│           UI (React)                │
│  screens/         ui/               │
│  Onboarding       Button            │
│  CreateWallet     Input             │
│  ImportWallet     Modal             │
│  SetPassword      AddressDisplay    │
│  Dashboard        WarningBanner     │
│  Send             ErrorBoundary     │
│  Receive                            │
│  Unlock                             │
└──────────────┬──────────────────────┘
               │ read/dispatch
┌──────────────▼──────────────────────┐
│         Store (Zustand)             │
│  wallet-store.ts                    │
│  status: no-wallet | locked |       │
│          unlocked                   │
│  screen: state-machine router       │
│  sessionKeys: только в памяти       │
└──────────────┬──────────────────────┘
               │ вызовы
┌──────────────▼──────────────────────┐
│         Services (чистая логика)    │
│  encryption.ts   — AES-256-GCM      │
│  keystore.ts     — localStorage     │
│  wallet.ts       — мнемоника/ключи  │
│  ton-api.ts      — TON Center API   │
│  address-guard.ts— 5 слоёв защиты  │
└─────────────────────────────────────┘
```

**Принцип:** компоненты не знают о криптографии и сети. Всё через сервисы и стор.

**Роутер:** state-machine на `screen` в Zustand-сторе — без React Router.

---

## Структура проекта

```
src/
  services/
    encryption.ts       — AES-256-GCM + PBKDF2 (Web Crypto API)
    keystore.ts         — localStorage + rate limiting попыток
    wallet.ts           — генерация/импорт мнемоники, ключи, адрес
    ton-api.ts          — баланс, транзакции, отправка (TON Center testnet)
    address-guard.ts    — многослойная защита от адрес-подмены
  store/
    wallet-store.ts     — Zustand: состояние кошелька, блокировка, сессия
  components/
    screens/            — экраны приложения (Onboarding → Dashboard → ...)
    ui/                 — переиспользуемые компоненты (Button, Input, Modal, ...)
  hooks/
    useBalance.ts       — polling баланса (15 сек)
    useTransactions.ts  — polling транзакций
    useSendTransaction.ts — FSM отправки: idle→validating→confirming→sending→done
    useActivityTracker.ts — авто-блокировка при неактивности (5 мин)
  utils/
    validation.ts       — валидация TON-адреса, суммы, пароля
    formatters.ts       — форматирование TON, адреса, дат
    retry.ts            — withRetry (exponential backoff + full jitter)
    circuit-breaker.ts  — CircuitBreaker (closed/open/half-open)
  types/
    index.ts            — Result<T,E>, domain types
  __tests__/
    fixtures/           — готовые мнемоники, транзакции, API-ответы
    factories/          — фабрики с дефолтами + overrides
    services/           — unit тесты сервисов
    components/         — component тесты (Dashboard, Send)
```

---

## Безопасность

| Угроза | Защита |
|---|---|
| Кража мнемоники из хранилища | AES-256-GCM + PBKDF2 100k итераций |
| Брутфорс пароля | Rate limiting: 5 попыток → нарастающий таймаут |
| Забытый разлогин | Авто-блокировка через 5 минут неактивности |
| Clipboard hijacking (подмена адреса) | Модальное подтверждение при paste |
| Визуальный spoofing адреса | Подсветка первых/последних 4 символов |
| Отправка на неизвестный адрес | Whitelist + жёлтое предупреждение |
| Отправка на неактивный адрес | Мягкое предупреждение через API |
| Случайная отправка крупной суммы | Предупреждение при > 50% баланса |
| Поспешная отправка | Чекбокс «Я проверил адрес» |
| Мнемоника в памяти | Зануление secretKey.fill(0) после подписания |

### Защита от адрес-подмены — 5 слоёв

`address-guard.ts` выполняет проверки последовательно, все warnings копятся в массив:

1. **Валидация формата** — `Address.parse()` из `@ton/ton`. Если невалидный — дальше не идём.
2. **Whitelist** — нормализуем оба адреса через `Address.parse().equals()` → нечувствительно к формату (bounceable / non-bounceable).
3. **Clipboard-детектор** — UI-слой передаёт флаг `pastedFromClipboard` → модальное подтверждение с крупным адресом.
4. **Активность адреса** — запрос к API. Мягкое предупреждение (не блокирует), если API недоступен — отдельный warning `ADDRESS_CHECK_FAILED`.
5. **Порог суммы** — `amount > 50% balance` → warning типа `danger`.

Функция никогда не бросает исключений — все ошибки внутри `warnings[]`.

### Шифрование мнемоники

```
password → PBKDF2(100k итераций, SHA-256, соль 128 бит) → AES-256-GCM ключ
                                                               ↓
                                               encrypt(мнемоника) → EncryptedBlob
                                                               ↓
                                                         localStorage
```

- Весь крипто через нативный `window.crypto.subtle` — нет npm-зависимостей для шифрования.
- При дешифровке неверный пароль → `DOMException('OperationError')` → маппим в `INVALID_PASSWORD`.

### Устойчивость к сбоям сети

```
callApi(fn)
  → CircuitBreaker.execute()       3 ошибки подряд → open на 30с
      → withRetry(fn, 3 попытки)   exponential backoff + full jitter
          → fn()                   реальный запрос к TON Center
```

- Все публичные функции `ton-api.ts` возвращают `Result<T, ApiError>` — никаких исключений наружу.
- CB видит итоговый результат после всех retry: retry = тактические попытки, CB = стратегическое решение «сервис живой?».

---

## Ключевые компромиссы

### JS-строки и мнемоника

JS-строки иммутабельны, GC не гарантирует очистку из памяти. Мы зануляем `secretKey` (`Uint8Array.fill(0)`) сразу после подписания транзакции — но строка мнемоники, переданная из сервиса в UI, остаётся в памяти до GC. Это ограничение браузерной среды, не специфичное для этого кошелька.

### TON-мнемоника ≠ BIP39

TON использует собственный алгоритм валидации мнемоники (через `@ton/crypto`). Стандартные BIP39 слова могут не пройти `mnemonicValidate()`. В тестах используются реальные TON-мнемоники, сгенерированные `mnemonicNew()`.

### Testnet-адреса

Адреса формируются с флагом `testOnly: true`. Не переводите testnet-активы на mainnet-адреса.

### sessionStorage vs localStorage для rate limiting

Счётчик попыток пароля хранится в `localStorage`, не в `sessionStorage` — иначе перезагрузкой страницы можно обойти ограничение.

---

## Что не реализовано (YAGNI)

- **Multi-wallet** — не в ТЗ
- **Jettons / NFT** — не в ТЗ
- **Telegram Mini App SDK** — это браузерный SPA
- **i18n** — достаточно одного языка (русский)
- **Оффлайн-режим** — излишне для testnet-демо
- **Биометрия** — нет подходящего браузерного API
- **Backend** — явно запрещён в ТЗ

---

## Что добавить для production

1. **Key derivation:** обновить PBKDF2 → Argon2id (недоступен в Web Crypto, нужен WASM-полифилл) или увеличить итерации до 600k+.
2. **Аудит зависимостей:** `@ton/ton`, `@ton/crypto` — критичные пакеты, требуют регулярного `npm audit`.
3. **Secure memory:** рассмотреть `WebAssembly.Memory` с явной очисткой для хранения ключей.
4. **CSP + subresource integrity:** для production-деплоя.
5. **Hardware wallet support:** Ledger через `@ledgerhq/hw-transport-webhid`.
6. **E2E тесты:** Playwright для критичных flow (create → send → receive).
7. **Мониторинг ошибок:** Sentry с включённым scrubbing чувствительных данных.
8. **Rate limiting на уровне CB:** более агрессивные параметры для mainnet.
