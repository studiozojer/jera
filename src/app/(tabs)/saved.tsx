import { FlatList } from 'react-native';
import { Page } from '../../components/Page';
import { PostCard } from '../../components/PostCard';
import { EmptyState, ScreenHeader } from '../../components/ui';
import { usePosts } from '../../lib/storage';

export default function Saved() {
  const { posts, saved } = usePosts();
  return (
    <Page>
      <ScreenHeader title="Saved" subtitle="Words worth coming back to." />
      <FlatList
        data={posts.filter((post) => saved.includes(post.id))}
        keyExtractor={(post) => post.id}
        renderItem={({ item }) => <PostCard post={item} />}
        ListEmptyComponent={
          <EmptyState
            icon="bookmark"
            title="Keep a thought close"
            description="Tap the bookmark on any post. You’ll find it here when you return."
          />
        }
      />
    </Page>
  );
}
