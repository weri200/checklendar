const ACTIVE_DEVICE_LIMIT_REACHED = 'ACTIVE_DEVICE_LIMIT_REACHED';
// 앱을 지운 기기의 토큰이 활성 기기 상한을 계속 차지하지 않도록 Firestore TTL로 만료시킵니다.
const TOKEN_TTL_MS = 60 * 24 * 60 * 60 * 1000;

const createDeviceRegistrationManager = ({
  db,
  tokenCollection,
  scheduleCollection,
  maskToken,
  maxActiveDevices,
  logger = console,
}) => {
  const deleteSchedulesForToken = async token => {
    const scheduleSnapshot = await scheduleCollection.where('token', '==', token).get();
    const batch = db.batch();

    scheduleSnapshot.forEach(document => batch.delete(document.ref));
    await batch.commit();
    return scheduleSnapshot.size;
  };

  // 활성 토큰 조회와 새 토큰 저장을 같은 트랜잭션에서 처리해 동시 등록도 상한을 넘지 않게 합니다.
  const registerDevice = async ({ token, previousToken, data }) => {
    const tokenReference = tokenCollection.doc(token);
    const previousTokenReference = previousToken && previousToken !== token
      ? tokenCollection.doc(previousToken)
      : null;
    const activeTokenQuery = tokenCollection
      .where('active', '==', true)
      .limit(maxActiveDevices);

    await db.runTransaction(async transaction => {
      const tokenSnapshot = await transaction.get(tokenReference);
      const previousTokenSnapshot = previousTokenReference
        ? await transaction.get(previousTokenReference)
        : null;
      const activeTokenSnapshot = await transaction.get(activeTokenQuery);
      const tokenIsActive = tokenSnapshot.exists && tokenSnapshot.data().active === true;
      const previousTokenIsActive = previousTokenSnapshot?.exists
        && previousTokenSnapshot.data().active === true;

      if (
        !tokenIsActive
        && activeTokenSnapshot.size >= maxActiveDevices
        && !previousTokenIsActive
      ) {
        const error = new Error(`활성 알림 기기는 최대 ${maxActiveDevices}대까지 등록할 수 있습니다.`);
        error.code = ACTIVE_DEVICE_LIMIT_REACHED;
        throw error;
      }

      transaction.set(tokenReference, data, { merge: true });
      // FCM 토큰 갱신은 기존 기기 한 대를 교체하는 것이므로 상한에 도달해도 허용합니다.
      if (previousTokenSnapshot?.exists) transaction.delete(previousTokenReference);
    });

    // 이전 토큰 문서는 트랜잭션에서 제거하고, 연결된 예약은 별도 배치로 정리합니다.
    if (previousTokenReference) {
      const deletedScheduleCount = await deleteSchedulesForToken(previousToken);
      if (deletedScheduleCount > 0) {
        logger.log(`[이전 토큰 정리] ${maskToken(previousToken)}, 예약 ${deletedScheduleCount}건 삭제`);
      }
    }
  };

  // 토큰과 해당 토큰의 남은 예약을 원자적 배치로 함께 제거합니다.
  const deleteDeviceRegistration = async token => {
    const scheduleSnapshot = await scheduleCollection.where('token', '==', token).get();
    const batch = db.batch();

    batch.delete(tokenCollection.doc(token));
    scheduleSnapshot.forEach(document => batch.delete(document.ref));
    await batch.commit();
    logger.log(`[토큰 삭제] ${maskToken(token)}, 예약 ${scheduleSnapshot.size}건 삭제`);
  };

  return {
    registerDevice,
    deleteDeviceRegistration,
    markDeviceInactive: deleteDeviceRegistration,
  };
};

module.exports = {
  ACTIVE_DEVICE_LIMIT_REACHED,
  TOKEN_TTL_MS,
  createDeviceRegistrationManager,
};
