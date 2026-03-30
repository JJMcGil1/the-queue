import sharp from 'sharp';
import { execSync } from 'child_process';
import { mkdirSync, rmSync, existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const svgPath = join(__dirname, 'icon.svg');
const svgBuffer = readFileSync(svgPath);
const iconsetDir = join(__dirname, 'icon.iconset');

// Clean and create iconset directory
if (existsSync(iconsetDir)) rmSync(iconsetDir, { recursive: true });
mkdirSync(iconsetDir);

// macOS iconset requires these exact filenames and sizes
const sizes = [
  { name: 'icon_16x16.png', size: 16 },
  { name: 'icon_16x16@2x.png', size: 32 },
  { name: 'icon_32x32.png', size: 32 },
  { name: 'icon_32x32@2x.png', size: 64 },
  { name: 'icon_128x128.png', size: 128 },
  { name: 'icon_128x128@2x.png', size: 256 },
  { name: 'icon_256x256.png', size: 256 },
  { name: 'icon_256x256@2x.png', size: 512 },
  { name: 'icon_512x512.png', size: 512 },
  { name: 'icon_512x512@2x.png', size: 1024 },
];

console.log('Generating PNGs from SVG...');

await Promise.all(sizes.map(({ name, size }) =>
  sharp(svgBuffer, { density: Math.round(72 * size / 1024 * 4) })
    .resize(size, size)
    .png()
    .toFile(join(iconsetDir, name))
    .then(() => console.log(`  ✓ ${name} (${size}x${size})`))
));

// Also generate the master icon.png (1024x1024) for electron-builder
await sharp(svgBuffer, { density: 288 })
  .resize(1024, 1024)
  .png()
  .toFile(join(__dirname, 'icon.png'));
console.log('  ✓ icon.png (1024x1024)');

// Generate .icns using macOS iconutil
console.log('Building icon.icns...');
execSync(`iconutil -c icns "${iconsetDir}" -o "${join(__dirname, 'icon.icns')}"`);
console.log('  ✓ icon.icns');

// Clean up iconset directory
rmSync(iconsetDir, { recursive: true });
console.log('Done!');
