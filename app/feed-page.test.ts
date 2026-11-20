import {expect, test} from 'bun:test';
import {readTimeline} from './feed-page.ts';
import {selectedView} from './view-context.ts';
import type {Request} from './social-data.ts';

test('one feed request preserves sparse continuation, partial reads and unknown counts', async () => {
  const calls: unknown[] = [];
  const pages = [
    {data: [], complete: false, next: 'older'},
    {data: [{id: 'p', replyCount: null, parentInfo: {author: 'parent', visibility: 'public'}, audienceInfo: {name:'My circle',kind:'shared'}}], complete:false},
  ];
  const request: Request = async (kind, operation, args) => {
    calls.push([kind, operation, args]);
    return pages.shift();
  };
  const view = selectedView('private');
  const first = await readTimeline(request, view, '', '');
  expect(first.next).toBe('older');
  const older = await readTimeline(request, view, first.next, '');
  expect(older.partial).toBe(true);
  expect(older.rows[0].readableReplies).toBe(-1);
  expect(older.rows[0].parent?.author).toBe('parent');
  expect(older.rows[0].audience?.name).toBe('My circle');
  expect(calls).toEqual([['q','feedRoots',{visibility:'private'}], ['q','feedRoots',{visibility:'private',c:'older'}]]);
});

test('an unavailable focused post ends the lookup and a partial thread cannot produce counts', async () => {
  const view = selectedView('public');
  expect((await readTimeline(async (_kind, op) => {
    expect(op).toBe('postById');
    return {data:null,complete:true};
  }, view, '', 'unknown')).rows).toEqual([]);
  const request: Request = async (_kind, op) => {
    if (op === 'postById') return {data:{id:'root',root:null},complete:true};
    return {data:[],complete:op !== 'threadPosts'};
  };
  await expect(readTimeline(request, view, '', 'root')).rejects.toThrow('incomplete');
});
