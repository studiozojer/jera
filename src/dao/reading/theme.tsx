import { createContext, useContext, type ReactNode } from "react";
import type { TextStyle } from "react-native";

/** Host supplies resolved canonical tokens. No router, data store or bench dependency. */
export type ReadingTheme = {
  colors: Record<
    | "txPrimary"
    | "txSecondary"
    | "txBody"
    | "txButton"
    | "txDisabled"
    | "txAccent"
    | "txError"
    | "bgSolidBase"
    | "bgSolidCard"
    | "bgSolidCardHover"
    | "bgSolidCardPressed"
    | "bgSolidButton"
    | "bgSolidButtonHover"
    | "bgSolidButtonPressed"
    | "bgSolidButtonDisabled"
    | "bgHover"
    | "bgPressed"
    | "bgAccent"
    | "bdPrimary"
    | "bdSecondary"
    | "bdCard",
    string
  >;
  type: Record<
    "whyteSm" | "whyteLg" | "whyteMd" | "fraktionXs" | "whyteXs",
    TextStyle
  >;
  space: Record<
    "xxs" | "xs" | "sm" | "md" | "lg" | "xl" | "xxl" | "xxxl",
    number
  >;
  radius: { md: number; lg: number; full: number };
};
const Context = createContext<ReadingTheme | null>(null);
export function ReadingProvider({
  theme,
  children,
}: {
  theme: ReadingTheme;
  children: ReactNode;
}) {
  return <Context.Provider value={theme}>{children}</Context.Provider>;
}
export function useReadingTheme() {
  const value = useContext(Context);
  if (!value)
    throw new Error("daoUI reading components require ReadingProvider");
  return value;
}
