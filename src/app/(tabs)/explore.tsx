import { router, useLocalSearchParams } from "expo-router";
import { FlatList, Pressable, View } from "react-native";
import { Field } from "../../dao/reading";
import { Page } from "../../components/Page";
import { PostCard } from "../../components/PostCard";
import {
  Chip,
  EmptyState,
  Icon,
  IconButton,
  ScreenHeader,
  Type,
} from "../../components/ui";
import { presentation, searchPosts } from "../../lib/records";
import { usePosts } from "../../lib/storage";
import { useColors } from "../../theme";
import { radius, spacing } from "../../theme/foundation.gen";

export default function Explore() {
  const c = useColors();
  const { posts } = usePosts();
  const { q = "" } = useLocalSearchParams<{ q?: string }>();
  const query = q;
  const setQuery = (value: string) => router.setParams({ q: value });
  const topics = [...new Set(posts.flatMap((post) => presentation(post).tags))];
  return (
    <Page>
      <ScreenHeader
        title="Explore"
        subtitle="Follow a word. See where it leads."
      />
      <View style={{ padding: spacing.xxl, gap: spacing.lg }}>
        <Field
          accessibilityLabel="Search posts"
          placeholder="Search words, people, or topics"
          value={query}
          onChangeText={setQuery}
          leading={<Icon name="search" />}
          trailing={
            query !== "" ? (
              <IconButton
                icon="x"
                label="Clear search"
                onPress={() => setQuery("")}
              />
            ) : undefined
          }
        />
        {!query && (
          <>
            <Type variant="meta" muted>
              IN THIS SPACE
            </Type>
            <View
              style={{
                flexDirection: "row",
                gap: spacing.sm,
                flexWrap: "wrap",
              }}
            >
              {topics.map((tag) => (
                <Chip key={tag} label={tag} onPress={() => setQuery(tag)} />
              ))}
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push("/playground")}
              style={({ pressed }) => ({
                borderRadius: radius.lg,
                borderWidth: 1,
                borderColor: c.bdCard,
                backgroundColor: pressed ? c.bgSolidCardPressed : c.bgSolidCard,
                padding: spacing.lg,
                flexDirection: "row",
                alignItems: "center",
                gap: spacing.md,
              })}
            >
              <Icon name="sliders" />
              <View style={{ flex: 1 }}>
                <Type>Record playground</Type>
                <Type variant="label" muted>
                  Try a different kind of post.
                </Type>
              </View>
              <Icon name="arrow-up-right" />
            </Pressable>
          </>
        )}
      </View>
      <FlatList
        data={searchPosts(posts, query)}
        keyExtractor={(post) => post.id}
        renderItem={({ item }) => <PostCard post={item} />}
        ListEmptyComponent={
          <EmptyState
            icon="search"
            title="Nothing here yet"
            description="Try another word, person, or topic."
          />
        }
      />
    </Page>
  );
}
