import AsyncStorage from '@react-native-async-storage/async-storage';

const API_SERVER_URL = (process.env.EXPO_PUBLIC_API_SERVER_URL
  || process.env.EXPO_PUBLIC_PUSH_SERVER_URL)?.trim().replace(/\/+$/, '');
const REQUEST_TIMEOUT_MS = 10_000;
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const HOLIDAY_CACHE_PREFIX = '@checklendar_holidays_';
export const HOLIDAY_CACHE_RETENTION_KEY = '@holiday_cache_retention_years';
export const DEFAULT_HOLIDAY_CACHE_RETENTION_YEARS = 5;
let cachePolicyApplied = false;

export interface Holiday {
  date: string;
  name: string;
}

interface HolidayResponse {
  success: boolean;
  holidays: Holiday[];
}

interface HolidayCache {
  holidays: Holiday[];
  fetchedAt: number;
}

const getCacheKey = (year: number) => `${HOLIDAY_CACHE_PREFIX}${year}`;

// 선택한 연수보다 오래된 과거 공휴일 캐시만 삭제하고 현재·미래 연도는 유지합니다.
export const pruneHolidayCache = async (retentionYears: number): Promise<number> => {
  const currentYear = new Date().getFullYear();
  const oldestYearToKeep = currentYear - retentionYears;
  const keys = await AsyncStorage.getAllKeys();
  const keysToRemove = keys.filter(key => {
    if (!key.startsWith(HOLIDAY_CACHE_PREFIX)) return false;
    const year = Number(key.slice(HOLIDAY_CACHE_PREFIX.length));
    return Number.isInteger(year) && year < oldestYearToKeep;
  });

  if (keysToRemove.length > 0) await AsyncStorage.multiRemove(keysToRemove);
  return keysToRemove.length;
};

const applyConfiguredCachePolicy = async (): Promise<void> => {
  if (cachePolicyApplied) return;
  const savedValue = await AsyncStorage.getItem(HOLIDAY_CACHE_RETENTION_KEY);
  const savedYears = Number(savedValue);
  const retentionYears = savedValue !== null && Number.isInteger(savedYears) && savedYears >= 0
    ? savedYears
    : DEFAULT_HOLIDAY_CACHE_RETENTION_YEARS;
  await pruneHolidayCache(retentionYears);
  cachePolicyApplied = true;
};

// 기존 배열 형식 캐시도 읽어 업데이트 과정에서 저장된 데이터를 잃지 않게 합니다.
const readHolidayCache = async (cacheKey: string): Promise<HolidayCache | null> => {
  const value = await AsyncStorage.getItem(cacheKey);
  if (!value) return null;

  try {
    const parsed = JSON.parse(value) as HolidayCache | Holiday[];
    if (Array.isArray(parsed)) return { holidays: parsed, fetchedAt: 0 };
    if (!Array.isArray(parsed.holidays) || !Number.isFinite(parsed.fetchedAt)) return null;
    return parsed;
  } catch {
    return null;
  }
};

const isCacheFresh = (year: number, cache: HolidayCache): boolean => {
  const currentYear = new Date().getFullYear();
  if (year < currentYear) return true;
  return cache.fetchedAt > 0 && Date.now() - cache.fetchedAt < CACHE_TTL_MS;
};

// 유효한 로컬 캐시를 먼저 사용해 앱 실행 때마다 Cloud Run을 호출하지 않습니다.
export const loadHolidays = async (year: number): Promise<Holiday[]> => {
  await applyConfiguredCachePolicy();
  const cacheKey = getCacheKey(year);
  const cached = await readHolidayCache(cacheKey);
  if (cached && isCacheFresh(year, cached)) return cached.holidays;

  if (!API_SERVER_URL) {
    return cached?.holidays ?? [];
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${API_SERVER_URL}/api/holidays?year=${year}`, {
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`공휴일 서버 요청 실패 (${response.status})`);

    const data = await response.json() as HolidayResponse;
    if (!data.success || !Array.isArray(data.holidays)) {
      throw new Error('공휴일 응답 형식이 올바르지 않습니다.');
    }
    const nextCache: HolidayCache = { holidays: data.holidays, fetchedAt: Date.now() };
    await AsyncStorage.setItem(cacheKey, JSON.stringify(nextCache));
    return data.holidays;
  } catch (error) {
    if (cached) return cached.holidays;
    throw error;
  } finally {
    clearTimeout(timeout);
  }
};
