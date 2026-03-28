/**
 * Dashboard.tsx
 *
 * Главный экран разблокированного кошелька.
 * - Адрес с кнопкой копирования
 * - Баланс с polling 15 сек + ручное обновление
 * - Список транзакций с поиском (локальная фильтрация)
 * - Кнопки Send / Receive
 */

import { useMemo, useState } from 'react';
import { useBalance } from '@/hooks/useBalance';
import { useTransactions } from '@/hooks/useTransactions';
import {
  selectAddress,
  selectBalance,
  selectTransactions,
  useWalletStore,
} from '@/store/wallet-store';
import type { Transaction } from '@/types';
import { AddressDisplay } from '@/components/ui/AddressDisplay';
import { Button } from '@/components/ui/Button';
import {
  formatRelativeTime,
  formatTransactionAmount,
  formatTon,
  truncateAddress,
} from '@/utils/formatters';

// ---------------------------------------------------------------------------
// Список транзакций
// ---------------------------------------------------------------------------

function TransactionItem({ tx }: { tx: Transaction }) {
  const isIn = tx.direction === 'in';
  const isOut = tx.direction === 'out';

  return (
    <div className="flex items-center gap-3 py-3 border-b border-white/5 last:border-0">
      {/* Иконка направления */}
      <div
        className={[
          'size-9 rounded-full flex items-center justify-center text-sm shrink-0',
          isIn
            ? 'bg-green-500/15 text-green-400'
            : isOut
              ? 'bg-accent/15 text-accent'
              : 'bg-white/10 text-white/30',
        ].join(' ')}
        aria-hidden="true"
      >
        {isIn ? '↓' : isOut ? '↑' : '✕'}
      </div>

      {/* Адрес + время */}
      <div className="flex-1 min-w-0">
        <p className="text-sm text-white/70 truncate font-mono">
          {tx.address ? truncateAddress(tx.address) : '—'}
        </p>
        <p className="text-xs text-white/30 mt-0.5">
          {formatRelativeTime(tx.timestamp)}
        </p>
      </div>

      {/* Сумма */}
      <p
        className={[
          'text-sm font-medium shrink-0',
          isIn ? 'text-green-400' : isOut ? 'text-white' : 'text-white/30',
        ].join(' ')}
      >
        {formatTransactionAmount(tx.amount, tx.direction)}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export function Dashboard() {
  const navigate = useWalletStore((s) => s.navigate);
  const lock = useWalletStore((s) => s.lock);
  const address = useWalletStore(selectAddress);
  const balance = useWalletStore(selectBalance);
  const transactions = useWalletStore(selectTransactions);

  const { loading: balanceLoading, refetch: refetchBalance } = useBalance();
  const { loading: txLoading } = useTransactions();

  const [searchQuery, setSearchQuery] = useState('');
  const [addressCopied, setAddressCopied] = useState(false);

  const handleCopyAddress = async () => {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setAddressCopied(true);
      setTimeout(() => setAddressCopied(false), 2000);
    } catch {
      // Clipboard API недоступен
    }
  };

  // Локальная фильтрация транзакций по адресу и сумме
  const filteredTransactions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return transactions;

    return transactions.filter(
      (tx) =>
        tx.address.toLowerCase().includes(q) ||
        tx.amount.includes(q),
    );
  }, [transactions, searchQuery]);

  const isLoading = balanceLoading || txLoading;

  return (
    <div className="min-h-screen flex flex-col max-w-md mx-auto">
      {/* Хедер */}
      <div className="p-6 pb-4">
        <div className="flex items-start justify-between gap-2 mb-6">
          <div className="min-w-0">
            <p className="text-xs text-white/40 mb-1">Ваш адрес</p>
            <button
              onClick={handleCopyAddress}
              className="text-left hover:opacity-70 transition-opacity cursor-pointer"
              title="Скопировать адрес"
            >
              {address ? (
                <AddressDisplay address={address} compact />
              ) : (
                <span className="text-white/30 text-sm font-mono">—</span>
              )}
            </button>
            {addressCopied && (
              <p className="text-xs text-accent mt-1">Скопировано!</p>
            )}
          </div>
          <button
            onClick={lock}
            className="text-white/30 hover:text-white/70 text-sm transition-colors shrink-0 cursor-pointer mt-1"
            title="Заблокировать кошелёк"
          >
            🔒
          </button>
        </div>

        {/* Баланс */}
        <div className="text-center mb-6">
          {balanceLoading ? (
            <div className="h-10 flex items-center justify-center">
              <div className="size-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="flex items-center justify-center gap-2">
              <p className="text-4xl font-bold">
                {balance ? formatTon(balance) : '— TON'}
              </p>
              <button
                onClick={refetchBalance}
                className="text-white/30 hover:text-white/70 transition-colors cursor-pointer ml-1"
                title="Обновить баланс"
                aria-label="Обновить баланс"
              >
                ↻
              </button>
            </div>
          )}
          <p className="text-white/30 text-xs mt-1">Тестовая сеть TON</p>
        </div>

        {/* Кнопки действий */}
        <div className="grid grid-cols-2 gap-3">
          <Button size="lg" fullWidth onClick={() => navigate('send')}>
            ↑ Отправить
          </Button>
          <Button size="lg" variant="secondary" fullWidth onClick={() => navigate('receive')}>
            ↓ Получить
          </Button>
        </div>
      </div>

      {/* Транзакции */}
      <div className="flex-1 px-6 pb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium text-white/70">Транзакции</h2>
          {isLoading && (
            <div className="size-3 border border-white/30 border-t-transparent rounded-full animate-spin" />
          )}
        </div>

        {/* Поиск */}
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Поиск по адресу или сумме"
          className={[
            'w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2 mb-3',
            'text-sm text-white placeholder:text-white/30',
            'focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent/60',
            'transition-colors',
          ].join(' ')}
        />

        {/* Список */}
        {txLoading && transactions.length === 0 ? (
          <div className="flex flex-col gap-2">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-14 bg-white/5 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : filteredTransactions.length === 0 ? (
          <p className="text-white/30 text-sm text-center py-8">
            {searchQuery ? 'Ничего не найдено' : 'Транзакций пока нет'}
          </p>
        ) : (
          <div>
            {filteredTransactions.map((tx) => (
              <TransactionItem key={tx.id} tx={tx} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
