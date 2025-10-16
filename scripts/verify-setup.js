#!/usr/bin/env node
/* eslint-disable */

/**
 * Setup verification script
 * Run with: node scripts/verify-setup.js
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 Verifying Vacaciones API Setup...\n');

let hasErrors = false;

// Check 1: Node version
console.log('1️⃣  Checking Node.js version...');
const nodeVersion = process.version;
const requiredVersion = 'v22.13.1';
if (nodeVersion === requiredVersion) {
  console.log(`   ✅ Node.js version: ${nodeVersion}\n`);
} else {
  console.log(`   ⚠️  Node.js version: ${nodeVersion} (expected ${requiredVersion})`);
  console.log(`   💡 Run: nvm use\n`);
}

// Check 2: .env file
console.log('2️⃣  Checking .env file...');
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  console.log('   ✅ .env file exists');
  
  const envContent = fs.readFileSync(envPath, 'utf-8');
  const requiredVars = [
    'GOOGLE_CLIENT_ID',
    'GOOGLE_SHEETS_ID',
    'GOOGLE_SERVICE_ACCOUNT_KEY_PATH',
  ];
  
  const missingVars = requiredVars.filter(varName => {
    const regex = new RegExp(`^${varName}=.+`, 'm');
    return !regex.test(envContent);
  });
  
  if (missingVars.length === 0) {
    console.log('   ✅ All required environment variables are set\n');
  } else {
    console.log(`   ❌ Missing environment variables: ${missingVars.join(', ')}`);
    console.log(`   💡 Edit your .env file and add these variables\n`);
    hasErrors = true;
  }
} else {
  console.log('   ❌ .env file not found');
  console.log('   💡 Run: cp .env.example .env\n');
  hasErrors = true;
}

// Check 3: Service account key
console.log('3️⃣  Checking service account key...');
const serviceAccountPath = path.join(__dirname, '..', 'service-account-key.json');
if (fs.existsSync(serviceAccountPath)) {
  console.log('   ✅ service-account-key.json exists');
  
  try {
    const keyContent = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf-8'));
    if (keyContent.type === 'service_account' && keyContent.client_email) {
      console.log(`   ✅ Service account email: ${keyContent.client_email}\n`);
    } else {
      console.log('   ⚠️  Service account key format looks incorrect\n');
    }
  } catch (error) {
    console.log('   ⚠️  Service account key is not valid JSON\n');
  }
} else {
  console.log('   ❌ service-account-key.json not found');
  console.log('   💡 Download it from Google Cloud Console and place it in the project root\n');
  hasErrors = true;
}

// Check 4: node_modules
console.log('4️⃣  Checking dependencies...');
const nodeModulesPath = path.join(__dirname, '..', 'node_modules');
if (fs.existsSync(nodeModulesPath)) {
  console.log('   ✅ node_modules exists\n');
} else {
  console.log('   ❌ node_modules not found');
  console.log('   💡 Run: npm install\n');
  hasErrors = true;
}

// Check 5: TypeScript compilation
console.log('5️⃣  Checking TypeScript compilation...');
const srcPath = path.join(__dirname, '..', 'src');
if (fs.existsSync(srcPath)) {
  console.log('   ✅ src/ directory exists');
  console.log('   💡 Run `npm run build` to verify TypeScript compiles correctly\n');
} else {
  console.log('   ❌ src/ directory not found\n');
  hasErrors = true;
}

// Summary
console.log('═══════════════════════════════════════════════════════════');
if (hasErrors) {
  console.log('❌ Setup incomplete. Please fix the errors above.');
  console.log('\nQuick fix:');
  console.log('  1. npm install');
  console.log('  2. cp .env.example .env');
  console.log('  3. Edit .env with your values');
  console.log('  4. Download service-account-key.json from Google Cloud');
  console.log('\nThen run this script again: node scripts/verify-setup.js');
} else {
  console.log('✅ Setup looks good!');
  console.log('\nNext steps:');
  console.log('  1. Verify: npm run build');
  console.log('  2. Start dev server: npm run dev');
  console.log('  3. Test: curl http://localhost:3000/api/health');
  console.log('\nSee QUICKSTART.md for more details.');
}
console.log('═══════════════════════════════════════════════════════════\n');

process.exit(hasErrors ? 1 : 0);
