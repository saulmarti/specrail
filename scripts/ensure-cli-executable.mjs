import { chmodSync, existsSync } from 'node:fs';
import path from 'node:path';

const cli = path.resolve('dist/src/cli.js');
if (!existsSync(cli)) throw new Error(`Compiled CLI missing: ${cli}`);
chmodSync(cli, 0o755);
