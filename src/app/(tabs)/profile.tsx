import { router } from 'expo-router';
import { FlatList, View } from 'react-native';
import { Button } from '../../components/Button';
import { Page } from '../../components/Page';
import { PostCard } from '../../components/PostCard';
import { Avatar, EmptyState, ScreenHeader, Type } from '../../components/ui';
import { usePosts } from '../../lib/storage';
import { spacing } from '../../theme/foundation.gen';

export default function Profile() {
  const { posts, saved } = usePosts();
  const mine = posts.filter((post) => post.author === 'You');
  return (
    <Page>
      <ScreenHeader
        title="Your space"
        action={
          <Button label="Write" onPress={() => router.push('/compose')} />
        }
      />
      <FlatList
        data={mine}
        keyExtractor={(post) => post.id}
        renderItem={({ item }) => <PostCard post={item} />}
        ListHeaderComponent={
          <View style={{ padding: spacing.xxl, gap: spacing.lg }}>
            <Avatar name="You" large />
            <View>
              <Type variant="title">You</Type>
              <Type variant="meta" muted>
                LOCAL PROFILE
              </Type>
            </View>
            <Type muted>
              A space to write, collect, and try things out. Your posts and
              saved collection live on this device.
            </Type>
            <View style={{ flexDirection: 'row', gap: spacing.xxl }}>
              <Type>
                {mine.length} <Type muted>posts</Type>
              </Type>
              <Type>
                {saved.length} <Type muted>saved</Type>
              </Type>
            </View>
            <Type variant="meta" muted>
              YOUR POSTS
            </Type>
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            icon="edit-3"
            title="Start with a thought"
            description="Your words will appear here as you add them."
          />
        }
      />
    </Page>
  );
}
