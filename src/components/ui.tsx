import Feather from '@expo/vector-icons/Feather';
import { router } from 'expo-router';
import type { ComponentProps, ReactNode } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
} from 'react-native';
import { useColors } from '../theme';
import { typeScale, radius, spacing } from '../theme/foundation.gen';

export type IconName = ComponentProps<typeof Feather>['name'];
export function Icon({
  name,
  size = 20,
  color,
}: {
  name: IconName;
  size?: number;
  color?: string;
}) {
  const c = useColors();
  return <Feather name={name} size={size} color={color ?? c.icPrimary} />;
}
export function Type({
  children,
  variant = 'body',
  muted = false,
  style,
  ...props
}: ComponentProps<typeof Text> & {
  variant?: 'body' | 'title' | 'heading' | 'meta' | 'label';
  muted?: boolean;
  style?: StyleProp<TextStyle>;
}) {
  const c = useColors();
  const ramp = {
    body: typeScale['whyte/sm'],
    title: typeScale['whyte/xl'],
    heading: typeScale['whyte/md'],
    meta: typeScale['fraktion/xs'],
    label: typeScale['whyte/xs'],
  };
  return (
    <Text
      {...props}
      style={[
        ramp[variant],
        { color: muted ? c.txSecondary : c.txPrimary },
        style,
      ]}
    >
      {children}
    </Text>
  );
}
export function IconButton({
  icon,
  label,
  onPress,
  active,
  disabled,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  active?: boolean;
  disabled?: boolean;
}) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{
        disabled,
        ...(active !== undefined ? { selected: active } : {}),
      }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        minWidth: 44,
        minHeight: 44,
        borderRadius: radius.full,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: pressed
          ? c.bgPressed
          : active
            ? c.bgAccent
            : 'transparent',
      })}
    >
      <Icon
        name={icon}
        color={disabled ? c.txDisabled : active ? c.icAccent : c.icSecondary}
      />
    </Pressable>
  );
}
export function Avatar({
  name,
  large = false,
}: {
  name: string;
  large?: boolean;
}) {
  const c = useColors();
  return (
    <View
      accessibilityLabel={name}
      style={{
        width: large ? 72 : 40,
        height: large ? 72 : 40,
        borderRadius: radius.full,
        backgroundColor: c.bgSolidCard,
        borderWidth: 1,
        borderColor: c.bdCard,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Type variant={large ? 'title' : 'body'}>{name.slice(0, 1)}</Type>
    </View>
  );
}
export function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
}) {
  const c = useColors();
  return (
    <Pressable
      disabled={!onPress}
      onPress={onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityState={onPress ? { selected: !!selected } : undefined}
      style={({ pressed }) => ({
        minHeight: onPress ? 44 : 28,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.xs,
        borderRadius: radius.full,
        justifyContent: 'center',
        backgroundColor: selected
          ? c.bgSolidButton
          : pressed
            ? c.bgPressed
            : c.bgSolidCard,
      })}
    >
      <Type
        variant="label"
        style={{ color: selected ? c.txButton : c.txSecondary }}
      >
        {label}
      </Type>
    </Pressable>
  );
}
export function ScreenHeader({
  title,
  subtitle,
  back = false,
  action,
}: {
  title: string;
  subtitle?: string;
  back?: boolean;
  action?: ReactNode;
}) {
  const c = useColors();
  return (
    <View
      style={{
        paddingHorizontal: spacing.xxl,
        paddingTop: spacing.xl,
        paddingBottom: spacing.lg,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderColor: c.bdPrimary,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
      }}
    >
      {back && (
        <IconButton
          icon="arrow-left"
          label="Back"
          onPress={() =>
            router.canGoBack() ? router.back() : router.replace('/')
          }
        />
      )}
      <View style={{ flex: 1, gap: spacing.xxs }}>
        <Type variant={back ? 'heading' : 'title'} accessibilityRole="header">
          {title}
        </Type>
        {subtitle && (
          <Type variant="label" muted>
            {subtitle}
          </Type>
        )}
      </View>
      {action}
    </View>
  );
}
export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: IconName;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <View
      style={{
        padding: spacing.xxxl,
        paddingVertical: 56,
        alignItems: 'center',
        gap: spacing.md,
      }}
    >
      <Icon name={icon} size={28} />
      <Type variant="heading" style={{ textAlign: 'center' }}>
        {title}
      </Type>
      <Type muted style={{ textAlign: 'center', maxWidth: 320 }}>
        {description}
      </Type>
      {action}
    </View>
  );
}
export function Notice({ children }: { children: ReactNode }) {
  const c = useColors();
  return (
    <Type
      accessibilityRole="alert"
      variant="label"
      style={{ color: c.txError, padding: spacing.lg }}
    >
      {children}
    </Type>
  );
}
