// Local formatting check only. OAuth still resolves the account and proves control.
// Handle grammar: https://atproto.com/specs/handle
const handlePattern = /^([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/;
const isHandle = (value: string) => value.length <= 253 && handlePattern.test(value) && value.toLowerCase() !== 'handle.invalid';

export function parseLoginInput(input: string) {
  const value = input.trim().replace(/^@/, '');
  const did = value.startsWith('did:');
  const valid = did
    ? /^did:plc:[a-z2-7]{24}$/.test(value) || (value.startsWith('did:web:') && isHandle(value.slice(8)))
    : isHandle(value);
  return { input, value: did ? value : value.toLowerCase(), valid };
}
