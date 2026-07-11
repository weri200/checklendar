# Cloud Run, Cloud Scheduler, Cloud Tasks 배포

## 구성

- Cloud Scheduler는 매일 자정에 당일 알림을 준비합니다.
- Cloud Tasks는 각 알림 시각에 Cloud Run을 호출합니다.
- 당일 일정 등록 및 변경은 일정 동기화 직후 새로운 Cloud Task를 만듭니다.
- 삭제되거나 변경된 이전 작업은 실행 시 문서 버전을 확인하고 발송을 건너뜁니다.
- Expo 영수증 확인도 발송 15분 후 Cloud Task로 실행됩니다.

## API 활성화

```bash
gcloud services enable \
  run.googleapis.com \
  cloudscheduler.googleapis.com \
  cloudtasks.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com
```

## Cloud Tasks 큐 생성

```bash
gcloud tasks queues create checklendar-notifications \
  --location=asia-northeast3 \
  --max-dispatches-per-second=100 \
  --max-concurrent-dispatches=20
```

## Cloud Run 배포

아래 값은 실제 프로젝트 ID, 서비스 계정, 내부 비밀키로 교체합니다. 첫 배포에서는 아직 서비스 URL을 모르므로 기본 환경변수만 전달합니다.

```bash
gcloud run deploy checklendar-api \
  --source ./server \
  --region=asia-northeast3 \
  --allow-unauthenticated \
  --min-instances=0 \
  --max-instances=2 \
  --service-account=checklendar-server@PROJECT_ID.iam.gserviceaccount.com \
  --set-env-vars=CLOUD_TASKS_PROJECT_ID=PROJECT_ID,CLOUD_TASKS_LOCATION=asia-northeast3,CLOUD_TASKS_QUEUE=checklendar-notifications,NOTIFICATION_TIMEZONE=Asia/Seoul
```

배포 후 생성된 URL을 확인하고 Cloud Tasks용 환경변수를 추가합니다.

```bash
CLOUD_RUN_URL=$(gcloud run services describe checklendar-api \
  --region=asia-northeast3 \
  --format='value(status.url)')

gcloud run services update checklendar-api \
  --region=asia-northeast3 \
  --update-env-vars=CLOUD_RUN_SERVICE_URL=$CLOUD_RUN_URL,INTERNAL_API_SECRET=LONG_RANDOM_SECRET
```

Cloud Run 서비스 계정에는 Firestore 사용 권한과 Cloud Tasks 생성 권한이 필요합니다.

```bash
gcloud projects add-iam-policy-binding PROJECT_ID \
  --member=serviceAccount:checklendar-server@PROJECT_ID.iam.gserviceaccount.com \
  --role=roles/datastore.user

gcloud projects add-iam-policy-binding PROJECT_ID \
  --member=serviceAccount:checklendar-server@PROJECT_ID.iam.gserviceaccount.com \
  --role=roles/cloudtasks.enqueuer
```

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

## 수동 확인

```bash
gcloud scheduler jobs run checklendar-daily-notifications \
  --location=asia-northeast3

gcloud run services logs read checklendar-api \
  --region=asia-northeast3 \
  --limit=100
```

Cloud Tasks 환경변수가 모두 설정되지 않은 로컬 환경에서는 기존 1분 폴링 방식이 자동으로 사용됩니다.
