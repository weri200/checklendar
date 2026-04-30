import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, Stack, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { 
  Animated, KeyboardAvoidingView, Modal, Platform, 
  ScrollView, SectionList, StyleSheet, Text, TextInput, TouchableOpacity, View 
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GestureHandlerRootView, Swipeable } from 'react-native-gesture-handler';
import { Calendar } from 'react-native-calendars';

import { useTheme } from './_layout';
import { updateNotification } from '../useNotification'; 

// ----------------------------------------------------------------------------
// [데이터 설계도]
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

interface ThemeType {
  bg: string;
  card: string;
  text: string;
  subText: string;
  border: string;
  icon: string;
}

const PANEL_HEIGHT = 300; 

// ----------------------------------------------------------------------------
// [작은 부품: 개별 할 일 카드 (스와이프 닫기 제어용)]
// ----------------------------------------------------------------------------
const MonthlyTaskItem = ({ item, theme, onToggle, onDelete, onEdit }: { 
  item: Task; 
  theme: ThemeType; 
  onToggle: (id: string) => void; 
  onDelete: (id: string) => void;
  onEdit: (id: string, currentText: string, currentRange: [string, string]) => void; 
}) => {
  const swipeableRef = useRef<Swipeable>(null);

  const handleEdit = () => {
    swipeableRef.current?.close(); // 수정 버튼 누르면 스와이프 닫기
    onEdit(item.id, item.text, item.range);
  };

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
      <View style={[styles.taskCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <TouchableOpacity 
          activeOpacity={0.7} 
          onPress={() => onToggle(item.id)} 
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
  );
};

export default function MonthlyScreen() {
  const { isDarkMode } = useTheme();
  const [tasks, setTasks] = useState<TaskState>({});

  // 모달 및 메뉴 관련 상태
  const [isModalVisible, setModalVisible] = useState(false);               
  const [isMenuVisible, setMenuVisible] = useState(false);                 
  const [isSelecting, setIsSelecting] = useState(false);                   
  
  const today = new Date().toISOString().split('T')[0];
  const [addStartDate, setAddStartDate] = useState(today);
  const [addEndDate, setAddEndDate] = useState(today);
  const [taskText, setTaskText] = useState('');

  // 🌟 [추가됨] 일정 수정 모달용 상태
  const [isEditModalVisible, setEditModalVisible] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editTaskText, setEditTaskText] = useState('');
  const [editStartDate, setEditStartDate] = useState(today);
  const [editEndDate, setEditEndDate] = useState(today);
  const [isEditSelecting, setIsEditSelecting] = useState(false);

  // 애니메이션 설정
  const overlayOpacity = useRef(new Animated.Value(0)).current;            
  const panelTranslateY = useRef(new Animated.Value(PANEL_HEIGHT)).current;

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
  // [2. 데이터 조작하기]
  // ----------------------------------------------------------------------------
  const updateAndSaveTasks = useCallback(async (newTasks: TaskState) => {
    setTasks(newTasks); 
    try {
      await AsyncStorage.setItem('@checklendar_tasks', JSON.stringify(newTasks)); 
      updateNotification(); 
    } catch (e) { 
      console.error('데이터 저장 오류:', e); 
    }
  }, []);

  const toggleTaskCompletion = useCallback((taskId: string) => {
    const updated = { ...tasks };
    Object.keys(updated).forEach(date => {
      updated[date] = updated[date].map(t => t.id === taskId ? { ...t, isDone: !t.isDone } : t);
    });
    updateAndSaveTasks(updated);
  }, [tasks, updateAndSaveTasks]);

  const deleteTaskPermanently = useCallback((taskId: string) => {
    const updated = { ...tasks };
    Object.keys(updated).forEach(date => {
      updated[date] = updated[date].filter(t => t.id !== taskId);
      if (updated[date].length === 0) delete updated[date];
    });
    updateAndSaveTasks(updated);
  }, [tasks, updateAndSaveTasks]);

  const saveTask = useCallback(() => {
    if (taskText.trim().length === 0) return; 
    
    const datesInRange = [];
    let curr = new Date(`${addStartDate}T00:00:00`); 
    const last = new Date(`${addEndDate}T00:00:00`);
    
    while (curr <= last) {
      const y = curr.getFullYear();
      const m = String(curr.getMonth() + 1).padStart(2, '0');
      const d = String(curr.getDate()).padStart(2, '0');
      datesInRange.push(`${y}-${m}-${d}`);
      curr.setDate(curr.getDate() + 1);
    }

    const newTask: Task = { id: Date.now().toString(), text: taskText, range: [addStartDate, addEndDate], isDone: false };
    const updatedTasks = { ...tasks };
    
    datesInRange.forEach(date => {
      updatedTasks[date] = [...(updatedTasks[date] || []), newTask];
    });

    updateAndSaveTasks(updatedTasks); 
    setTaskText(''); 
    setModalVisible(false); 
  }, [taskText, addStartDate, addEndDate, tasks, updateAndSaveTasks]);

  // 🌟 [추가됨] 수정 모달 열기
  const openEditModal = useCallback((id: string, currentText: string, currentRange: [string, string]) => {
    setEditingTaskId(id);
    setEditTaskText(currentText);
    setEditStartDate(currentRange[0]);
    setEditEndDate(currentRange[1]);
    setIsEditSelecting(false);
    setEditModalVisible(true);
  }, []);

  // 🌟 [추가됨] 수정한 내용과 날짜 저장하기
  const saveEditedTask = useCallback(() => {
    if (!editingTaskId || editTaskText.trim().length === 0) return;
    
    let currentIsDone = false;
    for (const date in tasks) {
      const foundTask = tasks[date].find(t => t.id === editingTaskId);
      if (foundTask) {
        currentIsDone = foundTask.isDone;
        break;
      }
    }

    const updatedTasks = { ...tasks };

    Object.keys(updatedTasks).forEach(date => {
      updatedTasks[date] = updatedTasks[date].filter(t => t.id !== editingTaskId);
      if (updatedTasks[date].length === 0) delete updatedTasks[date];
    });

    const datesInRange = [];
    let curr = new Date(`${editStartDate}T00:00:00`); 
    const last = new Date(`${editEndDate}T00:00:00`);
    
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

    datesInRange.forEach(date => {
      updatedTasks[date] = [...(updatedTasks[date] || []), updatedTask];
    });
    
    updateAndSaveTasks(updatedTasks);
    setEditModalVisible(false);
    setEditingTaskId(null);
    setEditTaskText('');
  }, [editingTaskId, editTaskText, editStartDate, editEndDate, tasks, updateAndSaveTasks]);

  // ----------------------------------------------------------------------------
  // [3. 모달 및 메뉴 제어]
  // ----------------------------------------------------------------------------
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

  // 🌟 [추가됨] 수정 모달에서 날짜 선택
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

  // 🌟 [추가됨] 수정 모달 달력 색칠
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
    setAddStartDate(today); 
    setAddEndDate(today); 
    setTaskText(''); 
    setModalVisible(true);
  }, [today]);

  // ----------------------------------------------------------------------------
  // [4. 데이터 가공 (월별 그룹화)]
  // ----------------------------------------------------------------------------
  const sections = useMemo(() => {
    const uniqueTasks = new Map<string, Task>();

    Object.values(tasks).forEach(dayTasks => {
      dayTasks.forEach(task => {
        if (!uniqueTasks.has(task.id)) {
          uniqueTasks.set(task.id, task);
        }
      });
    });

    const grouped: { [month: string]: Task[] } = {};

    Array.from(uniqueTasks.values()).forEach(task => {
      const [year, month] = task.range[0].split('-');
      const monthKey = `${year}년 ${month}월`;

      if (!grouped[monthKey]) grouped[monthKey] = [];
      grouped[monthKey].push(task);
    });

    return Object.keys(grouped)
      .sort((a, b) => a.localeCompare(b))
      .map(key => {
        const sortedTasks = grouped[key].sort((a, b) => a.range[0].localeCompare(b.range[0]));
        return {
          title: key,
          data: sortedTasks,
        };
      });
  }, [tasks]);

  // ----------------------------------------------------------------------------
  // [5. 화면 그리기 (UI)]
  // ----------------------------------------------------------------------------
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
        <StatusBar style={isDarkMode ? 'light' : 'dark'} />
        <Stack.Screen options={{ headerShown: false }} />
        
        <View style={styles.header}>
          <Text style={[styles.headerTitle, { color: theme.text }]}>Checklendar</Text>
          <TouchableOpacity onPress={handleOpenMenu}>
            <Ionicons name="menu" size={32} color={theme.icon} />
          </TouchableOpacity>
        </View>

        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 20, paddingBottom: 100 }} 
          stickySectionHeadersEnabled={false}
          showsVerticalScrollIndicator={false}
          
          renderSectionHeader={({ section: { title } }) => (
            <Text style={[styles.sectionTitle, { color: theme.text }]}>{title}</Text>
          )}

          // 🌟 [수정됨] 개별 카드를 분리된 컴포넌트로 렌더링
          renderItem={({ item }) => (
            <MonthlyTaskItem 
              item={item} 
              theme={theme} 
              onToggle={toggleTaskCompletion} 
              onDelete={deleteTaskPermanently} 
              onEdit={openEditModal} 
            />
          )}

          ListEmptyComponent={
            <Text style={[styles.emptyText, { color: theme.subText }]}>저장된 일정이 없습니다.</Text>
          }
        />

        <TouchableOpacity style={styles.fab} onPress={openModal}>
          <Ionicons name="add" size={32} color="#FFF" />
        </TouchableOpacity>

        {/* --- [모달 1] 새 일정 등록 --- */}
        <Modal visible={isModalVisible} animationType="slide" presentationStyle="pageSheet">
          <SafeAreaView style={[styles.modalContainer, { backgroundColor: theme.bg }]}>
            <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={70}>
              <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
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

        {/* 🌟 [모달 2] 일정 내용 및 날짜 수정 --- */}
        <Modal visible={isEditModalVisible} animationType="slide" presentationStyle="pageSheet">
          <SafeAreaView style={[styles.modalContainer, { backgroundColor: theme.bg }]}>
            <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={70}>
              <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
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

        {/* --- [모달 3] 바텀 메뉴 --- */}
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
              
              <TouchableOpacity style={styles.menuItem} onPress={() => { handleCloseMenu(); router.push('/'); }}>
                <Ionicons name="calendar-outline" size={22} color={theme.subText} />
                <Text style={[styles.menuItemText, { color: theme.text }]}>캘린더로 보기</Text>
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

