import { router, useLocalSearchParams } from 'expo-router';
import { ObserveInteractiveMarker } from 'expo-observe';
import { FlatList, Pressable, ScrollView, View } from 'react-native';
import { Button } from '../../components/Button';
import { Page } from '../../components/Page';
import { PostCard } from '../../components/PostCard';
import {
  Avatar,
  Chip,
  EmptyState,
  Icon,
  Notice,
  ScreenHeader,
  Type,
} from '../../components/ui';
import { postRecord, presentation, recordAdapters } from '../../lib/records';
import { usePosts } from '../../lib/storage';
import { useColors } from '../../theme';
import { spacing } from '../../theme/foundation.gen';

export default function Feed() {
  const c = useColors();
  const { posts, error } = usePosts();
  const {
    kind = '',
    family = '',
    draftClearFailed,
  } = useLocalSearchParams<{
    kind?: string;
    family?: string;
    draftClearFailed?: string;
  }>();
  const visible = posts.filter(
    (post) =>
      (kind !== 'mine' || post.author === 'You') &&
      (!kind || kind === 'mine' || postRecord(post).$type === kind) &&
      (!family ||
        presentation(post).tags.some(
          (tag) => tag.toLowerCase() === family.toLowerCase(),
        )),
  );
  return (
    <Page>
      <ObserveInteractiveMarker />
      <ScreenHeader
        title="Feed"
        subtitle="Thoughts, notes, and things in between."
        action={
          <Button
            label="Write"
            onPress={() => router.push('/compose')}
            disabled={!!error}
          />
        }
      />
      {draftClearFailed === '1' && (
        <Notice>
          Your post was added, but its saved draft could not be cleared.
        </Notice>
      )}
      <FlatList
        data={visible}
        keyExtractor={(p) => p.id}
        renderItem={({ item }) => <PostCard post={item} />}
        contentContainerStyle={{ paddingBottom: spacing.xxxl }}
        ListHeaderComponent={
          <>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Write a post"
              disabled={!!error}
              onPress={() => router.push('/compose')}
              style={({ pressed }) => ({
                padding: spacing.xxl,
                flexDirection: 'row',
                gap: spacing.md,
                alignItems: 'center',
                backgroundColor: pressed ? c.bgSecondary : 'transparent',
              })}
            >
              <Avatar name="You" />
              <Type muted style={{ flex: 1 }}>
                What’s on your mind?
              </Type>
              <Icon name="edit-3" color={c.icSecondary} />
            </Pressable>
            <View
              style={{
                paddingHorizontal: spacing.xxl,
                paddingBottom: spacing.lg,
                gap: spacing.sm,
              }}
            >
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: spacing.sm }}
              >
                {[
                  { id: '', label: 'All posts' },
                  { id: 'mine', label: 'Your posts' },
                  ...recordAdapters.map((adapter) => ({
                    id: adapter.type,
                    label: adapter.label,
                  })),
                ].map((item) => (
                  <Chip
                    key={item.id}
                    label={item.label}
                    selected={kind === item.id}
                    onPress={() => router.setParams({ kind: item.id })}
                  />
                ))}
                {!!family && (
                  <Chip
                    label={`${family} ×`}
                    selected
                    onPress={() => router.setParams({ family: '' })}
                  />
                )}
              </ScrollView>
              <Type variant="meta" muted>
                LOCAL SPACE · SAMPLE POSTS INCLUDED
              </Type>
            </View>
          </>
        }
        ListEmptyComponent={
          <EmptyState
            icon="feather"
            title="A little space to begin"
            description="Write a post or try a different view."
            action={
              <Button
                label="Write a post"
                onPress={() => router.push('/compose')}
              />
            }
          />
        }
      />
    </Page>
  );
}
