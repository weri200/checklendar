const express = require('express');
const cors = require('cors');
const { Expo } = require('expo-server-sdk');
const cron = require('node-cron');
const admin = require('firebase-admin');
require('dotenv').config();

// 파이어베이스 초기화
// .env에 설정된 GOOGLE_APPLICATION_CREDENTIALS 경로를 사용하거나, 
// 명시적으로 파일을 불러와 초기화합니다.
const serviceAccount = require('./firebase-service-account.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const app = express();
const PORT = 3000;
const expo = new Expo();

app.use(cors());
app.use(express.json());

/**
 * 1. 클라이언트로부터 푸시 토큰을 받아 Firestore에 저장
 */
app.post('/api/register-token', async (req, res) => {
  const { token } = req.body;

  if (!token || !Expo.isExpoPushToken(token)) {
    return res.status(400).json({ success: false, message: '유효하지 않은 토큰입니다.' });
  }

  try {
    await db.collection('pushTokens').doc(token).set({
      token: token,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    console.log(`[DB 저장 완료] 토큰 등록: ${token}`);
    return res.status(200).json({ success: true, message: '등록 성공' });
  } catch (error) {
    console.error('DB 저장 에러:', error);
    return res.status(500).json({ success: false, message: 'DB 저장 실패' });
  }
});

/**
 * 2. Firestore에서 모든 기기 토큰을 가져와 알림 전송
 */
async function sendPushNotifications() {
  try {
    const snapshot = await db.collection('pushTokens').get();
    if (snapshot.empty) {
      console.log('[알림 발송 스킵] 등록된 토큰이 없습니다.');
      return;
    }

    let messages = [];
    snapshot.forEach(doc => {
      messages.push({
        to: doc.data().token,
        sound: 'default',
        title: '체클렌더 알림',
        body: '오늘의 사진을 기록할 시간입니다! 📸',
      });
    });

    let chunks = expo.chunkPushNotifications(messages);
    for (let chunk of chunks) {
      try {
        await expo.sendPushNotificationsAsync(chunk);
      } catch (error) {
        console.error('Expo 푸시 전송 중 에러 발생:', error);
      }
    }
    console.log('[알림 발송 완료]');
  } catch (error) {
    console.error('푸시 알림 처리 중 에러:', error);
  }
}

// 3. 자동 알림 스케줄러 (Node.js 기본 내장 함수 사용)
const ONE_MINUTE = 60 * 1000; // 60,000 밀리초 = 1분

setInterval(() => {
  console.log('[스케줄러 작동] 정기 알림 발송 프로세스를 시작합니다.');
  sendPushNotifications();
}, ONE_MINUTE);

// 서버 시작
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[서버 가동] 백엔드 서버가 http://0.0.0.0:${PORT} 에서 실행 중입니다.`);
});