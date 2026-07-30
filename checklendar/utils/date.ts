/** Calendar-date helpers. Date strings are local YYYY-MM-DD values. */
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

// toISOString의 UTC 변환으로 날짜가 하루 밀리지 않도록 로컬 달력 날짜를 직접 만듭니다.
export const formatLocalDate = (date: Date = new Date()): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const parseLocalDate = (dateString: string): Date => {
  const match = DATE_PATTERN.exec(dateString);
  if (!match) throw new Error(`Invalid date string: ${dateString}`);

  const [, year, month, day] = match.map(Number);
  const date = new Date(year, month - 1, day);
  if (formatLocalDate(date) !== dateString) {
    throw new Error(`Invalid calendar date: ${dateString}`);
  }
  return date;
};

// 고정 폭 YYYY-MM-DD 형식은 문자열 순서와 날짜 순서가 같습니다.
export const isDateBefore = (left: string, right: string): boolean => left < right;

// setDate를 사용해 DST가 있는 지역에서도 달력상의 다음 날짜로 이동합니다.
export const getDateRange = (start: string, end: string): string[] => {
  if (isDateBefore(end, start)) return [];

  const last = parseLocalDate(end);
  const current = parseLocalDate(start);
  const dates: string[] = [];
  while (current <= last) {
    dates.push(formatLocalDate(current));
    current.setDate(current.getDate() + 1);
  }
  return dates;
};
