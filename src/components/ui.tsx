import Feather from "@expo/vector-icons/Feather";
import { router } from "expo-router";
import type { ComponentProps, ReactNode } from "react";
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
  ...props
}: Omit<ComponentProps<typeof DaoText>, "variant"> & {
  variant?: keyof typeof variants;
}) {
  return <DaoText {...props} variant={variants[variant]} />;
}

export type IconName = ComponentProps<typeof Feather>["name"];
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
    <Button
      iconOnly
      kind={active ? "secondary" : "ghost"}
      onPress={onPress}
      accessibilityLabel={label}
      accessibilityState={
        active === undefined ? undefined : { selected: active }
      }
      disabled={disabled}
    >
      <Icon
        name={icon}
        color={disabled ? c.txDisabled : active ? c.icPrimary : c.icSecondary}
      />
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
