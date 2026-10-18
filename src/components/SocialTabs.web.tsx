import { Tabs, router } from "expo-router";
import { Pressable, View, useWindowDimensions } from "react-native";
import { useColors } from "../theme";
import { fonts, spacing } from "../theme/foundation.gen";
import { Button } from "./Button";
import { Avatar, Icon, Type, type IconName } from "./ui";

const tabs: { name: string; title: string; icon: IconName }[] = [
  { name: "index", title: "Feed", icon: "home" },
  { name: "explore", title: "Explore", icon: "search" },
  { name: "saved", title: "Saved", icon: "bookmark" },
  { name: "profile", title: "Profile", icon: "user" },
];
export function SocialTabs() {
  const c = useColors();
  const wide = useWindowDimensions().width >= 900;
  return (
    <View
      style={{
        flex: 1,
        width: "100%",
        maxWidth: wide ? 920 : undefined,
        alignSelf: "center",
      }}
    >
      <Tabs
        tabBar={({ state, navigation }) => (
          <View
            style={
              wide
                ? {
                    width: 228,
                    padding: spacing.xxl,
                    paddingTop: 40,
                    borderRightWidth: 1,
                    borderColor: c.bdPrimary,
                    gap: spacing.xxxl,
                  }
                : {
                    flexDirection: "row",
                    borderTopWidth: 1,
                    borderColor: c.bdPrimary,
                    paddingVertical: spacing.sm,
                    backgroundColor: c.bgSolidBase,
                  }
            }
          >
            {wide && (
              <Pressable
                onPress={() => router.navigate("/")}
                accessibilityRole="link"
                accessibilityLabel="Jera home"
              >
                <Type variant="title">jera</Type>
                <Type variant="meta" muted style={{ marginTop: spacing.xs }}>
                  A place for your words.
                </Type>
              </Pressable>
            )}
            <View
              style={
                wide ? { gap: spacing.sm } : { flex: 1, flexDirection: "row" }
              }
            >
              {state.routes.map((route, index) => {
                const tab = tabs.find((item) => item.name === route.name);
                if (!tab) return null;
                const selected = state.index === index;
                return (
                  <Pressable
                    key={route.key}
                    accessibilityRole="tab"
                    accessibilityState={{ selected }}
                    accessibilityLabel={tab.title}
                    onPress={() => {
                      const event = navigation.emit({
                        type: "tabPress",
                        target: route.key,
                        canPreventDefault: true,
                      });
                      if (!selected && !event.defaultPrevented)
                        navigation.navigate(route.name);
                    }}
                    style={({ pressed }) => ({
                      ...(wide
                        ? {
                            flexDirection: "row" as const,
                            paddingHorizontal: spacing.lg,
                            minHeight: 52,
                            gap: spacing.md,
                            borderRadius: 8,
                          }
                        : { flex: 1, minHeight: 48, gap: spacing.xs }),
                      justifyContent: wide ? "flex-start" : "center",
                      alignItems: "center",
                      backgroundColor: pressed
                        ? c.bgPressed
                        : selected && wide
                          ? c.bgSolidCard
                          : "transparent",
                    })}
                  >
                    <Icon
                      name={tab.icon}
                      color={selected ? c.icPrimary : c.icSecondary}
                    />
                    <Type variant={wide ? "body" : "label"} muted={!selected}>
                      {tab.title}
                    </Type>
                  </Pressable>
                );
              })}
            </View>
            {wide && (
              <>
                <Button
                  label="Write a post"
                  onPress={() => router.push("/compose")}
                />
                <View style={{ flex: 1 }} />
                <Pressable
                  accessibilityRole="link"
                  onPress={() => router.push("/playground")}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: spacing.md,
                    minHeight: 44,
                  }}
                >
                  <Icon name="sliders" />
                  <Type variant="label">Record playground</Type>
                </Pressable>
                <Pressable
                  onPress={() => router.navigate("/profile")}
                  accessibilityRole="link"
                  style={{
                    flexDirection: "row",
                    gap: spacing.md,
                    alignItems: "center",
                  }}
                >
                  <Avatar name="You" />
                  <View>
                    <Type>You</Type>
                    <Type variant="meta" muted>
                      Local profile
                    </Type>
                  </View>
                </Pressable>
              </>
            )}
          </View>
        )}
        screenLayout={({ children }) => (
          <View style={{ flex: 1, minWidth: 0 }}>{children}</View>
        )}
        screenOptions={{
          headerShown: false,
          tabBarPosition: wide ? "left" : "bottom",
          sceneStyle: { backgroundColor: c.bgSolidBase },
          tabBarLabelStyle: { fontFamily: fonts.body },
        }}
      >
        {tabs.map((tab) => (
          <Tabs.Screen
            key={tab.name}
            name={tab.name}
            options={{ title: tab.title }}
          />
        ))}
      </Tabs>
    </View>
  );
}
