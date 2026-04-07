// useNotifications.ts
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { useEffect } from 'react';

// 💡 알림이 왔을 때 어떻게 표시할지 기본 설정 (앱 전역 설정)
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// 💡 밖에서 가져다 쓸 수 있도록 커스텀 훅(함수)으로 감싸줍니다.
export const useNotificationSetup = () => {
  useEffect(() => {
    const requestPermission = async () => {
      if (Device.isDevice) {
        const { status: existingStatus } = await Notifications.getPermissionsAsync();
        let finalStatus = existingStatus;
        
        // 권한이 없다면 팝업을 띄워 사용자에게 요청합니다.
        if (existingStatus !== 'granted') {
          const { status } = await Notifications.requestPermissionsAsync();
          finalStatus = status;
        }
        
        if (finalStatus !== 'granted') {
          console.log('알림 권한이 거부되었습니다.');
          return;
        }
      }
    };
    
    requestPermission();
  }, []);
};