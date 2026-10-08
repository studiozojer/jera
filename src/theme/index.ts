import { useColorScheme } from 'react-native';
import { darkColors, lightColors } from './tokens.gen';
export function useColors() { return useColorScheme() === 'dark' ? darkColors : lightColors; }
