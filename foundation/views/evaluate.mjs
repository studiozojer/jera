import { digest, fields, name, viewDefinition } from './definition.mjs';
import { sourceBinding, bindingScope, snapbackSnapshot, folderSnapshot } from './sources.mjs';

export function runtimeBindings(config) {
  fields(config, ['reader', 'sources', 'audiences']);
  if (typeof config.reader !== 'string' || !config.reader.trim() || config.reader.length > 200) throw new Error('A local reader context is required.');
  fields(config.sources, Object.keys(config.sources));
  fields(config.audiences, Object.keys(config.audiences));
  for (const [key, binding] of Object.entries(config.sources)) { name(key); sourceBinding(binding); }
  for (const [key, audience] of Object.entries(config.audiences)) {
    name(key); fields(audience, ['source', 'id']); name(audience.source);
    if ((audience.id !== null && (typeof audience.id !== 'string' || !audience.id || audience.id.length > 200)) || config.sources[audience.source]?.type !== 'snapback') throw new Error('Invalid audience binding.');
  }
  return structuredClone(config);
}
function validateCheckpoint(value) {
  if (value === null) return;
  fields(value, ['schemaVersion', 'scope', 'sources']);
  if (value.schemaVersion !== 1 || !/^[a-f0-9]{64}$/.test(value.scope)) throw new Error('Unsupported checkpoint.');
  fields(value.sources, Object.keys(value.sources));
  if (Object.keys(value.sources).length > 16) throw new Error('Checkpoint exceeds source bound.');
  for (const [source, revisions] of Object.entries(value.sources)) {
    name(source); fields(revisions, Object.keys(revisions));
    if (Object.keys(revisions).length > 1000) throw new Error('Checkpoint exceeds record bound.');
    for (const [key, revision] of Object.entries(revisions)) {
      const id = JSON.parse(key);
      if (!Array.isArray(id) || id.length !== 2 || id[0] !== source || typeof id[1] !== 'string' || !/^[a-f0-9]{64}$/.test(revision)) throw new Error('Invalid checkpoint entry.');
    }
  }
}
export async function evaluateView(input, config, previous = null, env = process.env) {
  const definition = viewDefinition(input), bindings = runtimeBindings(config);
  validateCheckpoint(previous);
  const scope = digest({ definition, reader: bindings.reader, sources: definition.sources.map(id => [id, bindings.sources[id] ? bindingScope(bindings.sources[id]) : null]) });
  // A changed view, source location, or reader starts a new observation scope.
  // Never compare another account's checkpoint or infer withdrawals from it.
  const prior = previous?.schemaVersion === 1 && previous.scope === scope ? previous : { sources: {} };
  const checkpoint = { schemaVersion: 1, scope, sources: {} }, statuses = [], records = [], changes = [];
  for (const source of definition.sources) {
    const binding = bindings.sources[source];
    if (!binding) { statuses.push({ source, state: 'unavailable' }); continue; }
    try {
      const snapshot = await (binding.type === 'snapback' ? snapbackSnapshot(source, binding, env) : folderSnapshot(source, binding));
      const selected = snapshot.filter(r => (!definition.select.visibility || definition.select.visibility === 'all' || r.access.visibility === definition.select.visibility) && (!definition.select.lexicons.length || definition.select.lexicons.some(l => l.ref === r.lexicon?.ref && l.digest === r.lexicon.digest)));
      const revisions = Object.fromEntries(selected.map(r => [r.key, r.revision]));
      const old = prior.sources[source] || {};
      for (const row of selected) if (old[row.key] !== row.revision) changes.push({ kind: 'upsert', key: row.key, revision: row.revision });
      for (const key of Object.keys(old)) if (!Object.hasOwn(revisions, key)) changes.push({ kind: 'withdraw', key });
      checkpoint.sources[source] = revisions;
      records.push(...selected);
      statuses.push({ source, state: 'complete', count: selected.length });
    } catch {
      // No source text/errors/old counts on failed reads. Preserve the digest-only
      // cursor privately so recovery compares to the last successful observation.
      if (prior.sources[source]) checkpoint.sources[source] = prior.sources[source];
      statuses.push({ source, state: 'unavailable' });
    }
  }
  records.sort((a, b) => b.at - a.at || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  const compose = definition.compose;
  const audience = compose ? bindings.audiences[compose.audience] : null;
  const writing = compose && bindings.sources[compose.destination]?.type === 'snapback' && audience?.source === compose.destination
    ? { state: 'bound', ...compose, audienceId: audience.id } : { state: compose ? 'unavailable' : 'read-only' };
  // Bound means configuration resolved, NOT permission verified or publication.
  return { output: { view: { id: definition.id, version: definition.version }, presentation: definition.presentation,
    sources: statuses, records, changes, writing }, checkpoint };
}
