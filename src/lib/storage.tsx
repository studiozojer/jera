import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

export type Post = { id: string; author: string; text: string; createdAt: string; sample?: boolean };
const samples: Post[] = [
  { id: 'sample-1', author: 'Rowan', text: 'A little less perfect, a little more present. :virgo:', createdAt: '2026-10-07T14:00:00Z', sample: true },
  { id: 'sample-2', author: 'Mira', text: '♍︎ Making room for the unfinished things today.', createdAt: '2026-10-07T13:00:00Z', sample: true },
  { id: 'sample-3', author: 'Jules', text: '♍ A good day to notice what is already working.', createdAt: '2026-10-07T12:00:00Z', sample: true },
  { id: 'sample-4', author: 'Noor', text: '♓︎ A thought arrived halfway through a walk. I’m leaving it here.', createdAt: '2026-10-07T11:00:00Z', sample: true },
];
const POSTS_KEY = 'astrofeed.posts.v1';
const DRAFT_KEY = 'astrofeed.draft.v1';
let draftWrites: Promise<void> = Promise.resolve();
export function saveDraft(text: string) {
  const write = draftWrites.catch(() => {}).then(() => AsyncStorage.setItem(DRAFT_KEY, text));
  draftWrites = write;
  return write;
}
export async function loadDraft() {
  await draftWrites.catch(() => {});
  return (await AsyncStorage.getItem(DRAFT_KEY)) ?? '';
}

type Store = { posts: Post[]; ready: boolean; error: string | null; addPost: (text: string) => Promise<void> };
const Context = createContext<Store | null>(null);
export function PostProvider({ children }: { children: ReactNode }) {
  const [posts, setPosts] = useState<Post[]>(samples);
  const current = useRef(posts);
  const writes = useRef<Promise<void>>(Promise.resolve());
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(POSTS_KEY).then((raw) => {
      if (!active) return;
      if (raw) {
        const saved: unknown = JSON.parse(raw);
        if (!Array.isArray(saved) || saved.some((p) => !p || typeof p.text !== 'string' || typeof p.id !== 'string' || typeof p.author !== 'string' || typeof p.createdAt !== 'string')) throw new Error('Invalid saved posts');
        current.current = [...saved, ...samples];
        setPosts(current.current);
      }
    }).catch(() => { if (active) setError('Saved posts could not be loaded. Restart before adding a post.'); })
      .finally(() => { if (active) setReady(true); });
    return () => { active = false; };
  }, []);

  function addPost(text: string) {
    if (!ready || error) return Promise.reject(new Error('Storage unavailable'));
    const write = writes.current.catch(() => {}).then(async () => {
      const post: Post = { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, author: 'You', text, createdAt: new Date().toISOString() };
      const next = [post, ...current.current];
      await AsyncStorage.setItem(POSTS_KEY, JSON.stringify(next.filter((p) => !p.sample)));
      current.current = next;
      setPosts(next);
    });
    writes.current = write;
    return write;
  }
  return <Context.Provider value={{ posts, ready, error, addPost }}>{children}</Context.Provider>;
}
export function usePosts() {
  const store = useContext(Context);
  if (!store) throw new Error('PostProvider required');
  return store;
}
