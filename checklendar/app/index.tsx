import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Stack, router } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, FlatList, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Calendar } from 'react-native-calendars';
import { SafeAreaView } from 'react-native-safe-area-context';
import { updateNotification } from '../useNotification';
import { useTheme } from './_layout';

// 앱에서 다룰 데이터들의 형태(규격)를 미리 약속해 둡니다.
interface Task {
  id: string;              // 할 일의 고유 번호 (보통 생성 시간을 사용)
  text: string;            // 사용자가 입력한 할 일 내용
  range: [string, string]; // [시작일, 종료일] 형태의 기간 정보
}

interface TaskState {
  [key: string]: Task[];   // '2026-04-08' 같은 날짜 글자를 열쇠(key)로 삼아 할 일 배열을 저장합니다.
}

interface ThemeType {
  bg: string;
  card: string;
  text: string;
  subText: string;
  border: string;
  icon: string;
}

// 하단 메뉴(바텀 시트)가 화면으로 올라올 때의 고정 높이입니다.
const PANEL_HEIGHT = 300; 

// ----------------------------------------------------------------------------
// [개별 할 일 아이템 컴포넌트]
// 사용자가 할 일의 동그라미를 누르면 체크 표시가 생기고 부드럽게 사라집니다.
// ----------------------------------------------------------------------------
const AnimatedTaskItem = ({ item, theme, onComplete }: { item: Task; theme: ThemeType; onComplete: (id: string) => void }) => { 
  const [isDone, setIsDone] = useState(false);
  
  // 투명도 조절을 위한 애니메이션 값 (1: 완전 선명함, 0: 완전 투명함)
  const fadeAnim = useRef(new Animated.Value(1)).current; 

  // 체크 버튼을 눌렀을 때 실행되는 함수
  const handlePress = () => {
    setIsDone(true); // 1. 먼저 체크 모양으로 바꿉니다.
    
    // 2. 0.4초에 걸쳐 서서히 투명해지는 애니메이션을 실행합니다.
    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 400,
      useNativeDriver: true,
    }).start(() => {
      // 3. 투명해지는 게 완전히 끝나면 부모(App)에게 이 할 일을 삭제해 달라고 요청합니다.
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


// ----------------------------------------------------------------------------
// [메인 화면 컴포넌트]
// 달력을 보여주고, 할 일을 추가/삭제하며, 기기에 데이터를 저장하는 메인 두뇌입니다.
// ----------------------------------------------------------------------------
export default function App() {
  
  // 1. 앱의 핵심 데이터 상태
  const { isDarkMode } = useTheme(); 
  const [viewDate, setViewDate] = useState(new Date().toISOString().split('T')[0]); // 메인 달력에서 현재 누른 날짜
  const [tasks, setTasks] = useState<TaskState>({}); // 앱에 등록된 모든 할 일들의 모음
  
  // 2. 화면에 띄울 창(모달)과 입력창 상태
  const [isModalVisible, setModalVisible] = useState(false); // '+ 버튼'을 눌러서 띄우는 새 일정 추가 창
  const [addStartDate, setAddStartDate] = useState(viewDate); // 새 일정의 시작일
  const [addEndDate, setAddEndDate] = useState(viewDate); // 새 일정의 종료일
  const [isSelecting, setIsSelecting] = useState(false); // 두 날짜를 연결해서 고르는 중인지 여부
  const [taskText, setTaskText] = useState(''); // 사용자가 키보드로 적고 있는 글자
  const [isMenuVisible, setMenuVisible] = useState(false); // 왼쪽 위 햄버거 메뉴 창
  
  // 3. 현재 테마(다크/라이트)에 맞춰 색상표를 준비합니다.
  const theme = useMemo(() => ({
    bg: isDarkMode ? '#121212' : '#F8F9FA',
    card: isDarkMode ? '#1E1E1E' : '#FFFFFF',
    text: isDarkMode ? '#FFFFFF' : '#333333',
    subText: isDarkMode ? '#AAAAAA' : '#888888',
    border: isDarkMode ? '#333333' : '#EEEEEE',
    icon: isDarkMode ? '#FFFFFF' : '#333333',
  }), [isDarkMode]);

  // 하단 메뉴가 스르륵 올라오게 만들기 위한 애니메이션 값들
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const panelTranslateY = useRef(new Animated.Value(PANEL_HEIGHT)).current;

  // ----------------------------------------------------------------------------
  // [데이터 저장 및 불러오기 기능]
  // ----------------------------------------------------------------------------
  
  // 앱이 처음 켜질 때, 휴대폰 저장소(AsyncStorage)에서 예전 할 일들을 꺼내옵니다.
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

  // [핵심] 할 일이 추가되거나 지워질 때마다 화면, 기기 저장소, 알림 예약을 한 번에 똑같이 맞춰주는 만능 함수입니다.
  const updateAndSaveTasks = async (newTasks: TaskState) => {
    setTasks(newTasks); 
    try {
      await AsyncStorage.setItem('@checklendar_tasks', JSON.stringify(newTasks)); 
      updateNotification(); 
    } catch (e) {
      console.error('데이터 저장에 실패했습니다.', e);
    }
  };

  // ----------------------------------------------------------------------------
  // [하단 메뉴 애니메이션 제어]
  // ----------------------------------------------------------------------------
  
  // 메뉴 버튼을 누르면 배경은 어두워지고 시트가 밑에서 올라옵니다.
  useEffect(() => {
    if (isMenuVisible) {
      Animated.parallel([
        Animated.timing(overlayOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.spring(panelTranslateY, { toValue: 0, speed: 12, bounciness: 5, useNativeDriver: true }),
      ]).start();
    }
  }, [isMenuVisible, overlayOpacity, panelTranslateY]);

  // 메뉴를 닫으면 다시 밑으로 숨고 배경이 밝아집니다.
  const handleCloseMenu = useCallback(() => {
    Animated.parallel([
      Animated.timing(overlayOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
      Animated.timing(panelTranslateY, { toValue: PANEL_HEIGHT, duration: 250, useNativeDriver: true }),
    ]).start(() => setMenuVisible(false));
  }, [overlayOpacity, panelTranslateY]);

  // ----------------------------------------------------------------------------
  // [할 일 데이터 처리 로직]
  // ----------------------------------------------------------------------------
  
  // 시작일과 종료일 사이에 있는 모든 날짜를 알아내어 배열로 만들어주는 계산기입니다.
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

  // 새 일정을 저장합니다. 
  // 예를 들어 1일부터 3일까지 일정이면 1일, 2일, 3일 각각의 데이터 방에 같은 일정을 복사해 넣습니다.
  const saveTask = useCallback(() => {
    if (taskText.trim().length === 0) return; // 빈 글자는 무시합니다.
    
    const range = getDatesInRange(addStartDate, addEndDate);
    const newTask = { id: Date.now().toString(), text: taskText, range: [addStartDate, addEndDate] as [string, string] };
    const updatedTasks = { ...tasks };
    
    range.forEach(date => {
      if (!updatedTasks[date]) updatedTasks[date] = [];
      updatedTasks[date] = [...updatedTasks[date], newTask];
    });
    
    updateAndSaveTasks(updatedTasks); 

    // 저장이 끝나면 입력창을 비우고 모달을 닫습니다.
    setTaskText('');
    setIsSelecting(false);
    setModalVisible(false);
  }, [taskText, addStartDate, addEndDate, tasks, getDatesInRange]);

  // 할 일을 삭제합니다. 하나의 일정이 여러 날짜에 걸쳐있을 수 있으므로 모든 날짜를 뒤져서 지웁니다.
  const deleteTask = useCallback((taskId: string) => {
    const updated = { ...tasks };
    
    Object.keys(updated).forEach(date => {
      updated[date] = updated[date].filter((t: Task) => t.id !== taskId);
      // 할 일이 0개가 된 날짜는 데이터 방 자체를 청소해 줍니다.
      if (updated[date].length === 0) delete updated[date];
    });
    
    updateAndSaveTasks(updated); 
  }, [tasks]);

  // 새 일정 추가 버튼(+)을 눌렀을 때, 현재 보고 있는 날짜로 초기화하며 창을 엽니다.
  const openAddModal = useCallback(() => {
    setAddStartDate(viewDate); 
    setAddEndDate(viewDate); 
    setIsSelecting(false); 
    setTaskText(''); 
    setModalVisible(true);
  }, [viewDate]);

  // 일정 추가 모달에서 달력을 터치할 때, 시작일과 종료일을 부드럽게 이어주는 로직입니다.
  const handleDayPress = useCallback((day: any) => {
    const clickedDate = day.dateString;
    if (!isSelecting) {
      // 첫 번째 터치: 시작일로 지정
      setAddStartDate(clickedDate); 
      setAddEndDate(clickedDate); 
      setIsSelecting(true);
    } else {
      // 두 번째 터치: 종료일로 지정하되, 만약 시작일보다 과거를 누르면 두 날짜의 자리를 바꿔줍니다.
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
  // [달력 꾸미기 도구]
  // ----------------------------------------------------------------------------
  
  // 메인 화면 달력에 파란 점(일정 있음)과 선택된 날짜의 파란 배경을 그려주는 데이터를 만듭니다.
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
    
    if (!marks[viewDate]) {
      marks[viewDate] = { customStyles: { container: { backgroundColor: '#4A90E2', borderRadius: 8 }, text: { color: '#FFF' } } };
    }
    return marks;
  }, [tasks, viewDate, theme.text]);

  // 모달 화면 달력에서 선택한 기간(시작일~종료일)의 배경을 파랗게 이어주는 데이터를 만듭니다.
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


  // ----------------------------------------------------------------------------
  // [화면 렌더링 영역]
  // ----------------------------------------------------------------------------
  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
      <Stack.Screen options={{ headerShown: false }} />
      
      {/* 상단 앱 제목과 햄버거 메뉴 버튼 */}
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: theme.text }]}>Checklendar</Text>
        <TouchableOpacity onPress={() => setMenuVisible(true)}>
          <Ionicons name="menu" size={32} color={theme.icon} />
        </TouchableOpacity>
      </View>

      {/* 가운데 메인 달력 */}
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
            
            // 달력의 하루하루 네모칸을 그립니다. 일정이 3개 이상이면 '+숫자' 형태로 보여줍니다.
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

      {/* 하단 선택한 날짜의 할 일 목록 */}
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

      {/* 오른쪽 아래 새 일정 추가를 위한 둥근 버튼(+) */}
      <TouchableOpacity style={styles.fab} onPress={openAddModal}>
        <Ionicons name="add" size={32} color="#FFF" />
      </TouchableOpacity>

      {/* 새 일정을 등록하는 팝업 창(모달) */}
      <Modal visible={isModalVisible} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={[styles.modalContainer, { backgroundColor: theme.bg }]}>
          <KeyboardAvoidingView 
            style={{ flex: 1 }} 
            behavior={Platform.OS === 'ios' ? 'padding' : undefined }
            keyboardVerticalOffset={Platform.OS === 'ios' ? 70 : 0}
          >
            <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
              
              <View style={[styles.modalHeader, { backgroundColor: theme.card, borderBottomWidth: 1, borderColor: theme.border }]}>
                <TouchableOpacity onPress={() => setModalVisible(false)}><Text style={styles.cancelText}>취소</Text></TouchableOpacity>
                <Text style={[styles.modalTitle, { color: theme.text }]}>새 일정 추가</Text>
                <TouchableOpacity onPress={saveTask}><Text style={styles.saveText}>저장</Text></TouchableOpacity>
              </View>
              
              {/* 선택된 날짜 정보를 글자로 보여주는 곳 */}
              <View style={[styles.selectionInfo, { backgroundColor: theme.card }]}>
                <View style={styles.infoBox}><Text style={styles.infoLabel}>시작일</Text><Text style={[styles.infoValue, { color: theme.text }]}>{addStartDate}</Text></View>
                <View style={styles.arrowBox}><Ionicons name="arrow-forward" size={24} color="#4A90E2" /></View>
                <View style={styles.infoBox}><Text style={styles.infoLabel}>종료일</Text><Text style={[styles.infoValue, { color: theme.text }]}>{addEndDate}</Text></View>
              </View>
              
              {/* 기간을 선택할 수 있는 모달 전용 달력 */}
              <View style={[styles.modalCalendarWrapper, { backgroundColor: theme.card }]}>
                <Calendar markingType={'period'} markedDates={modalMarkedDates} theme={{ calendarBackground: theme.card, dayTextColor: theme.text, monthTextColor: theme.text, todayTextColor: '#4A90E2' }} onDayPress={handleDayPress} />
              </View>
              
              {/* 글씨 입력칸 */}
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

      {/* 설정이나 데이터 초기화를 할 수 있는 밑에서 올라오는 메뉴 */}
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
            
            <TouchableOpacity style={styles.menuItem} onPress={() => { handleCloseMenu(); updateAndSaveTasks({}); }}>
              <Ionicons name="trash-outline" size={22} color="#FF5252" />
              <Text style={[styles.menuItemText, { color: '#FF5252' }]}>모든 일정 지우기</Text>
            </TouchableOpacity>
          </SafeAreaView>
        </Animated.View>
      </Modal>

    </SafeAreaView>
  );
}

// ----------------------------------------------------------------------------
// [6. 화면 디자인(스타일) 정의]
// 화면의 여백, 글자 크기, 색상, 둥근 모서리 등을 꾸미는 옷장 같은 곳입니다.
// ----------------------------------------------------------------------------
const styles = StyleSheet.create({
  // --- [공통 영역] ---
  container: { flex: 1 }, // 화면 전체를 꽉 채웁니다.

  // --- [상단 헤더 영역] ('Checklendar' 제목과 메뉴 버튼) ---
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 15 },
  headerTitle: { fontSize: 26, fontWeight: 'bold' },

  // --- [달력 영역] ---
  calendarContainer: { marginHorizontal: 15, borderRadius: 15, padding: 10, elevation: 2, overflow: 'hidden' }, // 달력을 감싸는 둥근 네모 상자
  dayBox: { alignItems: 'center', justifyContent: 'center', width: 40, height: 40, borderRadius: 20 }, // 달력 안의 하루하루를 나타내는 동그란 칸
  dayText: { fontSize: 15 }, // 날짜 숫자 크기
  
  // 달력 숫자 밑에 찍히는 파란색/초록색/주황색 점(일정 개수 표시)
  badgeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 2, height: 10 },
  dot: { width: 5, height: 5, borderRadius: 2.5, marginHorizontal: 1.5 },
  countText: { fontSize: 10, fontWeight: 'bold', marginLeft: 2 },

  // --- [하단 할 일 목록 영역] ---
  listContainer: { flex: 1, padding: 20 },
  listTitle: { fontSize: 18, fontWeight: '600', marginBottom: 15 }, // '2026-04-08의 할 일' 제목
  
  // 개별 할 일 네모 카드
  todoItem: { padding: 16, borderRadius: 15, marginBottom: 12, elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 3 },
  todoContent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  todoText: { fontSize: 16, fontWeight: '600' }, // 할 일 글자
  todoRange: { fontSize: 12, marginTop: 4 }, // 시작일~종료일 글자
  emptyText: { textAlign: 'center', marginTop: 30, fontSize: 15 }, // 일정이 없을 때 나오는 안내 문구

  // --- [오른쪽 아래 파란색 둥근 버튼 (+)] ---
  fab: { position: 'absolute', right: 20, bottom: 40, backgroundColor: '#4A90E2', width: 60, height: 60, borderRadius: 30, justifyContent: 'center', alignItems: 'center', elevation: 5 },

  // --- [새 일정 추가 모달(팝업창) 영역] ---
  modalContainer: { flex: 1 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20 },
  cancelText: { color: '#FF5252', fontSize: 16 }, // '취소' 빨간 글씨
  saveText: { color: '#4A90E2', fontSize: 16, fontWeight: 'bold' }, // '저장' 파란 글씨
  modalTitle: { fontSize: 18, fontWeight: 'bold' },
  
  // 시작일과 종료일을 화살표와 함께 보여주는 칸
  selectionInfo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 20, paddingHorizontal: 15 },
  infoBox: { flex: 1, alignItems: 'center' },
  infoLabel: { fontSize: 12, color: '#999', marginBottom: 5 },
  infoValue: { fontSize: 16, fontWeight: 'bold' },
  arrowBox: { alignItems: 'center', justifyContent: 'center', width: 40 },
  
  modalCalendarWrapper: { paddingBottom: 10 }, // 모달 안의 달력을 감싸는 칸
  inputSection: { padding: 20 }, // 할 일 글씨 입력하는 구역
  inputLabel: { fontSize: 14, marginBottom: 10, fontWeight: '600' },
  textInput: { padding: 15, borderRadius: 12, fontSize: 16, borderWidth: 1 }, // 실제 글씨를 치는 네모난 칸

  // --- [햄버거 메뉴 (바텀 시트) 영역] ---
  menuOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0, 0, 0, 0.5)', zIndex: 10 }, // 메뉴가 뜰 때 뒤에 깔리는 어두운 배경
  overlayTouchArea: { flex: 1 }, // 어두운 배경을 누르면 닫히게 하는 투명 버튼
  menuPanel: { position: 'absolute', bottom: 0, width: '100%', height: PANEL_HEIGHT, borderTopLeftRadius: 30, borderTopRightRadius: 30, paddingTop: 12, zIndex: 20 }, // 밑에서 올라오는 하얀색 시트
  handleBar: { width: 40, height: 5, backgroundColor: '#E0E0E0', borderRadius: 3, alignSelf: 'center', marginBottom: 10 }, // 시트 맨 위에 있는 회색 손잡이 줄
  menuSafeArea: { paddingHorizontal: 25, paddingBottom: 20 },
  menuHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 10, paddingBottom: 25 },
  menuTitle: { fontSize: 22, fontWeight: 'bold' },
  closeBtn: { padding: 5 },
  
  // 메뉴 안에 있는 개별 버튼들 ('설정', '모든 일정 지우기')
  menuItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 18, borderBottomWidth: 1, borderColor: 'rgba(0,0,0,0.05)' },
  menuItemText: { fontSize: 16, marginLeft: 15, fontWeight: '500' },
});