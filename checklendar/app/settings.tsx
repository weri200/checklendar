import React, { useRef, useEffect, useMemo } from 'react';
import { StyleSheet, View, TouchableOpacity, Switch, Platform, Animated } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, Stack } from 'expo-router';
import { useTheme } from './_layout';

export default function SettingsScreen() {
  // 전역 컨텍스트에서 다크모드 상태와 토글 함수를 가져옴
  const { isDarkMode, toggleDarkMode } = useTheme();
  
  /**
   * [1. 애니메이션 값 관리]
   * - themeAnim: 0(라이트 모드)에서 1(다크 모드) 사이의 수치를 가짐
   * - useRef를 사용하여 컴포넌트가 리렌더링되어도 애니메이션 값을 유지함
   */
  const themeAnim = useRef(new Animated.Value(isDarkMode ? 1 : 0)).current;

  /**
   * [2. 테마 전환 효과 트리거]
   * - isDarkMode 상태가 바뀔 때마다 실행됨
   * - 300ms 동안 수치를 부드럽게 0 -> 1 또는 1 -> 0으로 변화시킴
   */
  useEffect(() => {
    Animated.timing(themeAnim, {
      toValue: isDarkMode ? 1 : 0,
      duration: 300,
      // 색상(color) 애니메이션은 네이티브 레이어에서 지원하지 않으므로 false 설정
      useNativeDriver: false, 
    }).start();
  }, [isDarkMode, themeAnim]);

  /**
   * [3. 보간법(Interpolation) 최적화]
   * - useMemo를 사용하여 보간된 애니메이션 객체가 리렌더링 시마다 새로 생성되지 않게 함
   * - 0~1 사이의 숫자를 실제 색상 코드(HEX)로 매핑함
   */
  const animatedColors = useMemo(() => ({
    // 전체 배경색
    bgColor: themeAnim.interpolate({
      inputRange: [0, 1],
      outputRange: ['#F8F9FA', '#121212']
    }),
    // 설정 아이템 카드 배경색
    itemBgColor: themeAnim.interpolate({
      inputRange: [0, 1],
      outputRange: ['#FFFFFF', '#1A1A1A']
    }),
    // 기본 텍스트 색상
    textColor: themeAnim.interpolate({
      inputRange: [0, 1],
      outputRange: ['#333333', '#FFFFFF']
    }),
    // 설명/안내용 보조 텍스트 색상
    subTextColor: themeAnim.interpolate({
      inputRange: [0, 1],
      outputRange: ['#888888', '#AAAAAA']
    })
  }), [themeAnim]);

  return (
    <Animated.View style={[styles.container, { backgroundColor: animatedColors.bgColor }]}>
      {/* [4. 상단 헤더 커스터마이징]
          - Stack.Screen을 통해 현재 화면의 네비게이션 바 설정을 직접 제어함
      */}
      <Stack.Screen options={{ 
        headerShown: true, 
        title: '설정',
        headerTitleAlign: 'center', 
        headerShadowVisible: false, // 헤더 하단 실선 제거
        headerBackVisible: false,   // iOS 기본 백버튼(알약 배경)을 숨기고 커스텀 버튼 사용
        headerStyle: { 
          // 헤더 배경도 현재 테마 상태에 따라 즉시 변경
          backgroundColor: isDarkMode ? '#121212' : '#F8F9FA', 
        },
        headerTintColor: isDarkMode ? '#FFF' : '#333', // 헤더 텍스트/아이콘 색상
        headerLeftContainerStyle: { paddingLeft: 10 },
        headerLeft: () => (
          <TouchableOpacity 
            onPress={() => router.back()} // 이전 화면(메인)으로 돌아가기
            style={styles.backButton} 
            activeOpacity={0.7}
            hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }} // 터치 인식 범위 확장
          >
            <Ionicons 
              name="chevron-back" 
              size={28} 
              color={isDarkMode ? "#FFF" : "#333"} 
            />
          </TouchableOpacity>
        ),
      }} />

      {/* [5. 설정 리스트 본문]
          - edges=['bottom', ...] 설정을 통해 하단 노치(홈 인디케이터) 영역 여백 확보
      */}
      <SafeAreaView edges={['bottom', 'left', 'right']} style={styles.content}>
        <Animated.Text style={[styles.sectionTitle, { color: animatedColors.subTextColor }]}>
          일반 설정
        </Animated.Text>
        
        {/* 다크모드 스위치 아이템 카드 */}
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
            // iOS는 기본 색상을 쓰고, 안드로이드에서만 thumb 색상 지정
            thumbColor={Platform.OS === 'ios' ? undefined : "#f4f3f4"}
            onValueChange={toggleDarkMode} // 전역 테마 토글 함수 실행
            value={isDarkMode}
          />
        </Animated.View>

        <Animated.Text style={[styles.guideText, { color: animatedColors.subTextColor }]}>
          * 설정은 앱 전체에 즉시 반영됩니다.
        </Animated.Text>
      </SafeAreaView>
    </Animated.View>
  );
}

// --- [스타일 시트 정의] ---
const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1, paddingHorizontal: 20, paddingTop: 10 },
  sectionTitle: { fontSize: 14, fontWeight: '600', marginBottom: 15, marginLeft: 5, textTransform: 'uppercase' },
  settingItem: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    padding: 16, 
    borderRadius: 15, 
    // 카드 그림자 설정 (iOS용)
    shadowColor: '#000', 
    shadowOffset: { width: 0, height: 1 }, 
    shadowOpacity: 0.05, 
    shadowRadius: 2, 
    // 카드 그림자 설정 (Android용)
    elevation: 2 
  },
  settingLabel: { flexDirection: 'row', alignItems: 'center' },
  settingText: { fontSize: 16, fontWeight: '500', marginLeft: 12 },
  guideText: { fontSize: 12, marginTop: 20, textAlign: 'center' },
  backButton: { 
    backgroundColor: 'transparent', // 알약 모양 방지를 위해 투명 배경 고정
    padding: 5, 
    justifyContent: 'center', 
    alignItems: 'center' 
  },
});