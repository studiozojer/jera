import { allRows, type PostRecord, type Request } from './social-data.ts';
import { selectPosts, type View } from './view-context.ts';

type Parent = Pick<PostRecord, 'author' | 'visibility'>;
type Audience = { name: string; kind: string };
type FeedRow = PostRecord & { parentInfo: Parent | null; audienceInfo: Audience | null; replyCount: number | null };
type TimelineRow = { post: PostRecord; feed: boolean; parent: Parent | null; audience: Audience | null; publicReplies: number; readableReplies: number };

export async function readTimeline(request: Request, view: View, cursor: string, focus: string): Promise<{rows: TimelineRow[]; next: string; partial: boolean}> {
  if (!focus) {
    const visibility = view.select.visibility;
    // The bounded server projection implements precisely these two current view definitions.
    if (view.sources.length !== 1 || view.sources[0] !== 'network' || (visibility !== 'public' && visibility !== 'private') || view.select.lexicons.length || view.presentation.order !== 'newest-first' || view.presentation.group !== 'thread') {
      throw new Error('This feed definition needs a matching page query.');
    }
    const page = await request('q', 'feedRoots', {visibility, ...(cursor ? {c: cursor} : {})});
    if (!Array.isArray(page.data)) throw new Error('Could not read the feed page.');
    const rows = (page.data as FeedRow[]).map(post => ({
      post, feed: true, parent: post.parentInfo, audience: post.audienceInfo,
      publicReplies: visibility === 'public' ? post.replyCount ?? -1 : 0, readableReplies: post.replyCount ?? -1,
    }));
    return {rows, next: page.next ?? '', partial: page.complete === false && !page.next};
  }

  // Thread counts are computed from all readable descendants. A metered response
  // cannot establish either an empty conversation or an exact reply count.
  const threadRequest: Request = async (...args) => {
    const result = await request(...args);
    if (result.complete === false && !result.next) throw new Error('The conversation read was incomplete.');
    return result;
  };
  const focused: PostRecord | null = (await threadRequest('q', 'postById', {id: focus})).data;
  if (!focused) return {rows: [], next: '', partial: false};
  const rootId = focused.root || focused.id;
  const [root, descendants, audiences] = await Promise.all([
    focused.id === rootId ? focused : threadRequest('q', 'postById', {id: rootId}).then(result => result.data as PostRecord | null),
    allRows(threadRequest, 'threadPosts', {root: rootId}),
    allRows(threadRequest, 'availableAudiences'),
  ]);
  const authorized: PostRecord[] = root ? [root, ...descendants] : descendants;
  const {records, feed} = selectPosts(view, authorized);
  const byId = new Map(records.map(p => [p.id, p]));
  const byAudience = new Map(audiences.map(a => [a.id, a]));
  const publicCounts = new Map<string, number>(), readableCounts = new Map<string, number>();
  for (const post of records) {
    if (!post.parent || post.deleted) continue;
    readableCounts.set(post.parent, (readableCounts.get(post.parent) ?? 0) + 1);
    if (post.visibility === 'public') publicCounts.set(post.parent, (publicCounts.get(post.parent) ?? 0) + 1);
  }
  const rows = records.map(post => ({
    post, feed: feed.has(post.id), parent: byId.get(post.parent ?? '') ?? null, audience: byAudience.get(post.audience ?? '') ?? null,
    publicReplies: publicCounts.get(post.id) ?? 0, readableReplies: readableCounts.get(post.id) ?? 0,
  }));
  return {rows, next: '', partial: false};
}
