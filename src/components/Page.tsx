import type { ReactNode } from "react";
import { View, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useColors } from "../theme";
import { usePosts } from "../lib/storage";
import { Notice } from "./ui";

export function Page({ children }: { children: ReactNode }) {
  const c = useColors();
  const wide = useWindowDimensions().width >= 900;
  const { error } = usePosts();
  return (
    <SafeAreaView
      edges={["top", "left", "right"]}
      style={{ flex: 1, backgroundColor: c.bgSolidBase }}
    >
      <View
        style={{
          flex: 1,
          width: "100%",
          maxWidth: 640,
          alignSelf: "center",
          borderLeftWidth: wide ? 1 : 0,
          borderRightWidth: wide ? 1 : 0,
          borderColor: c.bdSecondary,
        }}
      >
        {error && <Notice>{error}</Notice>}
        {children}
      </View>
    </SafeAreaView>
  );
}
