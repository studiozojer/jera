import { randomBytes } from 'node:crypto';

export function intentId() {
  let value = BigInt(`0x${randomBytes(16).toString('hex')}`);
  const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  let id = '';
  for (let i = 0; i < 26; i++) { id = alphabet[Number(value & 31n)] + id; value >>= 5n; }
  return id;
}

export class JeraClient {
  constructor(origin, token) {
    const url = new URL(origin);
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname))) {
      throw new Error('Use HTTPS, or HTTP on loopback for development.');
    }
    this.origin = url.origin;
    this.token = token;
  }
  async request(path, body) {
    const response = await fetch(`${this.origin}${path}`, {
      method: 'POST', headers: { 'content-type': 'application/json', ...(this.token ? { authorization: `Bearer ${this.token}` } : {}) },
      body: JSON.stringify(body), signal: AbortSignal.timeout(30_000),
    });
    const result = await response.json();
    if (!response.ok || result.denied || result.state === 'failed') {
      const refusal = result.denied ?? result.why ?? result;
      const error = new Error(refusal.message ?? `HTTP ${response.status}`);
      error.code = refusal.code ?? `HTTP_${response.status}`;
      throw error;
    }
    return result;
  }
  query(name, args = {}) { return this.request(`/q/${encodeURIComponent(name)}`, { args }); }
  mutate(name, args, id = intentId()) { return this.request(`/m/${encodeURIComponent(name)}`, { id, args }); }
}
