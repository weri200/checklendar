const HOLIDAY_API_URL = 'https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getHoliDeInfo';
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 10_000;
const holidayCache = new Map();

// 공공데이터포털은 Encoding/Decoding 인증키를 모두 표시합니다. Secret에 어느 쪽을
// 저장해도 요청 단계에서는 원본 키 한 번만 URL 인코딩되도록 정규화합니다.
const normalizeServiceKey = serviceKey => {
  const trimmedKey = serviceKey.trim();
  if (!trimmedKey) return '';

  try {
    return /%[0-9a-f]{2}/i.test(trimmedKey)
      ? decodeURIComponent(trimmedKey)
      : trimmedKey;
  } catch {
    throw new Error('공휴일 API 인증키의 URL 인코딩 형식이 올바르지 않습니다.');
  }
};

// XML 응답에 포함된 기본 엔티티를 화면에 표시할 문자열로 복원합니다.
const decodeXml = value => value
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"')
  .replace(/&apos;/g, "'")
  .replace(/&amp;/g, '&');

const readTag = (xml, tag) => {
  const match = xml.match(new RegExp(`<${tag}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${tag}>`));
  return match ? decodeXml(match[1].trim()) : null;
};

// 공공데이터포털의 연도별 XML 응답을 앱에서 사용하기 쉬운 배열로 변환합니다.
const parseHolidayXml = xml => {
  const resultCode = readTag(xml, 'resultCode');
  // 인증키 만료 같은 공통 오류 응답에는 resultCode가 없으므로 빈 목록으로 캐시하지 않고 오류로 처리합니다.
  if (resultCode !== '00') {
    const message = readTag(xml, 'resultMsg') || readTag(xml, 'returnAuthMsg') || '알 수 없는 오류';
    throw new Error(`공휴일 API 오류 (${resultCode || readTag(xml, 'returnReasonCode')}): ${message}`);
  }

  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].flatMap(match => {
    const item = match[1];
    const rawDate = readTag(item, 'locdate');
    const name = readTag(item, 'dateName');
    const isHoliday = readTag(item, 'isHoliday');
    if (!rawDate || !name || isHoliday === 'N') return [];

    return [{
      date: `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}`,
      name,
    }];
  });
};

const fetchHolidays = async (year, serviceKey) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const url = new URL(HOLIDAY_API_URL);
  url.searchParams.set('serviceKey', normalizeServiceKey(serviceKey));
  url.searchParams.set('solYear', String(year));
  url.searchParams.set('numOfRows', '100');
  url.searchParams.set('pageNo', '1');

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`공휴일 API HTTP 오류: ${response.status}`);
    return parseHolidayXml(await response.text());
  } finally {
    clearTimeout(timeout);
  }
};

const registerHolidayRoutes = app => {
  app.get('/api/holidays', async (req, res) => {
    const year = Number(req.query.year);
    if (!Number.isInteger(year) || year < 1900 || year > 2100) {
      return res.status(400).json({ success: false, message: 'year는 1900~2100 사이의 연도여야 합니다.' });
    }

    const serviceKey = process.env.PUBLIC_DATA_SERVICE_KEY?.trim();
    if (!serviceKey) {
      return res.status(503).json({ success: false, message: '공휴일 API 키가 서버에 설정되지 않았습니다.' });
    }

    const cached = holidayCache.get(year);
    if (cached && cached.expiresAt > Date.now()) {
      return res.json({ success: true, year, holidays: cached.holidays, cached: true });
    }

    try {
      const holidays = await fetchHolidays(year, serviceKey);
      holidayCache.set(year, { holidays, expiresAt: Date.now() + CACHE_TTL_MS });
      res.set('Cache-Control', 'public, max-age=3600');
      return res.json({ success: true, year, holidays, cached: false });
    } catch (error) {
      console.error('공휴일 조회 실패:', error);
      return res.status(502).json({ success: false, message: '공휴일 정보를 불러오지 못했습니다.' });
    }
  });
};

module.exports = { normalizeServiceKey, parseHolidayXml, registerHolidayRoutes };
