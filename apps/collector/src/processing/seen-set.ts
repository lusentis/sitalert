import type Redis from "ioredis";

/**
 * Redis-backed set with TTL eviction using sorted sets.
 * Score = Unix timestamp of when the ID was added.
 * Evicts entries older than `ttlSeconds` on each add.
 */
export class SeenSet {
  private readonly key: string;
  private readonly ttlSeconds: number;
  private readonly redis: Redis;

  constructor(redis: Redis, namespace: string, ttlSeconds: number) {
    this.redis = redis;
    this.key = `seen:${namespace}`;
    this.ttlSeconds = ttlSeconds;
  }

  async has(id: string): Promise<boolean> {
    const score = await this.redis.zscore(this.key, id);
    return score !== null;
  }

  async add(id: string): Promise<void> {
    const now = Date.now() / 1000;
    await this.redis.zadd(this.key, now, id);
    // Evict stale entries
    const cutoff = now - this.ttlSeconds;
    await this.redis.zremrangebyscore(this.key, "-inf", cutoff);
  }

  async addMany(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const now = Date.now() / 1000;
    const args: (string | number)[] = [];
    for (const id of ids) {
      args.push(now, id);
    }
    await this.redis.zadd(this.key, ...args);
    const cutoff = now - this.ttlSeconds;
    await this.redis.zremrangebyscore(this.key, "-inf", cutoff);
  }

  async size(): Promise<number> {
    return this.redis.zcard(this.key);
  }
}
