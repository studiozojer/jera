import { router } from 'expo-router';
import { Observe, ObserveInteractiveMarker } from 'expo-observe';
import { useEffect, useRef, useState } from 'react';
import {
  AppState,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  KeyboardAwareScrollView,
  KeyboardStickyView,
} from 'react-native-keyboard-controller';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../components/Button';
import { Avatar, Chip, Type } from '../components/ui';
import { loadDraft, saveDraft, usePosts } from '../lib/storage';
import { replaceWebText } from '../lib/web-editor';
import {
  familiesIn,
  replaceRange,
  shortcodeAt,
  symbols,
  type SymbolFamily,
} from '../lib/symbols';
import { useColors } from '../theme';
import { fonts, spacing } from '../theme/foundation.gen';

export default function Composer() {
  const c = useColors();
  const { addPost } = usePosts();
  const input = useRef<TextInput>(null);
  const text = useRef('');
  const selection = useRef({ start: 0, end: 0 });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [initial, setInitial] = useState<string | null>(null);
  const [canPost, setCanPost] = useState(false);
  const [families, setFamilies] = useState<SymbolFamily[]>([]);
  const [query, setQuery] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSymbols, setShowSymbols] = useState(false);
  const draftLoaded = useRef(false);
  const firstEdit = useRef(false);

  // Native owns ordinary typing. No value/selection feedback loop on each keystroke.
  function refreshSuggestions() {
    const next = familiesIn(text.current);
    setFamilies((prev) => (prev.join() === next.join() ? prev : next));
    const candidate = shortcodeAt(text.current, selection.current);
    setQuery(candidate?.query ?? null);
  }
  function persist() {
    if (draftLoaded.current)
      saveDraft(text.current).catch(() =>
        setError(
          'Your draft could not be saved. Keep this screen open and try again.',
        ),
      );
  }
  useEffect(() => {
    if (initial === null) return;
    const frame = requestAnimationFrame(() => {
      const editor = input.current;
      // An input/focus event can beat this deferred initialization. Once the
      // user has the editor, restoring the initial caret would overwrite it.
      if (!editor || firstEdit.current || editor.isFocused()) return;
      editor.focus();
      const end = initial.length;
      if (Platform.OS === 'web')
        (editor as unknown as HTMLTextAreaElement).setSelectionRange(end, end);
      else editor.setNativeProps({ selection: { start: end, end } });
      selection.current = { start: end, end };
    });
    return () => cancelAnimationFrame(frame);
  }, [initial]);
  useEffect(() => {
    let active = true;
    loadDraft()
      .then((saved) => {
        if (!active) return;
        text.current = saved;
        draftLoaded.current = true;
        selection.current = { start: saved.length, end: saved.length };
        setInitial(saved);
        setCanPost(!!saved.trim());
        setFamilies(familiesIn(saved));
      })
      .catch(() => {
        if (active)
          setError(
            'Your saved draft could not be loaded. Close and try again.',
          );
      });
    const background = AppState.addEventListener('change', (state) => {
      if (state !== 'active') persist();
    });
    return () => {
      active = false;
      background.remove();
      if (timer.current) clearTimeout(timer.current);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (draftLoaded.current) saveDraft(text.current).catch(() => {});
    };
  }, []);

  function changed(value: string) {
    text.current = value;
    if (!firstEdit.current) {
      firstEdit.current = true;
      Observe.logEvent('composer.first_edit');
    }
    setCanPost(!!value.trim());
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(refreshSuggestions, 150);
    // Periodic save while typing continuously, rather than waiting for a pause.
    if (!saveTimer.current)
      saveTimer.current = setTimeout(() => {
        saveTimer.current = null;
        persist();
      }, 750);
  }
  function accept(symbol: (typeof symbols)[number]) {
    const webInput =
      Platform.OS === 'web'
        ? (input.current as unknown as HTMLTextAreaElement | null)
        : null;
    if (webInput) {
      text.current = webInput.value;
      selection.current = {
        start: webInput.selectionStart,
        end: webInput.selectionEnd,
      };
    }
    const candidate = shortcodeAt(text.current, selection.current);
    const start = candidate?.start ?? selection.current.start;
    const end = candidate?.end ?? selection.current.end;
    const result = replaceRange(text.current, start, end, symbol.glyph);
    const nextSelection = { start: result.caret, end: result.caret };
    if (webInput) {
      replaceWebText(webInput, result.text, result.caret);
    } else {
      input.current?.setNativeProps({
        text: result.text,
        selection: nextSelection,
      });
    }
    text.current = result.text;
    selection.current = nextSelection;
    input.current?.focus();
    setCanPost(!!result.text.trim());
    refreshSuggestions();
    persist();
    // An interaction event, not a measurement of keystroke-to-display latency.
    Observe.logEvent('composer.symbol_accept');
  }
  async function close() {
    try {
      if (timer.current) clearTimeout(timer.current);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (draftLoaded.current) await saveDraft(text.current);
      if (router.canGoBack()) router.back();
      else router.replace('/');
    } catch {
      setError('Could not save your draft. Please try again before closing.');
    }
  }
  async function post() {
    if (busy || !text.current.trim()) return;
    setBusy(true);
    setError(null);
    const submitted = text.current;
    const family = showSymbols ? familiesIn(submitted)[0] : undefined;
    try {
      await addPost(submitted);
    } catch {
      setError('Could not add your post. Your draft is still here.');
      setBusy(false);
      return;
    }
    if (timer.current) clearTimeout(timer.current);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    text.current = '';
    let draftClearFailed = false;
    try {
      await saveDraft('');
    } catch {
      draftClearFailed = true;
    }
    Observe.logEvent('composer.local_post', {
      attributes: { tagged: !!family },
    });
    router.dismissTo({
      pathname: '/',
      params: {
        kind: '',
        family: family ?? '',
        draftClearFailed: draftClearFailed ? '1' : '',
      },
    });
  }
  const options =
    query !== null
      ? symbols.filter((s) => s.id.startsWith(query))
      : [
          ...symbols.filter((s) => families.includes(s.id)),
          ...symbols.filter((s) => !families.includes(s.id)),
        ];
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bgSolidBase }}>
      <View
        style={{ flex: 1, width: '100%', maxWidth: 720, alignSelf: 'center' }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: 12,
            paddingVertical: 8,
          }}
        >
          <Button
            quiet
            label="Close"
            disabled={busy}
            onPress={() => {
              void close();
            }}
          />
          <Type>New post</Type>
          <Button
            label={busy ? 'Adding…' : 'Add post'}
            disabled={busy || !canPost || initial === null}
            onPress={() => {
              void post();
            }}
          />
        </View>
        <View
          style={{
            padding: spacing.xxl,
            flexDirection: 'row',
            gap: spacing.md,
            alignItems: 'center',
          }}
        >
          <Avatar name="You" />
          <View>
            <Type>You</Type>
            <Type variant="meta" muted>
              LOCAL POST
            </Type>
          </View>
        </View>
        {!!error && (
          <Text
            accessibilityRole="alert"
            style={{ color: c.txError, paddingHorizontal: 24 }}
          >
            {error}
          </Text>
        )}
        <KeyboardAwareScrollView
          bottomOffset={100}
          keyboardShouldPersistTaps="always"
          keyboardDismissMode="interactive"
          contentContainerStyle={{
            flexGrow: 1,
            paddingHorizontal: 24,
            paddingBottom: 140,
          }}
        >
          {initial !== null && (
            <>
              <ObserveInteractiveMarker />
              <TextInput
                ref={input}
                defaultValue={initial}
                multiline
                editable={!busy}
                autoCorrect
                spellCheck
                autoCapitalize="sentences"
                submitBehavior="newline"
                textAlignVertical="top"
                accessibilityLabel="Post text"
                placeholder="What’s on your mind?"
                placeholderTextColor={c.txSecondary}
                onChangeText={changed}
                onSelectionChange={({ nativeEvent }) => {
                  selection.current = nativeEvent.selection;
                  setQuery(
                    shortcodeAt(text.current, selection.current)?.query ?? null,
                  );
                }}
                style={{
                  color: c.txBody,
                  fontFamily: fonts.body,
                  fontSize: 20,
                  lineHeight: 30,
                  minHeight: 260,
                  paddingTop: 8,
                  paddingBottom: 24,
                }}
              />
            </>
          )}
        </KeyboardAwareScrollView>
        <KeyboardStickyView offset={{ closed: 0, opened: 0 }}>
          <View
            style={{
              backgroundColor: c.bgSolidBase,
              paddingTop: 10,
              paddingBottom: 12,
              borderTopWidth: 1,
              borderTopColor: c.bdPrimary,
            }}
          >
            <View
              style={{
                paddingHorizontal: spacing.xxl,
                flexDirection: 'row',
                alignItems: 'center',
                gap: spacing.md,
                paddingBottom: spacing.sm,
              }}
            >
              <Chip
                label="Zodiac symbols"
                selected={showSymbols}
                onPress={() => setShowSymbols((shown) => !shown)}
              />
              <Type variant="label" muted style={{ flex: 1 }}>
                Drafts stay on this device
              </Type>
            </View>
            {showSymbols && (
              <>
                <Type
                  variant="meta"
                  muted
                  style={{ paddingHorizontal: 24, marginBottom: 6 }}
                >
                  {query !== null
                    ? 'TAP TO INSERT A SYMBOL'
                    : 'SYMBOLS · TYPE :VIRGO: OR CHOOSE ONE'}
                </Type>
                <ScrollView
                  horizontal
                  keyboardShouldPersistTaps="always"
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ paddingHorizontal: 16, gap: 6 }}
                >
                  {options.map((s) => (
                    <Pressable
                      key={s.id}
                      disabled={busy || initial === null}
                      accessibilityRole="button"
                      accessibilityLabel={`Insert ${s.name} symbol`}
                      onPress={() => accept(s)}
                      style={({ pressed }) => ({
                        minHeight: 48,
                        minWidth: 64,
                        paddingHorizontal: 12,
                        justifyContent: 'center',
                        alignItems: 'center',
                        borderRadius: 16,
                        backgroundColor: pressed
                          ? c.bgSolidCardPressed
                          : c.bgSolidCard,
                      })}
                    >
                      <Type style={{ fontSize: 21 }}>{s.glyph}</Type>
                      <Type variant="label" muted>
                        {s.name}
                      </Type>
                    </Pressable>
                  ))}
                  {options.length === 0 && (
                    <Text style={{ color: c.txSecondary, padding: 12 }}>
                      No matching symbol. Your text stays as typed.
                    </Text>
                  )}
                </ScrollView>
              </>
            )}
          </View>
        </KeyboardStickyView>
      </View>
    </SafeAreaView>
  );
}
