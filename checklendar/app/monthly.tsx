import { Ionicons } from '@expo/vector-icons';
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
import {
  addTask,
  deleteTask,
  findTaskById,
  loadTasks,
  saveTasks,
  toggleTask,
  updateTask,
} from '../services/taskRepository';
import type { Task, TaskState } from '../types/task';
import { requestNotificationUpdate } from '../services/notificationUpdateScheduler';
import { TaskDetailsModal } from '../components/TaskDetailsModal';
import { createMenuPanResponder } from '../utils/menuPanResponder';
import { formatLocalDate, getDateRange } from '../utils/date';

interface ThemeType {
  bg: string;
  card: string;
  text: string;
  subText: string;
  border: string;
  icon: string;
}

const MENU_PANEL_OFFSET = 300;

// 월별 목록에 표시할 일정 항목입니다.
const MonthlyTaskItem = ({ item, theme, onToggle, onDelete, onEdit, onShowDetails }: {
  item: Task; 
  theme: ThemeType; 
  onToggle: (id: string) => void; 
  onDelete: (id: string) => void;
  onEdit: (id: string, currentText: string, currentRange: [string, string], currentMemo?: string) => void;
  onShowDetails: (task: Task) => void;
}) => {
  const swipeableRef = useRef<Swipeable>(null);

  const handleEdit = () => {
    swipeableRef.current?.close();
    onEdit(item.id, item.text, item.range, item.memo);
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
          onLongPress={() => onShowDetails(item)}
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
            {item.memo ? (
              <Text style={[styles.taskMemo, { color: theme.subText }]} numberOfLines={2}>
                {item.memo}
              </Text>
            ) : null}
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
  const [detailTask, setDetailTask] = useState<Task | null>(null);
  
  // 화면 상태를 관리합니다.
  const [tasks, setTasks] = useState<TaskState>({});
  const [isModalVisible, setModalVisible] = useState(false);               
  const [isMenuVisible, setMenuVisible] = useState(false);                 
  const [isSelecting, setIsSelecting] = useState(false);                   
  
  const today = formatLocalDate();
  const [addStartDate, setAddStartDate] = useState(today);
  const [addEndDate, setAddEndDate] = useState(today);
  const [taskText, setTaskText] = useState('');
  const [taskMemo, setTaskMemo] = useState('');

  const [isEditModalVisible, setEditModalVisible] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editTaskText, setEditTaskText] = useState('');
  const [editTaskMemo, setEditTaskMemo] = useState('');
  const [editStartDate, setEditStartDate] = useState(today);
  const [editEndDate, setEditEndDate] = useState(today);
  const [isEditSelecting, setIsEditSelecting] = useState(false);

  // 테마와 메뉴 애니메이션 값을 초기화합니다.
  const overlayOpacity = useRef(new Animated.Value(0)).current;            
  const panelBottom = useRef(new Animated.Value(-MENU_PANEL_OFFSET)).current;
  const isMenuClosing = useRef(false);
  const menuPanelHeight = useRef(MENU_PANEL_OFFSET);

  const theme = useMemo(() => ({
    bg: isDarkMode ? '#121212' : '#F8F9FA',
    card: isDarkMode ? '#1E1E1E' : '#FFFFFF',
    text: isDarkMode ? '#FFFFFF' : '#333333',
    subText: isDarkMode ? '#AAAAAA' : '#888888',
    border: isDarkMode ? '#333333' : '#EEEEEE',
    icon: isDarkMode ? '#FFFFFF' : '#333333',
  }), [isDarkMode]);

  // 저장된 일정 데이터를 불러옵니다.
  useFocusEffect(
    useCallback(() => {
      const loadLatestTasks = async () => {
        try {
          setTasks(await loadTasks());
        } catch (e) {
          console.error('데이터 불러오기 오류:', e);
        }
      };
      loadLatestTasks();
    }, [])
  );

  // 일정 변경 사항을 저장하고 알림을 갱신합니다.
  const updateAndSaveTasks = useCallback(async (newTasks: TaskState) => {
    setTasks(newTasks); 
    try {
      await saveTasks(newTasks);
      requestNotificationUpdate(); 
    } catch (e) { 
      console.error('데이터 저장 오류:', e); 
    }
  }, []);

  const toggleTaskCompletion = useCallback((taskId: string) => {
    updateAndSaveTasks(toggleTask(tasks, taskId));
  }, [tasks, updateAndSaveTasks]);

  const deleteTaskPermanently = useCallback((taskId: string) => {
    updateAndSaveTasks(deleteTask(tasks, taskId));
  }, [tasks, updateAndSaveTasks]);

  const saveTask = useCallback(() => {
    if (taskText.trim().length === 0) return;

    const newTask: Task = {
      id: Date.now().toString(),
      text: taskText.trim(),
      memo: taskMemo.trim() || undefined,
      range: [addStartDate, addEndDate],
      isDone: false,
    };

    updateAndSaveTasks(addTask(tasks, newTask));
    setTaskText('');
    setTaskMemo('');
    setModalVisible(false);
  }, [taskText, taskMemo, addStartDate, addEndDate, tasks, updateAndSaveTasks]);

  const openEditModal = useCallback((id: string, currentText: string, currentRange: [string, string], currentMemo?: string) => {
    setEditingTaskId(id);
    setEditTaskText(currentText);
    setEditTaskMemo(currentMemo || '');
    setEditStartDate(currentRange[0]);
    setEditEndDate(currentRange[1]);
    setIsEditSelecting(false);
    setEditModalVisible(true);
  }, []);

  const saveEditedTask = useCallback(() => {
    if (!editingTaskId || editTaskText.trim().length === 0) return;

    const currentTask = findTaskById(tasks, editingTaskId);
    const updatedTask: Task = {
      id: editingTaskId,
      text: editTaskText.trim(),
      memo: editTaskMemo.trim() || undefined,
      range: [editStartDate, editEndDate],
      isDone: currentTask?.isDone ?? false,
      color: currentTask?.color,
    };

    updateAndSaveTasks(updateTask(tasks, updatedTask));
    setEditModalVisible(false);
    setEditingTaskId(null);
    setEditTaskText('');
    setEditTaskMemo('');
  }, [editingTaskId, editTaskText, editTaskMemo, editStartDate, editEndDate, tasks, updateAndSaveTasks]);

  // 모달과 하단 메뉴의 표시 상태를 제어합니다.
  const handleOpenMenu = useCallback(() => {
    isMenuClosing.current = false;
    overlayOpacity.stopAnimation();
    panelBottom.stopAnimation();
    overlayOpacity.setValue(0);
    panelBottom.setValue(-menuPanelHeight.current);
    setMenuVisible(true);
  }, [overlayOpacity, panelBottom]);

  const closeMenu = useCallback((onClosed?: () => void) => {
    if (isMenuClosing.current) return;
    isMenuClosing.current = true;

    Animated.parallel([
      Animated.timing(overlayOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
      Animated.timing(panelBottom, { toValue: -menuPanelHeight.current, duration: 180, useNativeDriver: false }),
    ]).start(({ finished }) => {
      isMenuClosing.current = false;
      if (!finished) return;
      setMenuVisible(false);
      onClosed?.();
    });
  }, [overlayOpacity, panelBottom]);

  const handleCloseMenu = useCallback(() => closeMenu(), [closeMenu]);
  const handleMenuAction = useCallback((action: () => void) => closeMenu(action), [closeMenu]);
  const menuPanResponder = useMemo(() => createMenuPanResponder({
    panelBottom,
    overlayOpacity,
    panelHeight: menuPanelHeight,
    isClosing: isMenuClosing,
    onClose: handleCloseMenu,
  }), [panelBottom, overlayOpacity, handleCloseMenu]);

  useEffect(() => {
    if (isMenuVisible) {
      Animated.parallel([
        Animated.timing(overlayOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.timing(panelBottom, { toValue: 0, duration: 120, useNativeDriver: false }),
      ]).start();
    }
  }, [isMenuVisible, overlayOpacity, panelBottom]);

  const handleDayPressInModal = useCallback((day: any) => {
    const clickedDate = day.dateString;
    if (!isSelecting) {
      setAddStartDate(clickedDate); setAddEndDate(clickedDate); setIsSelecting(true);
    } else {
      if (clickedDate < addStartDate) {
        setAddEndDate(addStartDate); setAddStartDate(clickedDate);
      } else {
        setAddEndDate(clickedDate);
      }
      setIsSelecting(false);
    }
  }, [isSelecting, addStartDate]);

  const handleDayPressInEditModal = useCallback((day: any) => {
    const clickedDate = day.dateString;
    if (!isEditSelecting) {
      setEditStartDate(clickedDate); setEditEndDate(clickedDate); setIsEditSelecting(true);
    } else {
      if (clickedDate < editStartDate) {
        setEditEndDate(editStartDate); setEditStartDate(clickedDate);
      } else {
        setEditEndDate(clickedDate);
      }
      setIsEditSelecting(false);
    }
  }, [isEditSelecting, editStartDate]);

  const modalMarkedDates = useMemo(() => {
    const marks: { [key: string]: any } = {};
    const range = getDateRange(addStartDate, addEndDate);
    range.forEach((d, i) => {
      marks[d] = { 
        color: i === 0 || i === range.length - 1 ? '#4A90E2' : (isDarkMode ? '#2C3E50' : '#E3F2FD'), 
        textColor: theme.text, startingDay: i === 0, endingDay: i === range.length - 1 
      };
    });
    return marks;
  }, [addStartDate, addEndDate, isDarkMode, theme.text]);

  const editModalMarkedDates = useMemo(() => {
    const marks: { [key: string]: any } = {};
    const range = getDateRange(editStartDate, editEndDate);
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
    setTaskMemo('');
    setModalVisible(true);
  }, [today]);

  // 일정을 월별 목록으로 그룹화합니다.
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

  // 월별 체크리스트 화면을 렌더링합니다.
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

          renderItem={({ item }) => (
            <MonthlyTaskItem 
              item={item} 
              theme={theme} 
              onToggle={toggleTaskCompletion} 
              onDelete={deleteTaskPermanently} 
              onEdit={openEditModal} 
              onShowDetails={setDetailTask}
            />
          )}

          ListEmptyComponent={
            <Text style={[styles.emptyText, { color: theme.subText }]}>저장된 일정이 없습니다.</Text>
          }
        />

        <TouchableOpacity style={styles.fab} onPress={openModal}>
          <Ionicons name="add" size={32} color="#FFF" />
        </TouchableOpacity>

        <TaskDetailsModal
          task={detailTask}
          dark={isDarkMode}
          onClose={() => setDetailTask(null)}
        />

        {/* 새 일정 등록 모달. */}
        <Modal visible={isModalVisible} animationType="slide" presentationStyle="pageSheet">
          <SafeAreaView style={[styles.modalContainer, { backgroundColor: theme.bg }]}>
            <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? 70 : 20}>
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
                  <Calendar markingType={'period'} markedDates={modalMarkedDates} enableSwipeMonths={true} theme={{ calendarBackground: theme.card, dayTextColor: theme.text, monthTextColor: theme.text, todayTextColor: '#4A90E2' }} onDayPress={handleDayPressInModal} />
                </View>

                <View style={styles.inputSection}>
                  <Text style={[styles.inputLabel, { color: theme.subText }]}>할 일 내용</Text>
                  <TextInput style={[styles.textInput, { backgroundColor: theme.card, color: theme.text, borderColor: theme.border }]} placeholder="어떤 일정이 있나요?" placeholderTextColor={theme.subText} value={taskText} onChangeText={setTaskText} />

                  <Text style={[styles.inputLabel, styles.memoLabel, { color: theme.subText }]}>메모 (선택)</Text>
                  <TextInput
                    style={[styles.textInput, styles.memoInput, { backgroundColor: theme.card, color: theme.text, borderColor: theme.border }]}
                    placeholder="간단한 메모를 남겨보세요"
                    placeholderTextColor={theme.subText}
                    value={taskMemo}
                    onChangeText={setTaskMemo}
                    multiline
                    maxLength={200}
                  />
                </View>

              </ScrollView>
            </KeyboardAvoidingView>
          </SafeAreaView>
        </Modal>

        {/* 일정 수정 모달. */}
        <Modal visible={isEditModalVisible} animationType="slide" presentationStyle="pageSheet">
          <SafeAreaView style={[styles.modalContainer, { backgroundColor: theme.bg }]}>
            <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? 70 : 20}>
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
                  <Calendar markingType={'period'} markedDates={editModalMarkedDates} enableSwipeMonths={true} theme={{ calendarBackground: theme.card, dayTextColor: theme.text, monthTextColor: theme.text, todayTextColor: '#4A90E2' }} onDayPress={handleDayPressInEditModal} />
                </View>

                <View style={styles.inputSection}>
                  <Text style={[styles.inputLabel, { color: theme.subText }]}>할 일 내용</Text>
                  <TextInput style={[styles.textInput, { backgroundColor: theme.card, color: theme.text, borderColor: theme.border }]} placeholder="수정할 내용을 입력하세요" placeholderTextColor={theme.subText} value={editTaskText} onChangeText={setEditTaskText} />

                  <Text style={[styles.inputLabel, styles.memoLabel, { color: theme.subText }]}>메모 (선택)</Text>
                  <TextInput
                    style={[styles.textInput, styles.memoInput, { backgroundColor: theme.card, color: theme.text, borderColor: theme.border }]}
                    placeholder="간단한 메모를 남겨보세요"
                    placeholderTextColor={theme.subText}
                    value={editTaskMemo}
                    onChangeText={setEditTaskMemo}
                    multiline
                    maxLength={200}
                  />
                </View>

              </ScrollView>
            </KeyboardAvoidingView>
          </SafeAreaView>
        </Modal>

        {/* 바텀 메뉴. */}
        <Modal visible={isMenuVisible} transparent={true} animationType="none" onRequestClose={handleCloseMenu}>
          <Animated.View style={[styles.menuOverlay, { opacity: overlayOpacity }]}><TouchableOpacity style={styles.overlayTouchArea} activeOpacity={1} onPress={handleCloseMenu} /></Animated.View>
          <Animated.View
            style={[styles.menuPanel, { backgroundColor: theme.card, bottom: panelBottom }]}
            onLayout={({ nativeEvent }) => { menuPanelHeight.current = nativeEvent.layout.height; }}
          >
            <View style={styles.handleTouchArea} {...menuPanResponder.panHandlers}>
              <View style={styles.handleBar} />
            </View>
            <SafeAreaView edges={['bottom']} style={styles.menuSafeArea}>
              <View style={styles.menuHeader}>
                <Text style={[styles.menuTitle, { color: theme.text }]}>메뉴</Text>
                <TouchableOpacity onPress={handleCloseMenu} style={styles.closeBtn}>
                  <Ionicons name="close" size={28} color={theme.icon} />
                </TouchableOpacity>
              </View>
              
              <TouchableOpacity style={styles.menuItem} onPress={() => handleMenuAction(() => router.push('/'))}>
                <Ionicons name="calendar-outline" size={22} color={theme.subText} />
                <Text style={[styles.menuItemText, { color: theme.text }]}>캘린더로 보기</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.menuItem} onPress={() => handleMenuAction(() => router.push('/settings'))}>
                <Ionicons name="settings-outline" size={22} color={theme.subText} />
                <Text style={[styles.menuItemText, { color: theme.text }]}>설정</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.menuItem} onPress={() => handleMenuAction(() => updateAndSaveTasks({}))}>
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

