const assert = require('node:assert/strict');
const test = require('node:test');
const { createRateLimiter } = require('./rateLimitMiddleware');

test('허용량을 넘은 요청에 429와 재시도 시간을 반환한다', () => {
  let currentTime = 1_000;
  const middleware = createRateLimiter({
    windowMs: 60_000,
    maxRequests: 2,
    now: () => currentTime,
  });
  const req = { ip: '127.0.0.1' };
  const response = { headers: {} };
  const res = {
    set(name, value) { response.headers[name] = value; return this; },
    status(code) { response.statusCode = code; return this; },
    json(body) { response.body = body; return this; },
  };
  let passed = 0;
  middleware(req, res, () => { passed += 1; });
  middleware(req, res, () => { passed += 1; });
  middleware(req, res, () => { passed += 1; });
  assert.equal(passed, 2);
  assert.equal(response.statusCode, 429);
  assert.equal(response.headers['Retry-After'], '60');

  currentTime += 60_000;
  middleware(req, res, () => { passed += 1; });
  assert.equal(passed, 3);
});
