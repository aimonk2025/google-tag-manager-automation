// Auto-install googleapis package
const { execSync } = require('child_process');

try {
  console.log('Installing googleapis...');
  execSync('npm install googleapis --save', { stdio: 'inherit' });
  console.log('✓ googleapis installed successfully');
} catch (error) {
  console.error('✗ Installation failed:', error.message);
  process.exit(1);
}
