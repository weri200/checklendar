import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, Stack, useFocusEffect } from 'expo-router'; // 🌟 화면에 들어올 때마다 새로고침하기 위해 필요해요.
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useMemo, useState } from 'react';
import { SectionList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GestureHandlerRootView, Swipeable } from 'react-native-gesture-handler';

import { useTheme } from './_layout';
import { updateNotification } from '../useNotification'; // 알림 동기화용 함수

// ----------------------------------------------------------------------------
// [데이터 설계도]
// 앱에서 다루는 '할 일'이 어떻게 생겼는지 정의합니다.
// ----------------------------------------------------------------------------
interface Task {
  id: string;      // 할 일 고유 번호
  text: string;    // 할 일 내용
  range: [string, string]; // [시작일, 종료일]
  isDone: boolean; // 완료 여부
}

interface TaskState {
  [key: string]: Task[]; // 날짜별로 할 일 배열을 담는 주머니
}

export default function MonthlyScreen() {
  // 앱 전체의 다크모드 서랍에서 현재 상태를 꺼내옵니다.
  const { isDarkMode } = useTheme();
  
  // 화면에 그릴 전체 일정 데이터를 보관하는 장소입니다.
  const [tasks, setTasks] = useState<TaskState>({});

  // 🌟 [테마 설정] 다크모드 여부에 따라 색상을 미리 준비합니다. (버벅임 방지)
  const theme = useMemo(() => ({
    bg: isDarkMode ? '#121212' : '#F8F9FA',
    card: isDarkMode ? '#1E1E1E' : '#FFFFFF',
    text: isDarkMode ? '#FFFFFF' : '#333333',
    subText: isDarkMode ? '#AAAAAA' : '#888888',
    border: isDarkMode ? '#333333' : '#EEEEEE',
    icon: isDarkMode ? '#FFFFFF' : '#333333',
  }), [isDarkMode]);

  // ----------------------------------------------------------------------------
  // [1. 데이터 불러오기]
  // ----------------------------------------------------------------------------
  
  // 🌟 메인 화면에서 이 화면으로 넘어올 때마다 최신 데이터를 서랍(Storage)에서 꺼내옵니다.
  useFocusEffect(
    useCallback(() => {
      const loadTasks = async () => {
        try {
          const saved = await AsyncStorage.getItem('@checklendar_tasks');
          if (saved) setTasks(JSON.parse(saved));
        } catch (e) {
          console.error('데이터 불러오기 오류:', e);
        }
      };
      loadTasks();
    }, [])
  );

  // ----------------------------------------------------------------------------
  // [2. 데이터 조작하기 (저장, 체크, 삭제)]
  // ----------------------------------------------------------------------------

  // (1) 변경된 데이터를 휴대폰에 저장하고 알림 예약도 갱신하는 공용 함수
  const updateAndSaveTasks = useCallback(async (newTasks: TaskState) => {
    setTasks(newTasks); 
    try {
      await AsyncStorage.setItem('@checklendar_tasks', JSON.stringify(newTasks)); 
      updateNotification(); // 데이터가 바뀌면 알림 예약도 다시 세팅!
    } catch (e) { 
      console.error('데이터 저장 오류:', e); 
    }
  }, []);

  // (2) 일정을 터치했을 때 완료/미완료 상태를 반대로 뒤집는 함수
  const toggleTaskCompletion = useCallback((taskId: string) => {
    const updated = { ...tasks };
    Object.keys(updated).forEach(date => {
      updated[date] = updated[date].map(t => t.id === taskId ? { ...t, isDone: !t.isDone } : t);
    });
    updateAndSaveTasks(updated);
  }, [tasks, updateAndSaveTasks]);

  // (3) 왼쪽으로 밀어서 삭제를 눌렀을 때, 모든 날짜에서 해당 일정을 지우는 함수
  const deleteTaskPermanently = useCallback((taskId: string) => {
    const updated = { ...tasks };
    Object.keys(updated).forEach(date => {
      updated[date] = updated[date].filter(t => t.id !== taskId);
      if (updated[date].length === 0) delete updated[date];
    });
    updateAndSaveTasks(updated);
  }, [tasks, updateAndSaveTasks]);

  // ----------------------------------------------------------------------------
  // [3. 데이터 가공 (월별 그룹화)]
  // ----------------------------------------------------------------------------
  
  // 흩어져 있는 날짜별 데이터를 '2026년 4월' 같은 상자에 예쁘게 담는 과정입니다.
  const sections = useMemo(() => {
    const uniqueTasks = new Map<string, Task>();

    // 1단계: 여러 날짜에 걸친 일정이라도 딱 1개만 나오도록 ID 기준으로 골라냅니다.
    Object.values(tasks).forEach(dayTasks => {
      dayTasks.forEach(task => {
        if (!uniqueTasks.has(task.id)) {
          uniqueTasks.set(task.id, task);
        }
      });
    });

    // 2단계: 골라낸 일정들을 '시작 날짜'를 기준으로 해당 월(Month) 상자에 분류합니다.
    const grouped: { [month: string]: Task[] } = {};

    Array.from(uniqueTasks.values()).forEach(task => {
      const [year, month] = task.range[0].split('-');
      const monthKey = `${year}년 ${month}월`;

      if (!grouped[monthKey]) grouped[monthKey] = [];
      grouped[monthKey].push(task);
    });

    // 3단계: 화면에 보여줄 순서대로(4월 -> 5월) 예쁘게 정렬하여 최종 리스트를 만듭니다.
    return Object.keys(grouped)
      .sort((a, b) => a.localeCompare(b)) // 이른 달부터 나오게 오름차순 정렬
      .map(key => {
        const sortedTasks = grouped[key].sort((a, b) => a.range[0].localeCompare(b.range[0]));
        return {
          title: key,
          data: sortedTasks,
        };
      });
  }, [tasks]);

  // ----------------------------------------------------------------------------
  // [4. 화면 그리기 (UI)]
  // ----------------------------------------------------------------------------
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
        <StatusBar style={isDarkMode ? 'light' : 'dark'} />
        <Stack.Screen options={{ headerShown: false }} />
        
        {/* 상단 헤더: 뒤로가기 버튼과 제목 */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={28} color={theme.icon} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: theme.text }]}>월별 모아보기</Text>
          <View style={{ width: 28 }} />
        </View>

        {/* 메인 리스트: 월별로 섹션이 나뉘어 일정을 보여줍니다. */}
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 20, paddingBottom: 50 }}
          stickySectionHeadersEnabled={false}
          
          // 각 '월' 제목 디자인 (예: 2026년 4월)
          renderSectionHeader={({ section: { title } }) => (
            <Text style={[styles.sectionTitle, { color: theme.text }]}>{title}</Text>
          )}

          // 개별 할 일 카드 디자인
          renderItem={({ item }) => (
            <Swipeable
              friction={2}
              overshootRight={false}
              renderRightActions={() => (
                <TouchableOpacity 
                  onPress={() => deleteTaskPermanently(item.id)} 
                  style={styles.deleteAction}
                  activeOpacity={0.6}
                >
                  <Ionicons name="trash-outline" size={24} color="#FFF" />
                  <Text style={styles.deleteBtnText}>삭제</Text>
                </TouchableOpacity>
              )}
            >
              <View style={[styles.taskCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                <TouchableOpacity 
                  activeOpacity={0.7} 
                  onPress={() => toggleTaskCompletion(item.id)} 
                  style={styles.taskContent}
                >
                  <View style={{ flex: 1 }}>
                    <Text 
                      style={[
                        styles.taskText, 
                        { 
                          color: item.isDone ? theme.subText : theme.text,
                          textDecorationLine: item.isDone ? 'line-through' : 'none'
                        }
                      ]} 
                      numberOfLines={1}
                    >
                      {item.text}
                    </Text>
                    <Text style={[styles.taskRange, { color: theme.subText }]}>
                      {item.range[0] === item.range[1] ? item.range[0] : `${item.range[0]} ~ ${item.range[1]}`}
                    </Text>
                  </View>
                  <Ionicons 
                    name={item.isDone ? "checkmark-circle" : "ellipse-outline"} 
                    size={26} 
                    color={item.isDone ? "#34C759" : theme.subText} 
                    style={{ marginLeft: 12 }} 
                  />
                </TouchableOpacity>
              </View>
            </Swipeable>
          )}

          // 데이터가 하나도 없을 때 보여줄 안내 문구
          ListEmptyComponent={
            <Text style={[styles.emptyText, { color: theme.subText }]}>저장된 일정이 없습니다.</Text>
          }
        />
      </SafeAreaView>
    </GestureHandlerRootView>
  );
}

// ----------------------------------------------------------------------------
// [스타일 정의]
// ----------------------------------------------------------------------------
const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 15 },
  headerTitle: { fontSize: 20, fontWeight: 'bold' },
  backBtn: { padding: 5, marginLeft: -5 },
  sectionTitle: { fontSize: 24, fontWeight: 'bold', marginTop: 20, marginBottom: 15, marginLeft: 5 },
  
  taskCard: { borderRadius: 15, padding: 16, marginBottom: 12, borderWidth: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 3, elevation: 1 },
  taskContent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  taskText: { fontSize: 16, fontWeight: '600' },
  taskRange: { fontSize: 12, marginTop: 4 },
  
  deleteAction: { backgroundColor: '#FF3B30', justifyContent: 'center', alignItems: 'center', width: 80, borderRadius: 15, marginBottom: 12, marginLeft: 10 },
  deleteBtnText: { color: '#FFF', fontSize: 12, fontWeight: '600', marginTop: 4 },

  emptyText: { textAlign: 'center', marginTop: 50, fontSize: 16 },
});