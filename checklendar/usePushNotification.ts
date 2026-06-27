import { useState, useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';

// 1. 앱이 켜져 있을 때(포그라운드) 알림이 오면 어떻게 보여줄지 설정
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
  
  // 타입스크립트 에러 방지를 위해 초기값(null) 할당
  const notificationListener = useRef<Notifications.Subscription | null>(null);
  const responseListener = useRef<Notifications.Subscription | null>(null);

  useEffect(() => {
    // 권한 요청 및 토큰 발급 함수 실행
    registerForPushNotificationsAsync().then(token => {
      if (token) setExpoPushToken(token);
    });

    // 앱이 켜져 있을 때 알림이 도착한 경우의 이벤트 리스너
    notificationListener.current = Notifications.addNotificationReceivedListener(notification => {
      console.log('알림 도착!', notification);
    });

    // 사용자가 알림을 터치해서 앱에 들어왔을 때의 이벤트 리스너
    responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
      console.log('알림 클릭됨!', response);
    });

    // 컴포넌트가 언마운트될 때 리스너 정리 (최신 버전 .remove() 방식 적용)
    return () => {
      if (notificationListener.current) {
        notificationListener.current.remove();
      }
      if (responseListener.current) {
        responseListener.current.remove();
      }
    };
  }, []);

  return expoPushToken;
}

// --- 토큰 발급 및 권한 요청 핵심 로직 ---
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

      // 개발 빌드 환경에서 안정적으로 토큰을 가져오기 위해 프로젝트 ID를 명시합니다.
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