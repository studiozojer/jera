import { lexicons, validateRecord } from '../contracts/registry.mjs';
import { intentId } from '../scripts/client.mjs';
import { postEnvelope } from '../contracts/records.mjs';

const id = value => typeof value === 'string' && /^[0-9A-HJKMNP-TV-Z]{26}$/.test(value);
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const reject = (code, message, status = 400) => { throw Object.assign(new Error(message), { code, status, recordSafe: true }); };
async function readRequest(req) {
  if (!req.headers['content-type']?.startsWith('application/json')) reject('E_INPUT', 'Expected JSON.', 415);
  const chunks = []; let bytes = 0;
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > 98304) reject('E_INPUT', 'Request too large.', 413);
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { reject('E_INPUT', 'Invalid JSON.'); }
}
function send(res, status, value) { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(value)); }

// Mounted under the auth handler's existing origin/CORS and security headers.
// Browser and CLI submit the same envelope. Only this server owns the service
// credential for commitStructuredPost; users cannot call that mutation.
export function createRecordHandler({ authenticate, snapbackOrigin, serviceToken, fetcher = fetch }) {
  return async (req, res) => {
    try {
      const author = await authenticate(req.headers.authorization?.match(/^Bearer (.+)$/)?.[1]);
      const pathname = new URL(req.url, 'http://records.local').pathname;
      if (req.method === 'GET' && pathname === '/records/lexicons') return send(res, 200, { lexicons });
      if (req.method !== 'POST' || pathname !== '/records/publish') return send(res, 404, { denied: { code: 'E_NOT_FOUND', message: 'Not found.' } });
      const input = await readRequest(req);
      if (!plain(input) || Object.keys(input).some(key => !['intent', 'lexicon', 'audience', 'parent', 'payload', 'draft'].includes(key))
        || !id(input.intent) || (input.audience !== null && !id(input.audience)) || (input.parent !== null && input.parent !== undefined && !id(input.parent))
        || !plain(input.lexicon) || Object.keys(input.lexicon).some(key => !['ref', 'digest'].includes(key))) reject('E_INPUT', 'Invalid post envelope.');
      if (input.draft !== undefined && (!plain(input.draft) || Object.keys(input.draft).some(key => !['device', 'revision', 'scope'].includes(key))
        || !id(input.draft.device) || !Number.isSafeInteger(input.draft.revision) || input.draft.revision < 0 || input.draft.revision >= Number.MAX_SAFE_INTEGER
        || typeof input.draft.scope !== 'string' || !input.draft.scope.length || input.draft.scope.length > 200)) reject('E_INPUT', 'Invalid draft reference.');
      const record = validateRecord(input.lexicon, input.payload);
      const args = { author, intent: input.intent, audience: input.audience, parent: input.parent ?? null, ...record, draftDevice: input.draft?.device ?? null, draftRevision: input.draft?.revision ?? null, draftScope: input.draft?.scope ?? null };
      // Each HTTP attempt rechecks permissions/content in the mutation instead
      // of replaying a stale service receipt. (author,intent) deduplicates rows.
      const response = await fetcher(`${snapbackOrigin}/m/commitStructuredPost`, {
        method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${serviceToken}` },
        body: JSON.stringify({ id: intentId(), args }), signal: AbortSignal.timeout(15000),
      });
      const result = await response.json();
      if (!response.ok || result.denied || result.state === 'failed') {
        const failure = result.denied ?? result.why ?? {};
        reject(failure.code ?? 'E_BACKEND', 'The post could not be committed.', response.status >= 500 ? 503 : 409);
      }
      if (!result.result) reject('E_UNAVAILABLE', 'Outcome unavailable. Retry this same post intent.', 503);
      return send(res, 200, { ...result, result: postEnvelope(result.result) });
    } catch (error) {
      if (error.recordSafe || ['INVALID_PAYLOAD', 'UNKNOWN_LEXICON', 'LEXICON_CHANGED'].includes(error.code))
        return send(res, error.status ?? 400, { denied: { code: error.code, message: error.message } });
      if (error.jeraSafe) return send(res, error.status, { denied: { code: error.status === 401 ? 'E_AUTH' : 'E_UNAVAILABLE', message: error.message } });
      // Ambiguous transport failures retain the original logical post intent.
      // Never echo payloads, tokens or raw upstream errors.
      return send(res, 503, { denied: { code: 'E_UNAVAILABLE', message: 'Outcome unavailable. Retry this same post intent.' } });
    }
  };
}
