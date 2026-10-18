import { forwardRef, useState, type ReactNode } from "react";
import {
  Pressable,
  StyleSheet,
  Text as NativeText,
  TextInput,
  View,
  type StyleProp,
  type ViewStyle,
  type PressableStateCallbackType,
  type PressableProps,
  type TextProps,
  type TextInputProps,
  type ViewProps,
} from "react-native";
import { useReadingTheme } from "./theme";
export { ReadingProvider, useReadingTheme, type ReadingTheme } from "./theme";

export function Text({
  variant = "whyteSm",
  muted = false,
  style,
  ...props
}: TextProps & {
  variant?: "whyteSm" | "whyteLg" | "whyteMd" | "fraktionXs" | "whyteXs";
  muted?: boolean;
}) {
  const t = useReadingTheme();
  return (
    <NativeText
      {...props}
      style={[
        t.type[variant],
        {
          color: muted ? t.colors.txSecondary : t.colors.txPrimary,
          flexShrink: 1,
        },
        style,
      ]}
    />
  );
}

type ActionProps = Omit<PressableProps, "children" | "style"> & {
  children: ReactNode;
  kind?: "primary" | "secondary" | "ghost";
  iconOnly?: boolean;
};
/** 44pt minimum target, content-sized height, visible keyboard focus on every platform. */
export function Button({
  children,
  kind = "primary",
  iconOnly = false,
  disabled,
  onFocus,
  onBlur,
  accessibilityState,
  ...props
}: ActionProps) {
  const t = useReadingTheme();
  const c = t.colors;
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      {...props}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ ...accessibilityState, disabled: !!disabled }}
      onFocus={(e) => {
        setFocused(true);
        onFocus?.(e);
      }}
      onBlur={(e) => {
        setFocused(false);
        onBlur?.(e);
      }}
      style={({
        pressed,
        hovered,
      }: PressableStateCallbackType & { hovered?: boolean }) => ({
        minHeight: 44,
        minWidth: 44,
        paddingHorizontal: iconOnly ? t.space.sm : t.space.lg,
        paddingVertical: t.space.sm,
        borderRadius: t.radius.md,
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 1,
        borderWidth: 1,
        borderColor: focused
          ? c.txAccent
          : kind === "secondary"
            ? c.bdPrimary
            : "transparent",
        backgroundColor:
          kind === "primary"
            ? disabled
              ? c.bgSolidButtonDisabled
              : pressed
                ? c.bgSolidButtonPressed
                : hovered
                  ? c.bgSolidButtonHover
                  : c.bgSolidButton
            : disabled
              ? kind === "secondary"
                ? c.bgSolidCard
                : "transparent"
              : pressed
                ? c.bgPressed
                : hovered
                  ? c.bgHover
                  : kind === "secondary"
                    ? c.bgSolidCard
                    : "transparent",
      })}
    >
      {typeof children === "string" ? (
        <Text
          style={{
            color: disabled
              ? c.txDisabled
              : kind === "primary"
                ? c.txButton
                : c.txPrimary,
            textAlign: "center",
          }}
        >
          {children}
        </Text>
      ) : (
        children
      )}
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
  const t = useReadingTheme();
  return (
    <View
      accessible={false}
      style={{
        width: large ? 64 : 36,
        height: large ? 64 : 36,
        borderRadius: t.radius.full,
        backgroundColor: t.colors.bgSolidCard,
        borderWidth: 1,
        borderColor: t.colors.bdCard,
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      <Text
        variant={large ? "whyteMd" : "whyteXs"}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {Array.from(name)[0]}
      </Text>
    </View>
  );
}

/** Descriptive status. Intentionally cannot receive onPress. */
export function Badge({ label }: { label: string }) {
  const t = useReadingTheme();
  return (
    <View
      style={{
        alignSelf: "flex-start",
        paddingHorizontal: t.space.sm,
        paddingVertical: t.space.xs,
        borderRadius: t.radius.md,
        backgroundColor: t.colors.bgSolidCard,
      }}
    >
      <Text variant="whyteXs" muted>
        {label}
      </Text>
    </View>
  );
}

/** A compact visual inside a full-size target; selection is explicit, not color alone. */
export function FilterChip({
  label,
  selected,
  onPress,
  disabled = false,
}: {
  label: string;
  selected?: boolean;
  onPress: () => void;
  disabled?: boolean;
}) {
  const t = useReadingTheme();
  const [focused, setFocused] = useState(false);
  const toggle = selected !== undefined;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={({
        pressed,
        hovered,
      }: PressableStateCallbackType & { hovered?: boolean }) => ({
        minHeight: 44,
        justifyContent: "center",
        opacity: disabled ? 0.5 : 1,
        flexShrink: 1,
        minWidth: 44,
        borderRadius: t.radius.md,
        backgroundColor: pressed
          ? t.colors.bgPressed
          : hovered
            ? t.colors.bgHover
            : "transparent",
        borderWidth: 1,
        borderColor: focused ? t.colors.txAccent : "transparent",
      })}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: t.space.xs,
          minHeight: 28,
          paddingHorizontal: toggle ? t.space.sm : t.space.md,
          paddingVertical: t.space.xs,
          borderRadius: t.radius.full,
          borderWidth: 1,
          borderColor: selected ? t.colors.bgSolidButton : t.colors.bdPrimary,
          backgroundColor: selected
            ? t.colors.bgSolidButton
            : t.colors.bgSolidBase,
        }}
      >
        {toggle && (
          <Text
            variant="whyteXs"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            aria-hidden
            style={{ color: t.colors.txButton, opacity: selected ? 1 : 0 }}
          >
            ✓
          </Text>
        )}
        <Text
          variant="whyteXs"
          style={{ color: selected ? t.colors.txButton : t.colors.txSecondary }}
        >
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

