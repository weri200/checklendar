# Checklendar Expo 앱

Checklendar의 React Native·Expo 클라이언트입니다. 프로젝트 전체 설명과 서버·클라우드 구성은 [저장소 루트 README](../README.md)를 참고하세요.

## 실행

```bash
npm install
npm run android
```

개발 서버만 실행하려면:

```bash
npm start
```

## 환경변수

`.env.example`을 참고해 `.env`를 만들고 Cloud Run 또는 로컬 백엔드 주소를 설정합니다.
Android 개발 빌드는 Firebase App Check 디버그 토큰을 `.env.local`의 `EXPO_PUBLIC_FIREBASE_APP_CHECK_DEBUG_TOKEN`에 설정해야 합니다. 실제 릴리스는 Play Integrity를 사용합니다.

```env
EXPO_PUBLIC_PUSH_SERVER_URL=https://your-cloud-run-service.run.app
```

## 검사

```bash
npm run lint
npx tsc --noEmit
```
