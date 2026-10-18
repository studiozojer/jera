import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  presentation,
  readPosts,
  textRecord,
  validateRecord,
  type Post,
  type RecordValue,
} from './records';

export type { Post } from './records';
const samples: Post[] = [
  {
    id: 'sample-1',
    author: 'Rowan',
    text: 'A little less perfect, a little more present.\n\nLeaving some room for the things I haven’t figured out yet. :virgo:',
    createdAt: '2026-10-17T14:00:00Z',
    sample: true,
  },
  {
    id: 'sample-2',
    author: 'Mira',
    text: 'What changes when we leave a little space for a thought to grow?',
    createdAt: '2026-10-17T13:00:00Z',
    sample: true,
    record: {
      $type: 'studio.zojer.jera.note',
      title: 'Room for the unfinished',
      body: 'What changes when we leave a little space for a thought to grow?',
      topics: ['practice', 'attention'],
    },
  },
  {
    id: 'sample-3',
    author: 'Jules',
    text: 'The best conversations feel like taking a walk together. No destination required.',
    createdAt: '2026-10-17T12:00:00Z',
    sample: true,
  },
  {
    id: 'sample-4',
    author: 'Noor',
    text: '♓︎ A thought arrived halfway through a walk. I’m leaving it here before it turns into something else.',
    createdAt: '2026-10-17T11:00:00Z',
    sample: true,
  },
];
const POSTS_KEY = 'astrofeed.posts.v1';
const DRAFT_KEY = 'astrofeed.draft.v1';
const SAVED_KEY = 'jera.saved.v1';
let draftWrites: Promise<void> = Promise.resolve();
export function saveDraft(text: string) {
  const write = draftWrites
    .catch(() => {})
    .then(() => AsyncStorage.setItem(DRAFT_KEY, text));
  draftWrites = write;
  return write;
}
export async function loadDraft() {
  await draftWrites.catch(() => {});
  return (await AsyncStorage.getItem(DRAFT_KEY)) ?? '';
}

type Store = {
  posts: Post[];
  saved: string[];
  ready: boolean;
  error: string | null;
  addPost: (text: string) => Promise<void>;
  addRecord: (record: RecordValue) => Promise<void>;
  toggleSaved: (id: string) => Promise<void>;
};
const Context = createContext<Store | null>(null);
export function PostProvider({ children }: { children: ReactNode }) {
  const [posts, setPosts] = useState<Post[]>(samples);
  const current = useRef(posts);
  const writes = useRef<Promise<void>>(Promise.resolve());
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string[]>([]);
  const savedRef = useRef<string[]>([]);
  const savedWrites = useRef<Promise<void>>(Promise.resolve());
  useEffect(() => {
    let active = true;
    Promise.all([
      AsyncStorage.getItem(POSTS_KEY),
      AsyncStorage.getItem(SAVED_KEY),
    ])
      .then(([raw, savedRaw]) => {
        if (!active) return;
        const bookmarks: unknown =
          savedRaw === null ? [] : JSON.parse(savedRaw);
        if (
          !Array.isArray(bookmarks) ||
          bookmarks.some((id) => typeof id !== 'string')
        )
          throw new Error('Invalid saved bookmarks');
        current.current = [...readPosts(raw), ...samples];
        setPosts(current.current);
        savedRef.current = bookmarks;
        setSaved(bookmarks);
      })
      .catch(() => {
        if (active)
          setError(
            'Saved posts could not be loaded. Restart before adding a post.',
          );
      })
      .finally(() => {
        if (active) setReady(true);
      });
    return () => {
      active = false;
    };
  }, []);

  function addRecord(value: RecordValue) {
    if (!ready || error)
      return Promise.reject(new Error('Storage unavailable'));
    const record = validateRecord(JSON.parse(JSON.stringify(value)));
    const write = writes.current
      .catch(() => {})
      .then(async () => {
        const post: Post = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          author: 'You',
          text: '',
          record,
          createdAt: new Date().toISOString(),
        };
        post.text = presentation(post).text;
        const next = [post, ...current.current];
        await AsyncStorage.setItem(
          POSTS_KEY,
          JSON.stringify(next.filter((p) => !p.sample)),
        );
        current.current = next;
        setPosts(next);
      });
    writes.current = write;
    return write;
  }
  function addPost(text: string) {
    return addRecord(textRecord(text));
  }
  function toggleSaved(id: string) {
    if (!ready || error)
      return Promise.reject(new Error('Storage unavailable'));
    const write = savedWrites.current
      .catch(() => {})
      .then(async () => {
        const next = savedRef.current.includes(id)
          ? savedRef.current.filter((item) => item !== id)
          : [...savedRef.current, id];
        await AsyncStorage.setItem(SAVED_KEY, JSON.stringify(next));
        savedRef.current = next;
        setSaved(next);
      });
    savedWrites.current = write;
    return write;
  }
  return (
    <Context.Provider
      value={{ posts, saved, ready, error, addPost, addRecord, toggleSaved }}
    >
      {children}
    </Context.Provider>
  );
}
export function usePosts() {
  const store = useContext(Context);
  if (!store) throw new Error('PostProvider required');
  return store;
}
