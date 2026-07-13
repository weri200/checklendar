const assert = require('node:assert/strict');
const test = require('node:test');
const { createAppCheckMiddleware } = require('./appCheckMiddleware');

const runMiddleware = async ({ token, claims, mode = 'enforce' }) => {
  const req = { method: 'GET', path: '/api/test', get: () => token };
  const response = { statusCode: 200 };
  const res = {
    status(code) { response.statusCode = code; return this; },
    json(body) { response.body = body; return this; },
  };
  let nextCalled = false;
  const middleware = createAppCheckMiddleware({
    appCheck: { verifyToken: async () => claims },
    expectedAppId: 'expected-app',
    mode,
    logger: { warn() {} },
  });
  await middleware(req, res, () => { nextCalled = true; });
  return { ...response, nextCalled, req };
};

test('올바른 Firebase 앱의 App Check 토큰을 허용한다', async () => {
  const result = await runMiddleware({
    token: 'valid',
    claims: { appId: 'expected-app', token: { app_id: 'expected-app' } },
  });
  assert.equal(result.nextCalled, true);
  assert.equal(result.req.appCheck.app_id, 'expected-app');
});

test('이전 Admin SDK의 직접 claims 반환 형식도 허용한다', async () => {
  const result = await runMiddleware({ token: 'valid', claims: { sub: 'expected-app' } });
  assert.equal(result.nextCalled, true);
});

test('토큰이 없거나 다른 앱이면 강제 모드에서 거부한다', async () => {
  const missing = await runMiddleware({ token: '', claims: {} });
  const wrongApp = await runMiddleware({ token: 'valid', claims: { app_id: 'wrong-app' } });
  assert.equal(missing.statusCode, 401);
  assert.equal(wrongApp.statusCode, 401);
});

test('모니터 모드에서는 잘못된 요청도 기존 앱 호환을 위해 통과시킨다', async () => {
  const result = await runMiddleware({ token: '', claims: {}, mode: 'monitor' });
  assert.equal(result.nextCalled, true);
});
