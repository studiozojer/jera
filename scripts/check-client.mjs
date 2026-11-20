import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const app = fileURLToPath(new URL('../app/', import.meta.url));
const manifest = JSON.parse(readFileSync(resolve(app, 'app.json'), 'utf8'));
const generated = resolve(app, manifest.typescript.sources.backend);
const {snapback4Version} = JSON.parse(readFileSync(resolve(generated, 'package.json'), 'utf8'));
const {api} = await import(pathToFileURL(resolve(generated, 'api.ts')));
const installed = JSON.parse(readFileSync(resolve(app, '../node_modules/snapback4/package.json'), 'utf8'));
assert.equal(installed.version, snapback4Version, 'Snapback server CLI and generated API versions differ');
assert.equal(api.currentIdentity.kind, 'query');
assert.equal(api.postsList.kind, 'query');
console.log(`Verified Snapback ${installed.version} and generated Jera client bindings.`);
