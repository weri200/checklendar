import { Ionicons } from '@expo/vector-icons';
import { router, Stack } from 'expo-router';
import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Platform, StyleSheet, Switch, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from './_layout';

// ============================================================================
// [설정 화면 컴포넌트]
// 다크모드 등 앱의 전역 설정을 관리하며, 테마 변경 시 부드러운 색상 전환 애니메이션을 제공합니다.
// ============================================================================
export default function SettingsScreen() {

  // 1. 전역 테마 상태 가져오기
  const { isDarkMode, toggleDarkMode } = useTheme();
  
  // ----------------------------------------------------------------------------
  // [애니메이션 제어] 테마 전환 효과
  // ----------------------------------------------------------------------------
  
  // 테마 상태를 숫자로 변환하여 관리 (0: 라이트 모드, 1: 다크 모드)
  const themeAnim = useRef(new Animated.Value(isDarkMode ? 1 : 0)).current;

  // isDarkMode가 변경될 때마다 0.3초 동안 부드럽게 숫자 값을 변경
  useEffect(() => {
    Animated.timing(themeAnim, {
      toValue: isDarkMode ? 1 : 0,
      duration: 300,
      useNativeDriver: false, // 색상(Color) 애니메이션은 네이티브 드라이버를 지원하지 않음
    }).start();
  }, [isDarkMode, themeAnim]);

  // ----------------------------------------------------------------------------
  // [색상 보간(Interpolation)] 숫자를 실제 색상 코드로 매핑
  // ----------------------------------------------------------------------------
  
  // 리렌더링 시마다 매핑 객체가 다시 생성되지 않도록 useMemo로 최적화
  const animatedColors = useMemo(() => ({
    // 화면 전체 배경색
    bgColor: themeAnim.interpolate({
      inputRange: [0, 1],
      outputRange: ['#F8F9FA', '#121212']
    }),
    // 설정 항목 카드 배경색
    itemBgColor: themeAnim.interpolate({
      inputRange: [0, 1],
      outputRange: ['#FFFFFF', '#1A1A1A']
    }),
    // 기본 텍스트 색상
    textColor: themeAnim.interpolate({
      inputRange: [0, 1],
      outputRange: ['#333333', '#FFFFFF']
    }),
    // 서브 텍스트(안내문 등) 색상
    subTextColor: themeAnim.interpolate({
      inputRange: [0, 1],
      outputRange: ['#888888', '#AAAAAA']
    })
  }), [themeAnim]);

  // ============================================================================
  // [UI 렌더링 영역]
  // ============================================================================
  return (
    <Animated.View style={[styles.container, { backgroundColor: animatedColors.bgColor }]}>
      
      {/* --- [상단 네비게이션 헤더 설정] --- */}
      <Stack.Screen options={{ 
        headerShown: true, 
        title: '설정',
        headerTitleAlign: 'center', 
        headerShadowVisible: false, // 헤더 하단 구분선 제거
        headerBackVisible: false,   // iOS 기본 뒤로가기 버튼(알약 모양) 숨김 처리
        headerStyle: { backgroundColor: isDarkMode ? '#121212' : '#F8F9FA', },
        headerTintColor: isDarkMode ? '#FFF' : '#333', 
        // 커스텀 뒤로가기 버튼
        headerLeft: () => (
          <TouchableOpacity 
            onPress={() => router.back()} 
            style={styles.backButton} 
            activeOpacity={0.7}
            hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }} // 터치 영역 확장
          >
            <Ionicons name="chevron-back" size={28} color={isDarkMode ? "#FFF" : "#333"} />
          </TouchableOpacity>
        ),
      }} />

      {/* --- [설정 본문 영역] --- */}
      <SafeAreaView edges={['bottom', 'left', 'right']} style={styles.content}>
        
        {/* 섹션 타이틀 */}
        <Animated.Text style={[styles.sectionTitle, { color: animatedColors.subTextColor }]}>
          일반 설정
        </Animated.Text>
        
        {/* --- 다크모드 스위치 항목 --- */}
        <Animated.View style={[styles.settingItem, { backgroundColor: animatedColors.itemBgColor }]}>
          <View style={styles.settingLabel}>
            <Ionicons 
              name={isDarkMode ? "moon" : "sunny"} 
              size={22} 
              color={isDarkMode ? "#FFD700" : "#FF9500"} 
            />
            <Animated.Text style={[styles.settingText, { color: animatedColors.textColor }]}>
              다크모드
            </Animated.Text>
          </View>
          
          <Switch
            trackColor={{ false: "#767577", true: "#4A90E2" }}
            thumbColor={Platform.OS === 'ios' ? undefined : "#f4f3f4"} // 안드로이드용 동그라미 색상 처리
            onValueChange={toggleDarkMode}
            value={isDarkMode}
          />
        </Animated.View>

        {/* 안내 문구 */}
        <Animated.Text style={[styles.guideText, { color: animatedColors.subTextColor }]}>
          * 설정은 앱 전체에 즉시 반영됩니다.
        </Animated.Text>

      </SafeAreaView>
    </Animated.View>
  );
}

// ============================================================================
// [스타일 정의]
// ============================================================================
const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1, paddingHorizontal: 20, paddingTop: 10 },
  sectionTitle: { fontSize: 14, fontWeight: '600', marginBottom: 15, marginLeft: 5, textTransform: 'uppercase' },
  settingItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderRadius: 15, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 2 },
  settingLabel: { flexDirection: 'row', alignItems: 'center' },
  settingText: { fontSize: 16, fontWeight: '500', marginLeft: 12 },
  guideText: { fontSize: 12, marginTop: 20, textAlign: 'center' },
  backButton: { backgroundColor: 'transparent', padding: 5, justifyContent: 'center', alignItems: 'center' },
});