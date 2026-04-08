import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { useEffect } from 'react';

// ----------------------------------------------------------------------------
// [1. 화면 켜짐 상태 알림 설정]
// 사용자가 앱을 켜놓고 화면을 보고 있을 때도 알림이 오면 화면 위에서 
// 배너 형태로 떨어지며 소리가 나도록 기본 규칙을 정합니다.
// ----------------------------------------------------------------------------
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,   // 팝업 배너 띄우기 (O)
    shouldPlaySound: true,   // 띠링 소리 내기 (O)
    shouldSetBadge: false,   // 앱 아이콘에 빨간 숫자 띄우기 (X)
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// ----------------------------------------------------------------------------
// [2. 알림 권한 허락받기]
// 앱을 처음 깔았을 때 "이 앱에서 알림을 보내도 될까요?"라고 묻는 팝업을 띄웁니다.
// (이 기능은 _layout.tsx에서 앱이 켜질 때 딱 한 번 실행됩니다.)
// ----------------------------------------------------------------------------
export const useNotificationSetup = () => {
  useEffect(() => {
    const requestPermission = async () => {
      // 컴퓨터(시뮬레이터)가 아닌 진짜 스마트폰일 때만 권한을 묻습니다.
      if (Device.isDevice) {
        const { status: existingStatus } = await Notifications.getPermissionsAsync();
        let finalStatus = existingStatus;
        
        // 아직 대답을 안 했다면 팝업을 띄워 물어봅니다.
        if (existingStatus !== 'granted') {
          const { status } = await Notifications.requestPermissionsAsync();
          finalStatus = status;
        }
        
        // 거절당했다면 아쉽지만 알림을 보낼 수 없다고 기록합니다.
        if (finalStatus !== 'granted') {
          console.log('알림 권한이 거부되었습니다.');
          return;
        }
      }
    };
    
    requestPermission();
  }, []);
};

// ----------------------------------------------------------------------------
// [3. 스마트 알림 예약 스케줄러]
// '할 일이 있는 날'만 골라서, '사용자가 설정한 시간'에 알림을 미리 예약해 둡니다.
// index.tsx나 settings.tsx에서 설정이 바뀔 때마다 이 함수가 불려옵니다.
// ----------------------------------------------------------------------------
export const updateNotification = async () => {
  try {
    // 1. 과거에 예약해둔 알림들이 꼬이지 않게 싹 다 지우고 백지상태로 만듭니다.
    await Notifications.cancelAllScheduledNotificationsAsync();

    // 2. 기기 서랍(AsyncStorage)에서 알림 설정과 '할 일 목록'을 꺼내옵니다.
    const savedEnabled = await AsyncStorage.getItem('notiEnabled');
    const savedTimeStr = await AsyncStorage.getItem('notiTime');
    const tasksStr = await AsyncStorage.getItem('@checklendar_tasks'); 

    const isEnabled = savedEnabled ? JSON.parse(savedEnabled) : false;
    
    // 알림 스위치를 꺼뒀거나, 시간을 설정한 적이 없다면 예약하지 않고 그냥 돌아갑니다.
    if (!isEnabled || !savedTimeStr) return; 

    // 꺼내온 글자 데이터를 써먹을 수 있는 시간(Date)과 객체(Object) 형태로 바꿉니다.
    const notiTime = new Date(savedTimeStr);
    const tasks = tasksStr ? JSON.parse(tasksStr) : {};

    // 3. 오늘 날짜를 구합니다. (예: '2026-04-08')
    const now = new Date();
    const todayStr = new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString().split('T')[0];

    // 4. 수많은 날짜 중 "오늘 이후이면서 + 할 일이 1개 이상 있는 날"만 쏙쏙 골라냅니다.
    const activeDates = Object.keys(tasks)
      .filter(date => date >= todayStr && tasks[date].length > 0)
      .sort();

    // 5. 스마트폰 운영체제(iOS/Android)는 한 번에 너무 많은 알림 예약을 허락하지 않습니다.
    // 안전하게 가까운 미래의 딱 30일 치 알림만 예약합니다.
    const datesToSchedule = activeDates.slice(0, 30);

    // 6. 골라낸 날짜들(datesToSchedule)을 하나씩 돌면서 알람 시계를 맞춥니다.
    for (const dateStr of datesToSchedule) {
      
      // '2026-04-08' 이라는 글자를 2026, 4, 8 숫자로 쪼갭니다.
      const [year, month, day] = dateStr.split('-').map(Number);
      
      // 알람이 울릴 정확한 타이밍 = (할 일이 있는 날짜) + (사용자가 설정한 시/분)
      const targetDate = new Date(year, month - 1, day, notiTime.getHours(), notiTime.getMinutes(), 0);

      // 이미 시간이 지나버린 과거라면 알람을 맞출 수 없으니 다음 날짜로 넘어갑니다.
      if (targetDate <= now) continue;

      // 그날 할 일이 몇 개나 있는지 세어봅니다.
      const taskCount = tasks[dateStr].length;

      // 7. 스마트폰에게 "이 날짜 이 시간에 팝업 띄워줘!" 라고 예약을 겁니다.
      await Notifications.scheduleNotificationAsync({
        content: {
          title: "📅 오늘 일정을 확인하세요!",
          body: `Checklendar에 오늘 ${taskCount}개의 할 일이 등록되어 있습니다.`, // '오늘 3개의 할 일이...' 처럼 똑똑하게 보여줍니다.
          sound: true,
        },
        trigger: targetDate as any, // 우리가 계산한 targetDate에 정확히 터집니다.
      });
    }
  } catch (error) {
    console.error("알림 업데이트 중 오류 발생:", error);
  }
};