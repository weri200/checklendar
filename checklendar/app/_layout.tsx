import React, { createContext, useState, useContext, useMemo, useCallback } from 'react';
import { Stack } from 'expo-router';

/**
 * 1. 테마 컨텍스트(ThemeContext) 생성
 * - 앱 전체에서 공유할 데이터의 '설계도'입니다.
 * - 초기값으로 현재 상태(isDarkMode)와 상태를 바꿀 함수(toggleDarkMode)의 형태를 정의합니다.
 */
const ThemeContext = createContext({
  isDarkMode: false,
  toggleDarkMode: () => {},
});

/**
 * 2. 커스텀 훅(useTheme) 정의
 * - 다른 컴포넌트(index.tsx, settings.tsx 등)에서 
 * import { useTheme } from './_layout'; 만으로 간편하게 테마를 꺼내 쓸 수 있게 합니다.
 */
export const useTheme = () => useContext(ThemeContext);

export default function RootLayout() {
  // 앱 전체의 다크모드 여부를 결정하는 최상위 상태
  const [isDarkMode, setIsDarkMode] = useState(false);

  /**
   * 3. [최적화] 테마 전환 함수 (useCallback)
   * - useCallback을 사용하면 토글 함수가 메모리에 유지되어, 
   * 리렌더링 시마다 함수가 새로 생성되는 것을 방지합니다.
   */
  const toggleDarkMode = useCallback(() => {
    setIsDarkMode(prev => !prev);
  }, []);

  /**
   * 4. [최적화] 컨텍스트 값 메모이제이션 (useMemo)
   * - Provider에 전달할 value 객체를 메모리에 고정합니다.
   * - 이 처리를 하지 않으면 RootLayout이 리렌더링될 때마다 새로운 객체가 만들어져
   * 이 컨텍스트를 사용하는 모든 하위 컴포넌트가 불필요하게 다시 그려질 수 있습니다.
   */
  const themeValue = useMemo(() => ({
    isDarkMode,
    toggleDarkMode
  }), [isDarkMode, toggleDarkMode]);

  return (
    /**
     * 5. ThemeContext.Provider
     * - 위에서 만든 themeValue를 앱 전체(Stack 이하 모든 화면)에 공급합니다.
     * - 이제 index.tsx나 settings.tsx에서 useTheme()을 통해 이 값에 접근 가능합니다.
     */
    <ThemeContext.Provider value={themeValue}>
      <Stack screenOptions={{ headerShown: false }}>
        {/* 파일 기반 라우팅: name은 파일 이름과 일치해야 합니다. */}
        <Stack.Screen name="index" />
        <Stack.Screen name="settings" />
      </Stack>
    </ThemeContext.Provider>
  );
}