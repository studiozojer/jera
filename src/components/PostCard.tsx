import { router } from "expo-router";
import { useState } from "react";
import { Pressable } from "react-native";
import { presentation, type Post } from "../lib/records";
import { usePosts } from "../lib/storage";
import { useColors } from "../theme";
import { spacing } from "../theme/foundation.gen";
import {
  AuthorRow,
  Badge,
  FilterChip,
  ReadingItem,
  Toolbar,
  type ReadingLayout,
} from "../dao/reading";
import { IconButton, Notice, Type } from "./ui";

export function PostCard({
  post,
  detail = false,
  preview = false,
  layout = "stream",
}: {
  post: Post;
  detail?: boolean;
  preview?: boolean;
  layout?: ReadingLayout;
}) {
  const c = useColors();
  const { saved, toggleSaved } = usePosts();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const p = presentation(post);
  const isSaved = saved.includes(post.id);
  const date = new Date(post.createdAt);
  const dateLabel = Number.isNaN(date.getTime())
    ? "Undated"
    : date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const open = () =>
    router.push({ pathname: "/post/[id]", params: { id: post.id } });
  return (
    <ReadingItem
      layout={layout}
      author={
        <AuthorRow
          name={post.author}
          metadata={`${dateLabel} · ${post.sample ? "Sample post" : "On this device"}`}
          trailing={p.label !== "Post" ? <Badge label={p.label} /> : undefined}
        />
      }
      footer={
        <Toolbar>
          {p.tags.map((tag) =>
            preview ? (
              <Badge key={tag} label={tag} />
            ) : (
              <FilterChip
                key={tag}
                label={tag}
                onPress={() =>
                  router.push({ pathname: "/explore", params: { q: tag } })
                }
              />
            ),
          )}
          {!p.supported && (
            <Type variant="label" muted>
              Unrecognized type
            </Type>
          )}
          {!preview && (
            <Toolbar style={{ marginLeft: "auto" }}>
              <IconButton
                icon={isSaved ? "check" : "bookmark"}
                label={isSaved ? "Unsave post" : "Save post"}
                active={isSaved}
                disabled={busy}
                onPress={() => {
                  setBusy(true);
                  setError(null);
                  void toggleSaved(post.id)
                    .catch(() =>
                      setError("Could not update saved posts. Try again."),
                    )
                    .finally(() => setBusy(false));
                }}
              />
            </Toolbar>
          )}
        </Toolbar>
      }
    >
      <Pressable
        onPress={preview || detail ? undefined : open}
        disabled={preview || detail}
        accessibilityRole={preview || detail ? undefined : "button"}
        accessibilityLabel={
          preview || detail ? undefined : `Open post by ${post.author}`
        }
        style={{ gap: spacing.sm }}
      >
        {p.title && <Type variant="heading">{p.title}</Type>}
        <Type selectable={detail || preview} style={{ color: c.txBody }}>
          {p.text}
        </Type>
      </Pressable>
      {error && <Notice>{error}</Notice>}
    </ReadingItem>
  );
}
