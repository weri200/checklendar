const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeServiceKey, parseHolidayXml } = require('./holidayService');

test('Encoding 및 Decoding 인증키를 동일한 원본 키로 정규화한다', () => {
  const decodedKey = 'sample+service/key=';
  const encodedKey = encodeURIComponent(decodedKey);

  assert.equal(normalizeServiceKey(decodedKey), decodedKey);
  assert.equal(normalizeServiceKey(encodedKey), decodedKey);
  assert.equal(normalizeServiceKey(`  ${encodedKey}\n`), decodedKey);
});

test('손상된 Encoding 인증키는 설정 오류로 처리한다', () => {
  assert.throws(() => normalizeServiceKey('broken%2Fkey%ZZ'), /인코딩 형식/);
});

test('공휴일 XML을 날짜와 이름 배열로 변환한다', () => {
  const xml = `
    <response><header><resultCode>00</resultCode><resultMsg>OK</resultMsg></header><body><items>
      <item><dateName>설날</dateName><isHoliday>Y</isHoliday><locdate>20260217</locdate></item>
      <item><dateName>기념일</dateName><isHoliday>N</isHoliday><locdate>20260218</locdate></item>
    </items></body></response>`;

  assert.deepEqual(parseHolidayXml(xml), [{ date: '2026-02-17', name: '설날' }]);
});

test('API 오류 응답은 예외로 처리한다', () => {
  const xml = '<response><header><resultCode>30</resultCode><resultMsg>SERVICE KEY ERROR</resultMsg></header></response>';
  assert.throws(() => parseHolidayXml(xml), /SERVICE KEY ERROR/);
});

test('resultCode가 없는 공통 오류 응답을 빈 공휴일 목록으로 처리하지 않는다', () => {
  const xml = `
    <OpenAPI_ServiceResponse><cmmMsgHeader><errMsg>SERVICE ERROR</errMsg>
      <returnAuthMsg>SERVICE_KEY_IS_NOT_REGISTERED_ERROR</returnAuthMsg>
      <returnReasonCode>30</returnReasonCode>
    </cmmMsgHeader></OpenAPI_ServiceResponse>`;
  assert.throws(() => parseHolidayXml(xml), /SERVICE_KEY_IS_NOT_REGISTERED_ERROR/);
});
