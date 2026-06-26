const express = require('express');
const cors = require('cors');
const { Expo } = require('expo-server-sdk');
const cron = require('node-cron');

const app = express();
const PORT = 3000;

// Expo SDK 인스턴스 초기화
const expo = new Expo();

// 미들웨어 설정
app.use(cors());
app.use(express.json());

// 임시 데이터베이스 역할을 할 배열 (실제 서비스에서는 MongoDB나 MySQL 등에 저장해야 합니다)
let savedPushTokens = [];

/**
 * 1. 클라이언트(앱)로부터 푸시 토큰을 받아 저장하는 API 엔드포인트
 */
app.post('/api/register-token', (req, res) => {
  const { token } = req.body;

  if (!token) {
    return res.status(400).json({ success: false, message: '토큰이 누락되었습니다.' });
  }

  // Expo 푸시 토큰 형식이 올바른지 검증
  if (!Expo.isExpoPushToken(token)) {
    return res.status(400).json({ success: false, message: '유효하지 않은 Expo 푸시 토큰입니다.' });
  }

  // 중복 저장 방지
  if (!savedPushTokens.includes(token)) {
    savedPushTokens.push(token);
    console.log(`[토큰 등록 완료] 현재 등록된 총 기기 수: ${savedPushTokens.length}`);
  }

  return res.status(200).json({ success: true, message: '토큰이 성공적으로 등록되었습니다.' });
});

/**
 * 2. 등록된 모든 기기에 푸시 알림을 전송하는 핵심 함수
 */
async function sendPushNotifications() {
  if (savedPushTokens.length === 0) {
    console.log('[알림 발송 스킵] 등록된 푸시 토큰이 없습니다.');
    return;
  }

  console.log(`[알림 발송 시작] ${savedPushTokens.length}개의 기기로 발송을 시도합니다.`);

  // 발송할 메시지 객체 배열 생성
  let messages = [];
  for (let pushToken of savedPushTokens) {
    messages.push({
      to: pushToken,
      sound: 'default',
      title: '체클렌더 알림',
      body: '오늘의 사진을 기록할 시간입니다! 📸',
      data: { withSome: 'data' },
    });
  }

  // Expo SDK 규칙에 맞게 청크(Chunk) 단위로 쪼개서 전송
  let chunks = expo.chunkPushNotifications(messages);
  let tickets = [];

  for (let chunk of chunks) {
    try {
      let ticketChunk = await expo.sendPushNotificationsAsync(chunk);
      tickets.push(...ticketChunk);
    } catch (error) {
      console.error('Expo 푸시 전송 중 에러 발생:', error);
    }
  }
  
  console.log('[알림 발송 완료]');
}

/**
 * 3. 자동 알림 스케줄러 설정 (node-cron)
 * 현재 설정: 매 분 5초마다 자동 발송 (테스트용)
 * 실제 서비스 예시: 매일 밤 10시 -> '0 22 * * *'
 */
cron.schedule('5 * * * * *', () => {
  console.log('[스케줄러 작동] 정기 알림을 발송합니다.');
  sendPushNotifications();
});

// 수동으로 즉시 알림을 테스트할 수 있는 개발자용 엔드포인트
app.post('/api/trigger-alarm', async (req, res) => {
  await sendPushNotifications();
  res.json({ success: true, message: '수동 발송 요청 완료' });
});

// 서버 시작
app.listen(PORT,'0.0.0.0', () => {
  console.log(`[서버 가동] 백엔드 서버가 http://0.0.0.0:${PORT} 에서 실행 중입니다.`);
});