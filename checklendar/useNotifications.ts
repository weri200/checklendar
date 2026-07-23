import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';

import {
  getOrCreateNotificationTime,
  registerPushToken,
  syncNotificationSchedule,
  unregisterPushToken,
} from './services/notificationService';

// 앱을 사용 중일 때 도착한 알림도 배너와 소리로 표시합니다.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

let initializationQueue: Promise<boolean> = Promise.resolve(true);

const initializeNotifications = async (
  requestPermission: boolean,
  forceScheduleSync: boolean,
): Promise<boolean> => {
  // 현재 서버는 Android FCM 토큰을 직접 사용합니다.
  if (Platform.OS !== 'android') {
    console.log('FCM 직접 알림은 현재 Android에서만 초기화합니다.');
    return false;
  }
  if (!Device.isDevice) {
    console.log('푸시 알림은 실제 기기에서만 초기화합니다.');
    return false;
  }

  // Android 알림의 중요도와 기본 소리를 채널 단위로 설정합니다.
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: '기본 알림',
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'default',
    });
  }

  // 권한 팝업은 설정 화면에서 알림을 켠 명시적 동작에만 표시합니다.
  const permission = await Notifications.getPermissionsAsync();
  const finalStatus = permission.status === 'granted'
    ? permission.status
    : requestPermission
      ? (await Notifications.requestPermissionsAsync()).status
      : permission.status;

  if (finalStatus !== 'granted') {
    console.log('알림 권한이 없어 푸시 알림 초기화를 중단합니다.');
    return false;
  }

  // 기존 로컬 예약을 제거해 서버 푸시와 중복되지 않도록 합니다.
  await Notifications.cancelAllScheduledNotificationsAsync();

  const devicePushToken = await Notifications.getDevicePushTokenAsync();
  if (devicePushToken.type !== 'android' || typeof devicePushToken.data !== 'string') {
    throw new Error(`Android FCM 토큰을 가져오지 못했습니다: ${devicePushToken.type}`);
  }

  const token = devicePushToken.data;
  // 토큰 등록에 성공한 경우에만 해당 기기의 예약 목록을 서버와 동기화합니다.
  if (await registerPushToken(token)) {
    await syncNotificationSchedule({ force: forceScheduleSync });
    return true;
  }
  return false;
};

const queueInitialization = (
  requestPermission: boolean,
  forceScheduleSync: boolean,
): Promise<boolean> => {
  const runInitialization = () => initializeNotifications(requestPermission, forceScheduleSync).catch(error => {
    console.error('알림 초기화 실패:', error);
    return false;
  });
  initializationQueue = initializationQueue.then(runInitialization, runInitialization);
  return initializationQueue;
};

// 설정 스위치를 켜면 권한을 요청하고 현재 예약을 즉시 강제 동기화합니다.
export const enableNotifications = (): Promise<boolean> => queueInitialization(true, true);

// 앱 시작/복귀 시 저장된 사용자 선택과 현재 시스템 권한을 조용히 다시 확인합니다.
// 같은 날짜의 토큰·시간대·예약이 그대로라면 서버 동기화는 생략됩니다.
const refreshNotificationRegistration = async () => {
  const enabledValue = await AsyncStorage.getItem('notiEnabled');
  const enabled = enabledValue ? JSON.parse(enabledValue) : false;
  if (enabled) {
    await getOrCreateNotificationTime();
    await queueInitialization(false, false);
  } else {
    await unregisterPushToken();
  }
};

export const useNotifications = () => {
  const receivedListener = useRef<Notifications.Subscription | null>(null);

  useEffect(() => {
    void refreshNotificationRegistration().catch(error => {
      console.error('저장된 알림 설정 확인 실패:', error);
    });

    const appStateSubscription = AppState.addEventListener('change', state => {
      if (state === 'active') {
        void refreshNotificationRegistration().catch(error => {
          console.error('알림 권한 재확인 실패:', error);
        });
      }
    });

    receivedListener.current = Notifications.addNotificationReceivedListener(notification => {
      console.log('알림 도착:', notification.request.identifier);
    });

    // 화면이 해제될 때 수신 이벤트 구독도 함께 정리합니다.
    return () => {
      receivedListener.current?.remove();
      appStateSubscription.remove();
    };
  }, []);
};
