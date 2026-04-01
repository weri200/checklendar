import React, { useState, useMemo } from 'react';
import { StyleSheet, Text, View, SafeAreaView, TouchableOpacity, TextInput, FlatList, Modal, KeyboardAvoidingView, Platform } from 'react-native';
import { Calendar } from 'react-native-calendars';
import { Ionicons } from '@expo/vector-icons';
import { Stack } from 'expo-router';

export default function App() {

  const [viewDate, setViewDate] = useState(new Date().toISOString().split('T')[0]);
  const [tasks, setTasks] = useState({});

  // [추가 모달 상태]
  const [isModalVisible, setModalVisible] = useState(false);
  const [addStartDate, setAddStartDate] = useState(viewDate);
  const [addEndDate, setAddEndDate] = useState(viewDate);
  const [isSelecting, setIsSelecting] = useState(false); // 현재 범위를 잡는 중인지 확인
  const [taskText, setTaskText] = useState('');

  const [isMenuVisible, setMenuVisible] = useState(false);

  const getDatesInRange = (start, end) => {
    const dates = [];
    let curr = new Date(start);
    const last = new Date(end);
    while (curr <= last) {
      dates.push(curr.toISOString().split('T')[0]);
      curr.setDate(curr.getDate() + 1);
    }
    return dates;
  };

  const saveTask = () => {
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
    setViewDate(addStartDate);
    setModalVisible(false);
  };

  const openAddModal = () => {
    setAddStartDate(viewDate);
    setAddEndDate(viewDate);
    setIsSelecting(false); // 열 때 초기화
    setTaskText('');
    setModalVisible(true);
  };

  // [스마트 범위 선택 로직]
  const handleDayPress = (day) => {
    const clickedDate = day.dateString;

    if (!isSelecting) {
      // 첫 번째 클릭: 시작과 끝을 일단 동일하게 설정
      setAddStartDate(clickedDate);
      setAddEndDate(clickedDate);
      setIsSelecting(true);
    } else {
      // 두 번째 클릭: 날짜 크기 비교 후 자동 정렬
      if (new Date(clickedDate) < new Date(addStartDate)) {
        setAddEndDate(addStartDate);
        setAddStartDate(clickedDate);
      } else {
        setAddEndDate(clickedDate);
      }
      setIsSelecting(false); // 범위 선택 완료
    }
  };

  // [메인 화면] 마킹
  const mainMarkedDates = useMemo(() => {
    const marks = {};
    Object.keys(tasks).forEach((date) => {
      if (tasks[date].length > 0) {
        marks[date] = {
          marked: true, dotColor: '#4A90E2',
          customStyles: {
            container: { backgroundColor: date === viewDate ? '#4A90E2' : 'transparent', borderRadius: 8 },
            text: { color: date === viewDate ? '#FFF' : '#333' }
          }
        };
      }
    });
    if (!marks[viewDate]) marks[viewDate] = { customStyles: { container: { backgroundColor: '#4A90E2', borderRadius: 8 }, text: { color: '#FFF' } } };
    return marks;
  }, [tasks, viewDate]);

  // [추가 모달] 마킹 (실시간 범위 시각화)
  const modalMarkedDates = useMemo(() => {
    const marks = {};
    const range = getDatesInRange(addStartDate, addEndDate);
    range.forEach((date, index) => {
      marks[date] = {
        color: '#E3F2FD', textColor: '#333',
        startingDay: index === 0, endingDay: index === range.length - 1,
      };
    });
    if (marks[addStartDate]) marks[addStartDate].color = '#4A90E2';
    if (marks[addEndDate]) marks[addEndDate].color = '#4A90E2';
    return marks;
    
  }, [addStartDate, addEndDate]);

  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      {/* 메인 화면 구성 */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Checklendar</Text>
        <TouchableOpacity onPress={() => setMenuVisible(true)}>
          <Ionicons name="menu" size={32} color="#333" />
        </TouchableOpacity>
      </View>

      <View style={styles.calendarContainer}>
        <Calendar
          markingType={'custom'}
          markedDates={mainMarkedDates}
          onDayPress={(day) => setViewDate(day.dateString)}
          dayComponent={({date, state, marking}) => {
            const count = tasks[date.dateString]?.length || 0;
            const isSunday = new Date(date.dateString).getDay() === 0;

            return (
              <TouchableOpacity onPress={() => setViewDate(date.dateString)} style={[styles.dayBox, marking?.customStyles?.container]}>
                <Text style={[
                  styles.dayText, 
                  isSunday && { color: '#FF5252' }, // 일요일 빨간색
                  marking?.customStyles?.text,      // 선택된 날짜 텍스트 색상
                  state === 'disabled' && { color: '#ccc' }
                ]}>
                  {date.day}
                </Text>
                
                {/* 💡 핵심: 일정 개수에 따라 점과 숫자를 다르게 렌더링하는 로직 */}
                {count > 0 && (
                  <View style={styles.badgeRow}>
                    {count === 1 && (
                      <View style={[styles.dot, { backgroundColor: '#4A90E2' }]} />
                    )}
                    {count === 2 && (
                      <>
                        <View style={[styles.dot, { backgroundColor: '#4A90E2' }]} />
                        <View style={[styles.dot, { backgroundColor: '#34C759' }]} />
                      </>
                    )}
                    {count === 3 && (
                      <>
                        <View style={[styles.dot, { backgroundColor: '#4A90E2' }]} />
                        <View style={[styles.dot, { backgroundColor: '#34C759' }]} />
                        <View style={[styles.dot, { backgroundColor: '#FF9500' }]} />
                      </>
                    )}
                    {count >= 4 && (
                      <>
                        <View style={[styles.dot, { backgroundColor: '#FF3B30' }]} />
                        <Text style={[styles.countText, { color: '#FF3B30' }]}>{count}</Text>
                      </>
                    )}
                  </View>
                )}
              </TouchableOpacity>
            );
          }}
        />
      </View>

      <View style={styles.listContainer}>
        <Text style={styles.listTitle}>{viewDate}의 할 일</Text>
        <FlatList
          data={tasks[viewDate] || []}
          keyExtractor={(item) => item.id}
          renderItem={({item}) => (
            <View style={styles.todoItem}>
              <Text style={styles.todoText}>{item.text}</Text>
              <Text style={styles.todoRange}>{item.range[0]} ~ {item.range[1]}</Text>
            </View>
          )}
          ListEmptyComponent={<Text style={styles.emptyText}>예정된 일정이 없습니다.</Text>}
        />
      </View>

      <TouchableOpacity style={styles.fab} onPress={openAddModal}><Ionicons name="add" size={32} color="#FFF" /></TouchableOpacity>

      {/* 추가 모달 */}
      <Modal visible={isModalVisible} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setModalVisible(false)}><Text style={styles.cancelText}>취소</Text></TouchableOpacity>
            <Text style={styles.modalTitle}>새 일정 추가</Text>
            <TouchableOpacity onPress={saveTask}><Text style={styles.saveText}>저장</Text></TouchableOpacity>
          </View>

          {/* 변경된 날짜 표시 및 중앙 안내 문구 영역 */}
          <View style={styles.selectionInfo}>
            <View style={styles.infoBox}>
              <Text style={styles.infoLabel}>시작일</Text>
              <Text style={styles.infoValue}>{addStartDate}</Text>
            </View>
            
            {/* 화살표와 안내 문구를 하나로 묶은 중앙 영역 */}
            <View style={styles.arrowBox}>
              <Ionicons name="arrow-forward" size={24} color="#4A90E2" />
              <Text style={styles.smallGuideText}>
                {isSelecting ? "종료일 선택하세요!" : "날짜 범위 지정"}
              </Text>
            </View>

            <View style={styles.infoBox}>
              <Text style={styles.infoLabel}>종료일</Text>
              <Text style={styles.infoValue}>{addEndDate}</Text>
            </View>
          </View>

          <View style={styles.modalCalendarWrapper}>
            <Calendar
              markingType={'period'}
              markedDates={modalMarkedDates}
              theme={{ todayTextColor: '#4A90E2' }}
              // 모달 전용 커스텀 디자인 (기간 연결 띠 + 일요일 빨간색)
              dayComponent={({date, state, marking}) => {
                const isSunday = new Date(date.dateString).getDay() === 0;
                const isSelected = marking?.color; // 파란색 띠가 지나가는 자리인지 확인
                const isStart = marking?.startingDay;
                const isEnd = marking?.endingDay;

                return (
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => handleDayPress(date)}
                    style={[
                      styles.modalDayBox, // 가로로 꽉 차게 설정해야 띠가 끊기지 않음
                      isSelected && { backgroundColor: marking.color },
                      isStart && { borderTopLeftRadius: 20, borderBottomLeftRadius: 20 },
                      isEnd && { borderTopRightRadius: 20, borderBottomRightRadius: 20 }
                    ]}
                  >
                    <Text style={[
                      styles.dayText,
                      isSunday && { color: '#FF5252' }, // 일요일은 빨간색
                      isSelected && { color: marking.textColor || '#333' }, // 선택된 띠 영역 안의 글씨
                      (isStart || isEnd) && { color: '#FFF' }, // 시작일과 종료일은 짙은 파랑이므로 흰 글씨
                      state === 'disabled' && { color: '#ccc' }
                    ]}>
                      {date.day}
                    </Text>
                  </TouchableOpacity>
                );
              }}
            />
          </View>

          <View style={styles.inputSection}>
            <Text style={styles.inputLabel}>할 일 내용</Text>
            <TextInput style={styles.textInput} placeholder="어떤 일정이 있나요?" value={taskText} onChangeText={setTaskText} />
          </View>
        </SafeAreaView>
      </Modal>

          {/* 우측 슬라이드 메뉴 모달 */}
      <Modal visible={isMenuVisible} transparent={true} animationType="fade">
        <TouchableOpacity 
          style={styles.menuOverlay} 
          activeOpacity={1} 
          onPress={() => setMenuVisible(false)} // 어두운 배경 터치 시 닫힘
        >
          <TouchableOpacity activeOpacity={1} style={styles.menuPanel}>
            <View style={styles.menuHeader}>
              <Text style={styles.menuTitle}>메뉴</Text>
              <TouchableOpacity onPress={() => setMenuVisible(false)}>
                <Ionicons name="close" size={28} color="#333" />
              </TouchableOpacity>
            </View>

            {/* 메뉴 리스트 */}
            <TouchableOpacity style={styles.menuItem}>
              <Ionicons name="settings-outline" size={22} color="#555" />
              <Text style={styles.menuItemText}>설정</Text>
            </TouchableOpacity>
            
            <TouchableOpacity style={styles.menuItem}>
              <Ionicons name="trash-outline" size={22} color="#FF5252" />
              <Text style={[styles.menuItemText, { color: '#FF5252' }]}>모든 일정 지우기</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
      
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 15, paddingTop: 40 },
  headerTitle: { fontSize: 26, fontWeight: 'bold', color: '#333' },
  calendarContainer: { backgroundColor: '#FFF', marginHorizontal: 15, borderRadius: 15, padding: 10, elevation: 2 },
  dayBox: { alignItems: 'center', justifyContent: 'center', width: 40, height: 45, borderRadius: 8 },
  dayText: { fontSize: 15 },
  badgeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  dot: { width: 5, height: 5, borderRadius: 2.5, marginHorizontal: 1.5 },
  countText: { fontSize: 10, fontWeight: 'bold', marginLeft: 2 },
  listContainer: { flex: 1, padding: 20 },
  listTitle: { fontSize: 18, fontWeight: '600', marginBottom: 15, color: '#444' },
  todoItem: { backgroundColor: '#FFF', padding: 15, borderRadius: 12, marginBottom: 10, elevation: 1 },
  todoText: { fontSize: 16, color: '#333', fontWeight: '500' },
  todoRange: { fontSize: 12, color: '#888', marginTop: 6 },
  emptyText: { color: '#999', textAlign: 'center', marginTop: 30, fontSize: 15 },
  fab: { position: 'absolute', right: 20, bottom: 40, backgroundColor: '#4A90E2', width: 60, height: 60, borderRadius: 30, justifyContent: 'center', alignItems: 'center', elevation: 5 },
  modalContainer: { flex: 1, backgroundColor: '#F8F9FA' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderColor: '#EEE', backgroundColor: '#FFF' },
  cancelText: { color: '#FF5252', fontSize: 16 },
  saveText: { color: '#4A90E2', fontSize: 16, fontWeight: 'bold' },
  modalTitle: { fontSize: 18, fontWeight: 'bold' },
  selectionInfo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 20, paddingHorizontal: 15, backgroundColor: '#FFF' },
  infoBox: { flex: 1, alignItems: 'center' },
  infoLabel: { fontSize: 12, color: '#999', marginBottom: 5 },
  infoValue: { fontSize: 16, fontWeight: 'bold', color: '#333' },
  arrowBox: { flex: 1.2, alignItems: 'center', justifyContent: 'center' },
  smallGuideText: { fontSize: 11, color: '#4A90E2', marginTop: 4, fontWeight: '600', textAlign: 'center' },
  modalCalendarWrapper: { backgroundColor: '#FFF', paddingBottom: 10, borderBottomWidth: 1, borderColor: '#EEE' },
  modalDayBox: { alignItems: 'center', justifyContent: 'center', width: '100%', height: 45 },
  inputSection: { padding: 20, marginTop: 10 },
  inputLabel: { fontSize: 14, color: '#666', marginBottom: 10, fontWeight: '600' },
  textInput: { backgroundColor: '#FFF', padding: 15, borderRadius: 12, fontSize: 16, borderWidth: 1, borderColor: '#DDD' },
  menuOverlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.5)', justifyContent: 'flex-start', alignItems: 'flex-end' },
  menuPanel: { width: '65%', height: '100%', backgroundColor: '#FFF', padding: 20, paddingTop: 50, elevation: 5, shadowColor: '#000', shadowOffset: { width: -2, height: 0 }, shadowOpacity: 0.2, shadowRadius: 5 },
  menuHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 30 },
  menuTitle: { fontSize: 22, fontWeight: 'bold', color: '#333' },
  menuItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 15, borderBottomWidth: 1, borderColor: '#F1F3F5' },
  menuItemText: { fontSize: 16, color: '#333', marginLeft: 15, fontWeight: '500' },
});