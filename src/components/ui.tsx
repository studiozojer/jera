import Feather from "@expo/vector-icons/Feather";
import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { Children, type ComponentProps, type ReactNode } from "react";
import { Text } from "react-native";
import { symbolRuns } from "../lib/symbols";
import { symbolFonts } from "../theme/symbols";
import { useColors } from "../theme";
import {
  Text as DaoText,
  Button,
  Badge,
  FilterChip,
  Header,
  EmptyState as DaoEmptyState,
} from "../dao/reading";
export { Avatar } from "../dao/reading";
const variants = {
  body: "whyteSm",
  title: "whyteLg",
  heading: "whyteMd",
  meta: "fraktionXs",
  label: "whyteXs",
} as const;
export function Type({
  variant = "body",
  children,
  ...props
}: Omit<ComponentProps<typeof DaoText>, "variant"> & {
  variant?: keyof typeof variants;
}) {
  return (
    <DaoText {...props} variant={variants[variant]}>
      {Children.map(children, (child) => typeof child === "string"
        ? symbolRuns(child).map((run, index) => run.symbol
          ? <Text key={index} style={{ fontFamily: symbolFonts.symbols, fontWeight: "normal", letterSpacing: 0 }}>{run.text}</Text>
          : run.text)
        : child)}
    </DaoText>
  );
}

export type IconName = ComponentProps<typeof Feather>["name"];
// Feather has no filled bookmark. Use a matched pair from the installed icon set.
function BookmarkIcon({
  filled = false,
  size = 20,
  color,
}: {
  filled?: boolean;
  size?: number;
  color: string;
}) {
  return (
    <Ionicons
      name={filled ? "bookmark" : "bookmark-outline"}
      size={size}
      color={color}
    />
  );
}
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
  if (name === "bookmark")
    return <BookmarkIcon size={size} color={color ?? c.icPrimary} />;
  return <Feather name={name} size={size} color={color ?? c.icPrimary} />;
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
  const color = disabled ? c.txDisabled : active ? c.icPrimary : c.icSecondary;
  return (
    <Button
      iconOnly
      kind={active && icon !== "bookmark" ? "secondary" : "ghost"}
      onPress={onPress}
      accessibilityLabel={label}
      accessibilityState={
        active === undefined ? undefined : { selected: active }
      }
      disabled={disabled}
    >
      {icon === "bookmark" ? (
        <BookmarkIcon filled={active} color={color} />
      ) : (
        <Icon name={icon} color={color} />
      )}
    </Button>
  );
}
// Compatibility boundary: new code should choose Badge or FilterChip explicitly.
export function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
}) {
  return onPress ? (
    <FilterChip label={label} selected={selected} onPress={onPress} />
  ) : (
    <Badge label={label} />
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
  return (
    <Header
      title={title}
      subtitle={subtitle}
      action={action}
      leading={
        back ? (
          <IconButton
            icon="arrow-left"
            label="Back"
            onPress={() =>
              router.canGoBack() ? router.back() : router.replace("/")
            }
          />
        ) : undefined
      }
    />
  );
}
export function EmptyState({
  icon,
  ...props
}: {
  icon: IconName;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return <DaoEmptyState {...props} icon={<Icon name={icon} size={24} />} />;
}
export function Notice({ children }: { children: ReactNode }) {
  const c = useColors();
  return (
    <Type
      accessibilityRole="alert"
      variant="label"
      style={{ color: c.txError, padding: 16 }}
    >
      {children}
    </Type>
  );
}
