const assert = require('node:assert/strict');
const test = require('node:test');

const { getBackfillExpireAtMs } = require('./backfillTokenExpireAt');
const { TOKEN_TTL_MS } = require('./deviceRegistration');

test('기존 토큰의 expireAt은 마지막 갱신 시각부터 계산하고, 갱신 시각이 없으면 현재부터 계산합니다.', () => {
  const nowMs = Date.UTC(2026, 9, 29);
  const updatedAtMs = Date.UTC(2026, 3, 1);

  assert.equal(
    getBackfillExpireAtMs({ updatedAt: { toMillis: () => updatedAtMs } }, nowMs),
    updatedAtMs + TOKEN_TTL_MS,
  );
  assert.equal(getBackfillExpireAtMs({}, nowMs), nowMs + TOKEN_TTL_MS);
});
