import { Ionicons } from '@expo/vector-icons';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTheme } from './_layout';

const Section = ({ title, children, dark }: {
  title: string;
  children: React.ReactNode;
  dark: boolean;
}) => (
  <View style={styles.section}>
    <Text style={[styles.sectionTitle, dark && styles.darkText]}>{title}</Text>
    <Text style={[styles.body, dark && styles.darkSubText]}>{children}</Text>
  </View>
);

export default function PrivacyScreen() {
  const { isDarkMode } = useTheme();
  const backgroundColor = isDarkMode ? '#121212' : '#F8F9FA';

  return (
    <SafeAreaView style={[styles.container, { backgroundColor }]} edges={['bottom', 'left', 'right']}>
      <StatusBar style={isDarkMode ? 'light' : 'dark'} />
      <Stack.Screen options={{
        headerShown: true,
        title: '개인정보처리방침',
        headerTitleAlign: 'center',
        headerShadowVisible: false,
        headerStyle: { backgroundColor },
        headerTintColor: isDarkMode ? '#FFFFFF' : '#333333',
        headerLeft: () => (
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="chevron-back" size={28} color={isDarkMode ? '#FFFFFF' : '#333333'} />
          </TouchableOpacity>
        ),
      }} />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.updatedAt, isDarkMode && styles.darkSubText]}>시행일: 2026년 7월 20일</Text>
        <Section title="1. 처리하는 정보" dark={isDarkMode}>
          일정 제목·메모·완료 상태와 앱 설정은 사용자의 기기에만 저장됩니다. 알림을 켠 경우에만
          FCM 기기 토큰, 시간대, 알림 날짜·시각 및 미완료 일정 개수를 서버로 전송합니다. 일정 제목과
          메모는 서버로 전송하지 않습니다. 서비스 보호를 위해 Firebase App Check 검증 정보와 요청 과정의
          네트워크 정보가 처리될 수 있습니다.
        </Section>
        <Section title="2. 이용 목적" dark={isDarkMode}>
          수집 정보는 사용자가 선택한 일정 요약 알림 전송, 대한민국 공휴일 조회, 부정 요청 방지와
          서비스 보안 목적으로만 사용합니다. 광고, 맞춤형 마케팅 또는 데이터 판매에 사용하지 않습니다.
        </Section>
        <Section title="3. 보관 및 삭제" dark={isDarkMode}>
          알림 예약은 발송되거나 일정이 변경되면 삭제됩니다. 설정에서 알림을 끄면 서버의 FCM 토큰과
          남은 예약을 즉시 삭제합니다. 기기에 저장된 일정은 앱에서 삭제할 수 있고, 전체 로컬 정보는
          Android 시스템 설정의 앱 데이터 삭제로 제거할 수 있습니다. 기기 백업 설정에 따라 복원될 수 있습니다.
        </Section>
        <Section title="4. 처리 위탁 및 국외 처리" dark={isDarkMode}>
          알림과 보안 기능 제공을 위해 Google Cloud, Firebase Cloud Messaging, Cloud Firestore,
          Firebase App Check를 사용합니다. 해당 정보는 Google의 글로벌 인프라에서 처리될 수 있으며,
          전송 구간은 HTTPS로 암호화됩니다.
        </Section>
        <Section title="5. 선택권과 문의" dark={isDarkMode}>
          알림 기능은 선택 사항이며 거부해도 달력과 체크리스트 기능을 사용할 수 있습니다. 개인정보 관련
          문의나 삭제 요청은 Google Play의 Checklendar 개발자 연락처 또는 프로젝트 문의 채널
          (github.com/weri200/checklendar/issues)을 이용해 주세요.
        </Section>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 22, paddingVertical: 20, paddingBottom: 48 },
  updatedAt: { color: '#666666', fontSize: 13, marginBottom: 22 },
  section: { marginBottom: 24 },
  sectionTitle: { color: '#222222', fontSize: 17, fontWeight: '700', marginBottom: 8 },
  body: { color: '#555555', fontSize: 15, lineHeight: 24 },
  darkText: { color: '#FFFFFF' },
  darkSubText: { color: '#BBBBBB' },
  backButton: { padding: 5 },
});
