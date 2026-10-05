import { afterEach, describe, expect, it, vi } from "vitest";
import { createRateLimiter } from "./rateLimiter";

describe("createRateLimiter", () => {
  afterEach(() => vi.useRealTimers());

  it("holds the call over the limit until the oldest leaves the 1s window", async () => {
    vi.useFakeTimers();
    const throttle = createRateLimiter({ maxPerSecond: 2, jitterMs: 1 });

    await throttle();
    await throttle();

    let released = false;
    const third = throttle().then(() => { released = true; });

    await vi.advanceTimersByTimeAsync(900);
    expect(released).toBe(false);

    await vi.advanceTimersByTimeAsync(200);
    await third;
    expect(released).toBe(true);
  });
});
