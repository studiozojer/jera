import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readDeviceStamp } from '../tooling/exact2/snapback4/web/device-build.mjs';

const app = fileURLToPath(new URL('../app/', import.meta.url));
const manifest = JSON.parse(readFileSync(resolve(app, 'app.json'), 'utf8'));
const generated = resolve(app, manifest.typescript.sources.backend);
const {snapback4Version} = JSON.parse(readFileSync(resolve(generated, 'package.json'), 'utf8'));
const {api} = await import(pathToFileURL(resolve(generated, 'api.ts')));
const device = readDeviceStamp(resolve(app, 'assets/snapback4.wasm'));
assert.equal(device.version, snapback4Version, 'Exact device and generated client API versions differ');
assert.equal(api.currentIdentity.kind, 'query');
assert.equal(api.postsList.kind, 'query');
console.log(`Verified Snapback ${device.version} device and generated Jera client bindings.`);
