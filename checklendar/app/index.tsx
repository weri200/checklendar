import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Stack, router } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Dimensions, FlatList, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Calendar } from 'react-native-calendars';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from './_layout';

interface Task {
  id: string;
  text: string;
  range: [string, string];
}

interface TaskState {
  [key: string]: Task[]; // 문자열(날짜)을 키로, Task 배열을 값으로 가짐
}

interface ThemeType {
  bg: string;
  card: string;
  text: string;
  subText: string;
  border: string;
  icon: string;
}

// ============================================================================
// [상수 정의]
// ============================================================================
const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const PANEL_HEIGHT = 300; // 하단 설정 메뉴(바텀 시트)의 높이


// ============================================================================
// [개별 할 일 아이템 컴포넌트]
// 할 일을 완료했을 때 체크 표시가 뜨고 서서히 사라지는 애니메이션을 담당합니다.
// ============================================================================
const AnimatedTaskItem = ({ item, theme, onComplete }: { item: Task; theme: ThemeType; onComplete: (id: string) => void }) => {  const [isDone, setIsDone] = useState(false);
  const fadeAnim = useRef(new Animated.Value(1)).current; 

  const handlePress = () => {
    setIsDone(true); 
    
    // 투명도를 1에서 0으로 0.4초 동안 변경 후 삭제 콜백 실행
    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 400,
      useNativeDriver: true,
    }).start(() => {
      onComplete(item.id); 
    });
  };

  return (
    <Animated.View style={[styles.todoItem, { backgroundColor: theme.card, opacity: fadeAnim }]}>
      <TouchableOpacity activeOpacity={0.7} onPress={handlePress} style={styles.todoContent}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.todoText, { color: theme.text, textDecorationLine: isDone ? 'line-through' : 'none' }]}>
            {item.text}
          </Text>
          <Text style={[styles.todoRange, { color: theme.subText }]}>{item.range[0]} ~ {item.range[1]}</Text>
        </View>
        <Ionicons 
          name={isDone ? "checkmark-circle" : "ellipse-outline"} 
          size={26} 
          color={isDone ? "#34C759" : theme.subText} 
          style={{ marginLeft: 12 }} 
        />
      </TouchableOpacity>
    </Animated.View>
  );
};


