import { createHash } from 'node:crypto';
import { canonicalJSON } from '../contracts/registry.mjs';

export const digest = value => createHash('sha256').update(canonicalJSON(value)).digest('hex');
export function fields(value, names, required = names) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(k => !names.includes(k)) || required.some(k => !Object.hasOwn(value, k))) throw new Error('Invalid contract fields.');
}
export function name(value) {
  if (typeof value !== 'string' || ['constructor', 'prototype'].includes(value) || !/^[a-z][a-z0-9-]{0,79}$/.test(value)) throw new Error('Expected a logical binding name.');
}
function exactLexicon(value) {
  fields(value, ['ref', 'digest']);
  if (typeof value.ref !== 'string' || !/^[a-zA-Z][a-zA-Z0-9.-]{0,199}$/.test(value.ref) || !/^[a-f0-9]{64}$/.test(value.digest)) throw new Error('Expected an exact lexicon reference.');
}
export function viewDefinition(input) {
  fields(input, ['schemaVersion', 'id', 'version', 'sources', 'select', 'presentation', 'compose']);
  if (input.schemaVersion !== 1 || !Number.isSafeInteger(input.version) || input.version < 1) throw new Error('Unsupported view version.');
  name(input.id);
  if (!Array.isArray(input.sources) || !input.sources.length || input.sources.length > 16 || new Set(input.sources).size !== input.sources.length) throw new Error('Expected distinct source bindings.');
  input.sources.forEach(name);
  fields(input.select, ['lexicons']);
  if (!Array.isArray(input.select.lexicons) || input.select.lexicons.length > 32) throw new Error('Invalid lexicon selection.');
  input.select.lexicons.forEach(exactLexicon);
  fields(input.presentation, ['order', 'group']);
  if (input.presentation.order !== 'newest-first' || !['thread', 'none'].includes(input.presentation.group)) throw new Error('Unsupported presentation.');
  if (input.compose !== null) {
    const c = input.compose;
    fields(c, ['destination', 'audience', 'lexicons', 'defaultLexicon']);
    name(c.destination); name(c.audience);
    if (!input.sources.includes(c.destination)) throw new Error('Writing destination must be a bound source.');
    if (!Array.isArray(c.lexicons) || !c.lexicons.length || c.lexicons.length > 16) throw new Error('Expected permitted writing lexicons.');
    c.lexicons.forEach(exactLexicon);
    if (new Set(c.lexicons.map(l => l.ref)).size !== c.lexicons.length || !c.lexicons.some(l => l.ref === c.defaultLexicon)) throw new Error('Default lexicon must be an unambiguous permitted version.');
  }
  // Keep caller mutation from changing a running scan or its checkpoint scope.
  return JSON.parse(canonicalJSON(input));
}
