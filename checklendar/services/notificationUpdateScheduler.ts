import { syncNotificationSchedule } from './notificationService';

const NOTIFICATION_UPDATE_DELAY_MS = 500;

let updateTimer: ReturnType<typeof setTimeout> | null = null;
let updateQueue: Promise<void> = Promise.resolve();

// 이전 동기화가 끝난 뒤 다음 동기화를 시작해 요청 순서를 보장합니다.
const enqueueNotificationUpdate = () => {
  const runUpdate = () => syncNotificationSchedule();
  updateQueue = updateQueue.then(runUpdate, runUpdate);
};

// 연속된 변경은 마지막 요청을 기준으로 한 번만 알림에 반영합니다.
export const requestNotificationUpdate = () => {
  if (updateTimer) clearTimeout(updateTimer);

  updateTimer = setTimeout(() => {
    updateTimer = null;
    enqueueNotificationUpdate();
  }, NOTIFICATION_UPDATE_DELAY_MS);
};
