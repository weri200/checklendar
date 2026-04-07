import { Stack } from 'expo-router';
import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { useNotificationSetup } from '../useNotification';

// ============================================================================
// [1. 전역 테마 컨텍스트 및 훅 정의]
// 앱 전체 화면에서 다크모드 상태를 공유하고 제어하기 위한 데이터 저장소입니다.
// ============================================================================

// 테마 데이터의 '설계도(초기값)'를 생성합니다.
const ThemeContext = createContext({
  isDarkMode: false,
  toggleDarkMode: () => {},
});

// 외부 파일(index.tsx, settings.tsx 등)에서 테마 데이터를 쉽게 꺼내 쓸 수 있도록 
// 커스텀 훅(useTheme)을 만들어 내보냅니다.
export const useTheme = () => useContext(ThemeContext);


// ============================================================================
// [2. 최상위 루트 레이아웃 컴포넌트]
// 앱이 실행될 때 가장 먼저 렌더링되는 뼈대로, 하위 모든 화면에 테마 정보를 공급합니다.
// ============================================================================
export default function RootLayout() {
  
  //  앱이 켜질 때 딱 한 번 알림 권한을 묻고 세팅
  useNotificationSetup();
  
  // 앱 전체의 다크모드 여부를 결정하는 최상위 상태
  const [isDarkMode, setIsDarkMode] = useState(false);

  // ----------------------------------------------------------------------------
  // [성능 최적화 로직] 메모리 낭비 및 불필요한 리렌더링 방지
  // ----------------------------------------------------------------------------
  
  // [최적화 1] useCallback: 테마 전환 함수 메모리 고정
  const toggleDarkMode = useCallback(() => {
    setIsDarkMode(prev => !prev);
  }, []);

  // [최적화 2] useMemo: 하위 컴포넌트로 전달할 객체 메모리 고정
  const themeValue = useMemo(() => ({
    isDarkMode,
    toggleDarkMode
  }), [isDarkMode, toggleDarkMode]);

  // ============================================================================
  // [3. 화면 렌더링 및 데이터 공급(Provider) 영역]
  // ============================================================================
  return (
    // 위에서 최적화한 themeValue를 Stack 내부의 모든 화면에 공급(Provide)합니다.
    <ThemeContext.Provider value={themeValue}>
      <Stack screenOptions={{ headerShown: false }}>
        {/* 파일 기반 라우팅: name 속성은 파일 이름(index, settings)과 일치해야 합니다. */}
        <Stack.Screen name="index" />
        <Stack.Screen name="settings" />
      </Stack>
    </ThemeContext.Provider>
  );
}