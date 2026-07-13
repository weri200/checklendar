const createRateLimiter = ({
  windowMs,
  maxRequests,
  key = req => req.ip,
  now = Date.now,
}) => {
  const counters = new Map();

  return (req, res, next) => {
    const currentTime = now();
    const requestKey = key(req) || 'unknown';
    const current = counters.get(requestKey);
    const counter = !current || current.resetAt <= currentTime
      ? { count: 0, resetAt: currentTime + windowMs }
      : current;
    counter.count += 1;
    counters.set(requestKey, counter);

    if (counters.size > 10_000) {
      for (const [storedKey, value] of counters) {
        if (value.resetAt <= currentTime) counters.delete(storedKey);
      }
      while (counters.size > 10_000) {
        counters.delete(counters.keys().next().value);
      }
    }

    res.set('RateLimit-Limit', String(maxRequests));
    res.set('RateLimit-Remaining', String(Math.max(0, maxRequests - counter.count)));
    res.set('RateLimit-Reset', String(Math.ceil(counter.resetAt / 1000)));
    if (counter.count <= maxRequests) return next();

    res.set('Retry-After', String(Math.ceil((counter.resetAt - currentTime) / 1000)));
    return res.status(429).json({
      success: false,
      message: '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.',
    });
  };
};

module.exports = { createRateLimiter };
