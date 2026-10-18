import type { ReactNode } from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useColors } from '../theme';
import { usePosts } from '../lib/storage';
import { Notice } from './ui';

export function Page({ children }: { children: ReactNode }) {
  const c = useColors();
  const { error } = usePosts();
  return (
    <SafeAreaView
      edges={['top', 'left', 'right']}
      style={{ flex: 1, backgroundColor: c.bgSolidBase }}
    >
      <View
        style={{
          flex: 1,
          width: '100%',
          maxWidth: 720,
          alignSelf: 'center',
          borderLeftWidth: 1,
          borderRightWidth: 1,
          borderColor: c.bdSecondary,
        }}
      >
        {error && <Notice>{error}</Notice>}
        {children}
      </View>
    </SafeAreaView>
  );
}
