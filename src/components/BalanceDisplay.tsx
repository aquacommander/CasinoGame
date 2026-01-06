'use client';

import { useBalance } from '@/qubic/context/BalanceContext';
import { useAuth } from '@/qubic/context/AuthContext';
import { Button } from '@heroui/react';
import { useQubicConnect } from '@/qubic/context/QubicConnectContext';

export default function BalanceDisplay() {
  const { balances, isLoading, getBalance, refreshBalance } = useBalance();
  const { isAuthenticated } = useAuth();
  const { connected, toggleConnectModal } = useQubicConnect();

  if (!isAuthenticated || !connected) {
    return (
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          color="primary"
          onClick={toggleConnectModal}
          className="font-semibold"
        >
          Connect Wallet
        </Button>
      </div>
    );
  }

  const balance = getBalance('QUBIC');

  return (
    <div className="flex items-center gap-3">
      <div className="flex flex-col items-end">
        <span className="text-xs text-gray-400">Balance</span>
        <div className="flex items-center gap-2">
          {isLoading ? (
            <span className="text-sm text-gray-500">Loading...</span>
          ) : (
            <span className="text-lg font-bold text-white">
              {balance.toFixed(4)} QUBIC
            </span>
          )}
          <Button
            size="sm"
            variant="light"
            onClick={refreshBalance}
            className="min-w-0 p-1"
            isIconOnly
          >
            🔄
          </Button>
        </div>
      </div>
    </div>
  );
}