export function Header({
  title,
  subtitle,
  leading,
  action,
}: {
  title: string;
  subtitle?: string;
  leading?: ReactNode;
  action?: ReactNode;
}) {
  const t = useReadingTheme();
  return (
    <View
      style={{
        paddingHorizontal: t.space.xl,
        paddingVertical: t.space.md,
        flexDirection: "row",
        alignItems: "center",
        gap: t.space.sm,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderColor: t.colors.bdPrimary,
      }}
    >
      {leading}
      <View style={{ flex: 1, minWidth: 0, gap: t.space.xs }}>
        <Text variant="whyteMd" accessibilityRole="header">
          {title}
        </Text>
        {subtitle ? (
          <Text variant="whyteXs" muted>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {action}
    </View>
  );
}

export function AuthorRow({
  name,
  metadata,
  trailing,
  avatar = true,
}: {
  name: string;
  metadata: string;
  trailing?: ReactNode;
  avatar?: boolean;
}) {
  const t = useReadingTheme();
  return (
    <View
      style={{ flexDirection: "row", alignItems: "flex-start", gap: t.space.md }}
    >
      {avatar && <Avatar name={name} />}
      <View style={{ flex: 1, minWidth: 0, gap: t.space.xxs }}>
        <Text>{name}</Text>
        <Text variant="whyteXs" muted>
          {metadata}
        </Text>
      </View>
      {trailing}
    </View>
  );
}

export type ReadingLayout = "stream" | "cards";
/** Slots carry content and behavior. No record type, routing or persistence assumptions. */
export function ReadingItem({
  author,
  children,
  footer,
  layout = "stream",
}: {
  author: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  layout?: ReadingLayout;
}) {
  const t = useReadingTheme();
  const card = layout === "cards";
  return (
    <View
      style={{
        padding: t.space.xl,
        gap: t.space.md,
        marginHorizontal: card ? t.space.lg : 0,
        marginBottom: card ? t.space.md : 0,
        backgroundColor: card ? t.colors.bgSolidCard : t.colors.bgSolidBase,
        borderRadius: card ? t.radius.lg : 0,
        borderWidth: card ? 1 : 0,
        borderBottomWidth: card ? 1 : StyleSheet.hairlineWidth,
        borderColor: card ? t.colors.bdCard : t.colors.bdSecondary,
      }}
    >
      {author}
      <View style={{ gap: t.space.xs }}>
        <View style={{ gap: t.space.sm }}>{children}</View>
        {footer}
      </View>
    </View>
  );
}

/** Uncontrolled or controlled input; host retains ownership. The ref is the native TextInput. */
export const Field = forwardRef<
  TextInput,
  TextInputProps & {
    appearance?: "field" | "editor";
    leading?: ReactNode;
    trailing?: ReactNode;
    containerStyle?: StyleProp<ViewStyle>;
  }
>(function Field(
  {
    appearance = "field",
    style,
    onFocus,
    onBlur,
    leading,
    trailing,
    containerStyle,
    editable = true,
    ...props
  },
  ref,
) {
  const t = useReadingTheme();
  const [focused, setFocused] = useState(false);
  const editor = appearance === "editor";
  const input = (
    <TextInput
      {...props}
      ref={ref}
      editable={editable}
      placeholderTextColor={
        editable ? t.colors.txSecondary : t.colors.txDisabled
      }
      onFocus={(e) => {
        setFocused(true);
        onFocus?.(e);
      }}
      onBlur={(e) => {
        setFocused(false);
        onBlur?.(e);
      }}
      style={[
        t.type.whyteSm,
        {
          minHeight: editor ? 240 : 44,
          color: editable ? t.colors.txBody : t.colors.txDisabled,
          padding: t.space.md,
          paddingHorizontal: editor ? t.space.sm : t.space.md,
          backgroundColor: "transparent",
          flex: editor ? undefined : 1,
          minWidth: 0,
          borderRadius: 0,
          borderWidth: 0,
          borderLeftWidth: editor ? 1 : 0,
          outlineStyle: "solid",
          outlineWidth: 0,
          borderColor: focused
            ? t.colors.txAccent
            : editor
              ? "transparent"
              : t.colors.bdPrimary,
        },
        style,
      ]}
    />
  );
  return editor ? (
    input
  ) : (
    <View
      style={[
        {
          flexDirection: "row",
          alignItems: "center",
          backgroundColor: editable
            ? t.colors.bgSolidCard
            : t.colors.bgSolidBase,
          borderRadius: t.radius.md,
          borderWidth: 1,
          borderColor: !editable
            ? t.colors.bdSecondary
            : focused
              ? t.colors.txAccent
              : t.colors.bdPrimary,
          paddingLeft: leading ? t.space.md : 0,
          paddingRight: trailing ? t.space.xs : 0,
        },
        containerStyle,
      ]}
    >
      {leading}
      {input}
      {trailing}
    </View>
  );
});

export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  const t = useReadingTheme();
  return (
    <View
      style={{
        padding: t.space.xxxl,
        paddingVertical: 48,
        alignItems: "center",
        gap: t.space.md,
      }}
    >
      {icon}
      <Text variant="whyteMd" style={{ textAlign: "center" }}>
        {title}
      </Text>
      <Text muted style={{ textAlign: "center", maxWidth: 320 }}>
        {description}
      </Text>
      {action}
    </View>
  );
}

export function Toolbar({ style, ...props }: ViewProps) {
  const t = useReadingTheme();
  return (
    <View
      {...props}
      style={[
        {
          flexDirection: "row",
          flexWrap: "wrap",
          alignItems: "center",
          gap: t.space.xs,
        },
        style,
      ]}
    />
  );
}
