#!/bin/bash

# 1. package.json에서 버전 정보 추출
VERSION=$(node -p "require('./app.json').expo.version")

# 2. 저장할 경로와 파일 이름 설정 (윈도우 바탕화면 기준)
OUTPUT_PATH="/mnt/c/Ckecklendar/Builds/Checklendar_v${VERSION}.aab"

echo "🚀 Checklendar v${VERSION} 빌드를 시작합니다..."
echo "📍 저장 위치: ${OUTPUT_PATH}"

# 3. EAS 로컬 빌드 실행
eas build --platform android --profile production --local --output "$OUTPUT_PATH"

echo "✅ 빌드가 완료되었습니다!"
