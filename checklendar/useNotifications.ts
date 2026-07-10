import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';

import { registerPushToken, syncNotificationSchedule } from './services/notificationService';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

let initializationPromise: Promise<void> | null = null;

const initializeNotifications = async () => {
  if (Platform.OS === 'web') return;
  if (!Device.isDevice && Platform.OS !== 'android') {
    console.log('푸시 알림은 실제 기기에서만 초기화합니다.');
    return;
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: '기본 알림',
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'default',
    });
  }

  const permission = await Notifications.getPermissionsAsync();
  const finalStatus = permission.status === 'granted'
    ? permission.status
    : (await Notifications.requestPermissionsAsync()).status;

  if (finalStatus !== 'granted') {
    console.log('알림 권한이 없어 푸시 알림 초기화를 중단합니다.');
    return;
  }

  // 기존 로컬 예약을 제거해 서버 푸시와 중복되지 않도록 합니다.
  await Notifications.cancelAllScheduledNotificationsAsync();

  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) throw new Error('EAS projectId가 설정되지 않았습니다.');

  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  if (await registerPushToken(token)) {
    await syncNotificationSchedule();
  }
};

export const useNotifications = () => {
  const receivedListener = useRef<Notifications.Subscription | null>(null);

  useEffect(() => {
    initializationPromise ??= initializeNotifications().catch(error => {
      console.error('알림 초기화 실패:', error);
      initializationPromise = null;
    });

    receivedListener.current = Notifications.addNotificationReceivedListener(notification => {
      console.log('알림 도착:', notification.request.identifier);
    });

    return () => {
      receivedListener.current?.remove();
    };
  }, []);
};
