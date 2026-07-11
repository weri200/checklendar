const test = require('node:test');
const assert = require('node:assert/strict');
const { parseHolidayXml } = require('./holidayService');

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
