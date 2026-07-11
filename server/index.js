const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const { Expo } = require('expo-server-sdk');
const cron = require('node-cron');
const admin = require('firebase-admin');
const { createNotificationTaskManager } = require('./notificationTaskManager');
const { registerHolidayRoutes } = require('./holidayService');
require('dotenv').config();

// 로컬과 Cloud Run 모두 애플리케이션 기본 자격 증명을 사용합니다.
admin.initializeApp({ credential: admin.credential.applicationDefault() });

const db = admin.firestore();
const app = express();
const expo = new Expo();
const PORT = Number(process.env.PORT) || 3000;
const MAX_NOTIFICATIONS_PER_DEVICE = 30;
const DUE_NOTIFICATION_LIMIT = 100;
const DUE_RECEIPT_LIMIT = 400;
const PROCESSING_LEASE_MS = 5 * 60 * 1000;
const RECEIPT_CHECK_DELAY_MS = 15 * 60 * 1000;
const RECEIPT_RETENTION_MS = 24 * 60 * 60 * 1000;

const tokenCollection = db.collection('pushTokens');
const scheduleCollection = db.collection('scheduledNotifications');
const receiptCollection = db.collection('pushReceipts');
let notificationTaskManager = null;

app.use(cors());
app.use(express.json({ limit: '256kb' }));

// 로그에 토큰 전체가 노출되지 않도록 앞뒤 일부만 남깁니다.
const maskToken = token => `${token.slice(0, 18)}...${token.slice(-6)}`;

// 기기 토큰과 클라이언트 알림 ID의 조합으로 항상 같은 문서 ID를 생성합니다.
const createScheduleId = (token, notificationId) => {
  return crypto.createHash('sha256').update(`${token}:${notificationId}`).digest('hex');
};
// 예약 내용이 바뀌면 새 Cloud Task가 만들어지도록 내용 기반 버전을 생성합니다.
const createScheduleVersion = notification => {
  return crypto.createHash('sha256').update(JSON.stringify({
    scheduledAt: notification.scheduledDate.toISOString(),
    title: notification.title,
    body: notification.body,
  })).digest('hex').slice(0, 16);
};


const validateToken = token => typeof token === 'string' && Expo.isExpoPushToken(token);

// 클라이언트의 예약 목록을 검증하고 서버에서 사용할 날짜 형식으로 변환합니다.
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

// 공공데이터포털 인증키를 노출하지 않고 연도별 공휴일을 제공합니다.
registerHolidayRoutes(app);

