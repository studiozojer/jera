import type { ReactNode } from "react";
import { ReadingProvider } from "../dao/reading";
import { useColors } from "./index";
import { typeScale, spacing, radius } from "./foundation.gen";

export function ReadingTheme({ children }: { children: ReactNode }) {
  const colors = useColors();
  return (
    <ReadingProvider
      theme={{
        colors,
        space: spacing,
        radius,
        type: {
          whyteSm: typeScale["whyte/sm"],
          whyteLg: typeScale["whyte/lg"],
          whyteMd: typeScale["whyte/md"],
          fraktionXs: typeScale["fraktion/xs"],
          whyteXs: typeScale["whyte/xs"],
        },
      }}
    >
      {children}
    </ReadingProvider>
  );
}
