import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { 
  Animated, FlatList, KeyboardAvoidingView, Modal, Platform, 
  ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, 
} from 'react-native';

// [외부 도구상자]
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Stack, router, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Calendar } from 'react-native-calendars';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GestureHandlerRootView, Swipeable, FlingGestureHandler, Directions, State } from 'react-native-gesture-handler';

// [우리 앱 전용 도구상자]
import { updateNotification } from '../useNotification';
import { useTheme } from './_layout';

// ----------------------------------------------------------------------------
// [1. 데이터 규격서 (Interface)]
// 어떤 모양의 데이터를 다룰지 컴퓨터에게 미리 알려줍니다.
// ----------------------------------------------------------------------------
interface Task {
  id: string;              // 할 일의 고유 번호 (주민번호 같은 역할)
  text: string;            // 할 일 내용 (예: "장보기")
  range: [string, string]; // [시작하는 날, 끝나는 날]
  isDone: boolean;         // 완료했는지 안 했는지 (동그라미/체크)
}

interface TaskState {
  [key: string]: Task[];   // 날짜별 서랍장 (예: '2026-04-10' 서랍에 Task들이 들어있음)
}

interface ThemeType {
  bg: string;              // 뒷배경 색상
  card: string;            // 하얀색(또는 진회색) 네모 상자 색상
  text: string;            // 메인 글씨 색상
  subText: string;         // 흐릿한 보조 글씨 색상
  border: string;          // 선(테두리) 색상
  icon: string;            // 아이콘 색상
}

const PANEL_HEIGHT = 300;  // 바텀 메뉴가 튀어 올라올 때의 높이 (고정값)

