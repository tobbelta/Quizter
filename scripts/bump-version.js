#!/usr/bin/env node

/**
 * Automatisk versionsökning för RouteQuest
 *
 * Användning:
 *   node scripts/bump-version.js [major|minor|patch]
 *
 * Uppdaterar version i:
 * - src/version.js
 * - public/index.html
 * - public/version-check.js
 * - package.json
 */

const fs = require('fs');
const path = require('path');

const versionType = process.argv[2] || 'patch';

if (!['major', 'minor', 'patch'].includes(versionType)) {
  console.error('❌ Ogiltigt versionstyp. Använd: major, minor eller patch');
  process.exit(1);
}

// Läs nuvarande version från src/version.js
const versionPath = path.join(__dirname, '../src/version.js');
const versionContent = fs.readFileSync(versionPath, 'utf8');
const versionMatch = versionContent.match(/export const VERSION = '(\d+)\.(\d+)\.(\d+)'/);

if (!versionMatch) {
  console.error('❌ Kunde inte hitta version i src/version.js');
  process.exit(1);
}

let [, major, minor, patch] = versionMatch.map(Number);

// Öka version baserat på typ
switch (versionType) {
  case 'major':
    major++;
    minor = 0;
    patch = 0;
    break;
  case 'minor':
    minor++;
    patch = 0;
    break;
  case 'patch':
    patch++;
    break;
}

const newVersion = `${major}.${minor}.${patch}`;
const oldVersion = versionMatch[0].match(/'(.+)'/)[1];

console.log(`📦 Ökar version från ${oldVersion} till ${newVersion} (${versionType})`);

// Dagens datum för changelog
const today = new Date().toISOString().split('T')[0];

// 1. Uppdatera src/version.js
console.log('  ✓ Uppdaterar src/version.js...');
const newVersionContent = versionContent.replace(
  /export const VERSION = '\d+\.\d+\.\d+'/,
  `export const VERSION = '${newVersion}'`
);
fs.writeFileSync(versionPath, newVersionContent, 'utf8');

// 2. Uppdatera public/index.html
console.log('  ✓ Uppdaterar public/index.html...');
const indexPath = path.join(__dirname, '../public/index.html');
const indexContent = fs.readFileSync(indexPath, 'utf8');
const newIndexContent = indexContent.replace(
  /const APP_VERSION = '\d+\.\d+\.\d+'/,
  `const APP_VERSION = '${newVersion}'`
);
fs.writeFileSync(indexPath, newIndexContent, 'utf8');

// 3. Uppdatera public/version-check.js
console.log('  ✓ Uppdaterar public/version-check.js...');
const versionCheckPath = path.join(__dirname, '../public/version-check.js');
const versionCheckContent = fs.readFileSync(versionCheckPath, 'utf8');
const newVersionCheckContent = versionCheckContent.replace(
  /const VERSION_CHECK_APP_VERSION = '\d+\.\d+\.\d+'/,
  `const VERSION_CHECK_APP_VERSION = '${newVersion}'`
);
fs.writeFileSync(versionCheckPath, newVersionCheckContent, 'utf8');

// 4. Uppdatera package.json
console.log('  ✓ Uppdaterar package.json...');
const packagePath = path.join(__dirname, '../package.json');
const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
packageJson.version = newVersion;
fs.writeFileSync(packagePath, JSON.stringify(packageJson, null, 2) + '\n', 'utf8');

console.log(`\n✅ Version uppdaterad till ${newVersion}`);
console.log(`\n📝 Nästa steg:`);
console.log(`   1. Uppdatera CHANGELOG i src/version.js med ändringar för ${newVersion}`);
console.log(`   2. Commit: git add . && git commit -m "chore: bump version to ${newVersion}"`);
console.log(`   3. Tag: git tag v${newVersion}`);
console.log(`   4. Push: git push && git push --tags`);
