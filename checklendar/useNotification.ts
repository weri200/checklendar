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
    // 1. 기존 알림 싹 지우기
    await Notifications.cancelAllScheduledNotificationsAsync();

    const savedEnabled = await AsyncStorage.getItem('notiEnabled');
    const savedTimeStr = await AsyncStorage.getItem('notiTime');
    const tasksStr = await AsyncStorage.getItem('@checklendar_tasks'); 

    const isEnabled = savedEnabled ? JSON.parse(savedEnabled) : false;
    if (!isEnabled || !savedTimeStr) return; 

    const notiTime = new Date(savedTimeStr);
    const tasks = tasksStr ? JSON.parse(tasksStr) : {};

    const now = new Date();
    const todayStr = new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString().split('T')[0];

    // [수정 포인트 1] 미완료된 할 일이 1개라도 있는 날짜만 골라냅니다.
    const activeDates = Object.keys(tasks)
      .filter(date => {
        // 해당 날짜의 할 일 중 완료되지 않은(isDone: false) 것만 필터링
        const incompleteTasks = tasks[date].filter((t: any) => !t.isDone);
        return date >= todayStr && incompleteTasks.length > 0;
      })
      .sort();

    const datesToSchedule = activeDates.slice(0, 30);

    for (const dateStr of datesToSchedule) {
      const [year, month, day] = dateStr.split('-').map(Number);
      const targetDate = new Date(year, month - 1, day, notiTime.getHours(), notiTime.getMinutes(), 0);

      if (targetDate <= now) continue;

      // [수정 포인트 2] 알림 문구에 들어갈 개수도 '미완료 일정'만 셉니다.
      const incompleteTasks = tasks[dateStr].filter((t: any) => !t.isDone);
      const taskCount = incompleteTasks.length;

      // 만약 오늘 모든 할 일을 완료했다면 알림을 예약하지 않습니다.
      if (taskCount === 0) continue;

      await Notifications.scheduleNotificationAsync({
        content: {
          title: "📅 남은 일정을 확인하세요!",
          body: `오늘 아직 완료하지 않은 할 일이 ${taskCount}개 있습니다.`,
          sound: true,
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: new Date(targetDate),
        },
      });
    }
  } catch (error) {
    console.error("알림 업데이트 중 오류 발생:", error);
  }
};