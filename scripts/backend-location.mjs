import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function backendDirectory() {
  const sibling = fileURLToPath(new URL('../../jera-snapback/', import.meta.url));
  const directory = resolve(process.env.JERA_BACKEND_DIR || sibling);
  if (!existsSync(resolve(directory, 'snapback/schema.q'))) {
    throw new Error('Local integration requires a studiozojer/jera-snapback checkout. Set JERA_BACKEND_DIR to its absolute path.');
  }
  return directory;
}
