// Fixed-window rate limiter kept in memory. Each server instance counts on its own, so this is a minimal guard;
// a shared store (DB or Redis) can replace it later without changing callers.

export type RateLimiter = { take(key: string, now?: number): { allowed: boolean; retryAfter: number } };

export function createRateLimiter(limit: number, windowMs: number, maxKeys = 10_000): RateLimiter {
    const windows = new Map<string, { start: number; count: number }>();
    return {
        take(key, now = Date.now()) {
            let w = windows.get(key);
            if (!w || now - w.start >= windowMs) {
                // Drop expired windows before the map grows too large
                if (windows.size >= maxKeys) for (const [k, v] of windows) if (now - v.start >= windowMs) windows.delete(k);
                if (windows.size >= maxKeys) windows.delete(windows.keys().next().value as string);
                w = { start: now, count: 0 };
                windows.set(key, w);
            }
            if (w.count >= limit) return { allowed: false, retryAfter: Math.max(1, Math.ceil((w.start + windowMs - now) / 1000)) };
            w.count++;
            return { allowed: true, retryAfter: 0 };
        }
    };
}
