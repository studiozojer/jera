import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Page } from '../../components/Page';
import { Button } from '../../components/Button';
import { PostCard } from '../../components/PostCard';
import { EmptyState, ScreenHeader, Type } from '../../components/ui';
import { postRecord } from '../../lib/records';
import { usePosts } from '../../lib/storage';
import { spacing } from '../../theme/foundation.gen';

export default function PostDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { posts } = usePosts();
  const post = posts.find((item) => item.id === id);
  const [showRecord, setShowRecord] = useState(false);
  return (
    <Page>
      <ScreenHeader title="Post" back />
      <ScrollView>
        {post ? (
          <>
            <PostCard post={post} detail />
            <View style={{ padding: spacing.xxl, gap: spacing.md }}>
              <Button
                quiet
                label={showRecord ? 'Hide record' : 'View record'}
                onPress={() => setShowRecord((shown) => !shown)}
              />
              {showRecord && (
                <Type variant="meta" selectable>
                  {JSON.stringify(postRecord(post), null, 2)}
                </Type>
              )}
            </View>
          </>
        ) : (
          <EmptyState
            icon="file-text"
            title="Post not found"
            description="This post isn’t stored on this device."
          />
        )}
      </ScrollView>
    </Page>
  );
}
