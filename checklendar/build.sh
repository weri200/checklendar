#!/bin/bash

# ./build.sh 로 실행

echo "🚀 빌드 프로세스를 시작합니다..."

# 버전 코드 올리는 복잡한 노드 로직은 삭제해도 됩니다!
VERSION=$(node -p "require('./app.json').expo.version")

echo "🚀 v${VERSION} 빌드를 시작합니다. (버전 코드는 EAS가 관리합니다)"

OUTPUT_PATH="/mnt/c/Ckecklendar/Builds/Checklendar_v${VERSION}.aab"

# eas build 실행 (자동 관리 옵션이 켜져 있다면 그대로 진행)
eas build --platform android --profile production --local --output "$OUTPUT_PATH"

echo "✅ 빌드 완료! 파일명: Checklendar_v${VERSION}.aab"
