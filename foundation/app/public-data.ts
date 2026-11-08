import type { Request } from './social-data.ts';

export type PublicMedia = { src: string; alt: string };
export type IndexedPost = { uri: string; body: string; at: number; parent: string; root: string; record: string };
// Preserve the protocol's edges. A missing parent is a context gap, never a
// reason to silently attach a continuation directly to the root.
export function publicParentGaps(rows: IndexedPost[]) {
  const ids = new Set(rows.map(row => row.uri));
  return new Set(rows.filter(row => row.parent && !ids.has(row.parent)).map(row => row.uri));
}
export function blueskyUrl(uri: string): string {
  const parts = /^at:\/\/(did:[^/]+)\/app\.bsky\.feed\.post\/([^/]+)$/.exec(uri);
  return parts ? `https://bsky.app/profile/${encodeURIComponent(parts[1])}/post/${encodeURIComponent(parts[2])}` : '';
}
const httpsUrl = (value: unknown) => {
  if (typeof value !== 'string') return '';
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url.href : ''; } catch { return ''; }
};
// Source bytes remain in the index. This bounded reader supplies images and a
// useful external destination for embeds that the first reader doesn't play.
export function publicPresentation(row: IndexedPost, did: string) {
  const value = JSON.parse(row.record), embed = value.embed;
  const media = embed?.$type === 'app.bsky.embed.recordWithMedia' ? embed.media : embed;
  const images: PublicMedia[] = [];
  if (media?.$type === 'app.bsky.embed.images' && Array.isArray(media.images)) {
    for (const image of media.images.slice(0, 4)) {
      const cid = image.image?.ref?.$link;
      if (typeof cid === 'string' && /^b[a-z2-7]{8,255}$/.test(cid)) images.push({
        src: `https://cdn.bsky.app/img/feed_fullsize/plain/${encodeURIComponent(did)}/${cid}@jpeg`,
        alt: typeof image.alt === 'string' ? image.alt : '',
      });
    }
  }
  const external = media?.$type === 'app.bsky.embed.external' ? media.external : null;
  const embedUrl = httpsUrl(external?.uri);
  const embedLabel = embedUrl ? (typeof external.title === 'string' && external.title.trim() ? external.title : embedUrl) :
    media?.$type === 'app.bsky.embed.video' ? 'Watch video on Bluesky' :
    embed?.$type === 'app.bsky.embed.record' || embed?.$type === 'app.bsky.embed.recordWithMedia' ? 'View quoted post on Bluesky' : '';
  return { images, embedUrl: embedUrl || (embedLabel ? blueskyUrl(row.uri) : ''), embedLabel, sourceUrl: blueskyUrl(row.uri) };
}
export async function loadPublicIndex(request: Request, limit: number, focus: string) {
  const requested = Math.max(50, Math.min(20000, Math.floor(limit / 50) * 50));
  // Pin every page to one published generation. A worker completing a newer
  // snapshot mid-read restarts the read once, rather than mixing generations.
  for (let attempt = 0; attempt < 2; attempt++) {
    let account = (await request('q', 'publicIndexStatus', {})).data;
    if (!account) account = (await request('m', 'ensurePublicIndex', {})).result;
    if (!account) throw new Error('Public index unavailable');
    if (!account.generation) return { rows: [] as IndexedPost[], roots: [] as string[], more: false, ready: false, state: account.state, syncedAt: 0 };
    const generation = account.generation, roots: IndexedPost[] = [], threads: IndexedPost[] = [];
    const readPages = async (operation: string, args: Record<string, unknown>, target: IndexedPost[], maximum: number) => {
      let c: string | null = null; const seen = new Set<string>();
      do {
        const page = await request('q', operation, { ...args, generation, ...(c ? { c } : {}) });
        if (!Array.isArray(page.data)) throw new Error('Unreadable public page');
        target.push(...page.data); c = page.next || null;
        if (c && seen.has(c)) throw new Error('Repeated public cursor');
        if (c) seen.add(c);
      } while (c && target.length < maximum);
      return !!c;
    };
    try {
      const more = await readPages('publicIndexRoots', {}, roots, requested);
      if (blueskyUrl(focus)) {
        const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(focus)));
        const key = [...digest].map(x => x.toString(16).padStart(2, '0')).join('');
        try { await readPages('publicIndexThread', { key }, threads, 20000); }
        catch (error) { if ((error as { code?: string }).code !== 'POST_UNAVAILABLE') throw error; }
      }
      const current = (await request('q', 'publicIndexStatus', {})).data;
      if (current?.generation !== generation) continue;
      return { rows: [...new Map([...roots, ...threads].map(row => [row.uri, row])).values()], roots: roots.map(r => r.uri), more,
        ready: true, state: current.state, syncedAt: current.syncedAt || 0 };
    } catch (error) {
      if ((error as { code?: string }).code !== 'INDEX_CHANGED') throw error;
    }
  }
  throw new Error('Public index changed while loading. Try again.');
}
