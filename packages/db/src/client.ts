import { neon, neonConfig, Pool } from "@neondatabase/serverless";
import { drizzle as drizzleHttp } from "drizzle-orm/neon-http";
import { drizzle as drizzleServerless } from "drizzle-orm/neon-serverless";
import * as schema from "./schema.js";

/**
 * HTTP client for serverless environments (Next.js API routes, Vercel Edge).
 * Uses Neon's HTTP driver — one query per request, no persistent connection.
 */
export function createHttpClient(databaseUrl: string) {
  const queryFn = neon(databaseUrl);
  return drizzleHttp(queryFn, { schema });
}

/**
 * WebSocket pool client for long-running processes (collector service).
 * Maintains persistent connections for higher throughput.
 * Requires `ws` package — call with the WebSocket constructor.
 */
export function createPoolClient(
  databaseUrl: string,
  wsConstructor: unknown,
) {
  neonConfig.webSocketConstructor = wsConstructor as typeof WebSocket;
  const pool = new Pool({ connectionString: databaseUrl });
  return drizzleServerless(pool, { schema });
}

export type HttpClient = ReturnType<typeof createHttpClient>;
export type PoolClient = ReturnType<typeof createPoolClient>;
