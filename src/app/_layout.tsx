import { Stack } from 'expo-router';
import { Observe, ObserveRoot } from 'expo-observe';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { PostProvider, usePosts } from '../lib/storage';
import { useColors } from '../theme';

Observe.configure({ environment: process.env.EXPO_PUBLIC_OBSERVE_ENV ?? (__DEV__ ? 'development' : 'preview'), integrations: { 'expo-router': { filteredParams: ['text', 'draft', 'handle', 'did', 'family'] } } });
SplashScreen.preventAutoHideAsync().catch(() => {});

function Routes() {
  const { ready } = usePosts();
  const c = useColors();
  const [splashHidden, setSplashHidden] = useState(false);
  useEffect(() => { if (ready) SplashScreen.hideAsync().then(() => setSplashHidden(true)); }, [ready]);
  if (!ready || !splashHidden) return null;
  return <><StatusBar style="auto" /><Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bgSolidBase } }}>
    <Stack.Screen name="index" /><Stack.Screen name="compose" options={{ presentation: 'modal', gestureEnabled: false }} />
  </Stack></>;
}
export default function RootLayout() {
  return <ObserveRoot errorBoundaryFallback={<View style={{ flex: 1, padding: 32, justifyContent: 'center' }}><Text>The app could not open. Please restart it; saved drafts remain on this device.</Text></View>}>
    <GestureHandlerRootView style={{ flex: 1 }}><SafeAreaProvider><KeyboardProvider><PostProvider><Routes /></PostProvider></KeyboardProvider></SafeAreaProvider></GestureHandlerRootView>
  </ObserveRoot>;
}
