const assert = require('node:assert/strict');
const test = require('node:test');

const { createDeviceRegistrationManager } = require('./deviceRegistration');
const { ACTIVE_DEVICE_LIMIT_REACHED } = require('./deviceRegistration');

const createSnapshot = (exists, data = {}) => ({
  exists,
  data: () => data,
});

const createRegistrationManager = ({
  activeDeviceCount,
  tokenSnapshot = createSnapshot(false),
  previousTokenSnapshot = createSnapshot(false),
}) => {
  const writes = [];
  const tokenReferences = new Map();
  const activeQuery = { type: 'active-query' };
  const tokenCollection = {
    doc: token => {
      if (!tokenReferences.has(token)) {
        tokenReferences.set(token, { type: 'token', token });
      }
      return tokenReferences.get(token);
    },
    where: () => ({
      limit: () => activeQuery,
    }),
  };

  const manager = createDeviceRegistrationManager({
    db: {
      runTransaction: async callback => callback({
        get: async reference => {
          if (reference === activeQuery) return { size: activeDeviceCount };
          if (reference.token === 'new-token') return tokenSnapshot;
          return previousTokenSnapshot;
        },
        set: (reference, data, options) => writes.push({ type: 'set', reference, data, options }),
        delete: reference => writes.push({ type: 'delete', reference }),
      }),
      batch: () => ({
        delete: () => {},
        commit: async () => {},
      }),
    },
    tokenCollection,
    scheduleCollection: {
      where: () => ({
        get: async () => ({
          size: 0,
          forEach: () => {},
        }),
      }),
    },
    maskToken: token => token,
    maxActiveDevices: 100,
  });

  return { manager, writes };
};

test('활성 기기 100대가 등록되면 새로운 토큰을 거부합니다.', async () => {
  const { manager, writes } = createRegistrationManager({ activeDeviceCount: 100 });

  await assert.rejects(
    manager.registerDevice({
      token: 'new-token',
      previousToken: null,
      data: { active: true },
    }),
    error => error.code === ACTIVE_DEVICE_LIMIT_REACHED,
  );
  assert.deepEqual(writes, []);
});

test('활성 기기 상한에서도 이미 등록된 토큰은 갱신합니다.', async () => {
  const { manager, writes } = createRegistrationManager({
    activeDeviceCount: 100,
    tokenSnapshot: createSnapshot(true, { active: true }),
  });

  await manager.registerDevice({
    token: 'new-token',
    previousToken: null,
    data: { active: true, platform: 'android' },
  });

  assert.deepEqual(writes, [{
    type: 'set',
    reference: { type: 'token', token: 'new-token' },
    data: { active: true, platform: 'android' },
    options: { merge: true },
  }]);
});

test('활성 기기 상한에서 기존 토큰을 새 토큰으로 교체합니다.', async () => {
  const { manager, writes } = createRegistrationManager({
    activeDeviceCount: 100,
    previousTokenSnapshot: createSnapshot(true, { active: true }),
  });

  await manager.registerDevice({
    token: 'new-token',
    previousToken: 'old-token',
    data: { active: true },
  });

  assert.deepEqual(writes, [
    {
      type: 'set',
      reference: { type: 'token', token: 'new-token' },
      data: { active: true },
      options: { merge: true },
    },
    {
      type: 'delete',
      reference: { type: 'token', token: 'old-token' },
    },
  ]);
});

test('기기 등록 삭제 시 토큰과 모든 예약을 하나의 배치로 삭제합니다.', async () => {
  const deletedReferences = [];
  let committed = false;
  const tokenReference = { path: 'pushTokens/token-1' };
  const scheduleReferences = [
    { path: 'scheduledNotifications/schedule-1' },
    { path: 'scheduledNotifications/schedule-2' },
  ];
  const logs = [];

  const manager = createDeviceRegistrationManager({
    db: {
      batch: () => ({
        delete: reference => deletedReferences.push(reference),
        commit: async () => { committed = true; },
      }),
    },
    tokenCollection: { doc: token => ({ ...tokenReference, token }) },
    scheduleCollection: {
      where: () => ({
        get: async () => ({
          size: scheduleReferences.length,
          forEach: callback => scheduleReferences.forEach(ref => callback({ ref })),
        }),
      }),
    },
    maskToken: token => `masked-${token}`,
    maxActiveDevices: 100,
    logger: { log: message => logs.push(message) },
  });

  await manager.deleteDeviceRegistration('token-1');

  assert.equal(committed, true);
  assert.deepEqual(deletedReferences, [
    { ...tokenReference, token: 'token-1' },
    ...scheduleReferences,
  ]);
  assert.deepEqual(logs, ['[토큰 삭제] masked-token-1, 예약 2건 삭제']);
});
