// Exact recognizes Bun fixture entries and checks that the launched PID owns
// the listener. Replace this process with Node (the auth service's runtime)
// instead of spawning an unrecognized child listener.
import { fileURLToPath } from 'node:url';
if (process.versions.bun) {
  const node = Bun.which('node');
  if (!node) throw new Error('The Jera auth fixture requires Node.');
  process.execve(node, [node, fileURLToPath(import.meta.url)], process.env);
} else {
  await import('../test-server.mjs');
}
