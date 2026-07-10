import { useState, useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';

// 포그라운드에서 수신한 푸시 알림의 표시 방식을 설정합니다.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true, // 최신 버전 필수 추가 항목
    shouldShowList: true,   // 최신 버전 필수 추가 항목
  }),
});

export function usePushNotifications() {
  const [expoPushToken, setExpoPushToken] = useState('');
  
  // 수신 리스너를 보관해 언마운트 시 해제합니다.
  const notificationListener = useRef<Notifications.Subscription | null>(null);

  useEffect(() => {
    // 권한을 확인하고 Expo Push Token을 발급합니다.
    registerForPushNotificationsAsync().then(token => {
      if (token) setExpoPushToken(token);
    });

    // 포그라운드 알림 수신을 관찰합니다.
    notificationListener.current = Notifications.addNotificationReceivedListener(notification => {
      console.log('알림 도착!', notification);
    });

    // 컴포넌트가 사라질 때 리스너를 해제합니다.
    return () => {
      if (notificationListener.current) {
        notificationListener.current.remove();
      }
    };
  }, []);

  return expoPushToken;
}

// 플랫폼별 권한 확인, 토큰 발급, 서버 등록을 처리합니다.
async function registerForPushNotificationsAsync() {
  let token;

  if (Platform.OS === 'web') {
    console.log('웹 환경에서는 푸시 알림을 사용하지 않습니다.');
    return;
  }

  if (Device.isDevice || Platform.OS === 'android') {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    
    if (finalStatus !== 'granted') {
      alert('푸시 알림 권한을 얻지 못했습니다!');
      return;
    }
    
    try {
      console.log('⏳ 토큰 발급을 시도합니다...');
      
          const registerTokenToServer = async (token: string) => {
    try {
        const response = await fetch('https://caution-compactor-property.ngrok-free.dev/api/register-token', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token: token }),
        });
        
        if (response.ok) {
            console.log('서버에 토큰 등록 성공!');
        } else {
            console.error('서버 등록 응답 실패:', await response.text());
        }
    } catch (error) {
        console.error('서버 등록 요청 중 오류 발생:', error);
    }
    };

      // 개발 빌드에서도 토큰을 발급할 수 있도록 EAS 프로젝트 ID를 전달합니다.
      const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
      
      token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
      console.log('🎉 내 기기의 푸시 토큰:', token);

      await registerTokenToServer(token);
    } catch (error) {
      console.error('❌ 토큰 발급 실패. 원인:', error);
    }
  } else {
    alert('iOS 시뮬레이터에서는 푸시 알림을 테스트할 수 없습니다. 실기기를 사용해 주세요.');
  }



  return token;
}