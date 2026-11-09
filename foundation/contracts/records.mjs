// Snapback stores validated payloads as canonical JSON text. This projection is
// portable between the app, CLI and gateway; existing body-based readers work
// without parsing structured content. Unknown lexicons retain their exact data.
export function postEnvelope(row) {
  if (row === null) return null;
  const { payloadJson, ...envelope } = row;
  const payload = payloadJson == null ? null : JSON.parse(payloadJson);
  if (row.lexicon && !row.deleted && (payload === null || typeof payload !== 'object' || Array.isArray(payload)))
    throw new Error('Structured post payload is unavailable or malformed.');
  return { ...envelope, payload };
}
