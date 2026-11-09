import { patchSDK } from './patch-sdk.mjs';
import { fileURLToPath } from 'node:url';
patchSDK(fileURLToPath(new URL('../tooling/exact2', import.meta.url)));
