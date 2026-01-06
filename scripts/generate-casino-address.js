/**
 * Script to generate a Qubic casino house address
 * 
 * Usage: node scripts/generate-casino-address.js
 * 
 * This will generate:
 * - A new Qubic public address (casino house address)
 * - A private seed (KEEP SECRET - this is your private key)
 */

const { QubicHelper } = require('@qubic-lib/qubic-ts-library');

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
 * Main function to generate casino address
 */
async function generateCasinoAddress() {
  try {
    console.log('\n🎰 Generating Casino House Address...\n');
    
    const qHelper = new QubicHelper();
    
    // Generate a random seed (60 characters)
    const seed = generateRandomSeed();
    
    // Create identity package from seed
    const idPackage = await qHelper.createIdPackage(seed);
    
    // Display results
    console.log('='.repeat(70));
    console.log('✅ CASINO HOUSE ADDRESS GENERATED');
    console.log('='.repeat(70));
    console.log('\n📍 PUBLIC ADDRESS (Use this in .env.local):');
    console.log(idPackage.publicId);
    console.log('\n' + '='.repeat(70));
    console.log('\n🔐 PRIVATE SEED (KEEP THIS SECRET - SAVE IT SECURELY!):');
    console.log(seed);
    console.log('\n' + '='.repeat(70));
    
    // Instructions
    console.log('\n📝 NEXT STEPS:');
    console.log('1. Copy the PUBLIC ADDRESS above');
    console.log('2. Add it to your .env.local file:');
    console.log(`   NEXT_PUBLIC_CASINO_ADDRESS=${idPackage.publicId}`);
    console.log('3. SECURELY save the PRIVATE SEED (you need it to access funds)');
    console.log('4. Restart your development server');
    console.log('\n⚠️  WARNING: Never share your private seed! Anyone with it can access your funds!');
    console.log('='.repeat(70) + '\n');
    
    return {
      publicId: idPackage.publicId,
      seed: seed
    };
  } catch (error) {
    console.error('\n❌ Error generating casino address:', error);
    console.error('\nMake sure @qubic-lib/qubic-ts-library is installed:');
    console.error('  npm install @qubic-lib/qubic-ts-library\n');
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  generateCasinoAddress();
}

module.exports = { generateCasinoAddress };

