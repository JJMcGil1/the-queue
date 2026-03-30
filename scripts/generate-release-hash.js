const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const releaseDir = path.join(__dirname, '..', 'release');
const pkg = require(path.join(__dirname, '..', 'package.json'));

function sha256(filePath) {
  const data = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(data).digest('hex');
}

function fileSize(filePath) {
  return fs.statSync(filePath).size;
}

// Find all DMG and ZIP files in release directory
const files = fs.readdirSync(releaseDir).filter(f => f.endsWith('.dmg') || f.endsWith('.zip'));

if (files.length === 0) {
  console.error('No DMG or ZIP files found in release/');
  process.exit(1);
}

const platforms = {};
const hashLines = [];

for (const file of files) {
  const filePath = path.join(releaseDir, file);
  const hash = sha256(filePath);
  const size = fileSize(filePath);

  hashLines.push(`${hash}  ${file}`);

  if (file.includes('arm64') && file.endsWith('.dmg')) {
    platforms.macArm64 = { sha256: hash, size, file };
  } else if (file.includes('arm64') && file.endsWith('.zip')) {
    platforms.macArm64Zip = { sha256: hash, size, file };
  } else if (file.endsWith('.dmg')) {
    platforms.mac = { sha256: hash, size, file };
  } else if (file.endsWith('.zip')) {
    platforms.macZip = { sha256: hash, size, file };
  }
}

const latestJson = {
  version: pkg.version,
  releaseDate: new Date().toISOString(),
  releaseNotes: 'Bug fixes and improvements.',
  platforms,
};

fs.writeFileSync(path.join(releaseDir, 'latest.json'), JSON.stringify(latestJson, null, 2));
fs.writeFileSync(path.join(releaseDir, 'hashes.txt'), hashLines.join('\n') + '\n');

console.log('Generated latest.json and hashes.txt');
console.log(JSON.stringify(latestJson, null, 2));
