/**
 * One-time script to generate a Telegram session string for the collector.
 *
 * Usage:
 *   TELEGRAM_API_ID=12345 TELEGRAM_API_HASH=abc123 pnpm tsx scripts/generate-telegram-session.ts
 *
 * You'll be prompted for your phone number and OTP code.
 * The output session string goes into the TELEGRAM_SESSION_STRING env var.
 */
import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import * as readline from "node:readline";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stderr,
});

function prompt(question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer.trim()));
  });
}

async function main() {
  const apiId = parseInt(process.env["TELEGRAM_API_ID"] ?? "", 10);
  const apiHash = process.env["TELEGRAM_API_HASH"] ?? "";

  if (!apiId || !apiHash) {
    console.error(
      "Set TELEGRAM_API_ID and TELEGRAM_API_HASH env vars before running this script.\n" +
        "Get them from https://my.telegram.org → API development tools.",
    );
    process.exit(1);
  }

  const session = new StringSession("");
  const client = new TelegramClient(session, apiId, apiHash, {
    connectionRetries: 5,
  });

  await client.start({
    phoneNumber: () => prompt("Phone number (with country code, e.g. +1...): "),
    password: () => prompt("2FA password (if enabled, otherwise leave empty): "),
    phoneCode: () => prompt("OTP code from Telegram: "),
    onError: (err: Error) => {
      console.error("Error:", err.message);
    },
  });

  const sessionString = client.session.save() as unknown as string;

  console.error("\n--- Session generated successfully ---");
  console.error("Add this to your Railway env vars as TELEGRAM_SESSION_STRING:\n");

  // Print to stdout so it can be piped/captured
  process.stdout.write(sessionString + "\n");

  await client.disconnect();
  rl.close();
}

main().catch((err: unknown) => {
  console.error("Fatal:", err instanceof Error ? err.message : err);
  process.exit(1);
});
