import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';

import { registerPushToken, syncNotificationSchedule } from './services/notificationService';

// 앱을 사용 중일 때 도착한 알림도 배너와 소리로 표시합니다.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// 여러 화면에서 훅을 호출해도 초기화는 한 번만 실행합니다.
let initializationPromise: Promise<void> | null = null;

const initializeNotifications = async () => {
  // 현재 서버는 Android FCM 토큰을 직접 사용합니다.
  if (Platform.OS !== 'android') {
    console.log('FCM 직접 알림은 현재 Android에서만 초기화합니다.');
    return;
  }
  if (!Device.isDevice) {
    console.log('푸시 알림은 실제 기기에서만 초기화합니다.');
    return;
  }

  // Android 알림의 중요도와 기본 소리를 채널 단위로 설정합니다.
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: '기본 알림',
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'default',
    });
  }

  // 기존 권한을 우선 확인하고, 필요한 경우에만 사용자에게 권한을 요청합니다.
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

  const devicePushToken = await Notifications.getDevicePushTokenAsync();
  if (devicePushToken.type !== 'android' || typeof devicePushToken.data !== 'string') {
    throw new Error(`Android FCM 토큰을 가져오지 못했습니다: ${devicePushToken.type}`);
  }

  const token = devicePushToken.data;
  // 토큰 등록에 성공한 경우에만 해당 기기의 예약 목록을 서버와 동기화합니다.
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

    // 화면이 해제될 때 수신 이벤트 구독도 함께 정리합니다.
    return () => {
      receivedListener.current?.remove();
    };
  }, []);
};
