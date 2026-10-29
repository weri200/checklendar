# Cloud Run, Cloud Scheduler, Cloud Tasks 배포

## 구성

- Cloud Scheduler는 매일 자정에 당일 알림을 준비합니다.
- Cloud Tasks는 각 알림 시각에 Cloud Run을 호출합니다.
- 당일 일정 등록 및 변경은 일정 동기화 직후 새로운 Cloud Task를 만듭니다.
- 삭제되거나 변경된 이전 작업은 실행 시 문서 버전을 확인하고 발송을 건너뜁니다.
- Cloud Run은 Firebase Admin SDK를 사용해 FCM으로 직접 발송합니다.
- 공개 `/api` 경로는 Firebase App Check 토큰과 서버 요청 제한으로 보호합니다.
- Cloud Run 인스턴스와 Cloud Tasks 처리량을 제한해 비정상 트래픽의 비용 상한을 낮춥니다.

## API 활성화

```bash
gcloud services enable \
  run.googleapis.com \
  cloudscheduler.googleapis.com \
  cloudtasks.googleapis.com \
  firebaseappcheck.googleapis.com \
  fcm.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com
```

## Cloud Tasks 큐 생성

```bash
gcloud tasks queues create checklendar-notifications \
  --location=asia-northeast3 \
  --max-dispatches-per-second=5 \
  --max-concurrent-dispatches=2 \
  --max-attempts=5 \
  --min-backoff=5s \
  --max-backoff=300s
```

## Cloud Run 배포

아래 값은 실제 프로젝트 ID, 서비스 계정, 내부 비밀키로 교체합니다. 첫 배포에서는 아직 서비스 URL을 모르므로 기본 환경변수만 전달합니다.

```bash
gcloud run deploy checklendar-api \
  --source ./server \
  --region=asia-northeast3 \
  --allow-unauthenticated \
  --min-instances=0 \
  --max-instances=3 \
  --service-account=checklendar-server@PROJECT_ID.iam.gserviceaccount.com \
  --set-env-vars=CLOUD_TASKS_PROJECT_ID=PROJECT_ID,CLOUD_TASKS_LOCATION=asia-northeast3,CLOUD_TASKS_QUEUE=checklendar-notifications,NOTIFICATION_TIMEZONE=Asia/Seoul,FIREBASE_ANDROID_APP_ID=FIREBASE_APP_ID,APP_CHECK_ENFORCEMENT=enforce,MAX_ACTIVE_NOTIFICATION_DEVICES=100
```

배포 후 생성된 URL을 확인하고 Cloud Tasks용 환경변수를 추가합니다.

```bash
CLOUD_RUN_URL=$(gcloud run services describe checklendar-api \
  --region=asia-northeast3 \
  --format='value(status.url)')

gcloud run services update checklendar-api \
  --region=asia-northeast3 \
  --update-env-vars=CLOUD_RUN_SERVICE_URL=$CLOUD_RUN_URL,INTERNAL_API_SECRET=LONG_RANDOM_SECRET \
  --update-secrets=PUBLIC_DATA_SERVICE_KEY=public-data-service-key:latest
```

`public-data-service-key`에는 공공데이터포털의 일반 인증키(Decoding)를 저장하는 것을
권장합니다. 서버는 Encoding 인증키도 한 번 디코딩한 뒤 요청하므로 두 형식을 모두
지원합니다. Secret 값을 갱신한 경우 새 버전을 만든 뒤 Cloud Run에 새 Revision을
배포해야 `latest` 값이 반영됩니다.

Cloud Run 서비스 계정에는 Firestore 사용, Cloud Tasks 생성, FCM 발송 권한이 필요합니다.

