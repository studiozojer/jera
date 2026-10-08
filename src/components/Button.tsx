import { Pressable, Text } from 'react-native';
import { useColors } from '../theme';

export function Button({ label, onPress, disabled = false, quiet = false }: { label: string; onPress: () => void; disabled?: boolean; quiet?: boolean }) {
  const c = useColors();
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => ({ minHeight: 48, minWidth: 48, paddingHorizontal: 18, justifyContent: 'center', alignItems: 'center', borderRadius: 24,
      backgroundColor: quiet ? (pressed ? c.bgPressed : 'transparent') : disabled ? c.bgSolidButtonDisabled : pressed ? c.bgSolidButtonPressed : c.bgSolidButton })}>
    <Text style={{ fontSize: 16, fontWeight: '600', color: disabled ? c.txDisabled : quiet ? c.txPrimary : c.txButton }}>{label}</Text>
  </Pressable>;
}
