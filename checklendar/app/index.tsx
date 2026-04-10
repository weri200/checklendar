import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { 
  Animated, FlatList, KeyboardAvoidingView, Modal, Platform, 
  ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View 
} from 'react-native';

// [외부 라이브러리 및 도구]
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Calendar } from 'react-native-calendars';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GestureHandlerRootView, Swipeable } from 'react-native-gesture-handler';

// [커스텀 유틸리티 및 테마]
import { updateNotification } from '../useNotification';
import { useTheme } from './_layout';

// ----------------------------------------------------------------------------
// 1. [데이터 및 테마 규격 정의 (Interface)]
// ----------------------------------------------------------------------------
interface Task {
  id: string;              // 할 일의 고유 번호 (생성 시간 기준)
  text: string;            // 할 일 내용
  range: [string, string]; // [시작일, 종료일]
  isDone: boolean;         // 완료 여부
}

interface TaskState {
  [key: string]: Task[];   // '2026-04-10': [Task, Task...] 형태의 날짜별 저장소
}

interface ThemeType {
  bg: string;              // 배경색
  card: string;            // 카드/모달 배경색
  text: string;            // 기본 글자색
  subText: string;         // 부가 정보 글자색
  border: string;          // 테두리 색상
  icon: string;            // 아이콘 색상
}

const PANEL_HEIGHT = 300;  // 바텀 메뉴(시트)의 고정 높이