```bash
gcloud projects add-iam-policy-binding PROJECT_ID \
  --member=serviceAccount:checklendar-server@PROJECT_ID.iam.gserviceaccount.com \
  --role=roles/datastore.user

gcloud projects add-iam-policy-binding PROJECT_ID \
  --member=serviceAccount:checklendar-server@PROJECT_ID.iam.gserviceaccount.com \
  --role=roles/cloudtasks.enqueuer

gcloud projects add-iam-policy-binding PROJECT_ID \
  --member=serviceAccount:checklendar-server@PROJECT_ID.iam.gserviceaccount.com \
  --role=roles/firebasecloudmessaging.admin

gcloud projects add-iam-policy-binding PROJECT_ID \
  --member=serviceAccount:checklendar-server@PROJECT_ID.iam.gserviceaccount.com \
  --role=roles/firebaseappcheck.tokenVerifier
```

### Artifact Registry 이미지 자동 정리

소스 배포 때 생성되는 컨테이너 이미지가 계속 누적되지 않도록 최신 5개 이미지는
보존하고, 생성 후 1일이 지난 나머지 이미지는 자동 삭제합니다.

먼저 dry-run으로 정책을 검증합니다.

```bash
gcloud artifacts repositories set-cleanup-policies cloud-run-source-deploy \
  --project=checklendar-e5327 \
  --location=asia-northeast3 \
  --policy=server/artifact-cleanup-policy.json \
  --dry-run
```

검증 후 실제 정리를 활성화합니다.

```bash
gcloud artifacts repositories set-cleanup-policies cloud-run-source-deploy \
  --project=checklendar-e5327 \
  --location=asia-northeast3 \
  --policy=server/artifact-cleanup-policy.json \
  --no-dry-run
```

Artifact Registry의 백그라운드 작업이 정책을 적용하므로 실제 용량 감소까지 하루 정도
걸릴 수 있습니다.

Firebase Console의 App Check에서 Android 앱을 Play Integrity 공급자로 등록하고 릴리스 서명 인증서의 SHA-256을 추가합니다. 개발 APK는 별도의 디버그 토큰을 등록해 사용하며, 실제 토큰은 `.env.local`에만 저장합니다. 기존 앱에서 점진적으로 전환할 때는 `APP_CHECK_ENFORCEMENT=monitor`로 검증 로그를 확인한 다음 `enforce`로 바꿉니다.

## 자정 Scheduler 생성

```bash
gcloud scheduler jobs create http checklendar-daily-notifications \
  --location=asia-northeast3 \
  --schedule="0 0 * * *" \
  --time-zone=Asia/Seoul \
  --uri=CLOUD_RUN_URL/internal/prepare-daily-notifications \
  --http-method=POST \
  --headers=x-internal-secret=LONG_RANDOM_SECRET
```

## 기기 토큰 TTL

서버는 토큰 등록·예약 동기화 때 `pushTokens` 문서의 `expireAt`을 60일 뒤로 갱신합니다.
앱을 삭제해 더 이상 동기화하지 않는 기기의 토큰이 활성 기기 상한을 계속 차지하지 않도록
Firestore TTL 정책을 켭니다. 만료된 문서는 보통 24시간 안에 삭제되며, 남은 예약은 발송 시점에
토큰이 없음을 확인하고 삭제됩니다. 삭제된 기기가 다시 앱을 열면 앱이 토큰을 다시 등록합니다.

```bash
gcloud firestore fields ttls update expireAt \
  --collection-group=pushTokens \
  --enable-ttl \
  --project=checklendar-e5327
```

`expireAt`이 없는 기존 문서는 TTL 대상이 아니므로, 해당 기기가 다음에 동기화할 때 값이 채워집니다.

## 수동 확인

```bash
gcloud scheduler jobs run checklendar-daily-notifications \
  --location=asia-northeast3

gcloud run services logs read checklendar-api \
  --region=asia-northeast3 \
  --limit=100
```

Cloud Tasks 환경변수가 모두 설정되지 않은 로컬 환경에서는 기존 1분 폴링 방식이 자동으로 사용됩니다.
