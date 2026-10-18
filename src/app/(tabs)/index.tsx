import { router, useLocalSearchParams } from "expo-router";
import { ObserveInteractiveMarker } from "expo-observe";
import { FlatList, ScrollView, View } from "react-native";
import { Button } from "../../components/Button";
import { Page } from "../../components/Page";
import { PostCard } from "../../components/PostCard";
import { EmptyState, Notice, ScreenHeader, Type } from "../../components/ui";
import { FilterChip } from "../../dao/reading";
import { postRecord, presentation, recordAdapters } from "../../lib/records";
import { usePosts } from "../../lib/storage";
import { useColors } from "../../theme";
import { spacing } from "../../theme/foundation.gen";

export default function Feed() {
  const c = useColors();
  const { posts, error } = usePosts();
  const {
    kind = "",
    family = "",
    draftClearFailed,
    layout,
  } = useLocalSearchParams<{
    kind?: string;
    family?: string;
    draftClearFailed?: string;
    layout?: string;
  }>();
  // Retained design comparison: /?layout=cards. Both variants use the same content and actions.
  const readingLayout = layout === "cards" ? "cards" : "stream";
  const visible = posts.filter(
    (post) =>
      (kind !== "mine" || post.author === "You") &&
      (!kind || kind === "mine" || postRecord(post).$type === kind) &&
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
        subtitle="On this device"
        action={
          <Button
            label="Write"
            onPress={() => router.push("/compose")}
            disabled={!!error}
          />
        }
      />
      {draftClearFailed === "1" && (
        <Notice>
          Your post was added, but its saved draft could not be cleared.
        </Notice>
      )}
      <View
        style={{
          borderBottomWidth: 1,
          borderColor: c.bdSecondary,
          paddingHorizontal: spacing.md,
        }}
      >
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: spacing.xxs }}
        >
          {[
            { id: "", label: "All posts" },
            { id: "mine", label: "Your posts" },
            ...recordAdapters.map((adapter) => ({
              id: adapter.type,
              label: adapter.label,
            })),
          ].map((item) => (
            <FilterChip
              key={item.id}
              label={item.label}
              selected={kind === item.id}
              onPress={() => router.setParams({ kind: item.id })}
            />
          ))}
        </ScrollView>
        {!!family && (
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              alignItems: "center",
              gap: spacing.sm,
            }}
          >
            <Type variant="label" muted>
              Filtered by
            </Type>
            <FilterChip
              label={`${family} ×`}
              selected
              onPress={() => router.setParams({ family: "" })}
            />
          </View>
        )}
      </View>
      <FlatList
        data={visible}
        keyExtractor={(p) => p.id}
        renderItem={({ item }) => (
          <PostCard post={item} layout={readingLayout} />
        )}
        contentContainerStyle={{
          paddingBottom: spacing.xxxl,
          paddingTop: readingLayout === "cards" ? spacing.lg : 0,
        }}
        ListEmptyComponent={
          <EmptyState
            icon="feather"
            title="A little space to begin"
            description="Write a post or try a different view."
            action={
              <Button
                label="Write a post"
                onPress={() => router.push("/compose")}
                disabled={!!error}
              />
            }
          />
        }
      />
    </Page>
  );
}
