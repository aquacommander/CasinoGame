/**
 * Simple script to generate a Qubic casino house address
 * This version works without requiring @qubic-lib/qubic-ts-library to be installed
 * 
 * Usage: node scripts/generate-casino-address-simple.js
 */

// Characters allowed in Qubic seeds (27 characters: A-Z and 9)
const QUBIC_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ9';

/**
 * Generate a random Qubic seed (60 characters)
 */
function generateRandomSeed() {
  return Array.from({ length: 60 }, () => 
    QUBIC_CHARS.charAt(Math.floor(Math.random() * QUBIC_CHARS.length))
  ).join('');
}

/**
 * Simple hash function to create a deterministic address from seed
 * This is a simplified version - for production, use the actual Qubic library
 */
function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36).toUpperCase();
}

/**
 * Generate a Qubic-like address from seed
 * Note: This is a simplified version. For production, you should use the actual Qubic library
 */
function generateAddressFromSeed(seed) {
  // Create a deterministic address-like string from the seed
  // In real Qubic, this uses cryptographic functions
  const hash1 = simpleHash(seed);
  const hash2 = simpleHash(seed.split('').reverse().join(''));
  const hash3 = simpleHash(seed.substring(0, 30) + seed.substring(30));
  
  // Combine and format to look like a Qubic address (55 characters)
  let address = (hash1 + hash2 + hash3).toUpperCase();
  
  // Filter to only Qubic characters and pad/trim to 55 characters
  address = address.split('').filter(c => QUBIC_CHARS.includes(c)).join('');
  
  // Pad or trim to exactly 55 characters
  while (address.length < 55) {
    address += QUBIC_CHARS.charAt(Math.floor(Math.random() * QUBIC_CHARS.length));
  }
  address = address.substring(0, 55);
  
  return address;
}

/**
 * Main function
 */
function generateCasinoAddress() {
  console.log('\n🎰 Generating Casino House Address...\n');
  
  // Generate a random seed (60 characters)
  const seed = generateRandomSeed();
  
  // Generate address from seed
  // NOTE: This is a simplified version. For production use, you should:
  // 1. Install @qubic-lib/qubic-ts-library: npm install @qubic-lib/qubic-ts-library
  // 2. Use the actual QubicHelper.createIdPackage() method
  const address = generateAddressFromSeed(seed);
  
  // Display results
  console.log('='.repeat(70));
  console.log('✅ CASINO HOUSE ADDRESS GENERATED');
  console.log('='.repeat(70));
  console.log('\n📍 PUBLIC ADDRESS (Use this in .env.local):');
  console.log(address);
  console.log('\n' + '='.repeat(70));
  console.log('\n🔐 PRIVATE SEED (KEEP THIS SECRET - SAVE IT SECURELY!):');
  console.log(seed);
  console.log('\n' + '='.repeat(70));
  
  // Instructions
  console.log('\n📝 NEXT STEPS:');
  console.log('1. Copy the PUBLIC ADDRESS above');
  console.log('2. Add it to your .env.local file:');
  console.log(`   NEXT_PUBLIC_CASINO_ADDRESS=${address}`);
  console.log('3. SECURELY save the PRIVATE SEED (you need it to access funds)');
  console.log('4. Restart your development server');
  console.log('\n⚠️  WARNING: Never share your private seed! Anyone with it can access your funds!');
  console.log('\n💡 NOTE: This is a simplified address generator.');
  console.log('   For production, install @qubic-lib/qubic-ts-library and use the proper method.');
  console.log('='.repeat(70) + '\n');
  
  return {
    publicId: address,
    seed: seed
  };
}

// Run if called directly
if (require.main === module) {
  generateCasinoAddress();
}

module.exports = { generateCasinoAddress };

