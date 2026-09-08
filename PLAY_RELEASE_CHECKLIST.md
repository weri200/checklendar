# Checklendar Play 업데이트 및 운영 체크리스트

Android 앱은 배포되어 운영 중입니다. 이 문서는 후속 업데이트 검증과 배포 설정을 확인할 때 사용합니다.

## 업데이트 검증

- Android 버전명과 버전 코드를 확인하고 EAS production 프로필로 AAB를 빌드합니다.
- 내부 테스트에서 일정 등록·수정·삭제·완료 처리와 상세 팝업을 확인합니다.
- 공휴일 조회, 알림 등록·수신, 알림 해제 후 서버 토큰·예약 삭제를 확인합니다.
- 업데이트 배포 후 FCM·Cloud Tasks 실패 로그와 클라우드 사용량을 확인합니다.

## Play App Signing 및 Firebase App Check 설정 참고

아래는 초기 설정 절차입니다. 앱 서명이나 Firebase 연결을 변경할 때 참고합니다.

1. EAS production 프로필로 서명된 AAB를 빌드합니다.
   - `eas build --platform android --profile production`
2. Play Console에서 앱 번들을 내부 테스트 트랙에 업로드하고 Play App Signing을 활성화합니다.
3. Play Console의 Play 앱 서명 화면에서 **앱 서명 키 인증서**의 SHA-256을 복사합니다. 업로드 키 인증서가 아닙니다.
4. Play Console의 Play Integrity API에서 Firebase 프로젝트 `checklendar-e5327`을 연결합니다.
5. Firebase Console `App Check > 앱 > com.weri_200.checklendar`에서 Play Integrity 공급자를 선택하고 3번의 SHA-256을 등록합니다.
6. 처음에는 App Check 측정항목을 확인한 뒤 강제 적용하고, Play 내부 테스트에서 설치한 앱으로 다음을 확인합니다.
   - 공휴일 API 정상 조회
   - 알림 켜기 및 권한 허용
   - FCM 토큰 등록과 알림 예약
   - 실제 알림 수신
   - 알림 끄기 후 서버 토큰·예약 삭제

## Play Console 개인정보 항목

SDK, 수집 데이터 또는 개인정보처리방침이 변경되면 아래 항목을 검토하고 갱신합니다.

1. 공개된 [Checklendar 개인정보처리방침](https://gist.github.com/weri200/2c304c60607d5cafc3e89f7bf5ca2137)을 Play Console의 개인정보처리방침 URL에 입력합니다.
2. `PLAY_DATA_SAFETY.md`의 작성안을 실제 Play Console 문항과 대조하여 제출합니다.
3. 스토어 등록정보의 개발자 이메일이 실제 문의 수신 가능한 주소인지 확인합니다.
