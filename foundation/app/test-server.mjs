// Exact owns this disposable server during test/verify. A managed server also
// keeps verify's normal and large-text tours sequential: both use `fresh`.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const child = spawn(`${root}node_modules/.bin/snapback4`, [
  'dev', '--port', process.env.PORT ?? '4417', '--fresh', '--no-watch', '--unsafe-dev-doors',
], { cwd: root, stdio: 'inherit' });
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => child.kill(signal));
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 0; });
