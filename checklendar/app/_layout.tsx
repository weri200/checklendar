import { Ionicons } from '@expo/vector-icons';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useNotificationSetup } from '../useNotification';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ----------------------------------------------------------------------------
// [준비 단계] 앱이 켜질 때 필요한 것들
// ----------------------------------------------------------------------------

// 폰트나 데이터가 준비되기 전에 하얀 빈 화면이 보이지 않도록
// 스플래시(로딩) 화면을 강제로 띄워둡니다.
SplashScreen.preventAutoHideAsync();

// ----------------------------------------------------------------------------
// [1. 다크모드 공용 서랍 (Context) 만들기]
// 앱 안의 어떤 화면에서든 다크모드 상태를 꺼내 쓰고 변경할 수 있는 '공용 서랍'입니다.
// ----------------------------------------------------------------------------

// 1-1. 서랍의 기본 설계도 만들기
const ThemeContext = createContext({
  isDarkMode: false,           // 현재 다크모드인지 아닌지 (기본값: false)
  toggleDarkMode: () => {},    // 다크모드를 껐다 켜는 스위치 (함수)
});

// 1-2. 다른 파일에서 이 서랍을 쉽게 열 수 있게 해주는 '만능 열쇠(Hook)' 만들기
export const useTheme = () => useContext(ThemeContext);

// ----------------------------------------------------------------------------
// [2. 앱의 몸통 (Root Layout)]
// 모든 화면을 감싸고 있는 최상위 부모 컴포넌트입니다.
// ----------------------------------------------------------------------------
export default function RootLayout() {

  // 1. 사용자에게 알림 권한을 묻고 세팅합니다.
  useNotificationSetup();

  // 2. 앱에서 쓸 예쁜 아이콘(Ionicons)을 미리 불러옵니다.
  const [fontsLoaded] = useFonts({
    ...Ionicons.font,
  });

  // 3. 폰트가 다 준비되었다면, 띄워두었던 스플래시 화면을 이제 치워줍니다.
  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);
  
  // ----------------------------------------------------------------------------
  // [3. 다크모드 상태 관리 & 저장]
  // ----------------------------------------------------------------------------
  
  // 현재 테마 상태 (기본은 라이트모드)
  const [isDarkMode, setIsDarkMode] = useState(false);

  useEffect(() => {
    const loadTheme = async () => {
      try {
        const savedTheme = await AsyncStorage.getItem('@checklendar_theme');
        if (savedTheme !== null) {
          setIsDarkMode(JSON.parse(savedTheme)); // 저장된 기록이 있으면 덮어씌웁니다.
        }
      } catch (e) {
        console.error('테마 불러오기 오류:', e);
      }
    };
    loadTheme();
  }, []);

  // useCallback을 써서 함수가 계속 새로 만들어지는 것을 막습니다.
  const toggleDarkMode = useCallback(async () => {
    try {
      // "현재 상태의 반댓값"으로 설정하는 안전한 방식(함수형 업데이트)을 사용합니다.
      setIsDarkMode((prevTheme) => {
        const newTheme = !prevTheme;
        // 상태를 바꾸는 김에 휴대폰 저장소에도 바로 기록을 남깁니다.
        AsyncStorage.setItem('@checklendar_theme', JSON.stringify(newTheme)).catch(e => 
          console.error('테마 저장 오류:', e)
        );
        return newTheme; // 새로운 상태 적용!
      });
    } catch (e) {
      console.error('테마 전환 중 오류:', e);
    }
  }, []); 
  // ↑ 의존성 배열을 비워두어([]) 이 함수는 앱이 실행될 때 딱 한 번만 만들어집니다! (최적화 완료)

  // 서랍에 넣을 내용물(상태와 스위치)을 예쁘게 포장해 둡니다. (useMemo로 버벅임 방지)
  const themeValue = useMemo(() => ({
    isDarkMode,
    toggleDarkMode
  }), [isDarkMode, toggleDarkMode]);

  // ----------------------------------------------------------------------------
  // [4. 화면 그리기]
  // ----------------------------------------------------------------------------

  // 아직 폰트가 덜 불러와졌다면 화면을 그리지 않고 잠깐 대기합니다.
  if (!fontsLoaded) {
    return null;
  }

  // 아까 만든 공용 서랍(ThemeContext.Provider)으로 모든 화면을 감싸줍니다.
  // 이제 index, settings, monthly 화면은 언제든 서랍을 열어 다크모드를 확인할 수 있습니다!
  return (
    <ThemeContext.Provider value={themeValue}>
      {/* 화면 이동(내비게이션) 설정 */}
      <Stack screenOptions={{ headerShown: false }} initialRouteName='index'>
        <Stack.Screen name="index" />
        <Stack.Screen name="settings" />
        <Stack.Screen name="monthly" /> {/* 월별 모아보기 화면 */}
      </Stack>
    </ThemeContext.Provider>
  );
}