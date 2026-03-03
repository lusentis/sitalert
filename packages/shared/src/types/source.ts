import { z } from "zod";

export const Platform = z.enum([
  "api",
  "telegram",
  "twitter",
  "rss",
  "scraper",
]);

export type Platform = z.infer<typeof Platform>;
