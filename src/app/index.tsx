import { router, useLocalSearchParams } from 'expo-router';
import { ObserveInteractiveMarker } from 'expo-observe';
import { memo, useMemo } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../components/Button';
import { familiesIn, symbols, type SymbolFamily } from '../lib/symbols';
import { usePosts, type Post } from '../lib/storage';
import { useColors } from '../theme';

const PostRow = memo(function PostRow({ post }: { post: Post }) {
  const c = useColors();
  const families = familiesIn(post.text);
  return <View style={{ paddingVertical: 24, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: c.bdBase }}>
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
      <Text style={{ color: c.txPrimary, fontWeight: '600', fontSize: 16 }}>{post.author}</Text>
      <Text style={{ color: c.txSecondary, fontSize: 13 }}>{post.sample ? 'Sample post' : 'On this device'}</Text>
    </View>
    <Text selectable style={{ color: c.txBody, fontSize: 19, lineHeight: 29, marginTop: 10 }}>{post.text}</Text>
    {families.length > 0 && <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>{families.map((id) => {
      const s = symbols.find((item) => item.id === id)!;
      return <Pressable key={id} accessibilityRole="button" accessibilityLabel={`Show ${s.name} posts`} onPress={() => router.setParams({ family: id })} style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 22, backgroundColor: c.bgSolidCard }}>
        <Text style={{ color: c.txPrimary, fontSize: 14 }}>{s.glyph} {s.name}</Text>
      </Pressable>;
    })}</View>}
  </View>;
});

export default function Feed() {
  const c = useColors();
  const { posts, error } = usePosts();
  const { family: rawFamily, draftClearFailed } = useLocalSearchParams<{ family?: string; draftClearFailed?: string }>();
  const family = symbols.some((s) => s.id === rawFamily) ? rawFamily as SymbolFamily : undefined;
  const selectedSymbol = symbols.find((s) => s.id === family);
  const visible = useMemo(() => family ? posts.filter((p) => familiesIn(p.text).includes(family)) : posts, [posts, family]);
  return <SafeAreaView style={{ flex: 1, backgroundColor: c.bgSolidBase }}>
    <ObserveInteractiveMarker />
    <View style={styles.header}><View style={{ flex: 1 }}><Text style={{ color: c.txSecondary, fontSize: 12, letterSpacing: 1.5 }}>ASTROFEED</Text><Text style={{ color: c.txPrimary, fontSize: 32, fontWeight: '600', marginTop: 6 }}>{selectedSymbol ? `${selectedSymbol.name} posts` : 'In the current'}</Text></View>
      <Button label="Write" disabled={!!error} onPress={() => router.push('/compose')} /></View>
    <Text style={{ color: c.txSecondary, fontSize: 14, paddingHorizontal: 24, paddingBottom: 14 }}>A local posting prototype. Your words stay on this device.</Text>
    {!!error && <Text accessibilityRole="alert" style={{ color: c.txError, paddingHorizontal: 24 }}>{error}</Text>}
    {draftClearFailed === '1' && <Text accessibilityRole="alert" style={{ color: c.txError, paddingHorizontal: 24, paddingBottom: 12 }}>Your post was added, but the saved draft could not be cleared. It may reappear when you write again.</Text>}
    <View><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 24, gap: 8 }}>
      {[{ id: '', name: 'All', glyph: '' }, ...symbols].map((s) => <Pressable key={s.id} accessibilityRole="button" accessibilityState={{ selected: s.id === (family ?? '') }} onPress={() => router.setParams({ family: s.id })} style={{ minHeight: 48, paddingHorizontal: 16, borderRadius: 24, justifyContent: 'center', backgroundColor: s.id === (family ?? '') ? c.bgSolidButton : c.bgSolidCard }}>
        <Text style={{ color: s.id === (family ?? '') ? c.txButton : c.txPrimary, fontSize: 15 }}>{s.glyph} {s.name}</Text>
      </Pressable>)}
    </ScrollView></View>
    <FlatList data={visible} keyExtractor={(post) => post.id} renderItem={({ item }) => <PostRow post={item} />} contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 40 }} keyboardShouldPersistTaps="handled"
      ListEmptyComponent={<Text style={{ color: c.txSecondary, paddingVertical: 40, fontSize: 18 }}>No posts in this current yet. Write the first.</Text>} />
  </SafeAreaView>;
}
const styles = StyleSheet.create({ header: { padding: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16 } });
