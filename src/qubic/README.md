# Qubic Wallet Connection Integration

This directory contains the Qubic wallet connection implementation based on the Qubic team's existing components.

## Structure

- **config/**: Configuration files for Qubic snap and connection types
- **types/**: TypeScript type definitions
- **utils/**: Utility functions for MetaMask, Snaps, QR codes, and base64 conversions
- **context/**: React context providers (MetaMask, WalletConnect, QubicConnect)
- **components/**: React components for wallet connection UI
- **ui/**: Reusable UI components (Button, Card, Input, AccountSelector)
- **store/**: State management (using Jotai)
- **constants/**: Constants used across the integration

## Usage

The Qubic wallet connection is integrated into the main providers. To use it in your components:

```tsx
import { useQubicConnect } from '@/qubic/context/QubicConnectContext';
import ConnectLink from '@/qubic/components/ConnectLink';

function MyComponent() {
  const { connected, wallet, connect, disconnect } = useQubicConnect();
  
  return (
    <div>
      <ConnectLink />
      {connected && <div>Connected: {wallet?.publicKey}</div>}
    </div>
  );
}
```

## Connection Types

The integration supports multiple connection types:
- **mmSnap**: MetaMask Snap integration
- **walletconnect**: WalletConnect protocol
- **privateKey**: Private key/seed connection (not recommended for production)
- **vaultFile**: Qubic vault file connection

## Note

For WalletConnect transaction signing, components should use the `useWalletConnect` hook directly as the `getSignedTx` function in QubicConnectContext may not have access to the WalletConnect context in all scenarios.

