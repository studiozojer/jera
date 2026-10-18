import { Pressable, Text } from 'react-native';
import { useColors } from '../theme';
import { fonts, radius } from '../theme/foundation.gen';

export function Button({
  label,
  onPress,
  disabled = false,
  quiet = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  quiet?: boolean;
}) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 48,
        minWidth: 48,
        paddingHorizontal: 18,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: quiet
          ? pressed
            ? c.bgPressed
            : 'transparent'
          : disabled
            ? c.bgSolidButtonDisabled
            : pressed
              ? c.bgSolidButtonPressed
              : c.bgSolidButton,
        borderRadius: radius.md,
      })}
    >
      <Text
        style={{
          fontFamily: fonts.body,
          fontSize: 16,
          color: disabled ? c.txDisabled : quiet ? c.txPrimary : c.txButton,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