// ----------------------------------------------------------------------------
// [2. 작은 부품: 개별 할 일 카드 (AnimatedTaskItem)]
// ----------------------------------------------------------------------------
const AnimatedTaskItem = ({ item, theme, onToggle, onDelete }: { 
  item: Task; theme: ThemeType; onToggle: (id: string) => void; onDelete: (id: string) => void 
}) => {
  
  // 🌟 스와이프: 카드를 왼쪽으로 밀었을 때 나타날 빨간 '삭제' 버튼
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
            
            {/* 할 일 텍스트: 끝났으면(isDone) 색을 흐리게 빼고 취소선을 쫙 긋습니다. */}
            <Text style={[
              styles.todoText, 
              { 
                color: item.isDone ? theme.subText : theme.text, 
                textDecorationLine: item.isDone ? 'line-through' : 'none' 
              }
            ]}>
              {item.text}
            </Text>
            
            {/* 기간 표시: '시작일 ~ 종료일' */}
            <Text style={[styles.todoRange, { color: theme.subText }]}>
              {item.range[0]} ~ {item.range[1]}
            </Text>
          </View>
          
          {/* 오른쪽 끝에 달린 상태 아이콘 (빈 동그라미 or 초록색 체크표시) */}
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
// [3. 메인 화면: 달력과 일정을 보여주는 앱의 중심지]
// ----------------------------------------------------------------------------
export default function App() {
  
  // --- [A. 상태 공간 (메모리)] ---
  const { isDarkMode } = useTheme();                                       // 다크모드 켜졌나요?
  const [tasks, setTasks] = useState<TaskState>({});                       // 휴대폰에 저장된 전체 할 일 목록
  const [viewDate, setViewDate] = useState(new Date().toISOString().split('T')[0]); // 달력에서 지금 누른 파란색 날짜

  // 화면을 덮는 팝업(모달) 띄우기 스위치
  const [isModalVisible, setModalVisible] = useState(false);               // 새 일정 추가 창 스위치
  const [isMenuVisible, setMenuVisible] = useState(false);                 // 바닥에서 올라오는 메뉴 스위치
  const [isSelecting, setIsSelecting] = useState(false);                   // (일정 추가 시) 날짜 기간 고르는 중인가요?
  
  // 새 일정을 적을 때 쓸 빈 종이
  const [addStartDate, setAddStartDate] = useState(viewDate);
  const [addEndDate, setAddEndDate] = useState(viewDate);
  const [taskText, setTaskText] = useState('');

  // --- [B. 애니메이션 및 디자인 세팅] ---
  const overlayOpacity = useRef(new Animated.Value(0)).current;            // 메뉴 뜰 때 배경 까맣게 변하는 정도
  const panelTranslateY = useRef(new Animated.Value(PANEL_HEIGHT)).current;// 메뉴판이 바닥에 숨어있는 위치

  // 테마 색상표 (isDarkMode 스위치에 따라 흰색/까만색 버전으로 자동 교체됩니다)
  const theme = useMemo(() => ({
    bg: isDarkMode ? '#121212' : '#F8F9FA',
    card: isDarkMode ? '#1E1E1E' : '#FFFFFF',
    text: isDarkMode ? '#FFFFFF' : '#333333',
    subText: isDarkMode ? '#AAAAAA' : '#888888',
    border: isDarkMode ? '#333333' : '#EEEEEE',
    icon: isDarkMode ? '#FFFFFF' : '#333333',
  }), [isDarkMode]);

  // --- [C. 데이터 처리소 (불러오기, 저장, 삭제)] ---
  
  // 1. 데이터 불러오기: 이 화면에 들어올 때마다 서랍(AsyncStorage)에서 최신 데이터를 꺼냅니다.
  useFocusEffect(
    useCallback(() => {
      const loadLatestTasks = async () => {
        try {
          const savedTasks = await AsyncStorage.getItem('@checklendar_tasks');
          if (savedTasks) setTasks(JSON.parse(savedTasks));
        } catch (e) { 
          console.error('데이터 불러오기 오류:', e); 
        }
      };
      loadLatestTasks();
    }, [])
  );

  // 2. 🌟 [핵심] 변경된 데이터를 서랍에 잘 넣어두고 알림도 맞춰주는 든든한 함수
  const updateAndSaveTasks = useCallback(async (newTasks: TaskState) => {
    setTasks(newTasks); 
    try {
      await AsyncStorage.setItem('@checklendar_tasks', JSON.stringify(newTasks)); 
      updateNotification(); // 데이터가 바뀌었으니 알림도 다시 세팅!
    } catch (e) { 
      console.error('데이터 저장 오류:', e); 
    }
  }, []);

  // 3. 🌟 새 일정 등록하기 (모달창에서 '저장' 눌렀을 때 작동)
  const saveTask = useCallback(() => {
    if (taskText.trim().length === 0) return; // 아무 글자도 안 썼으면 무시!
    
    // 선택한 기간(예: 4월 1일 ~ 3일)을 쪼개서 [1일, 2일, 3일] 배열로 만듭니다.
    const datesInRange = [];
    let curr = new Date(addStartDate);
    const last = new Date(addEndDate);
    while (curr <= last) {
      datesInRange.push(curr.toISOString().split('T')[0]);
      curr.setDate(curr.getDate() + 1);
    }

    // 새로 만들 일정 덩어리입니다. (처음엔 미완료 상태니까 isDone은 false)
    const newTask: Task = { id: Date.now().toString(), text: taskText, range: [addStartDate, addEndDate], isDone: false };
    const updatedTasks = { ...tasks };
    
    // 아까 쪼갠 날짜들 서랍에 일정 덩어리를 하나씩 똑같이 복사해서 넣어줍니다.
    datesInRange.forEach(date => {
      updatedTasks[date] = [...(updatedTasks[date] || []), newTask];
    });

    updateAndSaveTasks(updatedTasks); 
    setTaskText(''); // 빈 종이로 초기화
    setModalVisible(false); // 모달창 닫기
  }, [taskText, addStartDate, addEndDate, tasks, updateAndSaveTasks]);

  // 4. 동그라미(완료/미완료) 똑딱! 스위치
  const toggleTaskCompletion = useCallback((taskId: string) => {
    const updatedTasks = { ...tasks };
    Object.keys(updatedTasks).forEach(date => {
      updatedTasks[date] = updatedTasks[date].map(t => t.id === taskId ? { ...t, isDone: !t.isDone } : t);
    });
    updateAndSaveTasks(updatedTasks); 
  }, [tasks, updateAndSaveTasks]);

  // 5. 스와이프해서 완전히 지워버리기
  const deleteTaskPermanently = useCallback((taskId: string) => {
    const updated = { ...tasks };
    Object.keys(updated).forEach(date => {
      updated[date] = updated[date].filter(t => t.id !== taskId);
      if (updated[date].length === 0) delete updated[date];
    });
    updateAndSaveTasks(updated);
  }, [tasks, updateAndSaveTasks]);

  // --- [D. 조작 스위치 (버튼 눌렀을 때 작동하는 동작들)] ---
  
  // 바텀 메뉴 열기/닫기 스위치 (애니메이션이 들어가서 스르륵 움직입니다)
  const handleOpenMenu = useCallback(() => setMenuVisible(true), []);
  const handleCloseMenu = useCallback(() => {
    Animated.parallel([
      Animated.timing(overlayOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
      Animated.timing(panelTranslateY, { toValue: PANEL_HEIGHT, duration: 250, useNativeDriver: true }),
    ]).start(() => setMenuVisible(false));
  }, [overlayOpacity, panelTranslateY]);

  // 메뉴판이 '켜짐' 상태가 되면, 스르륵 올라오라고 지시를 내립니다.
  useEffect(() => {
    if (isMenuVisible) {
      Animated.parallel([
        Animated.timing(overlayOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.spring(panelTranslateY, { toValue: 0, speed: 12, bounciness: 5, useNativeDriver: true }),
      ]).start();
    }
  }, [isMenuVisible, overlayOpacity, panelTranslateY]);

  // 새 일정을 등록할 때, 달력을 터치해서 '시작일'과 '종료일'을 지정하는 똑똑한 함수입니다.
  const handleDayPressInModal = useCallback((day: any) => {
    const clickedDate = day.dateString;
    if (!isSelecting) {
      // 1. 처음 터치: 그 날짜가 시작일이자 종료일이 됩니다.
      setAddStartDate(clickedDate); setAddEndDate(clickedDate); setIsSelecting(true);
    } else {
      // 2. 두 번째 터치:
      if (new Date(clickedDate) < new Date(addStartDate)) {
        // 만약 두 번째로 터치한 날짜가 처음 터치한 날짜보다 과거면? -> 순서를 뒤집어줍니다.
        setAddEndDate(addStartDate); setAddStartDate(clickedDate);
      } else {
        // 정상적인 순서면 종료일로 확정 쾅!
        setAddEndDate(clickedDate);
      }
      setIsSelecting(false);
    }
  }, [isSelecting, addStartDate]);

  // 메인 달력에 콕콕 찍을 동그라미(마킹) 데이터를 준비합니다.
  const mainMarkedDates = useMemo(() => {
    const marks: { [key: string]: any } = {};
    Object.keys(tasks).forEach(date => { if (tasks[date].length > 0) marks[date] = { marked: true }; });
    // 지금 보고 있는 파란색 선택 날짜는 모양을 좀 더 특별하게 꾸며줍니다.
    marks[viewDate] = { ...marks[viewDate], customStyles: { container: { backgroundColor: '#4A90E2', borderRadius: 8 }, text: { color: '#FFF' } } };
    return marks;
  }, [tasks, viewDate]);

  // 모달 달력에서 '파란색 선'으로 기간을 이어주는 데이터를 준비합니다.
  const modalMarkedDates = useMemo(() => {
    const marks: { [key: string]: any } = {};
    const range = [];
    let curr = new Date(addStartDate);
    while (curr <= new Date(addEndDate)) {
      range.push(curr.toISOString().split('T')[0]);
      curr.setDate(curr.getDate() + 1);
    }
    // 시작일(동그라미), 중간일(연한 배경), 종료일(동그라미)을 각각 예쁘게 칠해줍니다.
    range.forEach((d, i) => {
      marks[d] = { 
        color: i === 0 || i === range.length - 1 ? '#4A90E2' : (isDarkMode ? '#2C3E50' : '#E3F2FD'), 
        textColor: theme.text, startingDay: i === 0, endingDay: i === range.length - 1 
      };
    });
    return marks;
  }, [addStartDate, addEndDate, isDarkMode, theme.text]);

  // 🌟 화면을 왼쪽으로 휙(Fling) 밀었을 때 월별 모아보기 화면으로 넘어가는 스위치입니다.
  const onFlingLeft = useCallback(({ nativeEvent }: any) => {
    if (nativeEvent.state === State.ACTIVE) {
      router.push('/monthly' as any);
    }
  }, []);

  // 모달을 끄기 위한 함수 (최적화 추가)
  const closeModal = useCallback(() => {
    setModalVisible(false);
  }, []);

  // 더하기 버튼(FAB)을 눌렀을 때 모달을 여는 함수 (최적화 추가)
  const openModal = useCallback(() => {
    setAddStartDate(viewDate); 
    setAddEndDate(viewDate); 
    setTaskText(''); 
    setModalVisible(true);
  }, [viewDate]);


  // --- [E. 화면 그리기 (렌더링)] ---
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
        <StatusBar style={isDarkMode ? 'light' : 'dark'} />
        <Stack.Screen options={{ headerShown: false }} />
        
        {/* 앱 상단 타이틀바 (이름 + 메뉴 버튼) */}
        <View style={styles.header}>
          <Text style={[styles.headerTitle, { color: theme.text }]}>Checklendar</Text>
          <TouchableOpacity onPress={handleOpenMenu}>
            <Ionicons name="menu" size={32} color={theme.icon} />
          </TouchableOpacity>
        </View>

        {/* 🌟 달력 덩어리 (여기서 화면을 왼쪽으로 밀면 onFlingLeft 스위치가 켜집니다!) */}
        <FlingGestureHandler direction={Directions.LEFT} onHandlerStateChange={onFlingLeft}>
          <View style={[styles.calendarContainer, { backgroundColor: theme.card }]}>
            <Calendar
              key={isDarkMode ? 'dark' : 'light'}
              markingType={'custom'}
              markedDates={mainMarkedDates}
              onDayPress={(day: any) => setViewDate(day.dateString)} // 날짜 누르면 viewDate 변경!
              theme={{ calendarBackground: theme.card, dayTextColor: theme.text, monthTextColor: theme.text, arrowColor: '#4A90E2', todayTextColor: '#4A90E2' }}
              
              // 달력 안의 숫자 하나하나를 직접 예쁘게 빚어내는 공간입니다. (배지/동그라미 위치 지정)
              dayComponent={({date, state}: any) => {
                if (!date) return <View />;
                const dayTasks = tasks[date.dateString] || [];
                const incomplete = dayTasks.filter(t => !t.isDone).length; // 안 한 일 개수
                const completed = dayTasks.filter(t => t.isDone).length;   // 다 한 일 개수
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
        </FlingGestureHandler>

        {/* 달력 아래에 나오는 그 날의 할 일 목록입니다. */}
        <View style={styles.listContainer}>
          <Text style={[styles.listTitle, { color: theme.text }]}>{viewDate}의 할 일</Text>
          <FlatList
            data={tasks[viewDate] || []}
            keyExtractor={(item) => item.id}
            renderItem={({item}) => (
              <AnimatedTaskItem item={item} theme={theme} onToggle={toggleTaskCompletion} onDelete={deleteTaskPermanently} />
            )}
            // 할 일이 하나도 없을 때 보여줄 안내문구
            ListEmptyComponent={<Text style={[styles.emptyText, { color: theme.subText }]}>예정된 일정이 없습니다.</Text>}
          />
        </View>

        {/* 오른쪽 아래에 항상 떠 있는 파란색 '+' 버튼입니다. */}
        <TouchableOpacity style={styles.fab} onPress={openModal}>
          <Ionicons name="add" size={32} color="#FFF" />
        </TouchableOpacity>

        {/* =========================================================================
            여기서부터는 화면에 평소엔 안 보이다가 버튼 누르면 나타나는 팝업(모달) 공간입니다. 
            ========================================================================= */}

        {/* [모달 1] 새 일정 등록 스케치북 */}
        <Modal visible={isModalVisible} animationType="slide" presentationStyle="pageSheet">
          <SafeAreaView style={[styles.modalContainer, { backgroundColor: theme.bg }]}>
            {/* 타자 칠 때 키보드가 입력창을 가리지 않게 위로 쑥 올려주는 마법의 View */}
            <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={70}>
              <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
                
                {/* 모달창 헤더 (취소 / 제목 / 저장) */}
                <View style={[styles.modalHeader, { backgroundColor: theme.card, borderBottomWidth: 1, borderColor: theme.border }]}>
                  <TouchableOpacity onPress={closeModal}><Text style={styles.modalCancelText}>취소</Text></TouchableOpacity>
                  <Text style={[styles.modalTitle, { color: theme.text }]}>새 일정 추가</Text>
                  <TouchableOpacity onPress={saveTask}><Text style={styles.modalSaveText}>저장</Text></TouchableOpacity>
                </View>
                
                {/* 선택된 날짜 (시작일 -> 종료일) 보여주는 띠 */}
                <View style={[styles.selectionInfo, { backgroundColor: theme.card }]}>
                  <View style={styles.infoBox}><Text style={styles.infoLabel}>시작일</Text><Text style={[styles.infoValue, { color: theme.text }]}>{addStartDate}</Text></View>
                  <View style={styles.arrowBox}><Ionicons name="arrow-forward" size={24} color="#4A90E2" /></View>
                  <View style={styles.infoBox}><Text style={styles.infoLabel}>종료일</Text><Text style={[styles.infoValue, { color: theme.text }]}>{addEndDate}</Text></View>
                </View>

                {/* 기간을 길게 긋기 위해 모달창 안에 띄운 미니 달력 */}
                <View style={[styles.modalCalendarWrapper, { backgroundColor: theme.card }]}>
                  <Calendar markingType={'period'} markedDates={modalMarkedDates} theme={{ calendarBackground: theme.card, dayTextColor: theme.text, monthTextColor: theme.text, todayTextColor: '#4A90E2' }} onDayPress={handleDayPressInModal} />
                </View>

                {/* 진짜 할 일 내용을 타자 치는 입력창 */}
                <View style={styles.inputSection}>
                  <Text style={[styles.inputLabel, { color: theme.subText }]}>할 일 내용</Text>
                  <TextInput style={[styles.textInput, { backgroundColor: theme.card, color: theme.text, borderColor: theme.border }]} placeholder="어떤 일정이 있나요?" placeholderTextColor={theme.subText} value={taskText} onChangeText={setTaskText} />
                </View>

              </ScrollView>
            </KeyboardAvoidingView>
          </SafeAreaView>
        </Modal>

        {/* [모달 2] 바닥에서 스르륵 올라오는 설정/메뉴판 */}
        <Modal visible={isMenuVisible} transparent={true} animationType="none">
          {/* 바깥의 까만 배경 (이곳을 누르면 닫힙니다) */}
          <Animated.View style={[styles.menuOverlay, { opacity: overlayOpacity }]}><TouchableOpacity style={styles.overlayTouchArea} activeOpacity={1} onPress={handleCloseMenu} /></Animated.View>
          
          {/* 진짜 메뉴판 덩어리 */}
          <Animated.View style={[styles.menuPanel, { backgroundColor: theme.card, transform: [{ translateY: panelTranslateY }] }]}>
            <View style={styles.handleBar} /> {/* 위에 있는 회색 손잡이 줄 */}
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
// [4. 디자인 공방 (StyleSheet)]
// 화면 요소들의 예쁜 위치와 크기, 간격을 맞춰줍니다.
// ----------------------------------------------------------------------------
const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 15 },
  headerTitle: { fontSize: 26, fontWeight: 'bold' },

  calendarContainer: { marginHorizontal: 15, borderRadius: 15, padding: 10, elevation: 2, overflow: 'hidden' },
  dayBox: { alignItems: 'center', justifyContent: 'center', width: 40, height: 40, borderRadius: 20 },
  dayText: { fontSize: 15 },
  badgeContainer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 2, height: 12 },
  countText: { fontSize: 10, fontWeight: 'bold' }, 
  dot: { width: 4, height: 4, borderRadius: 2 },

  listContainer: { flex: 1, padding: 20 },
  listTitle: { fontSize: 18, fontWeight: '600', marginBottom: 15 },
  todoItem: { padding: 16, borderRadius: 15, marginBottom: 12, elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 3 },
  todoContent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  todoText: { fontSize: 16, fontWeight: '600' },
  todoRange: { fontSize: 11, marginTop: 4 },
  emptyText: { textAlign: 'center', marginTop: 30, fontSize: 15 },

  fab: { position: 'absolute', right: 20, bottom: 40, backgroundColor: '#4A90E2', width: 60, height: 60, borderRadius: 30, justifyContent: 'center', alignItems: 'center', elevation: 5 },
  deleteAction: { backgroundColor: '#FF3B30', justifyContent: 'center', alignItems: 'center', width: 80, borderRadius: 15, marginBottom: 12, marginLeft: 10 },
  deleteBtnText: { color: '#FFF', fontSize: 12, fontWeight: '600', marginTop: 4 },

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