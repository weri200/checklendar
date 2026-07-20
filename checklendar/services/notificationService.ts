import AsyncStorage from '@react-native-async-storage/async-storage';

import type { TaskState } from '../types/task';
import { formatLocalDate, parseLocalDate } from '../utils/date';
import { getAppCheckToken } from './appCheckService';

const PUSH_SERVER_URL = process.env.EXPO_PUBLIC_PUSH_SERVER_URL?.trim().replace(/\/+$/, '');
// 기존 키를 유지해 Expo 토큰을 새 FCM 토큰으로 교체할 때 서버 예약도 함께 정리합니다.
const REGISTERED_TOKEN_KEY = '@checklendar_registered_push_token';
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_SCHEDULED_NOTIFICATIONS = 30;
const MAX_SCHEDULE_AHEAD_MS = 30 * 24 * 60 * 60 * 1000;
const DEFAULT_NOTIFICATION_HOUR = 9;

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

export const getOrCreateNotificationTime = async (): Promise<Date> => {
  const savedTime = await AsyncStorage.getItem('notiTime');
  if (savedTime) {
    const parsedTime = new Date(savedTime);
    if (!Number.isNaN(parsedTime.getTime())) return parsedTime;
  }

  const defaultTime = new Date();
  defaultTime.setHours(DEFAULT_NOTIFICATION_HOUR, 0, 0, 0);
  await AsyncStorage.setItem('notiTime', defaultTime.toISOString());
  return defaultTime;
};

// 모든 서버 요청에 공통 헤더와 제한 시간을 적용합니다.
const requestJson = async (path: string, init: RequestInit): Promise<void> => {
  if (!PUSH_SERVER_URL) {
    throw new Error('EXPO_PUBLIC_PUSH_SERVER_URL이 설정되지 않았습니다.');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const appCheckToken = await getAppCheckToken();
    const response = await fetch(`${PUSH_SERVER_URL}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        'X-Firebase-AppCheck': appCheckToken,
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

// 현재 서버에 등록을 마친 토큰만 로컬 저장소에서 복원합니다.
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

// 동일한 서버와 토큰 조합은 다시 등록하지 않습니다.
const performTokenRegistration = async (token: string): Promise<boolean> => {
  if (!PUSH_SERVER_URL) {
    console.warn('푸시 서버 주소가 없어 토큰 등록을 건너뜁니다.');
    return false;
  }

  const previousRegistration = await readRegisteredToken();
  if (previousRegistration?.token === token) {
    return true;
  }

  try {
    await requestJson('/api/register-token', {
      method: 'POST',
      body: JSON.stringify({
        token,
        platform: 'android',
        previousToken: previousRegistration?.token,
      }),
    });
    await AsyncStorage.setItem(REGISTERED_TOKEN_KEY, JSON.stringify({ serverUrl: PUSH_SERVER_URL, token }));
    console.log('서버에 FCM 토큰 등록 성공!');
    return true;
  } catch (error) {
    console.error('푸시 토큰 등록 실패:', error);
    return false;
  }
};

// 동시에 들어온 토큰 등록 요청을 순서대로 처리합니다.
export const registerPushToken = (token: string): Promise<boolean> => {
  const runRegistration = () => performTokenRegistration(token).catch(error => {
    console.error('푸시 토큰 등록 처리 실패:', error);
    return false;
  });
  registrationQueue = registrationQueue.then(runRegistration, runRegistration);
  return registrationQueue;
};

// 사용자가 알림을 끄면 서버의 토큰과 남아 있는 예약을 함께 삭제합니다.
const performTokenUnregistration = async (): Promise<boolean> => {
  const registeredToken = await readRegisteredToken();
  if (!registeredToken) return true;

  try {
    await requestJson('/api/register-token', {
      method: 'DELETE',
      body: JSON.stringify({ token: registeredToken.token }),
    });
    await AsyncStorage.removeItem(REGISTERED_TOKEN_KEY);
    console.log('서버의 FCM 토큰과 예약 삭제 완료');
    return true;
  } catch (error) {
    // 다음 앱 실행 때 다시 정리할 수 있도록 등록 정보는 남겨 둡니다.
    console.error('푸시 토큰 삭제 실패:', error);
    return false;
  }
};

export const unregisterPushToken = (): Promise<boolean> => {
  const runUnregistration = () => performTokenUnregistration().catch(error => {
    console.error('푸시 토큰 삭제 처리 실패:', error);
    return false;
  });
  registrationQueue = registrationQueue.then(runUnregistration, runUnregistration);
  return registrationQueue;
};

// 완료하지 않은 미래 일정만 서버에서 발송할 알림 형식으로 변환합니다.
const buildServerNotifications = (tasks: TaskState, notificationTime: Date): ServerNotification[] => {
  const now = new Date();
  const today = formatLocalDate(now);
  const latestScheduledAt = now.getTime() + MAX_SCHEDULE_AHEAD_MS;

  return Object.keys(tasks)
    .filter(date => date >= today)
    .sort()
    .flatMap(date => {
      const incompleteTaskCount = tasks[date].filter(task => !task.isDone).length;
      if (incompleteTaskCount === 0) return [];

      const scheduledDate = parseLocalDate(date);
      scheduledDate.setHours(notificationTime.getHours(), notificationTime.getMinutes(), 0, 0);
      if (scheduledDate <= now) return [];
      // 서버가 허용하는 예약 범위 밖의 일정은 다음 앱 실행 때 범위에 들어오면 동기화합니다.
      if (scheduledDate.getTime() > latestScheduledAt) return [];

      return [{
        id: date,
        scheduledAt: scheduledDate.toISOString(),
        title: '📅 남은 일정을 확인하세요!',
        body: `오늘 아직 완료하지 않은 할 일이 ${incompleteTaskCount}개 있습니다.`,
      }];
    })
    .slice(0, MAX_SCHEDULED_NOTIFICATIONS);
};

// 로컬 설정과 일정을 읽어 서버의 예약 목록 전체를 최신 상태로 맞춥니다.
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

// 일정 동기화가 겹쳐도 서버에는 한 번에 하나씩 요청합니다.
export const syncNotificationSchedule = (): Promise<void> => {
  const runSync = () => performNotificationScheduleSync().catch(error => {
    console.error('서버 알림 일정 처리 실패:', error);
  });
  scheduleSyncQueue = scheduleSyncQueue.then(runSync, runSync);
  return scheduleSyncQueue;
};
