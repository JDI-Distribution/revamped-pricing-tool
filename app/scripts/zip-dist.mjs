import archiver from 'archiver';
import { createWriteStream } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const distDir = join(__dirname, '..', 'dist');
const outZip = join(__dirname, '..', 'dist', 'out.zip');

const output = createWriteStream(outZip);
const archive = archiver('zip', { zlib: { level: 9 } });

output.on('close', () => {
  console.log(`Created dist/out.zip (${(archive.pointer() / 1024).toFixed(1)} KB)`);
});

archive.on('error', (err) => { throw err; });
archive.pipe(output);

// Add all dist files except the zip itself, preserving forward-slash paths
archive.glob('**/*', {
  cwd: distDir,
  ignore: ['out.zip'],
});

await archive.finalize();
