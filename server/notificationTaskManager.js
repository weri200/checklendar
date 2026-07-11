const crypto = require('crypto');
const { CloudTasksClient } = require('@google-cloud/tasks');
const { DateTime } = require('luxon');

const RECEIPT_CHECK_DELAY_MS = 15 * 60 * 1000;
const RECEIPT_RETENTION_MS = 24 * 60 * 60 * 1000;

const createNotificationTaskManager = ({
  admin,
  db,
  expo,
  scheduleCollection,
  receiptCollection,
  tokenCollection,
  claimNotification,
  markDeviceInactive,
}) => {
  const projectId = process.env.CLOUD_TASKS_PROJECT_ID
    || process.env.GOOGLE_CLOUD_PROJECT
    || process.env.GCLOUD_PROJECT;
  const location = process.env.CLOUD_TASKS_LOCATION;
  const queueName = process.env.CLOUD_TASKS_QUEUE;
  const serviceUrl = process.env.CLOUD_RUN_SERVICE_URL?.replace(/\/+$/, '');
  const internalSecret = process.env.INTERNAL_API_SECRET;
  const timezone = process.env.NOTIFICATION_TIMEZONE || 'Asia/Seoul';
  const oidcServiceAccountEmail = process.env.CLOUD_TASKS_SERVICE_ACCOUNT_EMAIL;
  const enabled = Boolean(projectId && location && queueName && serviceUrl && internalSecret);
  const client = enabled ? new CloudTasksClient() : null;
  const parent = enabled ? client.queuePath(projectId, location, queueName) : null;

  const verifyInternalRequest = (req, res, next) => {
    if (!enabled) {
      return res.status(503).json({
        success: false,
        message: 'Cloud Tasks 환경변수가 설정되지 않았습니다.',
      });
    }

    const providedSecret = req.get('x-internal-secret') || '';
    const expected = Buffer.from(internalSecret);
    const provided = Buffer.from(providedSecret);
    if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) {
      return res.status(401).json({ success: false, message: '인증되지 않은 요청입니다.' });
    }

    return next();
  };

  const createHttpTask = async ({ id, path, payload, scheduleAt }) => {
    if (!enabled) return false;

    const task = {
      name: client.taskPath(projectId, location, queueName, id),
      scheduleTime: {
        seconds: Math.floor(scheduleAt.getTime() / 1000),
      },
      httpRequest: {
        httpMethod: 'POST',
        url: `${serviceUrl}${path}`,
        headers: {
          'Content-Type': 'application/json',
          'x-internal-secret': internalSecret,
        },
        body: Buffer.from(JSON.stringify(payload)),
      },
    };

    if (oidcServiceAccountEmail) {
      task.httpRequest.oidcToken = {
        serviceAccountEmail: oidcServiceAccountEmail,
        audience: serviceUrl,
      };
    }

    try {
      await client.createTask({ parent, task });
      return true;
    } catch (error) {
      if (error.code === 6 || String(error.message).includes('ALREADY_EXISTS')) return true;
      throw error;
    }
  };

  const isToday = date => {
    const scheduledDay = DateTime.fromJSDate(date).setZone(timezone);
    const today = DateTime.now().setZone(timezone);
    return scheduledDay.hasSame(today, 'day');
  };

  const createStoredScheduleVersion = data => {
    const scheduledAt = data.scheduledAt?.toDate?.();
    if (!scheduledAt) return null;

    return crypto.createHash('sha256').update(JSON.stringify({
      scheduledAt: scheduledAt.toISOString(),
      title: data.title,
      body: data.body,
    })).digest('hex').slice(0, 16);
  };

  const queueSchedule = async (scheduleId, data) => {
    const scheduledAt = data.scheduledAt?.toDate?.() || data.scheduledAt;
    if (
      data.status !== 'pending'
      || !data.version
      || !(scheduledAt instanceof Date)
      || scheduledAt.getTime() <= Date.now()
      || !isToday(scheduledAt)
    ) {
      return false;
    }

    const taskId = `notification-${scheduleId}-${data.version}`;
    return createHttpTask({
      id: taskId,
      path: '/internal/send-notification',
      payload: {
        scheduleId,
        version: data.version,
      },
      scheduleAt: scheduledAt,
    });
  };

  const queueScheduleSnapshot = async snapshot => {
    if (!snapshot.exists) return false;

    let data = snapshot.data();
    if (!data.version) {
      const version = createStoredScheduleVersion(data);
      if (!version) return false;

      await snapshot.ref.update({
        version,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      data = { ...data, version };
    }

    return queueSchedule(snapshot.id, data);
  };

  const queueSchedules = async schedules => {
    if (!enabled || schedules.length === 0) return 0;

    let queuedCount = 0;
    for (const schedule of schedules) {
      if (await queueSchedule(schedule.id, schedule)) queuedCount += 1;
    }
    return queuedCount;
  };

  const queueReceiptCheck = async (receiptId, scheduleAt) => {
    const taskTime = new Date(Math.max(scheduleAt.getTime(), Date.now() + 1000));
    const timeKey = Math.floor(taskTime.getTime() / 1000);
    const receiptKey = crypto.createHash('sha256').update(receiptId).digest('hex').slice(0, 24);

    return createHttpTask({
      id: `receipt-${receiptKey}-${timeKey}`,
      path: '/internal/check-push-receipt',
      payload: { receiptId },
      scheduleAt: taskTime,
    });
  };

  const prepareDailyNotifications = async () => {
    const day = DateTime.now().setZone(timezone);
    const start = admin.firestore.Timestamp.fromDate(day.startOf('day').toJSDate());
    const end = admin.firestore.Timestamp.fromDate(day.plus({ days: 1 }).startOf('day').toJSDate());
    const scheduleSnapshot = await scheduleCollection
      .where('scheduledAt', '>=', start)
      .where('scheduledAt', '<', end)
      .get();

    let queuedNotifications = 0;
    for (const snapshot of scheduleSnapshot.docs) {
      if (await queueScheduleSnapshot(snapshot)) queuedNotifications += 1;
    }

    const now = admin.firestore.Timestamp.now();
    const receiptSnapshot = await receiptCollection.where('expiresAt', '>', now).get();
    let queuedReceipts = 0;
    for (const snapshot of receiptSnapshot.docs) {
      const data = snapshot.data();
      const nextCheckAt = data.nextCheckAt?.toDate?.();
      if (nextCheckAt && await queueReceiptCheck(snapshot.id, nextCheckAt)) {
        queuedReceipts += 1;
      }
    }

    return {
      date: day.toISODate(),
      timezone,
      queuedNotifications,
      queuedReceipts,
    };
  };

  const queueExistingReceipt = async scheduleData => {
    const receiptId = scheduleData.receiptId;
    const nextCheckAt = scheduleData.nextReceiptCheckAt?.toDate?.();
    if (!receiptId || !nextCheckAt) return false;
    return queueReceiptCheck(receiptId, nextCheckAt);
  };

  const sendScheduledNotification = async (scheduleId, version) => {
    const document = scheduleCollection.doc(scheduleId);
    const initialSnapshot = await document.get();
    if (!initialSnapshot.exists) return { skipped: true, reason: 'deleted' };

    const initialData = initialSnapshot.data();
    if (initialData.version !== version) {
      return { skipped: true, reason: 'changed' };
    }
    if (initialData.status === 'ticketed') {
      await queueExistingReceipt(initialData);
      return { skipped: true, reason: 'already-ticketed' };
    }

    const tokenSnapshot = await tokenCollection.doc(initialData.token).get();
    if (!tokenSnapshot.exists || tokenSnapshot.data().active === false) {
      await document.delete();
      return { skipped: true, reason: 'inactive-token' };
    }

    const notification = await claimNotification({ ref: document }, version);
    if (!notification) return { skipped: true, reason: 'already-claimed' };

    let ticket;
    try {
      [ticket] = await expo.sendPushNotificationsAsync([{
        to: notification.token,
        sound: 'default',
        title: notification.title,
        body: notification.body,
        data: { notificationId: notification.notificationId },
      }]);
    } catch (error) {
      await document.update({
        status: 'pending',
        lastError: String(error),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      throw error;
    }

    if (ticket.status === 'error') {
      console.error('Expo 푸시 발송 실패:', ticket.message, ticket.details);
      if (ticket.details?.error === 'DeviceNotRegistered') {
        await markDeviceInactive(notification.token);
      } else {
        await document.delete();
      }
      return { sent: false, error: ticket.details?.error || 'ExpoError' };
    }

    const sentAt = Date.now();
    const nextReceiptCheckAt = new Date(sentAt + RECEIPT_CHECK_DELAY_MS);
    const expiresAt = new Date(sentAt + RECEIPT_RETENTION_MS);
    const batch = db.batch();

    batch.set(receiptCollection.doc(ticket.id), {
      receiptId: ticket.id,
      scheduleId,
      version,
      token: notification.token,
      attempts: 0,
      nextCheckAt: admin.firestore.Timestamp.fromDate(nextReceiptCheckAt),
      expiresAt: admin.firestore.Timestamp.fromDate(expiresAt),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    batch.update(document, {
      status: 'ticketed',
      receiptId: ticket.id,
      nextReceiptCheckAt: admin.firestore.Timestamp.fromDate(nextReceiptCheckAt),
      ticketedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    await batch.commit();

    await queueReceiptCheck(ticket.id, nextReceiptCheckAt);
    return { sent: true, receiptId: ticket.id };
  };

  const deleteReceiptAndSchedule = async (receiptDocument, receiptData) => {
    await db.runTransaction(async transaction => {
      const scheduleRef = receiptData.scheduleId
        ? scheduleCollection.doc(receiptData.scheduleId)
        : null;
      const scheduleSnapshot = scheduleRef ? await transaction.get(scheduleRef) : null;

      transaction.delete(receiptDocument);
      if (
        scheduleSnapshot?.exists
        && scheduleSnapshot.data().receiptId === receiptData.receiptId
      ) {
        transaction.delete(scheduleRef);
      }
    });
  };

  const checkPushReceipt = async receiptId => {
    const receiptDocument = receiptCollection.doc(receiptId);
    const receiptSnapshot = await receiptDocument.get();
    if (!receiptSnapshot.exists) return { skipped: true, reason: 'deleted' };

    const receiptData = receiptSnapshot.data();
    const expiresAt = receiptData.expiresAt?.toDate?.();
    if (!expiresAt || expiresAt.getTime() <= Date.now()) {
      await deleteReceiptAndSchedule(receiptDocument, receiptData);
      return { expired: true };
    }

    const receipts = await expo.getPushNotificationReceiptsAsync([receiptId]);
    const receipt = receipts[receiptId];

    if (!receipt) {
      const nextCheckAt = new Date(Date.now() + RECEIPT_CHECK_DELAY_MS);
      await queueReceiptCheck(receiptId, nextCheckAt);
      await receiptDocument.update({
        attempts: admin.firestore.FieldValue.increment(1),
        nextCheckAt: admin.firestore.Timestamp.fromDate(nextCheckAt),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return { pending: true };
    }

    if (receipt.status === 'error') {
      console.error('Expo 푸시 영수증 오류:', receipt.message, receipt.details);
      if (receipt.details?.error === 'DeviceNotRegistered' && receiptData.token) {
        await markDeviceInactive(receiptData.token);
      }
    }

    await deleteReceiptAndSchedule(receiptDocument, receiptData);
    return {
      completed: true,
      status: receipt.status,
      error: receipt.status === 'error' ? receipt.details?.error : undefined,
    };
  };

  const registerRoutes = app => {
    app.post(
      '/internal/prepare-daily-notifications',
      verifyInternalRequest,
      async (_req, res) => {
        try {
          const result = await prepareDailyNotifications();
          return res.json({ success: true, ...result });
        } catch (error) {
          console.error('당일 알림 작업 생성 실패:', error);
          return res.status(500).json({ success: false, message: '작업 생성에 실패했습니다.' });
        }
      },
    );

    app.post('/internal/send-notification', verifyInternalRequest, async (req, res) => {
      const { scheduleId, version } = req.body;
      if (typeof scheduleId !== 'string' || typeof version !== 'string') {
        return res.status(400).json({ success: false, message: '작업 정보가 올바르지 않습니다.' });
      }

      try {
        const result = await sendScheduledNotification(scheduleId, version);
        return res.json({ success: true, ...result });
      } catch (error) {
        console.error('Cloud Task 알림 발송 실패:', error);
        return res.status(500).json({ success: false, message: '알림 발송에 실패했습니다.' });
      }
    });

    app.post('/internal/check-push-receipt', verifyInternalRequest, async (req, res) => {
      const { receiptId } = req.body;
      if (typeof receiptId !== 'string') {
        return res.status(400).json({ success: false, message: '영수증 ID가 올바르지 않습니다.' });
      }

      try {
        const result = await checkPushReceipt(receiptId);
        return res.json({ success: true, ...result });
      } catch (error) {
        console.error('Cloud Task 영수증 확인 실패:', error);
        return res.status(500).json({ success: false, message: '영수증 확인에 실패했습니다.' });
      }
    });
  };

  return {
    enabled,
    queueSchedules,
    registerRoutes,
  };
};

module.exports = { createNotificationTaskManager };
