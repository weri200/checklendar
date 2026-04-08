import { Ionicons } from '@expo/vector-icons';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useNotificationSetup } from '../useNotification';

// 폰트나 데이터가 다 준비될 때까지 시작 화면(스플래시)이 1초 만에 꺼지지 않도록 꽉 붙잡아둡니다.
SplashScreen.preventAutoHideAsync();

// ----------------------------------------------------------------------------
// [1. 앱 전체에서 꺼내 쓸 '전역 저장소(Context)' 만들기]
// 메인 화면, 설정 화면 어디서든 '지금 다크모드야?'라고 물어보고 
// 스위치를 조작할 수 있도록 공용 보관함을 만듭니다.
// ----------------------------------------------------------------------------

// 보관함의 기본 형태(설계도)를 만듭니다.
const ThemeContext = createContext({
  isDarkMode: false,
  toggleDarkMode: () => {},
});

// 다른 파일(index.tsx, settings.tsx)에서 이 보관함을 쉽게 열어볼 수 있도록 
// 'useTheme'이라는 마법의 열쇠(커스텀 훅)를 만들어 수출(export)합니다.
export const useTheme = () => useContext(ThemeContext);


// ----------------------------------------------------------------------------
// [2. 앱의 가장 밑바탕 뼈대 (Root Layout)]
// 앱 아이콘을 눌러 실행할 때 가장 먼저 실행되며, 모든 화면을 감싸는 부모입니다.
// ----------------------------------------------------------------------------
export default function RootLayout() {

  // 앱이 처음 켜질 때, 알림을 보낼 수 있도록 사용자에게 권한을 묻고 세팅합니다.
  useNotificationSetup();

  // 앱에서 사용할 예쁜 아이콘 폰트(Ionicons)를 미리 다운로드하여 준비합니다.
  const [fontsLoaded] = useFonts({
    ...Ionicons.font,
  });

  // 폰트가 무사히 다 불러와졌다면, 아까 붙잡아두었던 시작 화면(스플래시)을 치워줍니다.
  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);
  
  // 앱 전체가 다크모드인지 라이트모드인지 기억하는 최상위 스위치입니다.
  const [isDarkMode, setIsDarkMode] = useState(false);

  // ----------------------------------------------------------------------------
  // [3. 화면 버벅임 방지 (성능 최적화)]
  // 앱 화면이 바뀔 때마다 스위치와 보관함이 새로 만들어지며 메모리를 낭비하지 않도록,
  // '이 기능들은 한 번만 만들고 꽉 기억해둬!' 라고 지시하는 과정입니다.
  // ----------------------------------------------------------------------------
  
  // 스위치를 껐다 켜는 작동 방식(함수)을 메모리에 단단히 고정합니다. (useCallback)
  const toggleDarkMode = useCallback(() => {
    setIsDarkMode(prev => !prev);
  }, []);

  // 보관함에 담을 내용물(현재 상태 + 스위치 조작법)을 메모리에 단단히 고정합니다. (useMemo)
  const themeValue = useMemo(() => ({
    isDarkMode,
    toggleDarkMode
  }), [isDarkMode, toggleDarkMode]);

  // 아직 폰트가 준비되지 않았다면 아무것도 보여주지 않고 얌전히 기다립니다.
  if (!fontsLoaded) {
    return null;
  }

  // ----------------------------------------------------------------------------
  // [4. 최종 화면 그리기 및 보관함 열어주기]
  // ----------------------------------------------------------------------------
  return (
    // 아까 만든 보관함(ThemeContext)으로 앱 전체(Stack)를 크게 감싸줍니다.
    // 이제 이 안에 있는 모든 화면들은 자유롭게 다크모드 상태를 꺼내 쓸 수 있습니다!
    <ThemeContext.Provider value={themeValue}>
      <Stack screenOptions={{ headerShown: false }} initialRouteName='index'>
        {/* 이동할 수 있는 화면들의 명세서입니다. (파일 이름과 꼭 같아야 합니다) */}
        <Stack.Screen name="index" />
        <Stack.Screen name="settings" />
      </Stack>
    </ThemeContext.Provider>
  );
}