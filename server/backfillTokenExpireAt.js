const admin = require('firebase-admin');
const { TOKEN_TTL_MS } = require('./deviceRegistration');
require('dotenv').config();

const BATCH_SIZE = 400;

// 마지막 갱신 시각부터 TTL을 계산해 오래 동기화하지 않은 토큰은 TTL을 켜면 바로 정리되게 합니다.
const getBackfillExpireAtMs = (data, nowMs) => {
  const updatedAtMs = data.updatedAt?.toMillis?.() ?? nowMs;
  return updatedAtMs + TOKEN_TTL_MS;
};

// expireAt 도입 전에 만든 pushTokens 문서에 한 번만 expireAt을 채웁니다.
// 기본은 확인만 하고, --apply를 붙이면 Firestore에 기록합니다.
const main = async () => {
  const apply = process.argv.includes('--apply');
  admin.initializeApp({ credential: admin.credential.applicationDefault() });
  const db = admin.firestore();
  const nowMs = Date.now();

  // Firestore는 필드가 없는 문서만 조회할 수 없어 전체를 읽습니다. 활성 기기는 최대 100대 수준입니다.
  const snapshot = await db.collection('pushTokens').get();
  const targets = snapshot.docs.filter(document => !document.data().expireAt);
  const alreadyExpired = targets.filter(
    document => getBackfillExpireAtMs(document.data(), nowMs) <= nowMs,
  ).length;

  console.log(`전체 ${snapshot.size}건, expireAt 없음 ${targets.length}건 (TTL을 켜면 바로 삭제 대상 ${alreadyExpired}건)`);
  if (!apply) {
    console.log('확인만 했습니다. 기록하려면 --apply를 붙여 다시 실행합니다.');
    return;
  }

  for (let index = 0; index < targets.length; index += BATCH_SIZE) {
    const batch = db.batch();
    targets.slice(index, index + BATCH_SIZE).forEach(document => {
      batch.update(document.ref, {
        expireAt: admin.firestore.Timestamp.fromMillis(getBackfillExpireAtMs(document.data(), nowMs)),
      });
    });
    await batch.commit();
  }
  console.log(`expireAt ${targets.length}건 기록 완료`);
};

if (require.main === module) {
  main().catch(error => {
    console.error('expireAt 채우기 실패:', error);
    process.exitCode = 1;
  });
}

module.exports = { getBackfillExpireAtMs };
