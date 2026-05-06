import { Ionicons } from '@expo/vector-icons';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useNotificationSetup } from '../useNotification';
import AsyncStorage from '@react-native-async-storage/async-storage';

// 스플래시 화면 유지
SplashScreen.preventAutoHideAsync();

// 다크모드 Context
const ThemeContext = createContext({
  isDarkMode: false,
  toggleDarkMode: () => {},
});

export const useTheme = () => useContext(ThemeContext);

export default function RootLayout() {
  // 알림 설정 초기화
  useNotificationSetup();

  // 폰트 로드
  const [fontsLoaded] = useFonts({
    ...Ionicons.font,
  });

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);
  
  // 테마 상태 관리
  const [isDarkMode, setIsDarkMode] = useState(false);

  // 저장된 테마 불러오기
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

  // 테마 토글 및 저장
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

  // 로딩 대기
  if (!fontsLoaded) {
    return null;
  }

  return (
    <ThemeContext.Provider value={themeValue}>
      <Stack screenOptions={{ headerShown: false }} initialRouteName='index'>
        <Stack.Screen name="index" />
        <Stack.Screen name="settings" />
        <Stack.Screen name="monthly" />
      </Stack>
    </ThemeContext.Provider>
  );
}