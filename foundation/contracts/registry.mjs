import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { checkSchema, validatePayload } from './validate.mjs';

export function canonicalJSON(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJSON).join(',')}]`;
  if (value !== null && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJSON(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
const freeze = value => {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
};
// Explicit catalog: a supported definition requires a reviewed deployment,
// not a table migration. Published versions remain semantically immutable.
const definitions = ['contribution.v1', 'post.v1'].map(ref => JSON.parse(readFileSync(new URL(`./lexicons/${ref}.json`, import.meta.url), 'utf8')));
for (const definition of definitions) checkSchema(definition.schema);
export const lexicons = freeze(definitions.map(definition => ({
  ref: definition.ref,
  digest: createHash('sha256').update(canonicalJSON(definition)).digest('hex'),
  definition,
})));
export function validateRecord(lexicon, payload) {
  const selected = lexicons.find(entry => entry.ref === lexicon?.ref);
  if (!selected) throw Object.assign(new Error('Unsupported lexicon version.'), { code: 'UNKNOWN_LEXICON', status: 400 });
  if (lexicon.digest !== selected.digest) throw Object.assign(new Error('Lexicon digest does not match the published definition.'), { code: 'LEXICON_CHANGED', status: 409 });
  validatePayload(selected.definition.schema, payload);
  if (Buffer.byteLength(canonicalJSON(payload)) > 65536) throw Object.assign(new Error('Payload exceeds the storage bound.'), { code: 'INVALID_PAYLOAD', status: 400 });
  return { lexicon: selected.ref, lexiconDigest: selected.digest, payloadJson: canonicalJSON(payload), body: payload[selected.definition.presentation.bodyField] };
}
