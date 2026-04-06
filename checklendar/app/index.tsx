import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, TextInput, FlatList, Modal, Dimensions, Animated } from 'react-native';
import { Calendar } from 'react-native-calendars';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Stack, router } from 'expo-router';
import { useTheme } from './_layout';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const PANEL_HEIGHT = 300; 

// --- [💡 내부 컴포넌트: 애니메이션이 적용된 할 일 아이템] ---
const AnimatedTaskItem = ({ item, theme, onComplete }) => {
  const [isDone, setIsDone] = useState(false); // 체크 여부
  const fadeAnim = useRef(new Animated.Value(1)).current; // 투명도 애니메이션

  const handlePress = () => {
    setIsDone(true); // 1. 즉시 체크 표시로 변경
    
    // 2. 부드럽게 사라지는 애니메이션 실행
    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 400,
      useNativeDriver: true,
    }).start(() => {
      onComplete(item.id); // 3. 애니메이션 종료 후 실제 데이터 삭제
    });
  };

  return (
    <Animated.View style={[styles.todoItem, { backgroundColor: theme.card, opacity: fadeAnim }]}>
      <TouchableOpacity 
        activeOpacity={0.7}
        onPress={handlePress}
        style={styles.todoContent}
      >
        {/* 왼쪽: 할 일 내용 */}
        <View style={{ flex: 1 }}>
          <Text style={[styles.todoText, { color: theme.text, textDecorationLine: isDone ? 'line-through' : 'none' }]}>
            {item.text}
          </Text>
          <Text style={[styles.todoRange, { color: theme.subText }]}>{item.range[0]} ~ {item.range[1]}</Text>
        </View>

        {/* 오른쪽: 체크 아이콘 (위치 변경됨) */}
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

export default function App() {
  const { isDarkMode } = useTheme(); 
  const [viewDate, setViewDate] = useState(new Date().toISOString().split('T')[0]);
  const [tasks, setTasks] = useState({});
  const [isModalVisible, setModalVisible] = useState(false);
  const [addStartDate, setAddStartDate] = useState(viewDate);
  const [addEndDate, setAddEndDate] = useState(viewDate);
  const [isSelecting, setIsSelecting] = useState(false);
  const [taskText, setTaskText] = useState('');
  const [isMenuVisible, setMenuVisible] = useState(false);

  const theme = useMemo(() => ({
    bg: isDarkMode ? '#121212' : '#F8F9FA',
    card: isDarkMode ? '#1E1E1E' : '#FFFFFF',
    text: isDarkMode ? '#FFFFFF' : '#333333',
    subText: isDarkMode ? '#AAAAAA' : '#888888',
    border: isDarkMode ? '#333333' : '#EEEEEE',
    icon: isDarkMode ? '#FFFFFF' : '#333333',
  }), [isDarkMode]);

  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const panelTranslateY = useRef(new Animated.Value(PANEL_HEIGHT)).current;

  useEffect(() => {
    if (isMenuVisible) {
      Animated.parallel([
        Animated.timing(overlayOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.spring(panelTranslateY, { toValue: 0, speed: 12, bounciness: 5, useNativeDriver: true }),
      ]).start();
    }
  }, [isMenuVisible]);

  const handleCloseMenu = useCallback(() => {
    Animated.parallel([
      Animated.timing(overlayOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
      Animated.timing(panelTranslateY, { toValue: PANEL_HEIGHT, duration: 250, useNativeDriver: true }),
    ]).start(() => setMenuVisible(false));
  }, [overlayOpacity, panelTranslateY]);

  // --- [데이터 삭제 로직] ---
  const deleteTask = useCallback((taskId) => {
    setTasks(prev => {
      const updated = { ...prev };
      Object.keys(updated).forEach(date => {
        updated[date] = updated[date].filter(t => t.id !== taskId);
        if (updated[date].length === 0) delete updated[date];
      });
      return updated;
    });
  }, []);

  const getDatesInRange = useCallback((start, end) => {
    const dates = [];
    let curr = new Date(start);
    const last = new Date(end);
    while (curr <= last) {
      dates.push(curr.toISOString().split('T')[0]);
      curr.setDate(curr.getDate() + 1);
    }
    return dates;
  }, []);

  const saveTask = useCallback(() => {
    if (taskText.trim().length === 0) return;
    const range = getDatesInRange(addStartDate, addEndDate);
    const newTask = { id: Date.now().toString(), text: taskText, range: [addStartDate, addEndDate] };
    const updatedTasks = { ...tasks };
    range.forEach(date => {
      if (!updatedTasks[date]) updatedTasks[date] = [];
      updatedTasks[date] = [...updatedTasks[date], newTask];
    });
    setTasks(updatedTasks);
    setTaskText('');
    setIsSelecting(false);
    setModalVisible(false);
  }, [taskText, addStartDate, addEndDate, tasks, getDatesInRange]);

  const openAddModal = useCallback(() => {
    setAddStartDate(viewDate); setAddEndDate(viewDate); setIsSelecting(false); setTaskText(''); setModalVisible(true);
  }, [viewDate]);

  const handleDayPress = useCallback((day) => {
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

  const mainMarkedDates = useMemo(() => {
    const marks = {};
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
    if (!marks[viewDate]) marks[viewDate] = { customStyles: { container: { backgroundColor: '#4A90E2', borderRadius: 8 }, text: { color: '#FFF' } } };
    return marks;
  }, [tasks, viewDate, theme.text]);

  const modalMarkedDates = useMemo(() => {
    const marks = {};
    const range = getDatesInRange(addStartDate, addEndDate);
    range.forEach((date, index) => {
      marks[date] = {
        color: isDarkMode ? '#2C3E50' : '#E3F2FD', textColor: theme.text,
        startingDay: index === 0, endingDay: index === range.length - 1,
      };
    });
    if (marks[addStartDate]) marks[addStartDate].color = '#4A90E2';
    if (marks[addEndDate]) marks[addEndDate].color = '#4A90E2';
    return marks;
  }, [addStartDate, addEndDate, isDarkMode, theme.text, getDatesInRange]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: theme.text }]}>Checklendar</Text>
        <TouchableOpacity onPress={() => setMenuVisible(true)}>
          <Ionicons name="menu" size={32} color={theme.icon} />
        </TouchableOpacity>
      </View>

      <View style={[styles.calendarContainer, { backgroundColor: theme.card }]}>
        <Calendar
          key={isDarkMode ? 'dark' : 'light'}
          markingType={'custom'}
          markedDates={mainMarkedDates}
          onDayPress={(day) => setViewDate(day.dateString)}
          theme={{ calendarBackground: theme.card, dayTextColor: theme.text, monthTextColor: theme.text, arrowColor: '#4A90E2', todayTextColor: '#4A90E2', textDisabledColor: isDarkMode ? '#444' : '#ccc' }}
          dayComponent={({date, state, marking}) => {
            const count = tasks[date.dateString]?.length || 0;
            const isSunday = new Date(date.dateString).getDay() === 0;
            const isSelected = date.dateString === viewDate;
            return (
              <TouchableOpacity onPress={() => setViewDate(date.dateString)} style={[styles.dayBox, isSelected && { backgroundColor: '#4A90E2' }]}>
                <Text style={[styles.dayText, isSunday && { color: '#FF5252' }, { color: isSelected ? '#FFF' : theme.text }, state === 'disabled' && { color: isDarkMode ? '#444' : '#ccc' }]}>{date.day}</Text>
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

      <View style={styles.listContainer}>
        <Text style={[styles.listTitle, { color: theme.text }]}>{viewDate}의 할 일</Text>
        <FlatList
          data={tasks[viewDate] || []}
          keyExtractor={(item) => item.id}
          renderItem={({item}) => (
            // 💡 애니메이션이 적용된 커스텀 아이템 사용
            <AnimatedTaskItem item={item} theme={theme} onComplete={deleteTask} />
          )}
          ListEmptyComponent={<Text style={[styles.emptyText, { color: theme.subText }]}>예정된 일정이 없습니다.</Text>}
        />
      </View>

      <TouchableOpacity style={styles.fab} onPress={openAddModal}><Ionicons name="add" size={32} color="#FFF" /></TouchableOpacity>

      {/* 모달 및 메뉴 코드는 이전과 동일하게 유지 */}
      <Modal visible={isModalVisible} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={[styles.modalContainer, { backgroundColor: theme.bg }]}>
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
            <TextInput style={[styles.textInput, { backgroundColor: theme.card, color: theme.text, borderColor: theme.border }]} placeholder="어떤 일정이 있나요?" placeholderTextColor={theme.subText} value={taskText} onChangeText={setTaskText} />
          </View>
        </SafeAreaView>
      </Modal>

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
            <TouchableOpacity style={styles.menuItem} onPress={() => { handleCloseMenu(); router.push('/settings'); }}><Ionicons name="settings-outline" size={22} color={theme.subText} /><Text style={[styles.menuItemText, { color: theme.text }]}>설정</Text></TouchableOpacity>
            <TouchableOpacity style={styles.menuItem} onPress={() => { setTasks({}); handleCloseMenu(); }}><Ionicons name="trash-outline" size={22} color="#FF5252" /><Text style={[styles.menuItemText, { color: '#FF5252' }]}>모든 일정 지우기</Text></TouchableOpacity>
          </SafeAreaView>
        </Animated.View>
      </Modal>
    </SafeAreaView>
  );
}

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
  // 💡 할 일 레이아웃 스타일
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