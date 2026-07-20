const assert = require('node:assert/strict');
const test = require('node:test');

const { createDeviceRegistrationManager } = require('./deviceRegistration');

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
