#!/bin/bash

echo "🚀 빌드 프로세스를 시작합니다..."

# 1. app.json에서 현재 버전 문자열 추출 (파일명용)
VERSION=$(node -p "require('./app.json').expo.version")

# 2. app.json의 versionCode를 자동으로 1 올리는 핵심 로직
NEW_VC=$(node -e "
const fs = require('fs');
const app = require('./app.json');

// android 설정이 없으면 생성
if (!app.expo.android) app.expo.android = {};

// 현재 versionCode에 1을 더함 (없으면 1로 시작)
const currentVC = app.expo.android.versionCode || 0;
const nextVC = currentVC + 1;
app.expo.android.versionCode = nextVC;

// 변경된 내용을 파일에 다시 저장
fs.writeFileSync('./app.json', JSON.stringify(app, null, 2) + '\n');
console.log(nextVC);
")

echo "🔢 버전 코드 업데이트 완료: $NEW_VC"

# 3. 저장할 경로와 파일 이름 설정
OUTPUT_PATH="/mnt/c/Ckecklendar/Builds/Checklendar_v${VERSION}.aab"
echo "📍 저장 위치: ${OUTPUT_PATH}"

# 4. EAS 로컬 빌드 실행
eas build --platform android --profile production --local --output "$OUTPUT_PATH"

echo "✅ 빌드가 완료되었습니다! 지정 폴더를 확인하세요."