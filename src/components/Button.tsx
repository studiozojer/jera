import { Button as DaoButton } from "../dao/reading";
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
  return (
    <DaoButton
      onPress={onPress}
      disabled={disabled}
      kind={quiet ? "ghost" : "primary"}
    >
      {label}
    </DaoButton>
  );
}