// ----------------------------------------------------------------------------
// [스타일 정의]
// ----------------------------------------------------------------------------
const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 15 },
  headerTitle: { fontSize: 26, fontWeight: 'bold' },
  sectionTitle: { fontSize: 20, fontWeight: 'bold', marginTop: 20, marginBottom: 15, marginLeft: 5 },
  
  taskCard: { borderRadius: 15, padding: 16, marginBottom: 12, borderWidth: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 3, elevation: 1 },
  taskContent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  taskText: { fontSize: 16, fontWeight: '600' },
  taskRange: { fontSize: 12, marginTop: 4 },
  
  // 🌟 [추가됨] 스와이프 액션 버튼 컨테이너
  actionContainer: { flexDirection: 'row', marginBottom: 12, marginLeft: 10 },
  editAction: { backgroundColor: '#4A90E2', justifyContent: 'center', alignItems: 'center', width: 65, borderRadius: 15 },
  deleteAction: { backgroundColor: '#FF3B30', justifyContent: 'center', alignItems: 'center', width: 65, borderRadius: 15, marginLeft: 8 },
  actionBtnText: { color: '#FFF', fontSize: 12, fontWeight: '600', marginTop: 4 },

  emptyText: { textAlign: 'center', marginTop: 50, fontSize: 16 },

  fab: { position: 'absolute', right: 20, bottom: 40, backgroundColor: '#4A90E2', width: 60, height: 60, borderRadius: 30, justifyContent: 'center', alignItems: 'center', elevation: 5 },
  
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