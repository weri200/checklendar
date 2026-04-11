import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, Stack, useFocusEffect } from 'expo-router'; // 🌟 useFocusEffect 필수!
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useMemo, useState } from 'react';
import { SectionList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GestureHandlerRootView, Swipeable } from 'react-native-gesture-handler';

import { useTheme } from './_layout';
import { updateNotification } from '../useNotification';

// ----------------------------------------------------------------------------
// [데이터 규격서 (Interface)]
// 할 일 데이터가 어떻게 생겼는지 정의합니다.
// ----------------------------------------------------------------------------
interface Task {
  id: string;
  text: string;
  range: [string, string];
  isDone: boolean;
}

interface TaskState {
  [key: string]: Task[];
}

export default function MonthlyScreen() {
  // 공용 서랍에서 현재 다크모드 상태를 꺼내옵니다.
  const { isDarkMode } = useTheme();
  
  // 이 화면에서 보여줄 전체 일정 데이터를 담는 공간입니다.
  const [tasks, setTasks] = useState<TaskState>({});

  // 다크모드/라이트모드에 따라 예쁜 색상을 미리 세팅해 둡니다. (버벅임 방지용 useMemo)
  const theme = useMemo(() => ({
    bg: isDarkMode ? '#121212' : '#F8F9FA',
    card: isDarkMode ? '#1E1E1E' : '#FFFFFF',
    text: isDarkMode ? '#FFFFFF' : '#333333',
    subText: isDarkMode ? '#AAAAAA' : '#888888',
    border: isDarkMode ? '#333333' : '#EEEEEE',
    icon: isDarkMode ? '#FFFFFF' : '#333333',
  }), [isDarkMode]);

  // ----------------------------------------------------------------------------
  // [1. 데이터 불러오기 (최적화 완료)]
  // ----------------------------------------------------------------------------
  
  // 🌟 [최적화 포인트] useEffect 대신 useFocusEffect를 사용합니다.
  // 메인 화면에서 일정을 추가하고 이 화면으로 넘어올 때마다
  // 서랍(AsyncStorage)을 새로 열어보고 최신 상태를 즉시 반영합니다!
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
  // [2. 데이터 조작하기 (체크, 삭제, 저장)]
  // ----------------------------------------------------------------------------

  // 🌟 [최적화 포인트] useCallback을 사용해 함수를 메모리에 단단히 고정합니다.
  
  // (1) 변경된 데이터를 서랍(휴대폰)에 저장하고 알림도 다시 세팅하는 든든한 함수
  const updateAndSaveTasks = useCallback(async (newTasks: TaskState) => {
    setTasks(newTasks); 
    try {
      await AsyncStorage.setItem('@checklendar_tasks', JSON.stringify(newTasks)); 
      updateNotification(); 
    } catch (e) { 
      console.error('데이터 저장 오류:', e); 
    }
  }, []);

  // (2) 일정을 눌렀을 때 동그라미(완료/미완료)를 바꿔주는 함수
  const toggleTaskCompletion = useCallback((taskId: string) => {
    const updated = { ...tasks };
    Object.keys(updated).forEach(date => {
      // 선택한 ID랑 똑같은 일정을 찾으면 isDone 스위치를 반대로 뒤집습니다.
      updated[date] = updated[date].map(t => t.id === taskId ? { ...t, isDone: !t.isDone } : t);
    });
    updateAndSaveTasks(updated); // 바꾼 결과를 저장!
  }, [tasks, updateAndSaveTasks]);

  // (3) 일정을 왼쪽으로 밀어서 빨간 '삭제' 버튼을 눌렀을 때 아예 지워버리는 함수
  const deleteTaskPermanently = useCallback((taskId: string) => {
    const updated = { ...tasks };
    Object.keys(updated).forEach(date => {
      // 선택한 ID랑 다른 일정들만 남기고(filter), 나머진 날려버립니다.
      updated[date] = updated[date].filter(t => t.id !== taskId);
      // 만약 그 날짜에 일정이 하나도 안 남았다면 빈 껍데기(날짜)도 지워줍니다.
      if (updated[date].length === 0) delete updated[date];
    });
    updateAndSaveTasks(updated); // 바꾼 결과를 저장!
  }, [tasks, updateAndSaveTasks]);

  // ----------------------------------------------------------------------------
  // [3. 데이터를 예쁘게 그룹화하기 (가공)]
  // ----------------------------------------------------------------------------
  
  // 흩어져 있는 날짜별 데이터를 'YYYY년 MM월' 이라는 상자에 차곡차곡 담습니다.
  const sections = useMemo(() => {
    const uniqueTasks = new Map<string, Task>();

    // 1단계: 다중 날짜 일정일 경우, 중복되지 않게 고유 ID 기준으로 딱 1개만 골라냅니다.
    Object.values(tasks).forEach(dayTasks => {
      dayTasks.forEach(task => {
        if (!uniqueTasks.has(task.id)) {
          uniqueTasks.set(task.id, task);
        }
      });
    });

    // 2단계: 골라낸 일정들을 '시작일' 기준으로 무슨 달(월)인지 파악해서 분류합니다.
    const grouped: { [month: string]: Task[] } = {};

    Array.from(uniqueTasks.values()).forEach(task => {
      const [year, month] = task.range[0].split('-');
      const monthKey = `${year}년 ${month}월`;

      if (!grouped[monthKey]) grouped[monthKey] = [];
      grouped[monthKey].push(task);
    });

    // 3단계: 화면에 그리기 좋게 배열로 바꾸고, 순서대로(이른 달부터) 정렬합니다.
    return Object.keys(grouped)
      .sort((a, b) => a.localeCompare(b)) // 이른 달(과거)부터 먼저 나오게 정렬
      .map(key => {
        // 같은 달 안에서도 시작일이 빠른 순서대로 한 번 더 정렬합니다.
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

        {/* 상단 헤더 영역 (뒤로가기 버튼 + 제목) */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={28} color={theme.icon} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: theme.text }]}>월별 모아보기</Text>
          <View style={{ width: 28 }} /> {/* 제목 중앙 정렬용 투명 블록 */}
        </View>

        {/* 월별 일정 리스트 (SectionList) */}
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 20, paddingBottom: 50 }}
          stickySectionHeadersEnabled={false} // 스크롤 시 월 제목이 위에 안 붙게 설정
          
          // 각 '월'의 제목을 그려주는 부분
          renderSectionHeader={({ section: { title } }) => (
            <Text style={[styles.sectionTitle, { color: theme.text }]}>{title}</Text>
          )}
          
          // 그 달 안의 개별 할 일들을 그려주는 부분
          renderItem={({ item }) => (
            // Swipeable: 왼쪽으로 밀어서 삭제 버튼을 띄우는 상자
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
              {/* 할 일 카드 본체 */}
              <View style={[styles.taskCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                <TouchableOpacity activeOpacity={0.7} onPress={() => toggleTaskCompletion(item.id)} style={styles.taskContent}>
                  
                  <View style={{ flex: 1 }}>
                    {/* 할 일 내용 */}
                    <Text style={[
                      styles.taskText, 
                      { 
                        color: item.isDone ? theme.subText : theme.text,
                        textDecorationLine: item.isDone ? 'line-through' : 'none'
                      }
                    ]} numberOfLines={1}>
                      {item.text}
                    </Text>
                    
                    {/* 날짜 표시 */}
                    <Text style={[styles.taskRange, { color: theme.subText }]}>
                      {item.range[0] === item.range[1] ? item.range[0] : `${item.range[0]} ~ ${item.range[1]}`}
                    </Text>
                  </View>

                  {/* 체크 표시 아이콘 */}
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
          
          // 일정이 없을 때의 화면
          ListEmptyComponent={
            <Text style={[styles.emptyText, { color: theme.subText }]}>저장된 일정이 없습니다.</Text>
          }
        />
      </SafeAreaView>
    </GestureHandlerRootView>
  );
}

// ----------------------------------------------------------------------------
// [디자인 (스타일) 영역]
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