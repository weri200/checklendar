const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const { Expo } = require('expo-server-sdk');
const cron = require('node-cron');
const admin = require('firebase-admin');
require('dotenv').config();

const credential = process.env.GOOGLE_APPLICATION_CREDENTIALS
  ? admin.credential.applicationDefault()
  : admin.credential.cert(require('./firebase-service-account.json'));

admin.initializeApp({ credential });

const db = admin.firestore();
const app = express();
const expo = new Expo();
const PORT = Number(process.env.PORT) || 3000;
const MAX_NOTIFICATIONS_PER_DEVICE = 30;
const DUE_NOTIFICATION_LIMIT = 100;
const PROCESSING_LEASE_MS = 5 * 60 * 1000;

const tokenCollection = db.collection('pushTokens');
const scheduleCollection = db.collection('scheduledNotifications');

app.use(cors());
app.use(express.json({ limit: '256kb' }));

const maskToken = token => `${token.slice(0, 18)}...${token.slice(-6)}`;

const createScheduleId = (token, notificationId) => {
  return crypto.createHash('sha256').update(`${token}:${notificationId}`).digest('hex');
};

const validateToken = token => typeof token === 'string' && Expo.isExpoPushToken(token);

const normalizeNotifications = notifications => {
  if (!Array.isArray(notifications) || notifications.length > MAX_NOTIFICATIONS_PER_DEVICE) {
    throw new Error(`notifications는 최대 ${MAX_NOTIFICATIONS_PER_DEVICE}개 배열이어야 합니다.`);
  }

  const now = Date.now();
  return notifications.flatMap(notification => {
    if (!notification || typeof notification !== 'object') {
      throw new Error('알림 항목 형식이 올바르지 않습니다.');
    }

    const { id, scheduledAt, title, body } = notification;
    const scheduledDate = new Date(scheduledAt);
    if (typeof id !== 'string' || id.length === 0 || id.length > 100) {
      throw new Error('알림 id가 올바르지 않습니다.');
    }
    if (Number.isNaN(scheduledDate.getTime())) {
      throw new Error('scheduledAt이 올바른 ISO 날짜가 아닙니다.');
    }
    if (typeof title !== 'string' || title.length === 0 || title.length > 100) {
      throw new Error('알림 제목이 올바르지 않습니다.');
    }
    if (typeof body !== 'string' || body.length === 0 || body.length > 500) {
      throw new Error('알림 내용이 올바르지 않습니다.');
    }

    if (scheduledDate.getTime() <= now) return [];
    return [{ id, scheduledDate, title, body }];
  });
};

app.get('/health', (_req, res) => {
  res.json({ success: true });
});

app.post('/api/register-token', async (req, res) => {
  const { token } = req.body;
  if (!validateToken(token)) {
    return res.status(400).json({ success: false, message: '유효하지 않은 토큰입니다.' });
  }

  try {
    await tokenCollection.doc(token).set({
      token,
      active: true,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    console.log(`[토큰 등록] ${maskToken(token)}`);
    return res.json({ success: true });
  } catch (error) {
    console.error('토큰 저장 실패:', error);
    return res.status(500).json({ success: false, message: '토큰 저장에 실패했습니다.' });
  }
});

app.put('/api/notification-schedule', async (req, res) => {
  const { token, timezone, notifications } = req.body;
  if (!validateToken(token)) {
    return res.status(400).json({ success: false, message: '유효하지 않은 토큰입니다.' });
  }

  let normalizedNotifications;
  try {
    normalizedNotifications = normalizeNotifications(notifications);
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }

  try {
    const existingSnapshot = await scheduleCollection.where('token', '==', token).get();
    const nextDocumentIds = new Set(
      normalizedNotifications.map(notification => createScheduleId(token, notification.id)),
    );
    const batch = db.batch();

    existingSnapshot.forEach(document => {
      if (!nextDocumentIds.has(document.id)) batch.delete(document.ref);
    });

    normalizedNotifications.forEach(notification => {
      const documentId = createScheduleId(token, notification.id);
      batch.set(scheduleCollection.doc(documentId), {
        token,
        notificationId: notification.id,
        scheduledAt: admin.firestore.Timestamp.fromDate(notification.scheduledDate),
        title: notification.title,
        body: notification.body,
        status: 'pending',
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });

    batch.set(tokenCollection.doc(token), {
      token,
      active: true,
      timezone: typeof timezone === 'string' ? timezone.slice(0, 100) : null,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    await batch.commit();
    return res.json({ success: true, scheduledCount: normalizedNotifications.length });
  } catch (error) {
    console.error('알림 일정 저장 실패:', error);
    return res.status(500).json({ success: false, message: '알림 일정 저장에 실패했습니다.' });
  }
});

const claimNotification = async document => {
  return db.runTransaction(async transaction => {
    const snapshot = await transaction.get(document.ref);
    if (!snapshot.exists) return null;

    const data = snapshot.data();
    const claimedAt = data.claimedAt?.toDate?.();
    const processingIsStale = data.status === 'processing'
      && claimedAt
      && Date.now() - claimedAt.getTime() > PROCESSING_LEASE_MS;

    if (data.status !== 'pending' && !processingIsStale) return null;

    transaction.update(document.ref, {
      status: 'processing',
      claimedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return { ref: document.ref, ...data };
  });
};

const markDeviceInactive = async token => {
  await tokenCollection.doc(token).set({
    active: false,
    deactivatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
};

const sendDueNotifications = async () => {
  const dueSnapshot = await scheduleCollection
    .where('scheduledAt', '<=', admin.firestore.Timestamp.now())
    .limit(DUE_NOTIFICATION_LIMIT)
    .get();

  if (dueSnapshot.empty) return;

  const claimedNotifications = (await Promise.all(
    dueSnapshot.docs.map(document => claimNotification(document)),
  )).filter(Boolean);

  if (claimedNotifications.length === 0) return;

  const messages = claimedNotifications.map(notification => ({
    to: notification.token,
    sound: 'default',
    title: notification.title,
    body: notification.body,
    data: { notificationId: notification.notificationId },
  }));

  const messageChunks = expo.chunkPushNotifications(messages);
  let offset = 0;

  for (const messageChunk of messageChunks) {
    const notificationChunk = claimedNotifications.slice(offset, offset + messageChunk.length);
    offset += messageChunk.length;

    try {
      const tickets = await expo.sendPushNotificationsAsync(messageChunk);
      await Promise.all(tickets.map(async (ticket, index) => {
        const notification = notificationChunk[index];
        if (ticket.status === 'ok') {
          await notification.ref.delete();
          return;
        }

        console.error('Expo 푸시 발송 실패:', ticket.message, ticket.details);
        if (ticket.details?.error === 'DeviceNotRegistered') {
          await markDeviceInactive(notification.token);
        }
        await notification.ref.delete();
      }));
    } catch (error) {
      console.error('Expo 푸시 전송 요청 실패:', error);
      await Promise.all(notificationChunk.map(notification => notification.ref.update({
        status: 'pending',
        lastError: String(error),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      })));
    }
  }
};

let schedulerRunning = false;
cron.schedule('* * * * *', async () => {
  if (schedulerRunning) return;
  schedulerRunning = true;
  try {
    await sendDueNotifications();
  } catch (error) {
    console.error('예약 알림 처리 실패:', error);
  } finally {
    schedulerRunning = false;
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[서버 가동] http://0.0.0.0:${PORT}`);
});
