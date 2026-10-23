const fs = require('fs');
const path = require('path');

const srcDir = path.resolve(__dirname, '..');
const destDir = path.resolve(srcDir, 'www');

// List of files and folders to copy
const assets = [
  'index.html',
  'styles.css',
  'app.js',
  'app_logo.png',
  'js',
  'services',
  'data'
];

function cleanAndBuild() {
  console.log('Starting web build...');

  // 1. Clean www directory
  if (fs.existsSync(destDir)) {
    console.log(`Cleaning existing build directory: ${destDir}`);
    fs.rmSync(destDir, { recursive: true, force: true });
  }

  // 2. Create www directory
  fs.mkdirSync(destDir, { recursive: true });
  console.log(`Created clean build directory: ${destDir}`);

  // 3. Copy assets
  assets.forEach(asset => {
    const srcPath = path.join(srcDir, asset);
    const destPath = path.join(destDir, asset);

    if (!fs.existsSync(srcPath)) {
      console.warn(`Warning: Asset "${asset}" not found at ${srcPath}`);
      return;
    }

    const stat = fs.statSync(srcPath);
    if (stat.isDirectory()) {
      console.log(`Copying directory: ${asset} -> www/${asset}`);
      fs.cpSync(srcPath, destPath, { recursive: true });
    } else {
      console.log(`Copying file: ${asset} -> www/${asset}`);
      fs.copyFileSync(srcPath, destPath);
    }
  });

  console.log('Web build completed successfully!');
}

try {
  cleanAndBuild();
} catch (err) {
  console.error('Error during web build:', err);
  process.exit(1);
}
