import { readdirSync, renameSync, readFileSync, writeFileSync, statSync } from 'fs';
import { join, relative, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const distDir = join(__dirname, '..', 'dist');

function walk(dir) {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(full));
    } else {
      files.push(full);
    }
  }
  return files;
}

// Pass 1: collect renames (basename only — dirs are already lowercase from Vite)
const allFiles = walk(distDir);
const renames = new Map(); // oldPath -> newPath

for (const filePath of allFiles) {
  const dir = dirname(filePath);
  const base = filePath.slice(dir.length + 1);
  // Lowercase, then replace every non-[a-z0-9] character except the final
  // extension dot with an underscore, then restore the single extension dot.
  const extMatch = base.match(/(\.[a-zA-Z0-9]+)$/);
  const ext = extMatch ? extMatch[1].toLowerCase() : '';
  const stem = ext ? base.slice(0, -ext.length) : base;
  const normalized = stem.toLowerCase().replace(/[^a-z0-9]/g, '_') + ext;
  if (base !== normalized) {
    const newPath = join(dir, normalized);
    renames.set(filePath, newPath);
  }
}

// Pass 2: rename files
for (const [oldPath, newPath] of renames) {
  renameSync(oldPath, newPath);
  console.log(`renamed: ${relative(distDir, oldPath)} → ${relative(distDir, newPath)}`);
}

if (renames.size === 0) {
  console.log('All filenames already normalized — nothing to rename.');
}

// Pass 3: update references inside .html, .js, .css files
// Build a map of old basename -> new basename for string replacement
const refMap = new Map();
for (const [oldPath, newPath] of renames) {
  const oldBase = oldPath.slice(dirname(oldPath).length + 1);
  const newBase = newPath.slice(dirname(newPath).length + 1);
  refMap.set(oldBase, newBase);
}

if (refMap.size > 0) {
  const textFiles = walk(distDir).filter(f => /\.(html|js|css)$/.test(f));
  for (const filePath of textFiles) {
    let content = readFileSync(filePath, 'utf8');
    let changed = false;
    for (const [oldBase, newBase] of refMap) {
      if (content.includes(oldBase)) {
        content = content.replaceAll(oldBase, newBase);
        changed = true;
      }
    }
    if (changed) {
      writeFileSync(filePath, content, 'utf8');
      console.log(`updated refs: ${relative(distDir, filePath)}`);
    }
  }
}

// Pass 4: write client-package.json for Catalyst Web Client Hosting
const clientPkg = join(distDir, 'client-package.json');
writeFileSync(clientPkg, JSON.stringify({ name: 'jdi-pricing-tool', version: '0.0.1', homepage: 'index.html' }, null, 4) + '\n', 'utf8');
console.log('wrote: client-package.json');

console.log('Done.');
