import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { presentation, type Post } from '../lib/records';
import { usePosts } from '../lib/storage';
import { useColors } from '../theme';
import { spacing } from '../theme/foundation.gen';
import { Avatar, Chip, IconButton, Notice, Type } from './ui';

export function PostCard({
  post,
  detail = false,
  preview = false,
}: {
  post: Post;
  detail?: boolean;
  preview?: boolean;
}) {
  const c = useColors();
  const { saved, toggleSaved } = usePosts();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const p = presentation(post);
  const isSaved = saved.includes(post.id);
  const date = new Date(post.createdAt);
  const dateLabel = Number.isNaN(date.getTime())
    ? 'Undated'
    : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const open = () =>
    router.push({ pathname: '/post/[id]', params: { id: post.id } });
  return (
    <View
      style={{
        padding: spacing.xxl,
        paddingBottom: spacing.md,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderColor: c.bdPrimary,
        gap: spacing.md,
      }}
    >
      <View
        style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'center' }}
      >
        <Avatar name={post.author} />
        <View style={{ flex: 1 }}>
          <Type>{post.author}</Type>
          <Type variant="meta" muted>
            {post.sample ? 'sample' : 'on this device'} · {dateLabel}
          </Type>
        </View>
        {p.label !== 'Post' && <Chip label={p.label} />}
      </View>
      <Pressable
        onPress={preview || detail ? undefined : open}
        disabled={preview || detail}
        accessibilityRole={preview || detail ? undefined : 'button'}
        accessibilityLabel={
          preview || detail ? undefined : `Open post by ${post.author}`
        }
        style={{ gap: spacing.sm }}
      >
        {p.title && <Type variant="heading">{p.title}</Type>}
        <Type
          selectable={detail || preview}
          style={{
            color: c.txBody,
            ...(detail ? { fontSize: 20, lineHeight: 30 } : {}),
          }}
        >
          {p.text}
        </Type>
      </Pressable>
      {p.tags.length > 0 && (
        <View
          style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}
        >
          {p.tags.map((tag) => (
            <Chip
              key={tag}
              label={tag}
              onPress={
                preview
                  ? undefined
                  : () =>
                      router.push({ pathname: '/explore', params: { q: tag } })
              }
            />
          ))}
        </View>
      )}
      {!preview && (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Pressable
            onPress={detail ? undefined : open}
            disabled={detail}
            accessibilityRole={detail ? undefined : 'button'}
            style={{ minHeight: 44, justifyContent: 'center' }}
          >
            <Type variant="label" muted>
              {detail ? p.label : 'View post'}
              {!p.supported ? ' · unrecognized type' : ''}
            </Type>
          </Pressable>
          <IconButton
            icon="bookmark"
            label={isSaved ? 'Unsave post' : 'Save post'}
            active={isSaved}
            disabled={busy}
            onPress={() => {
              setBusy(true);
              setError(null);
              void toggleSaved(post.id)
                .catch(() =>
                  setError('Could not update saved posts. Try again.'),
                )
                .finally(() => setBusy(false));
            }}
          />
        </View>
      )}
      {error && <Notice>{error}</Notice>}
    </View>
  );
}
