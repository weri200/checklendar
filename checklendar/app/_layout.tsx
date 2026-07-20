import { Ionicons } from '@expo/vector-icons';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNotifications } from '../useNotifications';

// 앱 초기화가 완료될 때까지 스플래시 화면을 표시합니다.
SplashScreen.preventAutoHideAsync();

// 앱 전역에서 사용하는 테마 상태를 제공합니다.
const ThemeContext = createContext({
  isDarkMode: false,
  toggleDarkMode: () => {},
});

export const useTheme = () => useContext(ThemeContext);

export default function RootLayout() {
  // 앱 시작 시 알림 권한, 토큰, 서버 일정을 한 번만 초기화합니다.
  useNotifications();

  // 아이콘 폰트를 로드합니다.
  const [fontsLoaded] = useFonts({
    ...Ionicons.font,
  });

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);
  
  // 현재 테마 상태를 관리합니다.
  const [isDarkMode, setIsDarkMode] = useState(false);

  // 저장된 테마 설정을 불러옵니다.
  useEffect(() => {
    const loadTheme = async () => {
      try {
        const savedTheme = await AsyncStorage.getItem('@checklendar_theme');
        if (savedTheme !== null) {
          setIsDarkMode(JSON.parse(savedTheme));
        }
      } catch (e) {
        console.error('테마 불러오기 오류:', e);
      }
    };
    loadTheme();
  }, []);

  // 테마를 전환하고 변경 사항을 저장합니다.
  const toggleDarkMode = useCallback(async () => {
    try {
      setIsDarkMode((prevTheme) => {
        const newTheme = !prevTheme;
        AsyncStorage.setItem('@checklendar_theme', JSON.stringify(newTheme)).catch(e => 
          console.error('테마 저장 오류:', e)
        );
        return newTheme;
      });
    } catch (e) {
      console.error('테마 전환 중 오류:', e);
    }
  }, []); 

  const themeValue = useMemo(() => ({
    isDarkMode,
    toggleDarkMode
  }), [isDarkMode, toggleDarkMode]);

  // 폰트 로드가 끝날 때까지 화면 렌더링을 지연합니다.
  if (!fontsLoaded) {
    return null;
  }

  return (
    <ThemeContext.Provider value={themeValue}>
      <Stack screenOptions={{ headerShown: false }} initialRouteName='index'>
        <Stack.Screen name="index" />
        <Stack.Screen name="settings" />
        <Stack.Screen name="privacy" />
        <Stack.Screen name="monthly" />
      </Stack>
    </ThemeContext.Provider>
  );
}
