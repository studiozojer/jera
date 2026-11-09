// App-local experience authority. These events describe context, never content.
// No network transport or permission enforcement is implied by this prototype.
export type ExperienceMode = 'private' | 'public';
export type ExperienceSnapshot = Readonly<{ mode: ExperienceMode; revision: number }>;
export type ExperienceChange = Readonly<{
  type: 'jera.experience.changed';
  version: 1;
  previousMode: ExperienceMode;
  mode: ExperienceMode;
  revision: number;
  origin: 'composer';
  at: number;
}>;
export type ExperienceListener = (event: ExperienceChange) => void;

export function isExperienceMode(value: unknown): value is ExperienceMode {
  return value === 'private' || value === 'public';
}

export function createExperienceStore(initial: ExperienceMode = 'public') {
  if (!isExperienceMode(initial)) throw new Error('Unknown experience mode');
  let snapshot: ExperienceSnapshot = Object.freeze({ mode: initial, revision: 0 });
  let latest: ExperienceChange | null = null;
  const listeners = new Set<ExperienceListener>();
  const queue: ExperienceChange[] = [];
  const observerFailures: { revision: number }[] = [];
  let notifying = false;
  return {
    getSnapshot: (): ExperienceSnapshot => snapshot,
    getLastChange: (): ExperienceChange | null => latest,
    getObserverFailures: () => observerFailures.slice(),
    subscribe(listener: ExperienceListener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    change(mode: ExperienceMode, at: number): ExperienceSnapshot {
      if (!isExperienceMode(mode) || !Number.isFinite(at)) throw new Error('Invalid experience change');
      if (mode === snapshot.mode) return snapshot;
      const previousMode = snapshot.mode;
      snapshot = Object.freeze({ mode, revision: snapshot.revision + 1 });
      latest = Object.freeze({ type: 'jera.experience.changed', version: 1, previousMode, mode, revision: snapshot.revision, origin: 'composer', at });
      queue.push(latest);
      // A subscriber may react with another change. Deliver revisions in order.
      if (!notifying) {
        notifying = true;
        try {
          while (queue.length) {
            const event = queue.shift()!;
            for (const listener of [...listeners]) {
              try { listener(event); }
              catch {
                // One observer cannot roll back the selected mode or block peers.
                // Retain bounded, content-free diagnostics for a future debug view.
                observerFailures.push({ revision: event.revision });
                if (observerFailures.length > 16) observerFailures.shift();
              }
            }
          }
        } finally { notifying = false; }
      }
      return snapshot;
    },
  };
}

const store = createExperienceStore();
// Other app sources can read current context and observe subsequent transitions.
export const getExperienceSnapshot = store.getSnapshot;
export const getLastExperienceChange = store.getLastChange;
export const subscribeExperience = store.subscribe;
// Route writes through the composer's app action, so navigation changes with mode.
export const setExperienceFromComposer = (mode: string, at: number) => {
  if (!isExperienceMode(mode)) throw new Error('Unknown experience mode');
  return store.change(mode, at);
};