// ============================================================================
// [메인 앱 컴포넌트]
// ============================================================================
export default function App() {
  
  // 1. 전역 테마 및 핵심 상태 관리
  const { isDarkMode } = useTheme(); 
  const [viewDate, setViewDate] = useState(new Date().toISOString().split('T')[0]); // 달력에서 선택된 날짜
  const [tasks, setTasks] = useState<TaskState>({}); // 전체 할 일 데이터 (구조: { 'YYYY-MM-DD': [task1, task2...] })
  
  // 2. 모달 및 폼 상태 관리
  const [isModalVisible, setModalVisible] = useState(false); // 일정 추가 모달 표시 여부
  const [addStartDate, setAddStartDate] = useState(viewDate); // 새 일정 시작일
  const [addEndDate, setAddEndDate] = useState(viewDate); // 새 일정 종료일
  const [isSelecting, setIsSelecting] = useState(false); // 달력 기간 선택 모드 활성화 여부
  const [taskText, setTaskText] = useState(''); // 입력창 텍스트
  const [isMenuVisible, setMenuVisible] = useState(false); // 하단 설정 메뉴 표시 여부

  // 3. 다크모드/라이트모드 색상 팔레트 (테마 변경 시에만 재생성)
  const theme = useMemo(() => ({
    bg: isDarkMode ? '#121212' : '#F8F9FA',
    card: isDarkMode ? '#1E1E1E' : '#FFFFFF',
    text: isDarkMode ? '#FFFFFF' : '#333333',
    subText: isDarkMode ? '#AAAAAA' : '#888888',
    border: isDarkMode ? '#333333' : '#EEEEEE',
    icon: isDarkMode ? '#FFFFFF' : '#333333',
  }), [isDarkMode]);

  // 4. 하단 메뉴 애니메이션 값
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const panelTranslateY = useRef(new Animated.Value(PANEL_HEIGHT)).current;

  // ----------------------------------------------------------------------------
  // [데이터 지속성 (Data Persistence)] 로컬 저장소 동기화
  // ----------------------------------------------------------------------------
  
  // 앱 실행 시 기기에 저장된 데이터 불러오기
  useEffect(() => {
    const loadTasks = async () => {
      try {
        const savedTasks = await AsyncStorage.getItem('@checklendar_tasks');
        if (savedTasks !== null) {
          setTasks(JSON.parse(savedTasks));
        }
      } catch (e) {
        console.error('데이터를 불러오는데 실패했습니다.', e);
      }
    };
    loadTasks();
  }, []);

  // 할 일(tasks) 데이터가 변경될 때마다 기기에 자동 저장하기
  useEffect(() => {
    const saveTasks = async () => {
      try {
        await AsyncStorage.setItem('@checklendar_tasks', JSON.stringify(tasks));
      } catch (e) {
        console.error('데이터 저장에 실패했습니다.', e);
      }
    };
    saveTasks();
  }, [tasks]);

  // ----------------------------------------------------------------------------
  // [애니메이션 제어] 하단 메뉴 열기/닫기
  // ----------------------------------------------------------------------------
  
  // 메뉴 모달이 열릴 때 슬라이드 업 & 배경 어두워짐 효과
  useEffect(() => {
    if (isMenuVisible) {
      Animated.parallel([
        Animated.timing(overlayOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.spring(panelTranslateY, { toValue: 0, speed: 12, bounciness: 5, useNativeDriver: true }),
      ]).start();
    }
  }, [isMenuVisible]);

  // 메뉴 모달 닫기
  const handleCloseMenu = useCallback(() => {
    Animated.parallel([
      Animated.timing(overlayOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
      Animated.timing(panelTranslateY, { toValue: PANEL_HEIGHT, duration: 250, useNativeDriver: true }),
    ]).start(() => setMenuVisible(false));
  }, [overlayOpacity, panelTranslateY]);

  // ----------------------------------------------------------------------------
  // [비즈니스 로직] 할 일 추가, 삭제, 날짜 계산
  // ----------------------------------------------------------------------------
  
  // 날짜 범위(시작일~종료일) 배열 생성기
  const getDatesInRange = useCallback((start: string, end: string) => {
    const dates = [];
    let curr = new Date(start);
    const last = new Date(end);
    while (curr <= last) {
      dates.push(curr.toISOString().split('T')[0]);
      curr.setDate(curr.getDate() + 1);
    }
    return dates;
  }, []);

  // 새 일정 저장
  const saveTask = useCallback(() => {
    if (taskText.trim().length === 0) return;
    
    const range = getDatesInRange(addStartDate, addEndDate);
    const newTask = { id: Date.now().toString(), text: taskText, range: [addStartDate, addEndDate] as [string, string] };
    const updatedTasks = { ...tasks };
    
    // 선택된 범위의 모든 날짜 키에 해당 일정을 복사하여 넣음
    range.forEach(date => {
      if (!updatedTasks[date]) updatedTasks[date] = [];
      updatedTasks[date] = [...updatedTasks[date], newTask];
    });
    
    setTasks(updatedTasks);
    setTaskText('');
    setIsSelecting(false);
    setModalVisible(false);
  }, [taskText, addStartDate, addEndDate, tasks, getDatesInRange]);

  // 할 일 완료(삭제) 처리
const deleteTask = useCallback((taskId: string) => {
      setTasks(prev => {
      const updated = { ...prev };
      // 모든 날짜를 순회하며 해당 ID를 가진 일정을 지우고, 빈 날짜는 정리
      Object.keys(updated).forEach(date => {
        updated[date] = updated[date].filter((t: Task) => t.id !== taskId);
        if (updated[date].length === 0) delete updated[date];
      });
      return updated;
    });
  }, []);

  // 일정 추가 모달 열기 및 초기화
  const openAddModal = useCallback(() => {
    setAddStartDate(viewDate); 
    setAddEndDate(viewDate); 
    setIsSelecting(false); 
    setTaskText(''); 
    setModalVisible(true);
  }, [viewDate]);

  // 추가 모달 내의 달력 범위 선택 로직 (스마트 탭)
  const handleDayPress = useCallback((day: any) => {
    const clickedDate = day.dateString;
    if (!isSelecting) {
      setAddStartDate(clickedDate); 
      setAddEndDate(clickedDate); 
      setIsSelecting(true);
    } else {
      if (new Date(clickedDate) < new Date(addStartDate)) {
        setAddEndDate(addStartDate); 
        setAddStartDate(clickedDate);
      } else {
        setAddEndDate(clickedDate);
      }
      setIsSelecting(false);
    }
  }, [isSelecting, addStartDate]);

  // ----------------------------------------------------------------------------
  // [달력 시각화 마커]
  // ----------------------------------------------------------------------------
  
  // 메인 달력: 일정이 있는 날짜와 현재 선택된 날짜(viewDate) 표시
  const mainMarkedDates = useMemo(() => {
    const marks: { [key: string]: any } = {};
    Object.keys(tasks).forEach((date) => {
      if (tasks[date].length > 0) {
        marks[date] = {
          marked: true,
          customStyles: {
            container: { backgroundColor: date === viewDate ? '#4A90E2' : 'transparent', borderRadius: 8 },
            text: { color: date === viewDate ? '#FFF' : theme.text }
          }
        };
      }
    });
    
    // 일정이 없더라도 현재 선택된 날짜는 강조 표시
    if (!marks[viewDate]) {
      marks[viewDate] = { customStyles: { container: { backgroundColor: '#4A90E2', borderRadius: 8 }, text: { color: '#FFF' } } };
    }
    return marks;
  }, [tasks, viewDate, theme.text]);

  // 추가 모달 달력: 선택된 시작일과 종료일 사이를 이어주는 연결선 표시
  const modalMarkedDates = useMemo(() => {
    const marks: { [key: string]: any } = {};
    const range = getDatesInRange(addStartDate, addEndDate);
    range.forEach((date, index) => {
      marks[date] = {
        color: isDarkMode ? '#2C3E50' : '#E3F2FD', 
        textColor: theme.text,
        startingDay: index === 0, 
        endingDay: index === range.length - 1,
      };
    });
    if (marks[addStartDate]) marks[addStartDate].color = '#4A90E2';
    if (marks[addEndDate]) marks[addEndDate].color = '#4A90E2';
    return marks;
  }, [addStartDate, addEndDate, isDarkMode, theme.text, getDatesInRange]);


  // ============================================================================
  // [UI 렌더링 영역]
  // ============================================================================
  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
      <Stack.Screen options={{ headerShown: false }} />
      
      {/* --- 상단 헤더 --- */}
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: theme.text }]}>Checklendar</Text>
        <TouchableOpacity onPress={() => setMenuVisible(true)}>
          <Ionicons name="menu" size={32} color={theme.icon} />
        </TouchableOpacity>
      </View>

      {/* --- 메인 달력 영역 --- */}
      <View style={[styles.calendarContainer, { backgroundColor: theme.card }]}>
        <Calendar
          key={isDarkMode ? 'dark' : 'light'}
          markingType={'custom'}
          markedDates={mainMarkedDates}
          onDayPress={(day) => setViewDate(day.dateString)}
          theme={{ 
            calendarBackground: theme.card, 
            dayTextColor: theme.text, 
            monthTextColor: theme.text, 
            arrowColor: '#4A90E2', 
            todayTextColor: '#4A90E2', 
            textDisabledColor: isDarkMode ? '#444' : '#ccc' 
          }}
          dayComponent={({date, state, marking}) => {
            if (!date) return <View />;
            const count = tasks[date.dateString]?.length || 0;
            const isSunday = new Date(date.dateString).getDay() === 0;
            const isSelected = date.dateString === viewDate;
            return (
              <TouchableOpacity onPress={() => setViewDate(date.dateString)} style={[styles.dayBox, isSelected && { backgroundColor: '#4A90E2' }]}>
                <Text style={[styles.dayText, isSunday && { color: '#FF5252' }, { color: isSelected ? '#FFF' : theme.text }, state === 'disabled' && { color: isDarkMode ? '#444' : '#ccc' }]}>
                  {date.day}
                </Text>
                {count > 0 && (
                  <View style={styles.badgeRow}>
                    {count === 1 && <View style={[styles.dot, { backgroundColor: '#0064FF' }]} />}
                    {count === 2 && <><View style={[styles.dot, { backgroundColor: '#0064FF' }]} /><View style={[styles.dot, { backgroundColor: '#34C759' }]} /></>}
                    {count >= 3 && <><View style={[styles.dot, { backgroundColor: '#FF9500' }]} /><Text style={[styles.countText, { color: '#FF9500' }]}>{count}</Text></>}
                  </View>
                )}
              </TouchableOpacity>
            );
          }}
        />
      </View>

      {/* --- 하단 할 일 목록 영역 --- */}
      <View style={styles.listContainer}>
        <Text style={[styles.listTitle, { color: theme.text }]}>{viewDate}의 할 일</Text>
        <FlatList
          data={tasks[viewDate] || []}
          keyExtractor={(item) => item.id}
          renderItem={({item}) => (
            <AnimatedTaskItem item={item} theme={theme} onComplete={deleteTask} />
          )}
          ListEmptyComponent={<Text style={[styles.emptyText, { color: theme.subText }]}>예정된 일정이 없습니다.</Text>}
        />
      </View>

      {/* --- 우측 하단 일정 추가 버튼 (FAB) --- */}
      <TouchableOpacity style={styles.fab} onPress={openAddModal}>
        <Ionicons name="add" size={32} color="#FFF" />
      </TouchableOpacity>

      {/* --- [모달] 새 일정 추가 폼 --- */}
      <Modal visible={isModalVisible} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={[styles.modalContainer, { backgroundColor: theme.bg }]}>
          <KeyboardAvoidingView 
            style={{ flex: 1 }} 
            behavior={Platform.OS === 'ios' ? 'padding' : undefined }
            keyboardVerticalOffset={Platform.OS === 'ios' ? 70 : 0}
          >
            <ScrollView 
              contentContainerStyle={{ flexGrow: 1 }} 
              keyboardShouldPersistTaps="handled"
            >
              <View style={[styles.modalHeader, { backgroundColor: theme.card, borderBottomWidth: 1, borderColor: theme.border }]}>
                <TouchableOpacity onPress={() => setModalVisible(false)}><Text style={styles.cancelText}>취소</Text></TouchableOpacity>
                <Text style={[styles.modalTitle, { color: theme.text }]}>새 일정 추가</Text>
                <TouchableOpacity onPress={saveTask}><Text style={styles.saveText}>저장</Text></TouchableOpacity>
              </View>
              
              <View style={[styles.selectionInfo, { backgroundColor: theme.card }]}>
                <View style={styles.infoBox}><Text style={styles.infoLabel}>시작일</Text><Text style={[styles.infoValue, { color: theme.text }]}>{addStartDate}</Text></View>
                <View style={styles.arrowBox}><Ionicons name="arrow-forward" size={24} color="#4A90E2" /></View>
                <View style={styles.infoBox}><Text style={styles.infoLabel}>종료일</Text><Text style={[styles.infoValue, { color: theme.text }]}>{addEndDate}</Text></View>
              </View>
              
              <View style={[styles.modalCalendarWrapper, { backgroundColor: theme.card }]}>
                <Calendar markingType={'period'} markedDates={modalMarkedDates} theme={{ calendarBackground: theme.card, dayTextColor: theme.text, monthTextColor: theme.text, todayTextColor: '#4A90E2' }} onDayPress={handleDayPress} />
              </View>
              
              <View style={styles.inputSection}>
                <Text style={[styles.inputLabel, { color: theme.subText }]}>할 일 내용</Text>
                <TextInput 
                  style={[styles.textInput, { backgroundColor: theme.card, color: theme.text, borderColor: theme.border }]} 
                  placeholder="어떤 일정이 있나요?" 
                  placeholderTextColor={theme.subText} 
                  value={taskText} 
                  onChangeText={setTaskText} 
                />
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

      {/* --- [모달] 바텀 시트 (설정 및 제어 메뉴) --- */}
      <Modal visible={isMenuVisible} transparent={true} animationType="none">
        <Animated.View style={[styles.menuOverlay, { opacity: overlayOpacity }]}>
          <TouchableOpacity style={styles.overlayTouchArea} activeOpacity={1} onPress={handleCloseMenu} />
        </Animated.View>
        <Animated.View style={[styles.menuPanel, { backgroundColor: theme.card, transform: [{ translateY: panelTranslateY }] }]}>
          <View style={styles.handleBar} />
          <SafeAreaView edges={['bottom']} style={styles.menuSafeArea}>
            <View style={styles.menuHeader}>
              <Text style={[styles.menuTitle, { color: theme.text }]}>메뉴</Text>
              <TouchableOpacity onPress={handleCloseMenu} style={styles.closeBtn}><Ionicons name="close" size={28} color={theme.icon} /></TouchableOpacity>
            </View>
            <TouchableOpacity style={styles.menuItem} onPress={() => { handleCloseMenu(); router.push('/settings'); }}>
              <Ionicons name="settings-outline" size={22} color={theme.subText} />
              <Text style={[styles.menuItemText, { color: theme.text }]}>설정</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuItem} onPress={() => { setTasks({}); handleCloseMenu(); }}>
              <Ionicons name="trash-outline" size={22} color="#FF5252" />
              <Text style={[styles.menuItemText, { color: '#FF5252' }]}>모든 일정 지우기</Text>
            </TouchableOpacity>
          </SafeAreaView>
        </Animated.View>
      </Modal>

    </SafeAreaView>
  );
}

