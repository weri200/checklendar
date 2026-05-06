import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated, KeyboardAvoidingView, Modal, Platform,
  ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, Switch
} from 'react-native';

import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Stack, router, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import DateTimePicker from '@react-native-community/datetimepicker';
import { SafeAreaView } from 'react-native-safe-area-context';

import { updateNotification } from '../useNotification';
import { useTheme } from './_layout';

export default function SettingsScreen() {

  // 화면 상태 및 데이터 관리
  const { isDarkMode, toggleDarkMode } = useTheme(); 
  
  const [isNotiEnabled, setIsNotiEnabled] = useState(false); 
  const [notiTime, setNotiTime] = useState(new Date());      
  const [showPicker, setShowPicker] = useState(false);       
  const [tempNotiTime, setTempNotiTime] = useState(new Date());

  const [isChecklistView, setIsChecklistView] = useState(false);

  // 테마 및 부드러운 애니메이션 설정
  const themeAnim = useRef(new Animated.Value(isDarkMode ? 1 : 0)).current;
  
  const modalOpacity = useRef(new Animated.Value(0)).current;      
  const modalTranslateY = useRef(new Animated.Value(400)).current; 

  const animatedColors = useMemo(() => ({
    bgColor: themeAnim.interpolate({ inputRange: [0, 1], outputRange: ['#F8F9FA', '#121212'] }),
    itemBgColor: themeAnim.interpolate({ inputRange: [0, 1], outputRange: ['#FFFFFF', '#1A1A1A'] }),
    modalBgColor: themeAnim.interpolate({ inputRange: [0, 1], outputRange: ['#FFFFFF', '#1C1C1E'] }),
    textColor: themeAnim.interpolate({ inputRange: [0, 1], outputRange: ['#333333', '#FFFFFF'] }),
    subTextColor: themeAnim.interpolate({ inputRange: [0, 1], outputRange: ['#888888', '#AAAAAA'] })
  }), [themeAnim]);

  // 설정 불러오기
  const loadSettings = async () => {
    try {
      const savedEnabled = await AsyncStorage.getItem('notiEnabled');
      const savedTime = await AsyncStorage.getItem('notiTime');
      const savedView = await AsyncStorage.getItem('@main_view');
      
      if (savedEnabled !== null) setIsNotiEnabled(JSON.parse(savedEnabled));
      if (savedTime !== null) setNotiTime(new Date(savedTime));
      if (savedView !== null) setIsChecklistView(savedView === 'checklist');
    } catch (e) {
      console.log('설정 불러오기 실패:', e);
    }
  };

  useEffect(() => {
    Animated.timing(themeAnim, {
      toValue: isDarkMode ? 1 : 0,
      duration: 300,
      useNativeDriver: false,
    }).start();
  }, [isDarkMode, themeAnim]);

  useEffect(() => {
    loadSettings();
  }, []);

  // 사용자 동작 핸들러
  const handleToggleView = async (value: boolean) => {
    setIsChecklistView(value);
    await AsyncStorage.setItem('@main_view', value ? 'checklist' : 'calendar');
  };

  const handleOpenPicker = () => { 
    if (Platform.OS === 'ios') {
      setTempNotiTime(new Date(notiTime));
      setShowPicker(true);
      Animated.parallel([
        Animated.timing(modalOpacity, { toValue: 1, duration: 250, useNativeDriver: false }),
        Animated.timing(modalTranslateY, { toValue: 0, duration: 250, useNativeDriver: false })
      ]).start();
    } else {
      setShowPicker(true);
    } 
  };

  const closePicker = () => {
    if (Platform.OS === 'ios') {
      Animated.parallel([
        Animated.timing(modalOpacity, { toValue: 0, duration: 200, useNativeDriver: false }),
        Animated.timing(modalTranslateY, { toValue: 400, duration: 200, useNativeDriver: false })
      ]).start(() => {
        setShowPicker(false); 
      });
    } else {
      setShowPicker(false);
    }
  };

  const handleToggleNoti = async (value: boolean) => {
    setIsNotiEnabled(value);
    await AsyncStorage.setItem('notiEnabled', JSON.stringify(value));
    updateNotification(); 
  };

  const handleAndroidTimeChange = async (event: any, selectedDate?: Date) => {
    closePicker();
    if (selectedDate) {
      setNotiTime(selectedDate);
      await AsyncStorage.setItem('notiTime', selectedDate.toISOString());
      updateNotification(); 
    }
  };

  const handleIOSTimeChange = (event: any, selectedDate?: Date) => {
    if (selectedDate) {
      setTempNotiTime(selectedDate);
    }
  };

  const handleIOSDone = async () => {
    setNotiTime(tempNotiTime);
    await AsyncStorage.setItem('notiTime', tempNotiTime.toISOString());
    closePicker();
    updateNotification(); 
  };

  // UI 렌더링
  return (
    <Animated.View style={[styles.container, { backgroundColor: animatedColors.bgColor }]}>
      <StatusBar style={isDarkMode ? 'light' : 'dark'} />
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
        
        {/* 일반 설정 섹션 */}
        <Animated.Text style={[styles.sectionTitle, { color: animatedColors.subTextColor }]}>일반 설정</Animated.Text>
        
        <Animated.View style={[styles.settingItem, { backgroundColor: animatedColors.itemBgColor, marginBottom: 10 }]}>
          <View style={styles.settingLabel}>
            <Ionicons name={isDarkMode ? "moon" : "sunny"} size={22} color={isDarkMode ? "#FFD700" : "#FF9500"} />
            <Animated.Text style={[styles.settingText, { color: animatedColors.textColor }]}>다크모드</Animated.Text>
          </View>
          <Switch trackColor={{ false: "#767577", true: "#4A90E2" }} thumbColor={Platform.OS === 'ios' ? undefined : "#f4f3f4"} onValueChange={toggleDarkMode} value={isDarkMode} />
        </Animated.View>

        <Animated.View style={[styles.settingItem, { backgroundColor: animatedColors.itemBgColor }]}>
          <View style={styles.settingLabel}>
            <Ionicons name="list" size={22} color={isDarkMode ? "#FFD700" : "#4A90E2"} />
            <Animated.Text style={[styles.settingText, { color: animatedColors.textColor }]}>시작 화면: 체크리스트</Animated.Text>
          </View>
          <Switch trackColor={{ false: "#767577", true: "#4A90E2" }} thumbColor={Platform.OS === 'ios' ? undefined : "#f4f3f4"} onValueChange={handleToggleView} value={isChecklistView} />
        </Animated.View>

        {/* 알림 설정 섹션 */}
        <Animated.Text style={[styles.sectionTitle, { color: animatedColors.subTextColor, marginTop: 30 }]}>알림 설정</Animated.Text>
        <Animated.View style={[styles.settingItem, { backgroundColor: animatedColors.itemBgColor, marginBottom: 10 }]}>
          <View style={styles.settingLabel}>
            <Ionicons name="notifications" size={22} color={isDarkMode ? "#FFD700" : "#4A90E2"} />
            <Animated.Text style={[styles.settingText, { color: animatedColors.textColor }]}>일정 요약 알림</Animated.Text>
          </View>
          <Switch trackColor={{ false: "#767577", true: "#4A90E2" }} thumbColor={Platform.OS === 'ios' ? undefined : "#f4f3f4"} onValueChange={handleToggleNoti} value={isNotiEnabled} />
        </Animated.View>

        {isNotiEnabled && (
          <TouchableOpacity onPress={handleOpenPicker} activeOpacity={0.7}>
            <Animated.View style={[styles.settingItem, { backgroundColor: animatedColors.itemBgColor }]}>
              <View style={styles.settingLabel}>
                <Ionicons name="time-outline" size={22} color={isDarkMode ? "#FFD700" : "#4A90E2"} />
                <Animated.Text style={[styles.settingText, { color: animatedColors.textColor }]}>알림 시간</Animated.Text>
              </View>
              <Animated.Text style={[styles.timeText, { color: animatedColors.subTextColor }]}>
                {notiTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </Animated.Text>
            </Animated.View>
          </TouchableOpacity>
        )}

        {/* iOS용 시간 선택 모달 */}
        {Platform.OS === 'ios' && (
          <Modal visible={showPicker} transparent={true} animationType="none" onRequestClose={closePicker}>
            <Animated.View style={[styles.modalBackdropWrapper, { opacity: modalOpacity }]}>
              <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={closePicker} />
            </Animated.View>
            
            <Animated.View style={[styles.modalSheet, { backgroundColor: animatedColors.modalBgColor, transform: [{ translateY: modalTranslateY }] }]}>
              <SafeAreaView edges={['bottom']}>
                <View style={styles.modalHeader}>
                  <TouchableOpacity onPress={closePicker}><Text style={styles.modalCancelText}>취소</Text></TouchableOpacity>
                  <Animated.Text style={[styles.modalTitle, { color: animatedColors.textColor }]}>시간 선택</Animated.Text>
                  <TouchableOpacity onPress={handleIOSDone}><Text style={styles.modalDoneText}>완료</Text></TouchableOpacity>
                </View>
                <DateTimePicker value={tempNotiTime} mode="time" display="spinner" is24Hour={false} onChange={handleIOSTimeChange} locale="ko-KR" textColor={isDarkMode ? '#FFFFFF' : '#000000'} />
              </SafeAreaView>
            </Animated.View>
          </Modal>
        )}

        <Animated.Text style={[styles.guideText, { color: animatedColors.subTextColor }]}>
          * 시작 화면 설정을 켜면 앱 실행 시 월별 체크리스트가 먼저 보입니다.
        </Animated.Text>

      </SafeAreaView>

      {/* 안드로이드용 시간 선택 모달 */}
      {Platform.OS === 'android' && showPicker && (
        <DateTimePicker value={notiTime} mode="time" display="default" onChange={handleAndroidTimeChange} />
      )}

    </Animated.View>
  );
}

// 스타일 설정
const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1, paddingHorizontal: 20, paddingTop: 10 },
  sectionTitle: { fontSize: 14, fontWeight: '600', marginBottom: 15, marginLeft: 5, textTransform: 'uppercase' },
  settingItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderRadius: 15, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 2 },
  settingLabel: { flexDirection: 'row', alignItems: 'center' },
  settingText: { fontSize: 16, fontWeight: '500', marginLeft: 12 },
  timeText: { fontSize: 16, fontWeight: '600' },
  guideText: { fontSize: 12, marginTop: 30, textAlign: 'center' },
  backButton: { backgroundColor: 'transparent', padding: 5, justifyContent: 'center', alignItems: 'center' },
  modalBackdropWrapper: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 }, 
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' }, 
  modalSheet: { position: 'absolute', bottom: 0, left: 0, right: 0, borderTopLeftRadius: 25, borderTopRightRadius: 25, paddingBottom: 20, shadowColor: '#000', shadowOffset: { width: 0, height: -3 }, shadowOpacity: 0.1, shadowRadius: 5, elevation: 10 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(120,120,128,0.2)' },
  modalCancelText: { color: '#FF3B30', fontSize: 16, fontWeight: '600' },
  modalTitle: { fontSize: 17, fontWeight: 'bold' },
  modalDoneText: { color: '#4A90E2', fontSize: 16, fontWeight: 'bold' },
});