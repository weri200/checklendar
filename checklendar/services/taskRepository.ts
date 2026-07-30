import AsyncStorage from '@react-native-async-storage/async-storage';

import type { Task, TaskState } from '../types/task';
import { getDateRange } from '../utils/date';

const TASKS_STORAGE_KEY = '@checklendar_tasks';

// 날짜별 조회를 빠르게 하려고 기간 일정은 포함된 모든 날짜에 같은 ID로 저장합니다.
// 따라서 수정·완료·삭제는 ID가 같은 복사본 전체에 반영해야 합니다.
export const loadTasks = async (): Promise<TaskState> => {
  const savedTasks = await AsyncStorage.getItem(TASKS_STORAGE_KEY);
  return savedTasks ? JSON.parse(savedTasks) : {};
};

export const saveTasks = async (tasks: TaskState): Promise<void> => {
  await AsyncStorage.setItem(TASKS_STORAGE_KEY, JSON.stringify(tasks));
};

export const findTaskById = (tasks: TaskState, taskId: string): Task | undefined => {
  for (const dateTasks of Object.values(tasks)) {
    const task = dateTasks.find(item => item.id === taskId);
    if (task) return task;
  }
  return undefined;
};

export const addTask = (tasks: TaskState, task: Task): TaskState => {
  const updated = { ...tasks };
  getDateRange(task.range[0], task.range[1]).forEach(date => {
    updated[date] = [...(updated[date] || []), task];
  });
  return updated;
};

export const deleteTask = (tasks: TaskState, taskId: string): TaskState => {
  const updated: TaskState = {};
  Object.entries(tasks).forEach(([date, dateTasks]) => {
    const remainingTasks = dateTasks.filter(task => task.id !== taskId);
    if (remainingTasks.length > 0) updated[date] = remainingTasks;
  });
  return updated;
};

export const updateTask = (tasks: TaskState, task: Task): TaskState => {
  return addTask(deleteTask(tasks, task.id), task);
};

export const toggleTask = (tasks: TaskState, taskId: string): TaskState => {
  const currentTask = findTaskById(tasks, taskId);
  if (!currentTask) return tasks;

  const nextDone = !currentTask.isDone;
  return Object.fromEntries(
    Object.entries(tasks).map(([date, dateTasks]) => [
      date,
      dateTasks.map(task => task.id === taskId ? { ...task, isDone: nextDone } : task),
    ]),
  );
};
