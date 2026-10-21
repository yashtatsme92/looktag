import { send as consoleSend } from "./console.ts";
import type { EmailProviderName, EmailSender, OutboundEmail } from "./types.ts";

export type { EmailProviderName, EmailSender, OutboundEmail };

type Env = { EMAIL_PROVIDER?: string };

/** `EMAIL_PROVIDER=console`. That is the only adapter, and nothing calls it yet. */
export function resolveEmailProvider(env: Env = process.env): EmailProviderName {
  const named = env.EMAIL_PROVIDER?.trim().toLowerCase();
  if (named && named !== "console") {
    throw new Error(`Unknown EMAIL_PROVIDER "${named}". Only "console" is implemented.`);
  }
  return "console";
}

export function emailSender(env: Env = process.env): EmailSender {
  resolveEmailProvider(env);
  return { send: consoleSend };
}

export async function send(message: OutboundEmail): Promise<void> {
  await emailSender().send(message);
}
