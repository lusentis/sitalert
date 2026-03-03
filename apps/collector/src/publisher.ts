import type Redis from "ioredis";
import type { NormalizedEvent } from "@travelrisk/shared";

export class Publisher {
  private redis: Redis;

  constructor(redis: Redis) {
    this.redis = redis;
  }

  async publishEvent(event: NormalizedEvent): Promise<void> {
    await this.redis.publish("events:new", JSON.stringify(event));
  }
}
