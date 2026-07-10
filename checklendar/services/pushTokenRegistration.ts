import AsyncStorage from '@react-native-async-storage/async-storage';

const PUSH_SERVER_URL = process.env.EXPO_PUBLIC_PUSH_SERVER_URL?.trim().replace(/\/+$/, '');
const REGISTERED_TOKEN_KEY = '@checklendar_registered_push_token';
const REGISTRATION_TIMEOUT_MS = 10_000;

let registrationQueue: Promise<void> = Promise.resolve();

const performTokenRegistration = async (token: string) => {
  if (!PUSH_SERVER_URL) {
    console.warn('EXPO_PUBLIC_PUSH_SERVER_URL이 설정되지 않아 푸시 토큰 등록을 건너뜁니다.');
    return;
  }

  const registrationSignature = JSON.stringify({ serverUrl: PUSH_SERVER_URL, token });
  const savedSignature = await AsyncStorage.getItem(REGISTERED_TOKEN_KEY);
  if (savedSignature === registrationSignature) {
    console.log('푸시 토큰이 변경되지 않아 서버 등록을 건너뜁니다.');
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REGISTRATION_TIMEOUT_MS);

  try {
    const response = await fetch(`${PUSH_SERVER_URL}/api/register-token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ token }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const responseBody = await response.text();
      throw new Error(`푸시 토큰 등록 실패 (${response.status}): ${responseBody}`);
    }

    await AsyncStorage.setItem(REGISTERED_TOKEN_KEY, registrationSignature);
    console.log('서버에 푸시 토큰 등록 성공!');
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      console.error(`푸시 토큰 등록 요청이 ${REGISTRATION_TIMEOUT_MS / 1000}초 후 중단되었습니다.`);
      return;
    }

    console.error('푸시 토큰 등록 요청 중 오류 발생:', error);
  } finally {
    clearTimeout(timeout);
  }
};

// 중복 실행을 직렬화해 성공한 토큰이 저장된 뒤 다음 요청이 비교되도록 합니다.
export const registerPushToken = (token: string): Promise<void> => {
  const runRegistration = () => performTokenRegistration(token);
  registrationQueue = registrationQueue.then(runRegistration, runRegistration);
  return registrationQueue;
};
