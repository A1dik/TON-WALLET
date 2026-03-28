/**
 * Receive.tsx
 *
 * Экран получения TON.
 * Показывает non-bounceable адрес (стандарт для получения), QR-код, кнопку копирования.
 */

import { useCallback, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { selectAddress, useWalletStore } from '@/store/wallet-store';
import { Button } from '@/components/ui/Button';
import { AddressDisplay } from '@/components/ui/AddressDisplay';

export function Receive() {
  const navigate = useWalletStore((s) => s.navigate);
  const address = useWalletStore(selectAddress);

  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API недоступен — fallback не делаем, это браузерное ограничение
    }
  }, [address]);

  if (!address) return null;

  return (
    <div className="min-h-screen p-6 max-w-md mx-auto flex flex-col">
      {/* Хедер */}
      <div className="flex items-center gap-3 mb-8">
        <button
          onClick={() => navigate('dashboard')}
          className="text-white/50 hover:text-white transition-colors cursor-pointer"
          aria-label="Назад"
        >
          ←
        </button>
        <h1 className="text-xl font-semibold">Получить TON</h1>
      </div>

      <div className="flex flex-col items-center gap-8">
        {/* QR-код */}
        <div className="bg-white rounded-2xl p-4">
          <QRCodeSVG
            value={address}
            size={200}
            bgColor="#ffffff"
            fgColor="#000000"
            level="M"
          />
        </div>

        {/* Адрес */}
        <div className="w-full space-y-3">
          <p className="text-white/50 text-sm text-center">Ваш адрес для получения</p>
          <div className="bg-white/5 rounded-xl p-4 flex flex-col items-center gap-3">
            <div className="text-center break-all">
              <AddressDisplay address={address} />
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleCopy}
            >
              {copied ? '✓ Скопировано' : 'Скопировать адрес'}
            </Button>
          </div>
        </div>

        {/* Информация */}
        <p className="text-white/30 text-xs text-center max-w-xs">
          Отправляйте только TON на этот адрес. Это адрес тестовой сети — настоящие TON здесь не работают.
        </p>
      </div>
    </div>
  );
}