// ----------------------------------------------------------------------------
// 2. [서브 컴포넌트: AnimatedTaskItem] - 할 일 목록의 개별 아이템
// ----------------------------------------------------------------------------
const AnimatedTaskItem = ({ item, theme, onToggle, onDelete }: { 
  item: Task; theme: ThemeType; onToggle: (id: string) => void; onDelete: (id: string) => void 
}) => {
  
  // [슬라이드 액션] 왼쪽으로 밀었을 때 나타날 삭제 버튼 UI
  const renderRightActions = () => (
    <TouchableOpacity 
      onPress={() => onDelete(item.id)} 
      style={styles.deleteAction}
      activeOpacity={0.6}
    >
      <Ionicons name="trash-outline" size={24} color="#FFF" />
      <Text style={styles.deleteBtnText}>삭제</Text>
    </TouchableOpacity>
  );

  return (
    <Swipeable renderRightActions={renderRightActions} friction={2} overshootRight={false}>
      <View style={[styles.todoItem, { backgroundColor: theme.card }]}>
        <TouchableOpacity activeOpacity={0.7} onPress={() => onToggle(item.id)} style={styles.todoContent}>
          <View style={{ flex: 1 }}>
            {/* 완료 시 색상을 흐리게(subText) 바꾸고 취소선을 긋습니다. */}
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

// ----------------------------------------------------------------------------
// 3. [메인 컴포넌트: App] - 앱의 두뇌 및 화면 렌더링
// ----------------------------------------------------------------------------
export default function App() {
  // --- [A. 상태 관리 (State)] ---
  const { isDarkMode } = useTheme(); 
  const [tasks, setTasks] = useState<TaskState>({});                       // 전체 일정 데이터
  const [viewDate, setViewDate] = useState(new Date().toISOString().split('T')[0]); // 현재 선택된 날짜

  // UI 제어 상태
  const [isModalVisible, setModalVisible] = useState(false);               // 일정 추가 팝업
  const [isMenuVisible, setMenuVisible] = useState(false);                 // 바텀 메뉴
  const [isSelecting, setIsSelecting] = useState(false);                   // 날짜 범위 선택 모드 여부
  
  // 일정 입력 상태
  const [addStartDate, setAddStartDate] = useState(viewDate);
  const [addEndDate, setAddEndDate] = useState(viewDate);
  const [taskText, setTaskText] = useState('');

  // --- [B. 애니메이션 및 테마 설정] ---
  const overlayOpacity = useRef(new Animated.Value(0)).current;            // 메뉴 배경 투명도
  const panelTranslateY = useRef(new Animated.Value(PANEL_HEIGHT)).current;// 메뉴 슬라이드 위치

  const theme = useMemo(() => ({
    bg: isDarkMode ? '#121212' : '#F8F9FA',
    card: isDarkMode ? '#1E1E1E' : '#FFFFFF',
    text: isDarkMode ? '#FFFFFF' : '#333333',
    subText: isDarkMode ? '#AAAAAA' : '#888888',
    border: isDarkMode ? '#333333' : '#EEEEEE',
    icon: isDarkMode ? '#FFFFFF' : '#333333',
  }), [isDarkMode]);

  // --- [C. 데이터 처리 로직 (Storage & CRUD)] ---
  
  // 초기 데이터 불러오기
  useEffect(() => {
    (async () => {
      try {
        const savedTasks = await AsyncStorage.getItem('@checklendar_tasks');
        if (savedTasks) setTasks(JSON.parse(savedTasks));
      } catch (e) { console.error('Data Load Error:', e); }
    })();
  }, []);

  // [핵심] 데이터 저장 및 알림 동기화 함수
  const updateAndSaveTasks = async (newTasks: TaskState) => {
    setTasks(newTasks); 
    try {
      await AsyncStorage.setItem('@checklendar_tasks', JSON.stringify(newTasks)); 
      updateNotification(); // 데이터 변경 시 알림 스케줄 갱신
    } catch (e) { console.error('Data Save Error:', e); }
  };

  // 일정 추가 로직
  const saveTask = useCallback(() => {
    if (taskText.trim().length === 0) return; 
    
    // 선택한 기간 사이의 모든 날짜 추출
    const datesInRange = [];
    let curr = new Date(addStartDate);
    const last = new Date(addEndDate);
    while (curr <= last) {
      datesInRange.push(curr.toISOString().split('T')[0]);
      curr.setDate(curr.getDate() + 1);
    }

    const newTask: Task = { id: Date.now().toString(), text: taskText, range: [addStartDate, addEndDate], isDone: false };
    const updatedTasks = { ...tasks };
    
    datesInRange.forEach(date => {
      updatedTasks[date] = [...(updatedTasks[date] || []), newTask];
    });

    updateAndSaveTasks(updatedTasks); 
    setTaskText(''); setModalVisible(false);
  }, [taskText, addStartDate, addEndDate, tasks]);

  // 완료 상태 변경
  const toggleTaskCompletion = useCallback((taskId: string) => {
    const updatedTasks = { ...tasks };
    Object.keys(updatedTasks).forEach(date => {
      updatedTasks[date] = updatedTasks[date].map(t => t.id === taskId ? { ...t, isDone: !t.isDone } : t);
    });
    updateAndSaveTasks(updatedTasks); 
  }, [tasks]);

  // 영구 삭제 (모든 날짜에서 해당 ID 삭제)
  const deleteTaskPermanently = useCallback((taskId: string) => {
    const updated = { ...tasks };
    Object.keys(updated).forEach(date => {
      updated[date] = updated[date].filter(t => t.id !== taskId);
      if (updated[date].length === 0) delete updated[date];
    });
    updateAndSaveTasks(updated);
  }, [tasks]);

  // --- [D. UI 핸들러 (Menu & Calendar)] ---
  
  const handleOpenMenu = () => setMenuVisible(true);
  const handleCloseMenu = useCallback(() => {
    Animated.parallel([
      Animated.timing(overlayOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
      Animated.timing(panelTranslateY, { toValue: PANEL_HEIGHT, duration: 250, useNativeDriver: true }),
    ]).start(() => setMenuVisible(false));
  }, []);

  useEffect(() => {
    if (isMenuVisible) {
      Animated.parallel([
        Animated.timing(overlayOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.spring(panelTranslateY, { toValue: 0, speed: 12, bounciness: 5, useNativeDriver: true }),
      ]).start();
    }
  }, [isMenuVisible]);

  // 달력 날짜 터치 처리 (추가 모달용)
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

  // 달력 마킹 데이터 계산
  const mainMarkedDates = useMemo(() => {
    const marks: { [key: string]: any } = {};
    Object.keys(tasks).forEach(date => { if (tasks[date].length > 0) marks[date] = { marked: true }; });
    marks[viewDate] = { ...marks[viewDate], customStyles: { container: { backgroundColor: '#4A90E2', borderRadius: 8 }, text: { color: '#FFF' } } };
    return marks;
  }, [tasks, viewDate]);

  const modalMarkedDates = useMemo(() => {
    const marks: { [key: string]: any } = {};
    const range = [];
    let curr = new Date(addStartDate);
    while (curr <= new Date(addEndDate)) {
      range.push(curr.toISOString().split('T')[0]);
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

  // --- [E. 화면 렌더링 (View)] ---
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
        <StatusBar style={isDarkMode ? 'light' : 'dark'} />
        <Stack.Screen options={{ headerShown: false }} />
        
        {/* 헤더 부부 */}
        <View style={styles.header}>
          <Text style={[styles.headerTitle, { color: theme.text }]}>Checklendar</Text>
          <TouchableOpacity onPress={handleOpenMenu}>
            <Ionicons name="menu" size={32} color={theme.icon} />
          </TouchableOpacity>
        </View>

        {/* 달력 섹션 */}
        <View style={[styles.calendarContainer, { backgroundColor: theme.card }]}>
          <Calendar
            key={isDarkMode ? 'dark' : 'light'}
            markingType={'custom'}
            markedDates={mainMarkedDates}
            onDayPress={(day) => setViewDate(day.dateString)}
            theme={{ calendarBackground: theme.card, dayTextColor: theme.text, monthTextColor: theme.text, arrowColor: '#4A90E2', todayTextColor: '#4A90E2' }}
            dayComponent={({date, state}) => {
              if (!date) return <View />;
              const dayTasks = tasks[date.dateString] || [];
              const incomplete = dayTasks.filter(t => !t.isDone).length;
              const completed = dayTasks.filter(t => t.isDone).length;
              const isSunday = new Date(date.dateString).getDay() === 0;
              const isSelected = date.dateString === viewDate;
              return (
                <TouchableOpacity onPress={() => setViewDate(date.dateString)} style={[styles.dayBox, isSelected && { backgroundColor: '#4A90E2' }]}>
                  <Text style={[styles.dayText, isSunday && { color: '#FF5252' }, { color: isSelected ? '#FFF' : theme.text }, state === 'disabled' && { color: isDarkMode ? '#444' : '#ccc' }]}>{date.day}</Text>
                  <View style={styles.badgeContainer}>
                    {incomplete > 0 && (incomplete === 1 ? <View style={[styles.dot, { backgroundColor: '#0064FF', marginRight: completed > 0 ? 4 : 0 }]} /> : <Text style={[styles.countText, { color: '#0064FF', marginRight: completed > 0 ? 4 : 0 }]}>{incomplete}</Text>)}
                    {completed > 0 && (completed === 1 ? <View style={[styles.dot, { backgroundColor: '#34C759' }]} /> : <Text style={[styles.countText, { color: '#34C759' }]}>{completed}</Text>)}
                  </View>
                </TouchableOpacity>
              );
            }}
          />
        </View>

        {/* 할 일 목록 리스트 */}
        <View style={styles.listContainer}>
          <Text style={[styles.listTitle, { color: theme.text }]}>{viewDate}의 할 일</Text>
          <FlatList
            data={tasks[viewDate] || []}
            keyExtractor={(item) => item.id}
            renderItem={({item}) => (
              <AnimatedTaskItem item={item} theme={theme} onToggle={toggleTaskCompletion} onDelete={deleteTaskPermanently} />
            )}
            ListEmptyComponent={<Text style={[styles.emptyText, { color: theme.subText }]}>예정된 일정이 없습니다.</Text>}
          />
        </View>

        {/* 추가 버튼 (FAB) */}
        <TouchableOpacity style={styles.fab} onPress={() => { setAddStartDate(viewDate); setAddEndDate(viewDate); setTaskText(''); setModalVisible(true); }}>
          <Ionicons name="add" size={32} color="#FFF" />
        </TouchableOpacity>

        {/* [모달 1] 일정 추가 */}
        <Modal visible={isModalVisible} animationType="slide" presentationStyle="pageSheet">
          <SafeAreaView style={[styles.modalContainer, { backgroundColor: theme.bg }]}>
            <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={70}>
              <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
                <View style={[styles.modalHeader, { backgroundColor: theme.card, borderBottomWidth: 1, borderColor: theme.border }]}>
                  <TouchableOpacity onPress={() => setModalVisible(false)}><Text style={styles.modalCancelText}>취소</Text></TouchableOpacity>
                  <Text style={[styles.modalTitle, { color: theme.text }]}>새 일정 추가</Text>
                  <TouchableOpacity onPress={saveTask}><Text style={styles.modalSaveText}>저장</Text></TouchableOpacity>
                </View>
                
                <View style={[styles.selectionInfo, { backgroundColor: theme.card }]}>
                  <View style={styles.infoBox}><Text style={styles.infoLabel}>시작일</Text><Text style={[styles.infoValue, { color: theme.text }]}>{addStartDate}</Text></View>
                  <View style={styles.arrowBox}><Ionicons name="arrow-forward" size={24} color="#4A90E2" /></View>
                  <View style={styles.infoBox}><Text style={styles.infoLabel}>종료일</Text><Text style={[styles.infoValue, { color: theme.text }]}>{addEndDate}</Text></View>
                </View>

                <View style={[styles.modalCalendarWrapper, { backgroundColor: theme.card }]}>
                  <Calendar markingType={'period'} markedDates={modalMarkedDates} theme={{ calendarBackground: theme.card, dayTextColor: theme.text, monthTextColor: theme.text, todayTextColor: '#4A90E2' }} onDayPress={handleDayPressInModal} />
                </View>

                <View style={styles.inputSection}>
                  <Text style={[styles.inputLabel, { color: theme.subText }]}>할 일 내용</Text>
                  <TextInput style={[styles.textInput, { backgroundColor: theme.card, color: theme.text, borderColor: theme.border }]} placeholder="어떤 일정이 있나요?" placeholderTextColor={theme.subText} value={taskText} onChangeText={setTaskText} />
                </View>
              </ScrollView>
            </KeyboardAvoidingView>
          </SafeAreaView>
        </Modal>

        {/* [모달 2] 바텀 메뉴 */}
        <Modal visible={isMenuVisible} transparent={true} animationType="none">
          <Animated.View style={[styles.menuOverlay, { opacity: overlayOpacity }]}><TouchableOpacity style={styles.overlayTouchArea} activeOpacity={1} onPress={handleCloseMenu} /></Animated.View>
          <Animated.View style={[styles.menuPanel, { backgroundColor: theme.card, transform: [{ translateY: panelTranslateY }] }]}>
            <View style={styles.handleBar} />
            <SafeAreaView edges={['bottom']} style={styles.menuSafeArea}>
              <View style={styles.menuHeader}><Text style={[styles.menuTitle, { color: theme.text }]}>메뉴</Text><TouchableOpacity onPress={handleCloseMenu} style={styles.closeBtn}><Ionicons name="close" size={28} color={theme.icon} /></TouchableOpacity></View>
              <TouchableOpacity style={styles.menuItem} onPress={() => { handleCloseMenu(); router.push('/settings'); }}><Ionicons name="settings-outline" size={22} color={theme.subText} /><Text style={[styles.menuItemText, { color: theme.text }]}>설정</Text></TouchableOpacity>
              <TouchableOpacity style={styles.menuItem} onPress={() => { handleCloseMenu(); updateAndSaveTasks({}); }}><Ionicons name="trash-outline" size={22} color="#FF5252" /><Text style={[styles.menuItemText, { color: '#FF5252' }]}>모든 일정 지우기</Text></TouchableOpacity>
            </SafeAreaView>
          </Animated.View>
        </Modal>

      </SafeAreaView>
    </GestureHandlerRootView>
  );
}

// ----------------------------------------------------------------------------
// 4. [스타일 정의 (StyleSheet)]
// ----------------------------------------------------------------------------
const styles = StyleSheet.create({
  // --- [공통 및 레이아웃] ---
  container: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 15 },
  headerTitle: { fontSize: 26, fontWeight: 'bold' },

  // --- [메인 달력 관련] ---
  calendarContainer: { marginHorizontal: 15, borderRadius: 15, padding: 10, elevation: 2, overflow: 'hidden' },
  dayBox: { alignItems: 'center', justifyContent: 'center', width: 40, height: 40, borderRadius: 20 },
  dayText: { fontSize: 15 },
  badgeContainer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 2, height: 12 },
  countText: { fontSize: 10, fontWeight: 'bold' }, 
  dot: { width: 4, height: 4, borderRadius: 2 },

  // --- [할 일 리스트 관련] ---
  listContainer: { flex: 1, padding: 20 },
  listTitle: { fontSize: 18, fontWeight: '600', marginBottom: 15 },
  todoItem: { padding: 16, borderRadius: 15, marginBottom: 12, elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 3 },
  todoContent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  todoText: { fontSize: 16, fontWeight: '600' },
  todoRange: { fontSize: 11, marginTop: 4 },
  emptyText: { textAlign: 'center', marginTop: 30, fontSize: 15 },

  // --- [액션 및 버튼 관련] ---
  fab: { position: 'absolute', right: 20, bottom: 40, backgroundColor: '#4A90E2', width: 60, height: 60, borderRadius: 30, justifyContent: 'center', alignItems: 'center', elevation: 5 },
  deleteAction: { backgroundColor: '#FF3B30', justifyContent: 'center', alignItems: 'center', width: 80, borderRadius: 15, marginBottom: 12, marginLeft: 10 },
  deleteBtnText: { color: '#FFF', fontSize: 12, fontWeight: '600', marginTop: 4 },

  // --- [일정 추가 모달(Modal) 관련] ---
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

  // --- [바텀 메뉴(Menu) 관련] ---
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