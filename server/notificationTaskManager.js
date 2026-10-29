const crypto = require('crypto');
const { CloudTasksClient } = require('@google-cloud/tasks');
const { DateTime } = require('luxon');

const LATE_QUEUE_GRACE_MS = 15 * 60 * 1000;

const createNotificationTaskManager = ({
  admin,
  messaging,
  scheduleCollection,
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
      // 자정 준비 호출이 몇 초 늦어도 00:00 예약이 빠지지 않도록 최근에 지난 예약도 등록합니다.
      || scheduledAt.getTime() <= Date.now() - LATE_QUEUE_GRACE_MS
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

    // 한 기기당 최대 30건이므로 독립적인 Cloud Tasks 요청을 함께 보내도 범위가 제한됩니다.
    const queued = await Promise.all(
      schedules.map(schedule => queueSchedule(schedule.id, schedule)),
    );
    return queued.filter(Boolean).length;
  };

  const prepareDailyNotifications = async () => {
    const day = DateTime.now().setZone(timezone);
    const start = admin.firestore.Timestamp.fromDate(day.startOf('day').toJSDate());
    const end = admin.firestore.Timestamp.fromDate(day.plus({ days: 1 }).startOf('day').toJSDate());
    const scheduleSnapshot = await scheduleCollection
      .where('scheduledAt', '>=', start)
      .where('scheduledAt', '<', end)
      .get();

    // 전체 기기 예약은 많을 수 있어 100건씩 병렬 처리해 API 호출 폭주를 막습니다.
    const queued = [];
    for (let index = 0; index < scheduleSnapshot.docs.length; index += 100) {
      const batch = scheduleSnapshot.docs.slice(index, index + 100);
      queued.push(...await Promise.all(batch.map(queueScheduleSnapshot)));
    }

    return {
      date: day.toISODate(),
      timezone,
      queuedNotifications: queued.filter(Boolean).length,
    };
  };

  const sendScheduledNotification = async (scheduleId, version) => {
    const document = scheduleCollection.doc(scheduleId);
    const initialSnapshot = await document.get();
    if (!initialSnapshot.exists) return { skipped: true, reason: 'deleted' };

    const initialData = initialSnapshot.data();
    if (initialData.version !== version) {
      return { skipped: true, reason: 'changed' };
    }
    const tokenSnapshot = await tokenCollection.doc(initialData.token).get();
    if (!tokenSnapshot.exists || tokenSnapshot.data().active === false) {
      await document.delete();
      return { skipped: true, reason: 'inactive-token' };
    }

    const notification = await claimNotification({ ref: document }, version);
    if (!notification) return { skipped: true, reason: 'already-claimed' };

    try {
      const messageId = await messaging.send({
        token: notification.token,
        notification: {
          title: notification.title,
          body: notification.body,
        },
        data: { notificationId: notification.notificationId },
        android: {
          priority: 'high',
          notification: {
            channelId: 'default',
            sound: 'default',
          },
        },
      });
      await document.delete();
      return { sent: true, messageId };
    } catch (error) {
      const invalidToken = [
        'messaging/registration-token-not-registered',
        'messaging/invalid-registration-token',
      ].includes(error?.code);
      if (invalidToken) {
        await markDeviceInactive(notification.token);
        return { sent: false, error: error.code };
      }

      await document.update({
        status: 'pending',
        lastError: String(error),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      throw error;
    }
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

  };

  return {
    enabled,
    queueSchedules,
    registerRoutes,
  };
};

module.exports = { createNotificationTaskManager };
