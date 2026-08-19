import { chmodSync, existsSync } from 'node:fs';
import path from 'node:path';

for (const target of ['dist/src/cli.js','scripts/specrail-worker.mjs']) {
  const file=path.resolve(target);
  if(!existsSync(file))throw new Error(`Executable missing: ${file}`);
  chmodSync(file,0o755);
}
