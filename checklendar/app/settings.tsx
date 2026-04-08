import { Ionicons } from '@expo/vector-icons';
import { router, Stack } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Modal, Platform, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import AsyncStorage from '@react-native-async-storage/async-storage';
import DateTimePicker from '@react-native-community/datetimepicker';

import { updateNotification } from '../useNotification';
import { useTheme } from './_layout';

export default function SettingsScreen() {

  // ----------------------------------------------------------------------------
  // [1. 화면 상태 및 데이터 관리]
  // 화면에서 변할 수 있는 값들을 기억해두는 공간입니다.
  // ----------------------------------------------------------------------------
  const { isDarkMode, toggleDarkMode } = useTheme(); // 앱 전체의 테마(다크/라이트) 상태
  
  const [isNotiEnabled, setIsNotiEnabled] = useState(false); // 알림 스위치 켜짐/꺼짐 상태
  const [notiTime, setNotiTime] = useState(new Date());      // 사용자가 최종적으로 설정한 알림 시간
  const [showPicker, setShowPicker] = useState(false);       // 시간 선택 창(모달)이 화면에 보이는지 여부
  
  // 아이폰(iOS) 전용: 사용자가 스피너를 굴리는 동안의 '임시 시간'을 기억합니다. 
  // '완료' 버튼을 눌러야만 진짜 알림 시간(notiTime)으로 넘어갑니다.
  const [tempNotiTime, setTempNotiTime] = useState(new Date());

  // ----------------------------------------------------------------------------
  // [2. 테마 및 부드러운 애니메이션 설정]
  // 딱딱하게 화면이 바뀌지 않고 스르륵 부드럽게 변하도록 도와주는 도구들입니다.
  // ----------------------------------------------------------------------------
  const themeAnim = useRef(new Animated.Value(isDarkMode ? 1 : 0)).current;
  
  // 아이폰 시간 선택 모달이 밑에서 스르륵 올라오게 만드는 애니메이션 값
  const modalOpacity = useRef(new Animated.Value(0)).current;      // 배경 어두워짐 (0->1)
  const modalTranslateY = useRef(new Animated.Value(400)).current; // 시트가 아래에서 위로 올라옴 (400->0)

  // 테마 상태(다크/라이트)에 따라 글자색, 배경색을 부드럽게 섞어주는(Interpolate) 마법의 팔레트입니다.
  const animatedColors = useMemo(() => ({
    bgColor: themeAnim.interpolate({ inputRange: [0, 1], outputRange: ['#F8F9FA', '#121212'] }),
    itemBgColor: themeAnim.interpolate({ inputRange: [0, 1], outputRange: ['#FFFFFF', '#1A1A1A'] }),
    modalBgColor: themeAnim.interpolate({ inputRange: [0, 1], outputRange: ['#FFFFFF', '#1C1C1E'] }),
    textColor: themeAnim.interpolate({ inputRange: [0, 1], outputRange: ['#333333', '#FFFFFF'] }),
    subTextColor: themeAnim.interpolate({ inputRange: [0, 1], outputRange: ['#888888', '#AAAAAA'] })
  }), [themeAnim]);

  // ----------------------------------------------------------------------------
  // [3. 설정 불러오기 (초기 세팅)]
  // ----------------------------------------------------------------------------
  
  // 앱의 설정 화면에 처음 들어왔을 때, 휴대폰에 저장해둔 예전 설정값들을 꺼내옵니다.
  const loadSettings = async () => {
    try {
      const savedEnabled = await AsyncStorage.getItem('notiEnabled');
      const savedTime = await AsyncStorage.getItem('notiTime');
      
      if (savedEnabled !== null) setIsNotiEnabled(JSON.parse(savedEnabled));
      if (savedTime !== null) setNotiTime(new Date(savedTime));
    } catch (e) {
      console.log('설정 불러오기 실패:', e);
    }
  };

  // 다크모드 스위치를 누르면 애니메이션 값을 0.3초(300ms) 동안 자연스럽게 바꿉니다.
  useEffect(() => {
    Animated.timing(themeAnim, {
      toValue: isDarkMode ? 1 : 0,
      duration: 300,
      useNativeDriver: false,
    }).start();
  }, [isDarkMode, themeAnim]);

  // 화면이 켜지자마자 저장된 설정을 불러옵니다.
  useEffect(() => {
    loadSettings();
  }, []);

  // ----------------------------------------------------------------------------
  // [4. 사용자 동작 핸들러 (버튼 눌렀을 때의 반응)]
  // ----------------------------------------------------------------------------
  
  // '알림 시간' 칸을 눌렀을 때 시간 선택 창을 엽니다.
  const handleOpenPicker = () => { 
    if (Platform.OS === 'ios') {
      // 아이폰은 현재 설정된 시간을 임시 시간에 복사해두고, 모달을 부드럽게 올려줍니다.
      setTempNotiTime(new Date(notiTime));
      setShowPicker(true);
      Animated.parallel([
        Animated.timing(modalOpacity, { toValue: 1, duration: 250, useNativeDriver: true }),
        Animated.timing(modalTranslateY, { toValue: 0, duration: 250, useNativeDriver: true })
      ]).start();
    } else {
      // 안드로이드는 시스템 기본 팝업을 바로 띄웁니다.
      setShowPicker(true);
    } 
  };

  // 시간 선택 창을 닫는 함수입니다. (아이폰은 스르륵 내려가며 닫힙니다.)
  const closePicker = () => {
    if (Platform.OS === 'ios') {
      Animated.parallel([
        Animated.timing(modalOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
        Animated.timing(modalTranslateY, { toValue: 400, duration: 200, useNativeDriver: true })
      ]).start(() => {
        setShowPicker(false); 
      });
    } else {
      setShowPicker(false);
    }
  };

  // 알림 켜기/끄기 스위치를 눌렀을 때 작동합니다. (폰에 저장 후 알림 시스템 갱신)
  const handleToggleNoti = async (value: boolean) => {
    setIsNotiEnabled(value);
    await AsyncStorage.setItem('notiEnabled', JSON.stringify(value));
    updateNotification(); 
  };

  // [안드로이드 전용] 시간 팝업에서 '확인'을 눌렀을 때 작동합니다.
  const handleAndroidTimeChange = async (event: any, selectedDate?: Date) => {
    closePicker();
    if (selectedDate) {
      setNotiTime(selectedDate);
      await AsyncStorage.setItem('notiTime', selectedDate.toISOString());
      updateNotification(); 
    }
  };

  // [아이폰 전용] 모달창 안에서 스피너를 데굴데굴 굴릴 때마다 임시 시간만 바꿉니다.
  const handleIOSTimeChange = (event: any, selectedDate?: Date) => {
    if (selectedDate) {
      setTempNotiTime(selectedDate);
    }
  };

  // [아이폰 전용] 모달창에서 '완료' 버튼을 눌렀을 때, 임시 시간을 진짜 시간으로 확정짓고 폰에 저장합니다.
  const handleIOSDone = async () => {
    setNotiTime(tempNotiTime);
    await AsyncStorage.setItem('notiTime', tempNotiTime.toISOString());
    closePicker();
    updateNotification(); 
  };

  // ----------------------------------------------------------------------------
  // [5. 화면 그리기 (UI 배치)]
  // ----------------------------------------------------------------------------
  return (
    <Animated.View style={[styles.container, { backgroundColor: animatedColors.bgColor }]}>
      
      {/* 화면 상단의 제목('설정')과 뒤로 가기 버튼을 만듭니다. */}
      <Stack.Screen options={{ 
        headerShown: true, 
        title: '설정',
        headerTitleAlign: 'center', 
        headerShadowVisible: false, 
        headerBackVisible: false, 
        headerStyle: { backgroundColor: isDarkMode ? '#121212' : '#F8F9FA', },
        headerTintColor: isDarkMode ? '#FFF' : '#333', 
        headerLeft: () => (
          <TouchableOpacity 
            onPress={() => router.back()} 
            style={styles.backButton} 
            activeOpacity={0.7} 
            hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
          >
            <Ionicons name="chevron-back" size={28} color={isDarkMode ? "#FFF" : "#333"} />
          </TouchableOpacity>
        ),
      }} />

      <SafeAreaView edges={['bottom', 'left', 'right']} style={styles.content}>
        
        {/* 일반 설정 섹션 (다크모드 스위치) */}
        <Animated.Text style={[styles.sectionTitle, { color: animatedColors.subTextColor }]}>일반 설정</Animated.Text>
        <Animated.View style={[styles.settingItem, { backgroundColor: animatedColors.itemBgColor }]}>
          <View style={styles.settingLabel}>
            <Ionicons name={isDarkMode ? "moon" : "sunny"} size={22} color={isDarkMode ? "#FFD700" : "#FF9500"} />
            <Animated.Text style={[styles.settingText, { color: animatedColors.textColor }]}>다크모드</Animated.Text>
          </View>
          <Switch trackColor={{ false: "#767577", true: "#4A90E2" }} thumbColor={Platform.OS === 'ios' ? undefined : "#f4f3f4"} onValueChange={toggleDarkMode} value={isDarkMode} />
        </Animated.View>

        {/* 알림 설정 섹션 (알림 켜기 스위치) */}
        <Animated.Text style={[styles.sectionTitle, { color: animatedColors.subTextColor, marginTop: 30 }]}>알림 설정</Animated.Text>
        <Animated.View style={[styles.settingItem, { backgroundColor: animatedColors.itemBgColor, marginBottom: 10 }]}>
          <View style={styles.settingLabel}>
            <Ionicons name="notifications" size={22} color={isDarkMode ? "#FFD700" : "#4A90E2"} />
            <Animated.Text style={[styles.settingText, { color: animatedColors.textColor }]}>일정 요약 알림</Animated.Text>
          </View>
          <Switch trackColor={{ false: "#767577", true: "#4A90E2" }} thumbColor={Platform.OS === 'ios' ? undefined : "#f4f3f4"} onValueChange={handleToggleNoti} value={isNotiEnabled} />
        </Animated.View>

        {/* 알림이 켜져 있을 때만 '알림 시간 설정' 버튼이 나타납니다. */}
        {isNotiEnabled && (
          <TouchableOpacity onPress={handleOpenPicker} activeOpacity={0.7}>
            <Animated.View style={[styles.settingItem, { backgroundColor: animatedColors.itemBgColor }]}>
              <View style={styles.settingLabel}>
                <Ionicons name="time-outline" size={22} color={isDarkMode ? "#FFD700" : "#4A90E2"} />
                <Animated.Text style={[styles.settingText, { color: animatedColors.textColor }]}>알림 시간</Animated.Text>
              </View>
              {/* 설정된 시간을 '08:00 AM' 같은 보기 좋은 형태로 보여줍니다. */}
              <Animated.Text style={[styles.timeText, { color: animatedColors.subTextColor }]}>
                {notiTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </Animated.Text>
            </Animated.View>
          </TouchableOpacity>
        )}

        {/* [아이폰용] 밑에서 부드럽게 올라오는 커스텀 시간 선택 창(모달)입니다. */}
        {Platform.OS === 'ios' && (
          <Modal
            visible={showPicker}
            transparent={true}
            animationType="none" 
            onRequestClose={closePicker}
          >
            {/* 어두워지는 배경 (여기를 터치하면 닫힙니다) */}
            <Animated.View style={[styles.modalBackdropWrapper, { opacity: modalOpacity }]}>
              <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={closePicker} />
            </Animated.View>
            
            {/* 밑에서 올라오는 하얀색 시트 부분 */}
            <Animated.View style={[
              styles.modalSheet, 
              { 
                backgroundColor: animatedColors.modalBgColor,
                transform: [{ translateY: modalTranslateY }] 
              }
            ]}>
              <SafeAreaView edges={['bottom']}>
                {/* 취소, 시간 선택, 완료 버튼 영역 */}
                <View style={styles.modalHeader}>
                  <TouchableOpacity onPress={closePicker}>
                    <Text style={styles.modalCancelText}>취소</Text>
                  </TouchableOpacity>
                  <Animated.Text style={[styles.modalTitle, { color: animatedColors.textColor }]}>시간 선택</Animated.Text>
                  <TouchableOpacity onPress={handleIOSDone}>
                    <Text style={styles.modalDoneText}>완료</Text>
                  </TouchableOpacity>
                </View>

                {/* 빙글빙글 돌아가는 진짜 시계 스피너 */}
                <DateTimePicker 
                  value={tempNotiTime} 
                  mode="time" 
                  display="spinner" 
                  is24Hour={false}
                  onChange={handleIOSTimeChange} 
                  locale="ko-KR"
                  textColor={isDarkMode ? '#FFFFFF' : '#000000'} 
                />
              </SafeAreaView>
            </Animated.View>
          </Modal>
        )}

        {/* 하단 안내 문구 */}
        <Animated.Text style={[styles.guideText, { color: animatedColors.subTextColor }]}>
          * 설정은 앱 전체에 즉시 반영되며, 매일 해당 시간에 알림이 울립니다.
        </Animated.Text>

      </SafeAreaView>

      {/* [안드로이드용] 안드로이드 폰의 시스템 기본 시간 팝업창을 띄웁니다. */}
      {Platform.OS === 'android' && showPicker && (
        <DateTimePicker 
          value={notiTime} 
          mode="time" 
          display="default" 
          onChange={handleAndroidTimeChange} 
        />
      )}

    </Animated.View>
  );
}

// ----------------------------------------------------------------------------
// [6. 화면 디자인 (스타일 설정)]
// 패딩, 마진, 둥근 모서리, 글자 크기 등 화면을 예쁘게 꾸미는 수치들입니다.
// ----------------------------------------------------------------------------
const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1, paddingHorizontal: 20, paddingTop: 10 },
  
  // 섹션 제목 ('일반 설정', '알림 설정')
  sectionTitle: { fontSize: 14, fontWeight: '600', marginBottom: 15, marginLeft: 5, textTransform: 'uppercase' },
  
  // 하얀색 네모난 설정 항목 박스
  settingItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderRadius: 15, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 2 },
  settingLabel: { flexDirection: 'row', alignItems: 'center' },
  settingText: { fontSize: 16, fontWeight: '500', marginLeft: 12 },
  
  timeText: { fontSize: 16, fontWeight: '600' },
  guideText: { fontSize: 12, marginTop: 30, textAlign: 'center' },
  backButton: { backgroundColor: 'transparent', padding: 5, justifyContent: 'center', alignItems: 'center' },
  
  // 모달(바텀 시트) 전용 스타일들
  modalBackdropWrapper: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 }, 
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' }, 
  modalSheet: { position: 'absolute', bottom: 0, left: 0, right: 0, borderTopLeftRadius: 25, borderTopRightRadius: 25, paddingBottom: 20, shadowColor: '#000', shadowOffset: { width: 0, height: -3 }, shadowOpacity: 0.1, shadowRadius: 5, elevation: 10 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(120,120,128,0.2)' },
  modalCancelText: { color: '#FF3B30', fontSize: 16, fontWeight: '600' },
  modalTitle: { fontSize: 17, fontWeight: 'bold' },
  modalDoneText: { color: '#4A90E2', fontSize: 16, fontWeight: 'bold' },
});