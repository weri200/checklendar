import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { 
  Animated, KeyboardAvoidingView, Modal, Platform, 
  ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, 
} from 'react-native';

// --- 1. 외부 라이브러리 및 공통 모듈 ---
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Stack, router, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Calendar } from 'react-native-calendars';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GestureHandlerRootView, Swipeable } from 'react-native-gesture-handler';

import { updateNotification } from '../useNotification';
import { useTheme } from './_layout';

// 앱 초기 실행 확인 플래그 (월별 모아보기 화면 자동 전환용)
let isAppJustLaunched = true;

// --- 2. 일정 색상 및 유틸리티 ---
const EVENT_PALETTE = [
  '#6A5ACD', '#FF7F50', '#40E0D0', '#FF69B4', '#1E90FF', 
  '#FFA500', '#9370DB', '#20B2AA', '#F08080', '#4682B4',
];

// 일정 ID를 기반으로 항상 일정한 색상을 반환
const getTaskColor = (id: string) => {
  const num = parseInt(id.slice(-6), 10) || 0;
  return EVENT_PALETTE[num % EVENT_PALETTE.length];
};

// --- 3. 데이터 타입 정의 ---
interface Task {
  id: string;              
  text: string;            
  range: [string, string]; // [시작일, 종료일]
  isDone: boolean;         // 완료 여부
}

interface TaskState {
  [key: string]: Task[];   // 날짜별 일정 목록
}

interface ThemeType {
  bg: string;              
  card: string;            
  text: string;            
  subText: string;         
  border: string;          
  icon: string;            
}

const PANEL_HEIGHT = 300;  

// --- 4. 개별 할 일 컴포넌트 (스와이프 액션 포함) ---
const AnimatedTaskItem = ({ item, theme, onToggle, onDelete, onEdit }: { 
  item: Task; 
  theme: ThemeType; 
  onToggle: (id: string) => void; 
  onDelete: (id: string) => void;
  onEdit: (id: string, currentText: string, currentRange: [string, string]) => void; 
}) => {
  const swipeableRef = useRef<Swipeable>(null);

  // 수정 버튼 클릭 시 스와이프 닫고 수정 모달 호출
  const handleEdit = () => {
    swipeableRef.current?.close();
    onEdit(item.id, item.text, item.range);
  };

  // 스와이프 시 우측에 나타날 수정/삭제 버튼
  const renderRightActions = () => (
    <View style={styles.actionContainer}>
      <TouchableOpacity onPress={handleEdit} style={styles.editAction} activeOpacity={0.6}>
        <Ionicons name="pencil-outline" size={24} color="#FFF" />
        <Text style={styles.actionBtnText}>수정</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={() => onDelete(item.id)} style={styles.deleteAction} activeOpacity={0.6}>
        <Ionicons name="trash-outline" size={24} color="#FFF" />
        <Text style={styles.actionBtnText}>삭제</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <Swipeable ref={swipeableRef} renderRightActions={renderRightActions} friction={2} overshootRight={false}>
      <View style={[styles.todoItem, { backgroundColor: theme.card }]}>
        <TouchableOpacity activeOpacity={0.7} onPress={() => onToggle(item.id)} style={styles.todoContent}>
          <View style={{ flex: 1 }}>
            <Text style={[
              styles.todoText, 
              { 
                color: item.isDone ? theme.subText : theme.text, 
                textDecorationLine: item.isDone ? 'line-through' : 'none' 
              }
            ]}>
              {item.text}
            </Text>
            <Text style={[styles.todoRange, { color: theme.subText }]}>
              {item.range[0]} ~ {item.range[1]}
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
  );
};

