const assert = require('node:assert/strict');
const test = require('node:test');

const { CloudTasksClient } = require('@google-cloud/tasks');
const { createNotificationTaskManager } = require('./notificationTaskManager');

const ENV_KEYS = [
  'CLOUD_TASKS_PROJECT_ID',
  'CLOUD_TASKS_LOCATION',
  'CLOUD_TASKS_QUEUE',
  'CLOUD_RUN_SERVICE_URL',
  'INTERNAL_API_SECRET',
  'NOTIFICATION_TIMEZONE',
];

const createManager = () => createNotificationTaskManager({
  admin: {},
  db: {},
  expo: {},
  scheduleCollection: {},
  receiptCollection: {},
  tokenCollection: {},
  claimNotification: async () => null,
  markDeviceInactive: async () => {},
});

test('Cloud Tasks 설정이 없으면 당일 예약 작업을 만들지 않습니다.', async t => {
  const previous = Object.fromEntries(ENV_KEYS.map(key => [key, process.env[key]]));
  ENV_KEYS.forEach(key => delete process.env[key]);
  t.after(() => {
    ENV_KEYS.forEach(key => {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    });
  });

  const manager = createManager();
  assert.equal(manager.enabled, false);
  assert.equal(await manager.queueSchedules([{
    id: 'schedule-1',
    version: 'version-1',
    scheduledAt: new Date(Date.now() + 1000),
    status: 'pending',
  }]), 0);
});

test('오늘 발송할 예약을 지정된 시각의 Cloud Task로 생성합니다.', async t => {
  const previous = Object.fromEntries(ENV_KEYS.map(key => [key, process.env[key]]));
  Object.assign(process.env, {
    CLOUD_TASKS_PROJECT_ID: 'test-project',
    CLOUD_TASKS_LOCATION: 'asia-northeast3',
    CLOUD_TASKS_QUEUE: 'test-queue',
    CLOUD_RUN_SERVICE_URL: 'https://example.run.app/',
    INTERNAL_API_SECRET: 'test-secret',
    NOTIFICATION_TIMEZONE: 'UTC',
  });

  const requests = [];
  const originalCreateTask = CloudTasksClient.prototype.createTask;
  CloudTasksClient.prototype.createTask = async request => {
    requests.push(request);
    return [{}];
  };

  t.after(() => {
    CloudTasksClient.prototype.createTask = originalCreateTask;
    ENV_KEYS.forEach(key => {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    });
  });

  const manager = createManager();
  const scheduledAt = new Date(Date.now() + 1000);
  const queuedCount = await manager.queueSchedules([{
    id: 'schedule-1',
    version: 'version-1',
    scheduledAt,
    status: 'pending',
  }]);

  assert.equal(manager.enabled, true);
  assert.equal(queuedCount, 1);
  assert.equal(requests.length, 1);
  assert.equal(
    requests[0].task.httpRequest.url,
    'https://example.run.app/internal/send-notification',
  );
  assert.deepEqual(
    JSON.parse(requests[0].task.httpRequest.body.toString()),
    { scheduleId: 'schedule-1', version: 'version-1' },
  );
  assert.equal(
    Number(requests[0].task.scheduleTime.seconds),
    Math.floor(scheduledAt.getTime() / 1000),
  );
});
