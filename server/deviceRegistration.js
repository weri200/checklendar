const createDeviceRegistrationManager = ({
  db,
  tokenCollection,
  scheduleCollection,
  maskToken,
  logger = console,
}) => {
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
    deleteDeviceRegistration,
    markDeviceInactive: deleteDeviceRegistration,
  };
};

module.exports = { createDeviceRegistrationManager };
