// Simple global rate limiter + retry/backoff for CMA calls.

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// Create a limiter that ensures <= maxPerSecond
export function createRateLimiter({ maxPerSecond = 8, jitterMs = 20 } = {}) {
  const calls = [];
  const windowMs = 1000;

  return async function throttle() {
    const now = Date.now();
    // drop timestamps older than 1s
    while (calls.length && now - calls[0] > windowMs) {
      calls.shift();
    }

    if (calls.length >= maxPerSecond) {
      // sleep until the oldest call drops out of the window
      const wait =
        Math.max(windowMs - (now - calls[0]), 0) +
        Math.floor(Math.random() * jitterMs);
      await sleep(wait);
      return throttle(); // re-check after sleep
    }

    calls.push(Date.now());
  };
}

// Singleton limiter, kept under the CMA's default limit of 10 req/s so 429
// backoff doesn't land between an entry's GET and its UPDATE.
export const throttle = createRateLimiter({ maxPerSecond: 8, jitterMs: 25 });

// Wrap a CMA call with rate limit + retry on 429
let inflight = 0;
export async function callCMA(fn, { retries = 4, baseDelay = 300 } = {}) {
  console.log("Inflight CMA calls:", inflight);
  let attempt = 0;
  for (;;) {
    await throttle();
    inflight++;
    try {
      return await fn();
    } catch (e) {
      const isRate = e?.status === 429 || e?.sys?.id === "RateLimitExceeded";
      if (!isRate || attempt >= retries) throw e;

      // exponential backoff + jitter
      const wait =
        baseDelay * Math.pow(2, attempt) + Math.floor(Math.random() * 100);
      await sleep(wait);
      attempt++;
    } finally {
      inflight--;
      if (inflight % 10 === 0) console.log("inflight", inflight);
    }
  }
}