// ============================================================================
// [스타일 정의]
// ============================================================================
const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 15 },
  headerTitle: { fontSize: 26, fontWeight: 'bold' },
  calendarContainer: { marginHorizontal: 15, borderRadius: 15, padding: 10, elevation: 2, overflow: 'hidden' },
  dayBox: { alignItems: 'center', justifyContent: 'center', width: 40, height: 40, borderRadius: 20 }, 
  dayText: { fontSize: 15 },
  badgeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 2, height: 10 },
  dot: { width: 5, height: 5, borderRadius: 2.5, marginHorizontal: 1.5 },
  countText: { fontSize: 10, fontWeight: 'bold', marginLeft: 2 },
  listContainer: { flex: 1, padding: 20 },
  listTitle: { fontSize: 18, fontWeight: '600', marginBottom: 15 },
  todoItem: { padding: 16, borderRadius: 15, marginBottom: 12, elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 3 },
  todoContent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  todoText: { fontSize: 16, fontWeight: '600' },
  todoRange: { fontSize: 12, marginTop: 4 },
  emptyText: { textAlign: 'center', marginTop: 30, fontSize: 15 },
  fab: { position: 'absolute', right: 20, bottom: 40, backgroundColor: '#4A90E2', width: 60, height: 60, borderRadius: 30, justifyContent: 'center', alignItems: 'center', elevation: 5 },
  modalContainer: { flex: 1 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20 },
  cancelText: { color: '#FF5252', fontSize: 16 },
  saveText: { color: '#4A90E2', fontSize: 16, fontWeight: 'bold' },
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
  menuOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0, 0, 0, 0.5)', zIndex: 10 },
  overlayTouchArea: { flex: 1 },
  menuPanel: { position: 'absolute', bottom: 0, width: '100%', height: PANEL_HEIGHT, borderTopLeftRadius: 30, borderTopRightRadius: 30, paddingTop: 12, zIndex: 20 },
  handleBar: { width: 40, height: 5, backgroundColor: '#E0E0E0', borderRadius: 3, alignSelf: 'center', marginBottom: 10 },
  menuSafeArea: { paddingHorizontal: 25, paddingBottom: 20 },
  menuHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 10, paddingBottom: 25 },
  menuTitle: { fontSize: 22, fontWeight: 'bold' },
  closeBtn: { padding: 5 },
  menuItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 18, borderBottomWidth: 1, borderColor: 'rgba(0,0,0,0.05)' },
  menuItemText: { fontSize: 16, marginLeft: 15, fontWeight: '500' },
});