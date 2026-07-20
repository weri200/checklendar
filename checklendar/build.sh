#!/bin/bash

set -euo pipefail

# ./build.sh 로 실행.

echo "🚀 빌드 프로세스를 시작합니다..."

# 버전 코드 올리는 복잡한 노드 로직은 삭제해도 됩니다!
VERSION=$(node -p "require('./app.json').expo.version")
VERSION_CODE=$(node -p "require('./app.json').expo.android.versionCode")
NATIVE_VERSION=$(sed -n 's/^[[:space:]]*versionName "\([^"]*\)"/\1/p' android/app/build.gradle | head -n 1)
NATIVE_VERSION_CODE=$(sed -n 's/^[[:space:]]*versionCode \([0-9][0-9]*\)/\1/p' android/app/build.gradle | head -n 1)

if [[ "$VERSION" != "$NATIVE_VERSION" || "$VERSION_CODE" != "$NATIVE_VERSION_CODE" ]]; then
  echo "❌ app.json과 build.gradle의 버전이 일치하지 않습니다." >&2
  echo "   app.json: ${VERSION} (${VERSION_CODE})" >&2
  echo "   build.gradle: ${NATIVE_VERSION} (${NATIVE_VERSION_CODE})" >&2
  exit 1
fi

if [[ -z "${ANDROID_HOME:-}" ]]; then
  ANDROID_HOME=$(sed -n 's/^sdk.dir=//p' android/local.properties | tail -n 1)
  export ANDROID_HOME
fi

if [[ -z "${ANDROID_HOME:-}" || ! -d "$ANDROID_HOME" ]]; then
  echo "❌ Android SDK 경로를 찾을 수 없습니다: ${ANDROID_HOME:-미설정}" >&2
  exit 1
fi

export ANDROID_SDK_ROOT="${ANDROID_SDK_ROOT:-$ANDROID_HOME}"

echo "🚀 v${VERSION} (${VERSION_CODE}) 빌드를 시작합니다. (버전 코드는 저장소에서 수동 관리합니다)"

OUTPUT_PATH="/mnt/c/Checklendar/Builds/Checklendar_v${VERSION}.aab"
mkdir -p "$(dirname "$OUTPUT_PATH")"

# eas build 실행 (자동 관리 옵션이 켜져 있다면 그대로 진행).
eas build --platform android --profile production --local --output "$OUTPUT_PATH"

echo "✅ 빌드 완료! 파일명: Checklendar_v${VERSION}.aab"
