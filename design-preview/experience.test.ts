import { test, expect } from 'bun:test';
import { createExperienceStore, type ExperienceChange, type ExperienceMode } from './experience.ts';

test('current snapshot, ordered transitions and same-mode no-op', () => {
  const store = createExperienceStore();
  const events: ExperienceChange[] = [];
  store.subscribe(event => events.push(event));
  expect(store.getSnapshot()).toEqual({ mode: 'public', revision: 0 });
  store.change('private', 10);
  store.change('private', 11);
  store.change('public', 12);
  expect(events).toEqual([
    { type: 'jera.experience.changed', version: 1, previousMode: 'public', mode: 'private', revision: 1, origin: 'composer', at: 10 },
    { type: 'jera.experience.changed', version: 1, previousMode: 'private', mode: 'public', revision: 2, origin: 'composer', at: 12 },
  ]);
  expect(store.getLastChange()).toEqual(events[1]);
  expect(store.getSnapshot()).toEqual({ mode: 'public', revision: 2 });
  expect(Object.isFrozen(store.getSnapshot())).toBe(true);
  expect(Object.isFrozen(events[0])).toBe(true);
});

test('late readers see current context and unsubscription ends notifications', () => {
  const store = createExperienceStore();
  store.change('private', 1);
  const late: ExperienceChange[] = [];
  const unsubscribe = store.subscribe(event => late.push(event));
  expect(store.getSnapshot()).toEqual({ mode: 'private', revision: 1 });
  store.change('public', 2);
  unsubscribe();
  store.change('private', 3);
  expect(late.map(event => event.revision)).toEqual([2]);
});

test('a reacting subscriber cannot reverse event order for other observers', () => {
  const store = createExperienceStore();
  const revisions: number[] = [];
  store.subscribe(event => { if (event.mode === 'private') store.change('public', 2); });
  store.subscribe(event => revisions.push(event.revision));
  store.change('private', 1);
  expect(revisions).toEqual([1, 2]);
  expect(store.getSnapshot()).toEqual({ mode: 'public', revision: 2 });
});

test('a failed observer does not roll back the selection or block peers', () => {
  const store = createExperienceStore();
  const seen: string[] = [];
  store.subscribe(() => { throw new Error('observer failure'); });
  store.subscribe(event => seen.push(event.mode));
  expect(store.change('private', 1)).toEqual({ mode: 'private', revision: 1 });
  expect(seen).toEqual(['private']);
  expect(store.getObserverFailures()).toEqual([{ revision: 1 }]);
});

test('invalid modes and timestamps do not change context', () => {
  const store = createExperienceStore();
  expect(() => store.change('unexpected' as ExperienceMode, 1)).toThrow();
  expect(() => store.change('private', NaN)).toThrow();
  expect(() => createExperienceStore('unexpected' as ExperienceMode)).toThrow();
  expect(store.getSnapshot()).toEqual({ mode: 'public', revision: 0 });
  expect(store.getLastChange()).toBeNull();
});