// 앱 설치 단위의 Expo 푸시 토큰을 활성 상태로 등록합니다.
app.post('/api/register-token', async (req, res) => {
  const { token } = req.body;
  if (!validateToken(token)) {
    return res.status(400).json({ success: false, message: '유효하지 않은 토큰입니다.' });
  }

  try {
    await tokenCollection.doc(token).set({
      token,
      active: true,
      deactivatedAt: admin.firestore.FieldValue.delete(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    console.log(`[토큰 등록] ${maskToken(token)}`);
    return res.json({ success: true });
  } catch (error) {
    console.error('토큰 저장 실패:', error);
    return res.status(500).json({ success: false, message: '토큰 저장에 실패했습니다.' });
  }
});

// 한 기기의 기존 예약 목록을 클라이언트가 전달한 최신 목록으로 교체합니다.
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
    const existingDocuments = new Map(
      existingSnapshot.docs.map(document => [document.id, document]),
    );
    const nextDocumentIds = new Set(
      normalizedNotifications.map(notification => createScheduleId(token, notification.id)),
    );
    const batch = db.batch();
    const schedulesToQueue = [];

    // 새 목록에서 사라진 예약은 같은 배치에서 제거합니다.
    existingSnapshot.forEach(document => {
      if (!nextDocumentIds.has(document.id)) batch.delete(document.ref);
    });

    normalizedNotifications.forEach(notification => {
      const documentId = createScheduleId(token, notification.id);
      const version = createScheduleVersion(notification);
      const existingDocument = existingDocuments.get(documentId);

      schedulesToQueue.push({
        id: documentId,
        version,
        scheduledAt: notification.scheduledDate,
        status: 'pending',
      });

      // 내용이 같은 예약은 발송 및 영수증 처리 상태를 그대로 유지합니다.
      if (existingDocument?.data().version === version) return;

      batch.set(scheduleCollection.doc(documentId), {
        token,
        notificationId: notification.id,
        version,
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
      deactivatedAt: admin.firestore.FieldValue.delete(),
      timezone: typeof timezone === 'string' ? timezone.slice(0, 100) : null,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    await batch.commit();
    const queuedCount = notificationTaskManager?.enabled
      ? await notificationTaskManager.queueSchedules(schedulesToQueue)
      : 0;
    return res.json({
      success: true,
      scheduledCount: normalizedNotifications.length,
      queuedCount,
    });
  } catch (error) {
    console.error('알림 일정 저장 실패:', error);
    return res.status(500).json({ success: false, message: '알림 일정 저장에 실패했습니다.' });
  }
});

// 트랜잭션으로 발송 권한을 선점해 여러 실행기가 같은 알림을 중복 발송하지 않게 합니다.
const claimNotification = async (document, expectedVersion = null) => {
  return db.runTransaction(async transaction => {
    const snapshot = await transaction.get(document.ref);
    if (!snapshot.exists) return null;

    const data = snapshot.data();
    const claimedAt = data.claimedAt?.toDate?.();
    const processingIsStale = data.status === 'processing'
      && claimedAt
      && Date.now() - claimedAt.getTime() > PROCESSING_LEASE_MS;

    if (expectedVersion && data.version !== expectedVersion) return null;
    if (data.status !== 'pending' && !processingIsStale) return null;

    transaction.update(document.ref, {
      status: 'processing',
      claimedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return { ref: document.ref, ...data };
  });
};

// 유효하지 않은 토큰을 비활성화하고 해당 토큰의 남은 예약을 함께 제거합니다.
const markDeviceInactive = async token => {
  const scheduleSnapshot = await scheduleCollection.where('token', '==', token).get();
  const batch = db.batch();

  batch.set(tokenCollection.doc(token), {
    active: false,
    deactivatedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  scheduleSnapshot.forEach(document => batch.delete(document.ref));
  await batch.commit();
  console.log(`[토큰 비활성화] ${maskToken(token)}, 예약 ${scheduleSnapshot.size}건 삭제`);
};

notificationTaskManager = createNotificationTaskManager({
  admin,
  db,
  expo,
  scheduleCollection,
  receiptCollection,
  tokenCollection,
  claimNotification,
  markDeviceInactive,
});
notificationTaskManager.registerRoutes(app);

if (notificationTaskManager.enabled) {
  console.log('[알림 모드] 자정 준비와 Cloud Tasks 예약 발송을 사용합니다.');
}

// 성공 티켓의 ID와 토큰을 저장해 15분 후 영수증을 확인할 수 있게 합니다.
const queuePushReceipt = (batch, receiptId, token, sentAt) => {
  batch.set(receiptCollection.doc(receiptId), {
    receiptId,
    token,
    attempts: 0,
    nextCheckAt: admin.firestore.Timestamp.fromMillis(sentAt + RECEIPT_CHECK_DELAY_MS),
    expiresAt: admin.firestore.Timestamp.fromMillis(sentAt + RECEIPT_RETENTION_MS),
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
};

// 영수증 조회 요청이 실패하면 같은 문서를 다음 확인 시각으로 미룹니다.
const rescheduleReceiptDocuments = async (documents, error) => {
  const batch = db.batch();
  const nextCheckAt = admin.firestore.Timestamp.fromMillis(Date.now() + RECEIPT_CHECK_DELAY_MS);

  documents.forEach(document => batch.update(document.ref, {
    attempts: admin.firestore.FieldValue.increment(1),
    nextCheckAt,
    lastError: String(error),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }));

  await batch.commit();
};

// Expo가 발급한 티켓 ID로 최종 푸시 처리 결과를 조회합니다.
const checkPendingPushReceipts = async () => {
  const now = admin.firestore.Timestamp.now();
  const pendingSnapshot = await receiptCollection
    .where('nextCheckAt', '<=', now)
    .limit(DUE_RECEIPT_LIMIT)
    .get();

  if (pendingSnapshot.empty) return;

  const documentsById = new Map(pendingSnapshot.docs.map(document => [document.id, document]));
  const receiptIdChunks = expo.chunkPushNotificationReceiptIds([...documentsById.keys()]);

  for (const receiptIdChunk of receiptIdChunks) {
    const receiptDocuments = receiptIdChunk
      .map(receiptId => documentsById.get(receiptId))
      .filter(Boolean);

    let receipts;
    try {
      receipts = await expo.getPushNotificationReceiptsAsync(receiptIdChunk);
    } catch (error) {
      console.error('Expo 푸시 영수증 조회 실패:', error);
      await rescheduleReceiptDocuments(receiptDocuments, error);
      continue;
    }

    const batch = db.batch();
    const invalidTokens = new Set();

    receiptDocuments.forEach(document => {
      const data = document.data();
      const receipt = receipts[document.id];

      if (!receipt) {
        const expiresAt = data.expiresAt?.toMillis?.() ?? 0;
        if (expiresAt <= now.toMillis()) {
          console.warn(`[영수증 만료] ${document.id}`);
          batch.delete(document.ref);
          return;
        }

        batch.update(document.ref, {
          attempts: admin.firestore.FieldValue.increment(1),
          nextCheckAt: admin.firestore.Timestamp.fromMillis(
            Date.now() + RECEIPT_CHECK_DELAY_MS,
          ),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        return;
      }

      if (receipt.status === 'error') {
        console.error('Expo 푸시 영수증 오류:', receipt.message, receipt.details);
        if (receipt.details?.error === 'DeviceNotRegistered' && data.token) {
          invalidTokens.add(data.token);
        }
      }

      batch.delete(document.ref);
    });

    // 토큰 정리에 실패하면 영수증 문서를 남겨 다음 실행에서 다시 처리합니다.
    await Promise.all([...invalidTokens].map(token => markDeviceInactive(token)));
    await batch.commit();
    console.log(`[영수증 확인] ${receiptDocuments.length}건 처리`);
  }
};

// 발송 시간이 지난 예약을 선점한 뒤 Expo가 허용하는 크기로 나누어 전송합니다.
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

    let tickets;
    try {
      tickets = await expo.sendPushNotificationsAsync(messageChunk);
    } catch (error) {
      console.error('Expo 푸시 전송 요청 실패:', error);
      await Promise.all(notificationChunk.map(notification => notification.ref.update({
        status: 'pending',
        lastError: String(error),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      })));
      continue;
    }

    const invalidTokens = new Set();
    const resultBatch = db.batch();
    const sentAt = Date.now();
    let resultOperationCount = 0;

    tickets.forEach((ticket, index) => {
      const notification = notificationChunk[index];

      if (ticket.status === 'ok') {
        resultBatch.delete(notification.ref);
        resultOperationCount += 1;

        if (ticket.id) {
          queuePushReceipt(resultBatch, ticket.id, notification.token, sentAt);
          resultOperationCount += 1;
        } else {
          console.error('Expo 푸시 성공 티켓에 영수증 ID가 없습니다.');
        }
        return;
      }

      console.error('Expo 푸시 발송 실패:', ticket.message, ticket.details);
      if (ticket.details?.error === 'DeviceNotRegistered') {
        invalidTokens.add(notification.token);
        return;
      }

      resultBatch.delete(notification.ref);
      resultOperationCount += 1;
    });

    try {
      // 예약 삭제와 영수증 추적 문서 저장을 같은 배치로 반영합니다.
      if (resultOperationCount > 0) await resultBatch.commit();
    } catch (error) {
      console.error('푸시 발송 결과 저장 실패:', error);
      continue;
    }

    try {
      // 같은 전송 묶음에서 중복된 만료 토큰은 한 번만 정리합니다.
      await Promise.all([...invalidTokens].map(token => markDeviceInactive(token)));
    } catch (error) {
      console.error('만료 토큰 정리 실패:', error);
    }
  }
};

if (!notificationTaskManager.enabled) {
  // Cloud Tasks를 설정하지 않은 로컬 환경에서는 기존 1분 폴링을 사용합니다.
  let schedulerRunning = false;
  cron.schedule('* * * * *', async () => {
    if (schedulerRunning) return;
    schedulerRunning = true;

    try {
      try {
        await checkPendingPushReceipts();
      } catch (error) {
        console.error('푸시 영수증 처리 실패:', error);
      }

      try {
        await sendDueNotifications();
      } catch (error) {
        console.error('예약 알림 처리 실패:', error);
      }
    } finally {
      schedulerRunning = false;
    }
  });
  console.log('[알림 모드] 로컬 1분 폴링을 사용합니다.');
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[서버 가동] http://0.0.0.0:${PORT}`);
});
