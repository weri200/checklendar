import { updateNotification } from '../useNotification';

const NOTIFICATION_UPDATE_DELAY_MS = 500;

let updateTimer: ReturnType<typeof setTimeout> | null = null;
let updateQueue: Promise<void> = Promise.resolve();

const enqueueNotificationUpdate = () => {
  const runUpdate = () => updateNotification();
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
