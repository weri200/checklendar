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

const createManager = (overrides = {}) => createNotificationTaskManager({
  admin: {},
  messaging: {},
  scheduleCollection: {},
  tokenCollection: {},
  claimNotification: async () => null,
  markDeviceInactive: async () => {},
  ...overrides,
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
  let activeRequests = 0;
  let peakActiveRequests = 0;
  const originalCreateTask = CloudTasksClient.prototype.createTask;
  CloudTasksClient.prototype.createTask = async request => {
    activeRequests += 1;
    peakActiveRequests = Math.max(peakActiveRequests, activeRequests);
    requests.push(request);
    await new Promise(resolve => setImmediate(resolve));
    activeRequests -= 1;
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
  const queuedCount = await manager.queueSchedules([
    {
      id: 'schedule-1',
      version: 'version-1',
      scheduledAt,
      status: 'pending',
    },
    {
      id: 'schedule-2',
      version: 'version-1',
      scheduledAt,
      status: 'pending',
    },
  ]);

  assert.equal(manager.enabled, true);
  assert.equal(queuedCount, 2);
  assert.equal(requests.length, 2);
  assert.equal(peakActiveRequests, 2);
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

test('예약 시각에 Android FCM 메시지를 직접 발송하고 예약을 삭제합니다.', async t => {
  const previous = Object.fromEntries(ENV_KEYS.map(key => [key, process.env[key]]));
  Object.assign(process.env, {
    CLOUD_TASKS_PROJECT_ID: 'test-project',
    CLOUD_TASKS_LOCATION: 'asia-northeast3',
    CLOUD_TASKS_QUEUE: 'test-queue',
    CLOUD_RUN_SERVICE_URL: 'https://example.run.app',
    INTERNAL_API_SECRET: 'test-secret',
    NOTIFICATION_TIMEZONE: 'UTC',
  });
  t.after(() => {
    ENV_KEYS.forEach(key => {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    });
  });

  let deleted = false;
  let sentMessage = null;
  const scheduleDocument = {
    get: async () => ({
      exists: true,
      data: () => ({
        token: 'fcm-device-token-for-test',
        notificationId: '2026-07-13',
        version: 'version-1',
        title: '일정 알림',
        body: '할 일이 1개 있습니다.',
        status: 'pending',
      }),
    }),
    delete: async () => { deleted = true; },
  };
  const routes = new Map();
  const manager = createManager({
    messaging: {
      send: async message => {
        sentMessage = message;
        return 'projects/test-project/messages/message-1';
      },
    },
    scheduleCollection: { doc: () => scheduleDocument },
    tokenCollection: {
      doc: () => ({
        get: async () => ({ exists: true, data: () => ({ active: true }) }),
      }),
    },
    claimNotification: async () => ({
      ref: scheduleDocument,
      token: 'fcm-device-token-for-test',
      notificationId: '2026-07-13',
      title: '일정 알림',
      body: '할 일이 1개 있습니다.',
    }),
  });
  manager.registerRoutes({
    post: (path, ...handlers) => routes.set(path, handlers),
  });

  const [verify, send] = routes.get('/internal/send-notification');
  const request = {
    get: name => name === 'x-internal-secret' ? 'test-secret' : '',
    body: { scheduleId: 'schedule-1', version: 'version-1' },
  };
  let responseBody = null;
  const response = {
    status: () => response,
    json: body => { responseBody = body; return body; },
  };
  await new Promise((resolve, reject) => {
    verify(request, response, () => send(request, response).then(resolve, reject));
  });

  assert.equal(responseBody.success, true);
  assert.equal(responseBody.sent, true);
  assert.equal(deleted, true);
  assert.deepEqual(sentMessage, {
    token: 'fcm-device-token-for-test',
    notification: {
      title: '일정 알림',
      body: '할 일이 1개 있습니다.',
    },
    data: { notificationId: '2026-07-13' },
    android: {
      priority: 'high',
      notification: { channelId: 'default', sound: 'default' },
    },
  });
});
