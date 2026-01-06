# Blockchain Integration Guide

This guide explains how to integrate blockchain transactions into your casino games.

## Overview

The integration consists of:
1. **Authentication** - Wallet-based user authentication
2. **Balance Management** - Track and manage user balances
3. **Transaction Service** - Handle blockchain transactions
4. **Betting Hook** - Easy-to-use hook for placing bets

## Setup

All providers are already set up in `src/providers/provider.tsx`. The contexts are available throughout your app.

## Using the Betting Hook

### Basic Usage

```typescript
import { useGameBetting } from '@/qubic/hooks/useGameBetting';

function MyGame() {
  const { placeBet, cashout, isProcessing, canBet } = useGameBetting();
  const [betAmount, setBetAmount] = useState(0);

  const handleBet = async () => {
    const result = await placeBet({
      amount: betAmount,
      gameType: 'crash', // or 'mines', 'videopoker', 'slide'
      gameId: 'game-123', // Optional game identifier
      metadata: {
        // Any additional game-specific data
        multiplier: 2.5,
      },
      onSuccess: (txHash) => {
        console.log('Bet placed!', txHash);
      },
      onError: (error) => {
        console.error('Bet failed:', error);
      },
    });
  };

  return (
    <button onClick={handleBet} disabled={!canBet || isProcessing}>
      {isProcessing ? 'Processing...' : 'Place Bet'}
    </button>
  );
}
```

### Cashout Example

```typescript
const handleCashout = async () => {
  const result = await cashout('crash', 'game-123', winAmount);
  if (result.success) {
    console.log('Cashout successful!');
  }
};
```

## Checking Balance

```typescript
import { useBalance } from '@/qubic/context/BalanceContext';

function MyComponent() {
  const { getBalance, hasEnoughBalance, balances, isLoading } = useBalance();

  const balance = getBalance('QUBIC');
  const canBet = hasEnoughBalance(100); // Check if user has at least 100 QUBIC

  return (
    <div>
      <p>Balance: {balance} QUBIC</p>
      {canBet ? (
        <p>You can place bets!</p>
      ) : (
        <p>Insufficient balance</p>
      )}
    </div>
  );
}
```

## Authentication

```typescript
import { useAuth } from '@/qubic/context/AuthContext';

function MyComponent() {
  const { user, isAuthenticated, login, logout } = useAuth();

  if (!isAuthenticated) {
    return <div>Please connect your wallet</div>;
  }

  return (
    <div>
      <p>Welcome, {user?.publicKey}</p>
      <button onClick={logout}>Logout</button>
    </div>
  );
}
```

## Integrating into Crash Game

Here's how to modify the Crash game to use blockchain transactions:

```typescript
// In src/app/crash/page.tsx

import { useGameBetting } from '@/qubic/hooks/useGameBetting';
import { useBalance } from '@/qubic/context/BalanceContext';

const CrashGame = () => {
  const { placeBet, cashout, isProcessing } = useGameBetting();
  const { hasEnoughBalance, getBalance } = useBalance();
  
  // ... existing code ...

  const clickBet = async () => {
    if (betAmount <= 0) return;
    
    // Check balance
    if (!hasEnoughBalance(betAmount)) {
      toast.error(`Insufficient balance. You have ${getBalance()} QUBIC`);
      return;
    }

    if (gameState === GAME_STATES.Starting) {
      setJoining(true);
      savedTarget.current = target * 100;
      
      // Place bet with blockchain transaction
      const result = await placeBet({
        amount: betAmount,
        gameType: 'crash',
        gameId: gameId,
        metadata: {
          target: target * 100,
          currencyId: currency._id,
        },
        onSuccess: (txHash) => {
          // Emit to socket after successful transaction
          crashSocket.emit("join-game", target * 100, betAmount, currency._id);
        },
        onError: (error) => {
          setJoining(false);
        },
      });

      if (!result.success) {
        setJoining(false);
        return;
      }
    } else {
      // ... existing planned bet logic ...
    }
  };

  const handleCashout = async () => {
    if (!betting) return;
    
    const result = await cashout('crash', gameId, winAmount);
    if (result.success) {
      crashSocket.emit("cashout");
    }
  };

  // ... rest of component ...
};
```

## Transaction History

```typescript
import { transactionHistoryService } from '@/qubic/services/transactionHistoryService';

// Get transaction history
const history = await transactionHistoryService.getHistory({
  limit: 50,
  type: 'bet',
  gameType: 'crash',
});

// Get statistics
const stats = await transactionHistoryService.getStatistics();
console.log('Total wagered:', stats.totalWagered);
```

## Payment Service (Deposits/Withdrawals)

```typescript
import { paymentService } from '@/qubic/services/paymentService';

// Get deposit address
const depositAddress = await paymentService.getDepositAddress();

// Check deposit status
const status = await paymentService.checkDepositStatus(txHash);

// Withdraw
const result = await paymentService.withdraw({
  amount: 100,
  currency: 'QUBIC',
  address: 'user-wallet-address',
});
```

## Environment Variables

Add to your `.env.local`:

```env
NEXT_PUBLIC_CASINO_ADDRESS=your-casino-house-address
```

## Backend API Endpoints

Your backend should implement these endpoints:

- `GET /api/balance` - Get user balance
- `POST /api/games/place-bet` - Process bet transaction
- `POST /api/games/cashout` - Process cashout
- `GET /api/transactions/history` - Get transaction history
- `GET /api/transactions/statistics` - Get statistics
- `POST /api/payment/deposit` - Process deposit
- `POST /api/payment/withdraw` - Process withdrawal
- `GET /api/payment/deposit-address` - Get deposit address

## Error Handling

All services include proper error handling. Always check the `success` field in responses:

```typescript
const result = await placeBet({ ... });
if (!result.success) {
  // Handle error
  console.error(result.error);
}
```

## Notes

- Transactions are signed client-side using the user's wallet
- Balance is locked when a bet is placed and unlocked if the bet fails
- The backend should verify transactions on-chain before processing
- All amounts are in QUBIC (1 QUBIC = 1e9 smallest units)

