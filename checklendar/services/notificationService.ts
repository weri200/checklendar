import AsyncStorage from '@react-native-async-storage/async-storage';

import type { TaskState } from '../types/task';
import { formatLocalDate, parseLocalDate } from '../utils/date';

const PUSH_SERVER_URL = process.env.EXPO_PUBLIC_PUSH_SERVER_URL?.trim().replace(/\/+$/, '');
const REGISTERED_TOKEN_KEY = '@checklendar_registered_push_token';
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_SCHEDULED_NOTIFICATIONS = 30;

interface RegisteredToken {
  serverUrl: string;
  token: string;
}

interface ServerNotification {
  id: string;
  scheduledAt: string;
  title: string;
  body: string;
}

let registrationQueue: Promise<boolean> = Promise.resolve(true);
let scheduleSyncQueue: Promise<void> = Promise.resolve();

const requestJson = async (path: string, init: RequestInit): Promise<void> => {
  if (!PUSH_SERVER_URL) {
    throw new Error('EXPO_PUBLIC_PUSH_SERVER_URL이 설정되지 않았습니다.');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${PUSH_SERVER_URL}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...init.headers,
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      const responseBody = await response.text();
      throw new Error(`서버 요청 실패 (${response.status}): ${responseBody}`);
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`서버 요청이 ${REQUEST_TIMEOUT_MS / 1000}초 후 중단되었습니다.`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
};

const readRegisteredToken = async (): Promise<RegisteredToken | null> => {
  const savedToken = await AsyncStorage.getItem(REGISTERED_TOKEN_KEY);
  if (!savedToken) return null;

  try {
    const registeredToken = JSON.parse(savedToken) as RegisteredToken;
    if (registeredToken.serverUrl !== PUSH_SERVER_URL || !registeredToken.token) return null;
    return registeredToken;
  } catch {
    return null;
  }
};

const performTokenRegistration = async (token: string): Promise<boolean> => {
  if (!PUSH_SERVER_URL) {
    console.warn('푸시 서버 주소가 없어 토큰 등록을 건너뜁니다.');
    return false;
  }

  const registeredToken = await readRegisteredToken();
  if (registeredToken?.token === token) {
    return true;
  }

  try {
    await requestJson('/api/register-token', {
      method: 'POST',
      body: JSON.stringify({ token }),
    });
    await AsyncStorage.setItem(REGISTERED_TOKEN_KEY, JSON.stringify({ serverUrl: PUSH_SERVER_URL, token }));
    console.log('서버에 푸시 토큰 등록 성공!');
    return true;
  } catch (error) {
    console.error('푸시 토큰 등록 실패:', error);
    return false;
  }
};

export const registerPushToken = (token: string): Promise<boolean> => {
  const runRegistration = () => performTokenRegistration(token).catch(error => {
    console.error('푸시 토큰 등록 처리 실패:', error);
    return false;
  });
  registrationQueue = registrationQueue.then(runRegistration, runRegistration);
  return registrationQueue;
};

const buildServerNotifications = (tasks: TaskState, notificationTime: Date): ServerNotification[] => {
  const now = new Date();
  const today = formatLocalDate(now);

  return Object.keys(tasks)
    .filter(date => date >= today)
    .sort()
    .flatMap(date => {
      const incompleteTaskCount = tasks[date].filter(task => !task.isDone).length;
      if (incompleteTaskCount === 0) return [];

      const scheduledDate = parseLocalDate(date);
      scheduledDate.setHours(notificationTime.getHours(), notificationTime.getMinutes(), 0, 0);
      if (scheduledDate <= now) return [];

      return [{
        id: date,
        scheduledAt: scheduledDate.toISOString(),
        title: '📅 남은 일정을 확인하세요!',
        body: `오늘 아직 완료하지 않은 할 일이 ${incompleteTaskCount}개 있습니다.`,
      }];
    })
    .slice(0, MAX_SCHEDULED_NOTIFICATIONS);
};

const performNotificationScheduleSync = async (): Promise<void> => {
  const registeredToken = await readRegisteredToken();
  if (!registeredToken) {
    console.log('등록된 푸시 토큰이 없어 서버 일정 동기화를 건너뜁니다.');
    return;
  }

  const [enabledValue, timeValue, tasksValue] = await Promise.all([
    AsyncStorage.getItem('notiEnabled'),
    AsyncStorage.getItem('notiTime'),
    AsyncStorage.getItem('@checklendar_tasks'),
  ]);

  const enabled = enabledValue ? JSON.parse(enabledValue) : false;
  const tasks = tasksValue ? JSON.parse(tasksValue) as TaskState : {};
  const notifications = enabled && timeValue
    ? buildServerNotifications(tasks, new Date(timeValue))
    : [];

  try {
    await requestJson('/api/notification-schedule', {
      method: 'PUT',
      body: JSON.stringify({
        token: registeredToken.token,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        notifications,
      }),
    });
    console.log(`서버 알림 일정 ${notifications.length}건 동기화 완료`);
  } catch (error) {
    console.error('서버 알림 일정 동기화 실패:', error);
  }
};

export const syncNotificationSchedule = (): Promise<void> => {
  const runSync = () => performNotificationScheduleSync().catch(error => {
    console.error('서버 알림 일정 처리 실패:', error);
  });
  scheduleSyncQueue = scheduleSyncQueue.then(runSync, runSync);
  return scheduleSyncQueue;
};
