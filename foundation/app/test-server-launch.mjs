// Exact manages a Bun entry; the auth fixture uses production's Node runtime.
import { spawn } from 'node:child_process';
const child = spawn('node', ['test-server.mjs'], { stdio: 'inherit', env: process.env });
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => child.kill(signal));
child.on('exit', code => process.exit(code ?? 0));
child.on('error', () => process.exit(1));
