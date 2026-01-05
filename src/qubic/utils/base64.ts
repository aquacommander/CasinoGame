/**
 * Convert base64 string to Uint8Array
 */
export function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * Convert Uint8Array to base64 string
 */
export function uint8ArrayToBase64(uint8Array: Uint8Array): string {
  let binary = "";
  const len = uint8Array.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(uint8Array[i]);
  }
  return btoa(binary);
}

/**
 * Decode Uint8Array transaction to QubicTransaction object
 * This is a simplified version - you may need to adjust based on actual QubicTransaction structure
 */
export function decodeUint8ArrayTx(uint8Array: Uint8Array): any {
  // This is a placeholder - the actual implementation depends on QubicTransaction structure
  // You'll need to import QubicTransaction from @qubic-lib/qubic-ts-library and properly decode it
  return uint8Array;
}

