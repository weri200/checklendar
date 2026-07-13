import { getApp } from '@react-native-firebase/app';
import {
  getToken,
  initializeAppCheck,
  ReactNativeFirebaseAppCheckProvider,
  type AppCheck,
} from '@react-native-firebase/app-check';

let appCheckPromise: Promise<AppCheck> | null = null;

const initializeCheck = (): Promise<AppCheck> => {
  if (appCheckPromise) return appCheckPromise;

  const provider = new ReactNativeFirebaseAppCheckProvider();
  const debugToken = process.env.EXPO_PUBLIC_FIREBASE_APP_CHECK_DEBUG_TOKEN;
  if (__DEV__ && !debugToken) {
    throw new Error('개발 빌드용 App Check 디버그 토큰이 설정되지 않았습니다.');
  }
  provider.configure({
    android: {
      // 로컬 개발 빌드는 Firebase Console에 등록한 디버그 토큰을 사용합니다.
      // Play Store용 릴리스 빌드는 Play Integrity로 실제 앱 설치를 검증합니다.
      provider: __DEV__ ? 'debug' : 'playIntegrity',
      debugToken: __DEV__ ? debugToken : undefined,
    },
  });

  appCheckPromise = initializeAppCheck(getApp(), {
    provider,
    isTokenAutoRefreshEnabled: true,
  }).catch(error => {
    appCheckPromise = null;
    throw error;
  });
  return appCheckPromise;
};

export const getAppCheckToken = async (): Promise<string> => {
  const appCheck = await initializeCheck();
  const result = await getToken(appCheck);
  if (!result.token) throw new Error('App Check 토큰을 발급받지 못했습니다.');
  return result.token;
};
