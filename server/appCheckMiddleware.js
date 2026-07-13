const APP_CHECK_HEADER = 'x-firebase-appcheck';
const VALID_ENFORCEMENT_MODES = new Set(['off', 'monitor', 'enforce']);

const createAppCheckMiddleware = ({
  appCheck,
  expectedAppId = process.env.FIREBASE_ANDROID_APP_ID,
  mode = process.env.APP_CHECK_ENFORCEMENT || 'enforce',
  logger = console,
}) => {
  const enforcementMode = VALID_ENFORCEMENT_MODES.has(mode) ? mode : 'enforce';

  return async (req, res, next) => {
    if (enforcementMode === 'off') return next();

    const token = req.get(APP_CHECK_HEADER);
    try {
      if (!token) throw new Error('missing-token');
      const verification = await appCheck.verifyToken(token);
      // firebase-admin 13은 { appId, token }을 반환하고, 이전 버전은 claims를 직접 반환합니다.
      const claims = verification.token || verification;
      const appId = verification.appId || claims.app_id || claims.sub;
      if (expectedAppId && appId !== expectedAppId) throw new Error('unexpected-app-id');
      req.appCheck = claims;
      return next();
    } catch (error) {
      const reason = error?.message || 'invalid-token';
      if (enforcementMode === 'monitor') {
        logger.warn(`[App Check 모니터] ${req.method} ${req.path}: ${reason}`);
        return next();
      }
      return res.status(401).json({
        success: false,
        message: '인증되지 않은 앱 요청입니다.',
      });
    }
  };
};

module.exports = { APP_CHECK_HEADER, createAppCheckMiddleware };