// 화면 스타일을 정의합니다.
const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 15 },
  headerTitle: { fontSize: 26, fontWeight: 'bold' },
  sectionTitle: { fontSize: 20, fontWeight: 'bold', marginTop: 20, marginBottom: 15, marginLeft: 5 },
  
  taskCard: { borderRadius: 15, padding: 16, marginBottom: 12, borderWidth: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 3, elevation: 1 },
  taskContent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  taskText: { fontSize: 16, fontWeight: '600' },
  taskMemo: { fontSize: 12, lineHeight: 17, marginTop: 4 },
  taskRange: { fontSize: 12, marginTop: 4 },
  
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
  memoLabel: { marginTop: 18 },
  memoInput: { minHeight: 82, textAlignVertical: 'top' },

  menuOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0, 0, 0, 0.4)', zIndex: 10 },
  overlayTouchArea: { flex: 1 },
  menuPanel: { position: 'absolute', width: '100%', borderTopLeftRadius: 30, borderTopRightRadius: 30, zIndex: 20 },
  handleTouchArea: { minHeight: 44, justifyContent: 'center', alignItems: 'center' },
  handleBar: { width: 40, height: 5, backgroundColor: '#E0E0E0', borderRadius: 3, alignSelf: 'center' },
  menuSafeArea: { paddingHorizontal: 25, paddingBottom: 20 },
  menuHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 15 },
  menuTitle: { fontSize: 22, fontWeight: 'bold' },
  closeBtn: { padding: 5 },
  menuItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 18, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(0,0,0,0.05)' },
  menuItemText: { fontSize: 16, marginLeft: 15, fontWeight: '500' },
});
