// In-memory sliding-window limiter. Best effort only: counters are lost on restart and are not shared
// between Node processes (Hostinger may run several), so the effective limit can be a few times higher.
// Nothing is persisted, which keeps visitors' IP addresses out of the database.
export type RateLimiter = { take: (key: string) => boolean }

export function createRateLimiter({
  limit,
  windowMs,
  maxKeys = 10_000,
  now = Date.now,
}: {
  limit: number
  windowMs: number
  maxKeys?: number
  now?: () => number
}): RateLimiter {
  const hits = new Map<string, number[]>()

  function prune(current: number) {
    for (const [key, times] of hits) {
      if (times.at(-1)! <= current - windowMs) hits.delete(key)
    }
  }

  return {
    // Records the attempt and returns false when the key already reached its limit in the window.
    take(key) {
      const current = now()
      const recent = (hits.get(key) ?? []).filter((t) => t > current - windowMs)
      if (recent.length >= limit) {
        hits.set(key, recent)
        return false
      }
      recent.push(current)
      hits.delete(key) // re-inserted last: Map order is then least recently used first
      hits.set(key, recent)
      if (hits.size > maxKeys) {
        prune(current)
        // Still full of active keys: forget the oldest ones rather than growing without bound.
        for (const key of hits.keys()) {
          if (hits.size <= maxKeys) break
          hits.delete(key)
        }
      }
      return true
    },
  }
}