// --- 5. 메인 앱 화면 ---
export default function App() {
  
  // 앱 초기 실행 시 '모아보기(checklist)' 설정이라면 월별 화면으로 이동
  useEffect(() => {
    const checkMainView = async () => {
      try {
        if (!isAppJustLaunched) return;
        isAppJustLaunched = false;

        const mainView = await AsyncStorage.getItem('@main_view');
        if (mainView === 'checklist') {
          router.replace('/monthly'); 
        }
      } catch (e) {
        console.error(e);
      }
    };
    checkMainView();
  }, []);
  
  // [상태 관리] 테마 및 데이터
  const { isDarkMode } = useTheme();                                       
  const [tasks, setTasks] = useState<TaskState>({});                       
  const [viewDate, setViewDate] = useState(new Date().toISOString().split('T')[0]); 

  // [상태 관리] UI 모달 표시 여부
  const [isModalVisible, setModalVisible] = useState(false);               
  const [isMenuVisible, setMenuVisible] = useState(false);                 
  const [isSelecting, setIsSelecting] = useState(false);                   
  
  // [상태 관리] 새 일정 추가용
  const [addStartDate, setAddStartDate] = useState(viewDate);
  const [addEndDate, setAddEndDate] = useState(viewDate);
  const [taskText, setTaskText] = useState('');

  // [상태 관리] 일정 수정용
  const [isEditModalVisible, setEditModalVisible] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editTaskText, setEditTaskText] = useState('');
  const [editStartDate, setEditStartDate] = useState(viewDate);
  const [editEndDate, setEditEndDate] = useState(viewDate);
  const [isEditSelecting, setIsEditSelecting] = useState(false);

  // 하단 메뉴 애니메이션 설정
  const overlayOpacity = useRef(new Animated.Value(0)).current;            
  const panelTranslateY = useRef(new Animated.Value(PANEL_HEIGHT)).current;

  // 다크모드 적용 테마
  const theme = useMemo(() => ({
    bg: isDarkMode ? '#121212' : '#F8F9FA',
    card: isDarkMode ? '#1E1E1E' : '#FFFFFF',
    text: isDarkMode ? '#FFFFFF' : '#333333',
    subText: isDarkMode ? '#AAAAAA' : '#888888',
    border: isDarkMode ? '#333333' : '#EEEEEE',
    icon: isDarkMode ? '#FFFFFF' : '#333333',
  }), [isDarkMode]);

  // 로컬 스토리지에서 일정 불러오기
  useFocusEffect(
    useCallback(() => {
      const loadLatestTasks = async () => {
        try {
          const savedTasks = await AsyncStorage.getItem('@checklendar_tasks');
          if (savedTasks) setTasks(JSON.parse(savedTasks));
        } catch (e) { 
          console.error(e); 
        }
      };
      loadLatestTasks();
    }, [])
  );

  // 일정을 스토리지에 저장하고 알림 상태 업데이트
  const updateAndSaveTasks = useCallback(async (newTasks: TaskState) => {
    setTasks(newTasks); 
    try {
      await AsyncStorage.setItem('@checklendar_tasks', JSON.stringify(newTasks)); 
      updateNotification(); 
    } catch (e) { 
      console.error(e); 
    }
  }, []);

  // [기능] 새 일정 저장
  const saveTask = useCallback(() => {
    if (taskText.trim().length === 0) return; 
    
    const datesInRange = [];
    let curr = new Date(`${addStartDate}T00:00:00`); 
    const last = new Date(`${addEndDate}T00:00:00`);
    
    // 시작일~종료일 사이의 모든 날짜 계산
    while (curr <= last) {
      const y = curr.getFullYear();
      const m = String(curr.getMonth() + 1).padStart(2, '0');
      const d = String(curr.getDate()).padStart(2, '0');
      datesInRange.push(`${y}-${m}-${d}`);
      curr.setDate(curr.getDate() + 1);
    }

    const newTask: Task = { id: Date.now().toString(), text: taskText, range: [addStartDate, addEndDate], isDone: false };
    const updatedTasks = { ...tasks };
    
    // 해당되는 모든 날짜에 새 일정 삽입
    datesInRange.forEach(date => {
      updatedTasks[date] = [...(updatedTasks[date] || []), newTask];
    });

    updateAndSaveTasks(updatedTasks); 
    setTaskText(''); 
    setModalVisible(false); 
  }, [taskText, addStartDate, addEndDate, tasks, updateAndSaveTasks]);

  // [기능] 일정 완료/미완료 토글
  const toggleTaskCompletion = useCallback((taskId: string) => {
    const updatedTasks = { ...tasks };
    Object.keys(updatedTasks).forEach(date => {
      updatedTasks[date] = updatedTasks[date].map(t => t.id === taskId ? { ...t, isDone: !t.isDone } : t);
    });
    updateAndSaveTasks(updatedTasks); 
  }, [tasks, updateAndSaveTasks]);

  // [기능] 일정 영구 삭제
  const deleteTaskPermanently = useCallback((taskId: string) => {
    const updated = { ...tasks };
    Object.keys(updated).forEach(date => {
      updated[date] = updated[date].filter(t => t.id !== taskId);
      if (updated[date].length === 0) delete updated[date];
    });
    updateAndSaveTasks(updated);
  }, [tasks, updateAndSaveTasks]);

  // [기능] 수정 모달 열기 및 기존 데이터 세팅
  const openEditModal = useCallback((id: string, currentText: string, currentRange: [string, string]) => {
    setEditingTaskId(id);
    setEditTaskText(currentText);
    setEditStartDate(currentRange[0]);
    setEditEndDate(currentRange[1]);
    setIsEditSelecting(false);
    setEditModalVisible(true);
  }, []);

  // [기능] 수정된 일정 저장
  const saveEditedTask = useCallback(() => {
    if (!editingTaskId || editTaskText.trim().length === 0) return;
    
    // 기존 일정의 완료 상태(isDone) 유지하기 위해 찾음
    let currentIsDone = false;
    for (const date in tasks) {
      const foundTask = tasks[date].find(t => t.id === editingTaskId);
      if (foundTask) {
        currentIsDone = foundTask.isDone;
        break;
      }
    }

    const updatedTasks = { ...tasks };

    // 1. 기존 날짜들에서 해당 일정 제거
    Object.keys(updatedTasks).forEach(date => {
      updatedTasks[date] = updatedTasks[date].filter(t => t.id !== editingTaskId);
      if (updatedTasks[date].length === 0) delete updatedTasks[date];
    });

    const datesInRange = [];
    let curr = new Date(`${editStartDate}T00:00:00`); 
    const last = new Date(`${editEndDate}T00:00:00`);
    
    // 2. 새롭게 수정된 범위의 날짜 계산
    while (curr <= last) {
      const y = curr.getFullYear();
      const m = String(curr.getMonth() + 1).padStart(2, '0');
      const d = String(curr.getDate()).padStart(2, '0');
      datesInRange.push(`${y}-${m}-${d}`);
      curr.setDate(curr.getDate() + 1);
    }

    const updatedTask: Task = { 
      id: editingTaskId, 
      text: editTaskText, 
      range: [editStartDate, editEndDate], 
      isDone: currentIsDone 
    };

    // 3. 수정된 날짜들에 일정 재삽입
    datesInRange.forEach(date => {
      updatedTasks[date] = [...(updatedTasks[date] || []), updatedTask];
    });
    
    updateAndSaveTasks(updatedTasks);
    setEditModalVisible(false);
    setEditingTaskId(null);
    setEditTaskText('');
  }, [editingTaskId, editTaskText, editStartDate, editEndDate, tasks, updateAndSaveTasks]);

  // [기능] 하단 메뉴 제어 (열기/닫기)
  const handleOpenMenu = useCallback(() => setMenuVisible(true), []);
  const handleCloseMenu = useCallback(() => {
    Animated.parallel([
      Animated.timing(overlayOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
      Animated.timing(panelTranslateY, { toValue: PANEL_HEIGHT, duration: 250, useNativeDriver: true }),
    ]).start(() => setMenuVisible(false));
  }, [overlayOpacity, panelTranslateY]);

  useEffect(() => {
    if (isMenuVisible) {
      Animated.parallel([
        Animated.timing(overlayOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.spring(panelTranslateY, { toValue: 0, speed: 12, bounciness: 5, useNativeDriver: true }),
      ]).start();
    }
  }, [isMenuVisible, overlayOpacity, panelTranslateY]);

  // [이벤트] 추가 모달 내 달력 날짜 선택
  const handleDayPressInModal = useCallback((day: any) => {
    const clickedDate = day.dateString;
    if (!isSelecting) {
      setAddStartDate(clickedDate); setAddEndDate(clickedDate); setIsSelecting(true);
    } else {
      if (new Date(clickedDate) < new Date(addStartDate)) {
        setAddEndDate(addStartDate); setAddStartDate(clickedDate);
      } else {
        setAddEndDate(clickedDate);
      }
      setIsSelecting(false);
    }
  }, [isSelecting, addStartDate]);

  // [이벤트] 수정 모달 내 달력 날짜 선택
  const handleDayPressInEditModal = useCallback((day: any) => {
    const clickedDate = day.dateString;
    if (!isEditSelecting) {
      setEditStartDate(clickedDate); setEditEndDate(clickedDate); setIsEditSelecting(true);
    } else {
      if (new Date(clickedDate) < new Date(editStartDate)) {
        setEditEndDate(editStartDate); setEditStartDate(clickedDate);
      } else {
        setEditEndDate(clickedDate);
      }
      setIsEditSelecting(false);
    }
  }, [isEditSelecting, editStartDate]);

  // 메인 달력: 일정이 있는 날짜들을 마킹 처리
  const mainMarkedDates = useMemo(() => {
    const marks: { [key: string]: any } = {};
    Object.keys(tasks).forEach(date => { if (tasks[date].length > 0) marks[date] = { marked: true }; });
    marks[viewDate] = { ...marks[viewDate], customStyles: { container: { backgroundColor: '#4A90E2', borderRadius: 8 }, text: { color: '#FFF' } } };
    return marks;
  }, [tasks, viewDate]);

  // 추가 모달 달력: 선택된 기간의 배경색 칠하기
  const modalMarkedDates = useMemo(() => {
    const marks: { [key: string]: any } = {};
    const range = [];
    let curr = new Date(`${addStartDate}T00:00:00`);
    const end = new Date(`${addEndDate}T00:00:00`);
    while (curr <= end) {
      const y = curr.getFullYear();
      const m = String(curr.getMonth() + 1).padStart(2, '0');
      const d = String(curr.getDate()).padStart(2, '0');
      range.push(`${y}-${m}-${d}`);
      curr.setDate(curr.getDate() + 1);
    }
    range.forEach((d, i) => {
      marks[d] = { 
        color: i === 0 || i === range.length - 1 ? '#4A90E2' : (isDarkMode ? '#2C3E50' : '#E3F2FD'), 
        textColor: theme.text, startingDay: i === 0, endingDay: i === range.length - 1 
      };
    });
    return marks;
  }, [addStartDate, addEndDate, isDarkMode, theme.text]);

  // 수정 모달 달력: 선택된 기간의 배경색 칠하기
  const editModalMarkedDates = useMemo(() => {
    const marks: { [key: string]: any } = {};
    const range = [];
    let curr = new Date(`${editStartDate}T00:00:00`);
    const end = new Date(`${editEndDate}T00:00:00`);
    while (curr <= end) {
      const y = curr.getFullYear();
      const m = String(curr.getMonth() + 1).padStart(2, '0');
      const d = String(curr.getDate()).padStart(2, '0');
      range.push(`${y}-${m}-${d}`);
      curr.setDate(curr.getDate() + 1);
    }
    range.forEach((d, i) => {
      marks[d] = { 
        color: i === 0 || i === range.length - 1 ? '#4A90E2' : (isDarkMode ? '#2C3E50' : '#E3F2FD'), 
        textColor: theme.text, startingDay: i === 0, endingDay: i === range.length - 1 
      };
    });
    return marks;
  }, [editStartDate, editEndDate, isDarkMode, theme.text]);

  const closeModal = useCallback(() => setModalVisible(false), []);

  const openModal = useCallback(() => {
    setAddStartDate(viewDate); 
    setAddEndDate(viewDate); 
    setTaskText(''); 
    setModalVisible(true);
  }, [viewDate]);

  // 현재 보고있는 날짜의 일정 목록
  const currentTasks = tasks[viewDate] || [];

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
        <StatusBar style={isDarkMode ? 'light' : 'dark'} />
        <Stack.Screen options={{ headerShown: false }} />
        
        {/* 상단 헤더 */}
        <View style={styles.header}>
          <Text style={[styles.headerTitle, { color: theme.text }]}>Checklendar</Text>
          <TouchableOpacity onPress={handleOpenMenu}>
            <Ionicons name="menu" size={32} color={theme.icon} />
          </TouchableOpacity>
        </View>

        <ScrollView 
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
        >
          {/* 메인 달력 영역 */}
          <View style={[styles.calendarContainer, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Calendar
              key={isDarkMode ? 'dark' : 'light'}
              markingType={'custom'}
              markedDates={mainMarkedDates}
              onDayPress={(day: any) => setViewDate(day.dateString)}
              enableSwipeMonths={true}
              theme={{ 
                calendarBackground: theme.card, 
                dayTextColor: theme.text, 
                monthTextColor: theme.text, 
                arrowColor: '#4A90E2', 
                todayTextColor: '#4A90E2',
                ['stylesheet.calendar.main' as any]: {
                  week: { marginTop: 0, marginBottom: 0, flexDirection: 'row', justifyContent: 'space-around' }
                }
              }}
              
              // 달력 날짜(Cell) 커스텀 렌더링
              dayComponent={({date, state}: any) => {
                if (!date) return <View />;
                
                const dayTasks = [...(tasks[date.dateString] || [])].sort((a, b) => {
                  const aIsMulti = a.range[0] !== a.range[1];
                  const bIsMulti = b.range[0] !== b.range[1];
                  if (aIsMulti && !bIsMulti) return -1;
                  if (!aIsMulti && bIsMulti) return 1;
                  return a.id.localeCompare(b.id);
                });

                const isSunday = new Date(date.dateString).getDay() === 0;
                const isSelected = date.dateString === viewDate;
                const isToday = date.dateString === new Date().toISOString().split('T')[0];

                return (
                  <TouchableOpacity 
                    activeOpacity={0.6}
                    onPress={() => setViewDate(date.dateString)} 
                    style={[
                      styles.dayBox, 
                      { borderColor: theme.border }, 
                      isSelected && { backgroundColor: isDarkMode ? '#2A2A2A' : '#E3F2FD' }
                    ]}
                  >
                    <View style={[styles.dayNumberWrapper, isToday && styles.todayCircle]}>
                      <Text style={[
                        styles.dayText, 
                        isSunday && { color: '#FF5252' }, 
                        { color: (isToday || isSelected) ? '#FFF' : theme.text },
                        state === 'disabled' && { color: theme.subText } 
                      ]}>
                        {date.day}
                      </Text>
                    </View>

                    {/* 달력 날짜 안의 미니 일정 표시 (바 또는 점) */}
                    <View style={styles.eventListWrapper}>
                      {dayTasks.slice(0, 3).map((task) => {
                        const isMultiDay = task.range[0] !== task.range[1];
                        if (isMultiDay) {
                          const isStart = task.range[0] === date.dateString;
                          const isEnd = task.range[1] === date.dateString;
                          return (
                            <View key={task.id} style={[
                              styles.eventBar,
                              { backgroundColor: task.isDone ? '#34C759' : getTaskColor(task.id) },
                              isStart && { borderTopLeftRadius: 4, borderBottomLeftRadius: 4, marginLeft: 2 },
                              isEnd && { borderTopRightRadius: 4, borderBottomRightRadius: 4, width: '95%' }
                            ]}>
                              {(isStart || date.day === 1) && (
                                <Text style={styles.eventBarText} numberOfLines={1}>{task.text}</Text>
                              )}
                            </View>
                          );
                        } else {
                          return (
                            <View key={task.id} style={styles.singleEventRow}>
                              <View style={[styles.singleEventDot, { backgroundColor: task.isDone ? '#34C759' : getTaskColor(task.id) }]} />
                              <Text style={[styles.singleEventText, { color: theme.text }]} numberOfLines={1}>
                                {task.text}
                              </Text>
                            </View>
                          );
                        }
                      })}
                      {dayTasks.length > 3 && <Text style={[styles.moreText, { color: theme.subText }]}>...</Text>}
                    </View>
                  </TouchableOpacity>
                );
              }}
            />
          </View>

          {/* 특정 날짜의 할 일 목록 영역 */}
          <View style={styles.listContainer}>
            <Text style={[styles.listTitle, { color: theme.text }]}>{viewDate}의 할 일</Text>
            
            {currentTasks.length > 0 ? (
              currentTasks.map((item) => (
                <AnimatedTaskItem 
                  key={item.id} 
                  item={item} 
                  theme={theme} 
                  onToggle={toggleTaskCompletion} 
                  onDelete={deleteTaskPermanently}
                  onEdit={openEditModal}
                />
              ))
            ) : (
              <Text style={[styles.emptyText, { color: theme.subText }]}>예정된 일정이 없습니다.</Text>
            )}
          </View>
        </ScrollView>

        {/* 플러스 버튼 (새 일정 추가) */}
        <TouchableOpacity style={styles.fab} onPress={openModal}>
          <Ionicons name="add" size={32} color="#FFF" />
        </TouchableOpacity>

        {/* --- 새 일정 등록 모달 --- */}
        <Modal visible={isModalVisible} animationType="slide" presentationStyle="pageSheet">
          <SafeAreaView style={[styles.modalContainer, { backgroundColor: theme.bg }]}>
            <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? 70 : 20}>
              <ScrollView contentContainerStyle={{ flexGrow: 1, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
                <View style={[styles.modalHeader, { backgroundColor: theme.card, borderBottomWidth: 1, borderColor: theme.border }]}>
                  <TouchableOpacity onPress={closeModal}><Text style={styles.modalCancelText}>취소</Text></TouchableOpacity>
                  <Text style={[styles.modalTitle, { color: theme.text }]}>새 일정 추가</Text>
                  <TouchableOpacity onPress={saveTask}><Text style={styles.modalSaveText}>저장</Text></TouchableOpacity>
                </View>
                
                <View style={[styles.selectionInfo, { backgroundColor: theme.card }]}>
                  <View style={styles.infoBox}><Text style={styles.infoLabel}>시작일</Text><Text style={[styles.infoValue, { color: theme.text }]}>{addStartDate}</Text></View>
                  <View style={styles.arrowBox}><Ionicons name="arrow-forward" size={24} color="#4A90E2" /></View>
                  <View style={styles.infoBox}><Text style={styles.infoLabel}>종료일</Text><Text style={[styles.infoValue, { color: theme.text }]}>{addEndDate}</Text></View>
                </View>

                <View style={[styles.modalCalendarWrapper, { backgroundColor: theme.card }]}>
                  <Calendar markingType={'period'} markedDates={modalMarkedDates} enableSwipeMonths={true} theme={{ calendarBackground: theme.card, dayTextColor: theme.text, monthTextColor: theme.text, todayTextColor: '#4A90E2' }} onDayPress={handleDayPressInModal} />
                </View>

                <View style={styles.inputSection}>
                  <Text style={[styles.inputLabel, { color: theme.subText }]}>할 일 내용</Text>
                  <TextInput style={[styles.textInput, { backgroundColor: theme.card, color: theme.text, borderColor: theme.border }]} placeholder="어떤 일정이 있나요?" placeholderTextColor={theme.subText} value={taskText} onChangeText={setTaskText} />
                </View>
              </ScrollView>
            </KeyboardAvoidingView>
          </SafeAreaView>
        </Modal>

        {/* --- 일정 수정 모달 --- */}
        <Modal visible={isEditModalVisible} animationType="slide" presentationStyle="pageSheet">
          <SafeAreaView style={[styles.modalContainer, { backgroundColor: theme.bg }]}>
            <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? 70 : 20}>
              <ScrollView contentContainerStyle={{ flexGrow: 1, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
                <View style={[styles.modalHeader, { backgroundColor: theme.card, borderBottomWidth: 1, borderColor: theme.border }]}>
                  <TouchableOpacity onPress={() => setEditModalVisible(false)}><Text style={styles.modalCancelText}>취소</Text></TouchableOpacity>
                  <Text style={[styles.modalTitle, { color: theme.text }]}>일정 수정</Text>
                  <TouchableOpacity onPress={saveEditedTask}><Text style={styles.modalSaveText}>저장</Text></TouchableOpacity>
                </View>
                
                <View style={[styles.selectionInfo, { backgroundColor: theme.card }]}>
                  <View style={styles.infoBox}><Text style={styles.infoLabel}>시작일</Text><Text style={[styles.infoValue, { color: theme.text }]}>{editStartDate}</Text></View>
                  <View style={styles.arrowBox}><Ionicons name="arrow-forward" size={24} color="#4A90E2" /></View>
                  <View style={styles.infoBox}><Text style={styles.infoLabel}>종료일</Text><Text style={[styles.infoValue, { color: theme.text }]}>{editEndDate}</Text></View>
                </View>

                <View style={[styles.modalCalendarWrapper, { backgroundColor: theme.card }]}>
                  <Calendar markingType={'period'} markedDates={editModalMarkedDates} theme={{ calendarBackground: theme.card, dayTextColor: theme.text, monthTextColor: theme.text, todayTextColor: '#4A90E2' }} onDayPress={handleDayPressInEditModal} />
                </View>

                <View style={styles.inputSection}>
                  <Text style={[styles.inputLabel, { color: theme.subText }]}>할 일 내용</Text>
                  <TextInput style={[styles.textInput, { backgroundColor: theme.card, color: theme.text, borderColor: theme.border }]} placeholder="수정할 내용을 입력하세요" placeholderTextColor={theme.subText} value={editTaskText} onChangeText={setEditTaskText} />
                </View>
              </ScrollView>
            </KeyboardAvoidingView>
          </SafeAreaView>
        </Modal>

        {/* --- 하단 서랍 메뉴 (BottomSheet) --- */}
        <Modal visible={isMenuVisible} transparent={true} animationType="none">
          <Animated.View style={[styles.menuOverlay, { opacity: overlayOpacity }]}><TouchableOpacity style={styles.overlayTouchArea} activeOpacity={1} onPress={handleCloseMenu} /></Animated.View>
          <Animated.View style={[styles.menuPanel, { backgroundColor: theme.card, transform: [{ translateY: panelTranslateY }] }]}>
            <View style={styles.handleBar} /> 
            <SafeAreaView edges={['bottom']} style={styles.menuSafeArea}>
              <View style={styles.menuHeader}>
                <Text style={[styles.menuTitle, { color: theme.text }]}>메뉴</Text>
                <TouchableOpacity onPress={handleCloseMenu} style={styles.closeBtn}>
                  <Ionicons name="close" size={28} color={theme.icon} />
                </TouchableOpacity>
              </View>
              
              <TouchableOpacity style={styles.menuItem} onPress={() => { handleCloseMenu(); router.push('/monthly'); }}>
                <Ionicons name="list" size={22} color={theme.subText} />
                <Text style={[styles.menuItemText, { color: theme.text }]}>일정 모아보기</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.menuItem} onPress={() => { handleCloseMenu(); router.push('/settings'); }}>
                <Ionicons name="settings-outline" size={22} color={theme.subText} />
                <Text style={[styles.menuItemText, { color: theme.text }]}>설정</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.menuItem} onPress={() => { handleCloseMenu(); updateAndSaveTasks({}); }}>
                <Ionicons name="trash-outline" size={22} color="#FF5252" />
                <Text style={[styles.menuItemText, { color: '#FF5252' }]}>모든 일정 지우기</Text>
              </TouchableOpacity>
            </SafeAreaView>
          </Animated.View>
        </Modal>

      </SafeAreaView>
    </GestureHandlerRootView>
  );
}

// --- 6. 스타일 정의 ---
const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 15 },
  headerTitle: { fontSize: 26, fontWeight: 'bold' },

  calendarContainer: { marginHorizontal: 15, borderRadius: 15, elevation: 2, overflow: 'hidden', borderWidth: 1 },
  
  dayBox: { 
    width: '100%', 
    height: 80, 
    borderWidth: 0.5, 
    paddingTop: 2,
    overflow: 'hidden'
  },
  dayNumberWrapper: { width: 22, height: 22, alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
  todayCircle: { backgroundColor: '#4A90E2', borderRadius: 11 },
  dayText: { fontSize: 12, fontWeight: '500' },

  eventListWrapper: { marginTop: 1, width: '100%' },
  eventBar: { width: '105%', height: 14, marginVertical: 1, paddingHorizontal: 4, justifyContent: 'center' },
  eventBarText: { fontSize: 9, color: '#FFF', fontWeight: 'bold' },

  singleEventRow: { flexDirection: 'row', alignItems: 'center', height: 14, paddingHorizontal: 4 },
  singleEventDot: { width: 5, height: 5, borderRadius: 2.5, marginRight: 4 },
  singleEventText: { fontSize: 9, flex: 1 },
  moreText: { fontSize: 8, textAlign: 'center', marginTop: 1 },

  listContainer: { padding: 20 },
  listTitle: { fontSize: 18, fontWeight: '600', marginBottom: 15 },
  todoItem: { padding: 16, borderRadius: 15, marginBottom: 12, elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 3 },
  todoContent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  todoText: { fontSize: 16, fontWeight: '600' },
  todoRange: { fontSize: 11, marginTop: 4 },
  emptyText: { textAlign: 'center', marginTop: 30, fontSize: 15 },

  fab: { position: 'absolute', right: 20, bottom: 40, backgroundColor: '#4A90E2', width: 60, height: 60, borderRadius: 30, justifyContent: 'center', alignItems: 'center', elevation: 5 },
  
  actionContainer: { flexDirection: 'row', marginBottom: 12, marginLeft: 10 },
  editAction: { backgroundColor: '#4A90E2', justifyContent: 'center', alignItems: 'center', width: 65, borderRadius: 15 },
  deleteAction: { backgroundColor: '#FF3B30', justifyContent: 'center', alignItems: 'center', width: 65, borderRadius: 15, marginLeft: 8 },
  actionBtnText: { color: '#FFF', fontSize: 12, fontWeight: '600', marginTop: 4 },

  modalContainer: { flex: 1 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20 },
  modalCancelText: { color: '#FF5252', fontSize: 16 },
  modalSaveText: { color: '#4A90E2', fontSize: 16, fontWeight: 'bold' },
  modalTitle: { fontSize: 18, fontWeight: 'bold' },
  selectionInfo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 20, paddingHorizontal: 15 },
  infoBox: { flex: 1, alignItems: 'center' },
  infoLabel: { fontSize: 12, color: '#999', marginBottom: 5 },
  infoValue: { fontSize: 16, fontWeight: 'bold' },
  arrowBox: { alignItems: 'center', justifyContent: 'center', width: 40 },
  modalCalendarWrapper: { paddingBottom: 10 },
  inputSection: { padding: 20 },
  inputLabel: { fontSize: 14, marginBottom: 10, fontWeight: '600' },
  textInput: { padding: 15, borderRadius: 12, fontSize: 16, borderWidth: 1 },

  menuOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0, 0, 0, 0.4)', zIndex: 10 },
  overlayTouchArea: { flex: 1 },
  menuPanel: { position: 'absolute', bottom: 0, width: '100%', borderTopLeftRadius: 30, borderTopRightRadius: 30, paddingTop: 12, zIndex: 20 },
  handleBar: { width: 40, height: 5, backgroundColor: '#E0E0E0', borderRadius: 3, alignSelf: 'center', marginBottom: 10 },
  menuSafeArea: { paddingHorizontal: 25, paddingBottom: 20 },
  menuHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 15 },
  menuTitle: { fontSize: 22, fontWeight: 'bold' },
  closeBtn: { padding: 5 },
  menuItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 18, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(0,0,0,0.05)' },
  menuItemText: { fontSize: 16, marginLeft: 15, fontWeight: '500' },
});
