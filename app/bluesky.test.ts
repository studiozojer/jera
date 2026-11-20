import { expect, test } from 'bun:test';
import { measureBlueskyPost } from './bluesky.ts';

test('Bluesky counts visible characters and also enforces the record byte limit', () => {
  expect(measureBlueskyPost('🇬🇧👩🏽‍💻e\u0301').count).toBe(3);
  expect(measureBlueskyPost('a'.repeat(300)).valid).toBe(true);
  expect(measureBlueskyPost('a'.repeat(301)).valid).toBe(false);
  const family = '👨‍👩‍👧‍👦';
  expect(measureBlueskyPost(family.repeat(120))).toMatchObject({ count: 120, bytes: 3000, valid: true });
  expect(measureBlueskyPost(family.repeat(121))).toMatchObject({ count: 121, bytes: 3025, valid: false });
});
