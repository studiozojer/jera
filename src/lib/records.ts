import { familiesIn, symbols } from './symbols.ts';

export type RecordValue = { $type: string; [key: string]: unknown };
export type RecordPresentation = {
  text: string;
  title?: string;
  label: string;
  tags: string[];
  supported: boolean;
};
export type RecordAdapter = {
  type: string;
  label: string;
  description: string;
  example: RecordValue;
  project: (record: RecordValue) => Omit<RecordPresentation, 'supported'>;
};
function requiredText(record: RecordValue, key: string) {
  if (typeof record[key] !== 'string' || !record[key].trim())
    throw new Error(`${key} must be a non-empty string.`);
  return record[key];
}
function symbolLabels(text: string) {
  return familiesIn(text).map((id) => symbols.find((s) => s.id === id)!.name);
}

// Add a projection here to teach every feed/search/detail surface a new record type.
// These validate the UI's required fields, not the complete network lexicon.
export const recordAdapters: RecordAdapter[] = [
  {
    type: 'app.bsky.feed.post',
    label: 'Post',
    description: 'A familiar text post.',
    example: {
      $type: 'app.bsky.feed.post',
      text: 'A small thought, left here for someone else to find.',
      createdAt: '2026-10-17T12:00:00.000Z',
    },
    project(record) {
      const text = requiredText(record, 'text');
      return { text, label: 'Post', tags: symbolLabels(text) };
    },
  },
  {
    type: 'studio.zojer.jera.note',
    label: 'Note',
    description: 'An experimental titled note with topics.',
    example: {
      $type: 'studio.zojer.jera.note',
      title: 'Room for the unfinished',
      body: 'What changes when we leave a little space for a thought to grow?',
      topics: ['practice', 'attention'],
      createdAt: '2026-10-17T12:00:00.000Z',
    },
    project(record) {
      const title = requiredText(record, 'title');
      const text = requiredText(record, 'body');
      if (
        record.topics !== undefined &&
        (!Array.isArray(record.topics) ||
          record.topics.some((t) => typeof t !== 'string'))
      )
        throw new Error('topics must be an array of strings.');
      return {
        title,
        text,
        label: 'Note',
        tags: [
          ...new Set([
            ...((record.topics as string[] | undefined) ?? []),
            ...symbolLabels(text),
          ]),
        ],
      };
    },
  },
];

export function parseRecord(value: unknown): RecordValue {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    typeof (value as RecordValue).$type !== 'string' ||
    !(value as RecordValue).$type.trim()
  )
    throw new Error('A record must be a JSON object with a non-empty $type.');
  return value as RecordValue;
}
export function projectRecord(record: RecordValue): RecordPresentation {
  const adapter = recordAdapters.find((item) => item.type === record.$type);
  if (adapter) return { ...adapter.project(record), supported: true };
  return {
    label: 'Custom record',
    text: 'This record has no display adapter yet. Its original fields are available in the post view.',
    tags: [],
    supported: false,
  };
}
export function validateRecord(value: unknown) {
  const record = parseRecord(value);
  projectRecord(record);
  return record;
}
export function textRecord(
  text: string,
  createdAt = new Date().toISOString(),
): RecordValue {
  return { $type: 'app.bsky.feed.post', text, createdAt };
}

export type Post = {
  id: string;
  author: string;
  text: string;
  createdAt: string;
  sample?: boolean;
  record?: RecordValue;
};
export function postRecord(post: Post) {
  return post.record ?? textRecord(post.text, post.createdAt);
}
export function presentation(post: Post) {
  return projectRecord(postRecord(post));
}
export function readPosts(raw: string | null): Post[] {
  if (raw === null) return [];
  const value: unknown = JSON.parse(raw);
  if (!Array.isArray(value)) throw new Error('Saved posts must be an array.');
  for (const post of value) {
    if (
      !post ||
      typeof post.id !== 'string' ||
      typeof post.author !== 'string' ||
      typeof post.text !== 'string' ||
      typeof post.createdAt !== 'string'
    )
      throw new Error('Invalid saved post.');
    if (post.record !== undefined) validateRecord(post.record);
  }
  return value;
}
export function searchPosts(posts: Post[], query: string) {
  const needle = query.trim().toLocaleLowerCase();
  return posts.filter((post) => {
    const p = presentation(post);
    return [post.author, p.title ?? '', p.text, ...p.tags]
      .join(' ')
      .toLocaleLowerCase()
      .includes(needle);
  });
}
