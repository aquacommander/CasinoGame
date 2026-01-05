# Qubic Wallet Connection Setup

## Current Status

The Qubic wallet connection has been integrated into the project. However, the Qubic libraries (`@qubic-lib/qubic-ts-library`, `@qubic-lib/qubic-mm-snap`, `@qubic-lib/qubic-ts-vault-library`) are not publicly available on npm and need to be installed separately.

## Installation Steps

### 1. Fix React Version Mismatch

First, ensure React versions match:

```bash
npm install react-dom@19.2.0
```

Or update both to the same version:

```bash
npm install react@19.2.0 react-dom@19.2.0
```

### 2. Install Qubic Libraries

The Qubic libraries need to be obtained from the Qubic team. You have two options:

#### Option A: If libraries are available via npm (private registry)

```bash
npm install @qubic-lib/qubic-ts-library @qubic-lib/qubic-mm-snap @qubic-lib/qubic-ts-vault-library
```

#### Option B: If libraries need to be added manually

1. Contact the Qubic team to obtain the library files
2. Add them to your `node_modules` or configure your build to use them
3. Update the imports in `src/qubic/context/QubicConnectContext.tsx` if the structure differs

### 3. Current Implementation

The current implementation uses dynamic imports with fallbacks, so the application will compile and run even without the Qubic libraries. However, full functionality will only work when the libraries are installed.

When Qubic libraries are missing:
- The app will compile successfully
- Wallet connection UI will be available
- Functions requiring Qubic libraries will throw descriptive errors when called
- Console warnings will indicate which libraries are missing

### 4. Testing

Once the libraries are installed:

1. Start the development server: `npm run dev`
2. The Qubic wallet connection should work fully
3. Check browser console for any warnings about missing libraries

## Features Available Without Libraries

- MetaMask Snap connection UI
- WalletConnect connection UI
- Basic wallet connection state management
- UI components for wallet connection

## Features Requiring Libraries

- Private key connection (requires `@qubic-lib/qubic-ts-library`)
- Vault file connection (requires `@qubic-lib/qubic-ts-vault-library`)
- Transaction signing (requires `@qubic-lib/qubic-ts-library`)
- Full MetaMask Snap integration (requires `@qubic-lib/qubic-mm-snap`)

