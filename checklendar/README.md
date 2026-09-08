# Checklendar Expo 앱

Checklendar의 React Native·Expo 클라이언트입니다. 프로젝트 전체 설명과 서버·클라우드 구성은 [저장소 루트 README](../README.md)를 참고하세요.

Android 앱은 배포되어 운영 중입니다. 현재는 기능 개선과 운영 안정화를 진행하며, 서버 기반 푸시 알림은 Android에서 지원합니다.

## 클라우드 사용량

[Cloudscope Personal](https://checklendar-e5327.web.app)에서 Google Cloud와 Firebase의 서비스별 사용량, 무료 한도 사용률 및 활성화된 API를 확인할 수 있습니다. 실제 프로젝트 데이터는 승인된 Google 계정으로 로그인해야 조회할 수 있습니다.

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

## Play 업데이트 및 운영 참고 문서

- 개인정보처리방침: [공개 HTTPS 페이지](https://gist.github.com/weri200/2c304c60607d5cafc3e89f7bf5ca2137)
- 데이터 보안 작성안: [`../PLAY_DATA_SAFETY.md`](../PLAY_DATA_SAFETY.md)
- 업데이트 검증 및 App Check 설정 참고: [`../PLAY_RELEASE_CHECKLIST.md`](../PLAY_RELEASE_CHECKLIST.md)
