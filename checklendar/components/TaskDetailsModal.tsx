import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import type { Task } from '../types/task';

interface TaskDetailsModalProps {
  task: Task | null;
  dark: boolean;
  onClose: () => void;
}

// 두 일정 화면에서 같은 상세 표시와 닫기 동작을 사용합니다.
export const TaskDetailsModal = ({ task, dark, onClose }: TaskDetailsModalProps) => {
  const colors = {
    card: dark ? '#1E1E1E' : '#FFFFFF',
    text: dark ? '#FFFFFF' : '#333333',
    subText: dark ? '#AAAAAA' : '#777777',
    border: dark ? '#333333' : '#EEEEEE',
  };

  return (
    <Modal visible={task !== null} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="일정 상세 닫기"
        style={styles.backdrop}
        onPress={onClose}
      >
        <Pressable
          accessibilityRole="summary"
          style={[styles.card, { backgroundColor: colors.card }]}
          onPress={event => event.stopPropagation()}
        >
          <Text style={[styles.heading, { color: colors.text }]}>일정 상세</Text>

          <Text style={[styles.title, { color: colors.text }]}>{task?.text}</Text>

          <View style={[styles.row, { borderColor: colors.border }]}>
            <Text style={[styles.label, { color: colors.subText }]}>기간</Text>
            <Text style={[styles.value, { color: colors.text }]}>
              {task && (task.range[0] === task.range[1]
                ? task.range[0]
                : `${task.range[0]} ~ ${task.range[1]}`)}
            </Text>
          </View>

          <View style={[styles.row, { borderColor: colors.border }]}>
            <Text style={[styles.label, { color: colors.subText }]}>상태</Text>
            <Text style={[styles.value, { color: task?.isDone ? '#34C759' : colors.text }]}>
              {task?.isDone ? '완료' : '진행 중'}
            </Text>
          </View>

          <View style={styles.memoSection}>
            <Text style={[styles.label, { color: colors.subText }]}>메모</Text>
            <Text style={[styles.memo, { color: task?.memo ? colors.text : colors.subText }]}>
              {task?.memo || '작성된 메모가 없습니다.'}
            </Text>
          </View>

          <Pressable
            accessibilityRole="button"
            style={styles.closeButton}
            onPress={onClose}
          >
            <Text style={styles.closeButtonText}>닫기</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 28,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  card: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    borderRadius: 20,
    padding: 24,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
  },
  heading: { fontSize: 14, fontWeight: '600', color: '#4A90E2', marginBottom: 12 },
  title: { fontSize: 22, lineHeight: 30, fontWeight: '700', marginBottom: 20 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  label: { fontSize: 13, fontWeight: '600' },
  value: { flex: 1, marginLeft: 20, fontSize: 14, textAlign: 'right' },
  memoSection: { paddingTop: 14 },
  memo: { marginTop: 8, fontSize: 15, lineHeight: 22 },
  closeButton: {
    alignItems: 'center',
    marginTop: 24,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#4A90E2',
  },
  closeButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
});
