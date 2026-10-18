import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, TextInput, View } from 'react-native';
import { Button } from '../components/Button';
import { Page } from '../components/Page';
import { PostCard } from '../components/PostCard';
import { Chip, Notice, ScreenHeader, Type } from '../components/ui';
import { recordAdapters, validateRecord, type Post } from '../lib/records';
import { usePosts } from '../lib/storage';
import { useColors } from '../theme';
import { fonts, radius, spacing } from '../theme/foundation.gen';

export default function Playground() {
  const c = useColors();
  const { addRecord, error: storageError } = usePosts();
  const [source, setSource] = useState(
    JSON.stringify(recordAdapters[1].example, null, 2),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const result = useMemo(() => {
    try {
      return { record: validateRecord(JSON.parse(source)), error: null };
    } catch (e) {
      return {
        record: null,
        error: e instanceof Error ? e.message : 'Invalid record.',
      };
    }
  }, [source]);
  const preview: Post | null = result.record
    ? {
        id: 'preview',
        author: 'You',
        text: '',
        record: result.record,
        createdAt: '2026-10-17T12:00:00.000Z',
      }
    : null;
  async function add() {
    if (!result.record || busy) return;
    setBusy(true);
    setError(null);
    try {
      await addRecord(result.record);
      router.dismissTo({
        pathname: '/',
        params: { kind: '', family: '', draftClearFailed: '' },
      });
    } catch {
      setError('Could not add this record. Your input is still here.');
      setBusy(false);
    }
  }
  return (
    <Page>
      <ScreenHeader
        title="Record playground"
        subtitle="Preview a shape before it joins the feed."
        back
      />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 32 }}
      >
        <View style={{ padding: spacing.xxl, gap: spacing.lg }}>
          <Type muted>
            Choose an example or paste a record. Its $type selects the display
            adapter; the original fields stay intact.
          </Type>
          <View
            style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}
          >
            {recordAdapters.map((adapter) => (
              <Chip
                key={adapter.type}
                label={adapter.label}
                selected={result.record?.$type === adapter.type}
                onPress={() =>
                  setSource(JSON.stringify(adapter.example, null, 2))
                }
              />
            ))}
            <Chip
              label="Unknown type"
              onPress={() =>
                setSource(
                  JSON.stringify(
                    {
                      $type: 'example.test.entry',
                      message: 'A new shape to explore.',
                    },
                    null,
                    2,
                  ),
                )
              }
            />
          </View>
          <TextInput
            accessibilityLabel="Record JSON"
            value={source}
            onChangeText={setSource}
            multiline
            autoCapitalize="none"
            autoCorrect={false}
            spellCheck={false}
            textAlignVertical="top"
            style={{
              minHeight: 260,
              borderRadius: radius.md,
              backgroundColor: c.bgSolidCard,
              color: c.txPrimary,
              padding: spacing.lg,
              fontFamily: fonts.mono,
              fontSize: 13,
              lineHeight: 21,
            }}
          />
          <Type variant="label" muted>
            Local rendering experiment. This checks the adapter’s required
            fields, not the full ATproto schema.
          </Type>
          {result.error && <Notice>{result.error}</Notice>}
          <Type variant="meta" muted>
            FEED PREVIEW
          </Type>
        </View>
        {preview && <PostCard post={preview} preview />}
        <View style={{ padding: spacing.xxl, gap: spacing.md }}>
          {(error || storageError) && <Notice>{error || storageError}</Notice>}
          <Button
            label={busy ? 'Adding…' : 'Add to local feed'}
            disabled={busy || !result.record || !!storageError}
            onPress={() => {
              void add();
            }}
          />
        </View>
      </ScrollView>
    </Page>
  );
}
