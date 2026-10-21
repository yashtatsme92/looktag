import type { OutboundEmail } from "./types";

/** Logs the message. Not wired to sign-in or any other flow. */
export async function send(message: OutboundEmail): Promise<void> {
  console.info("[email]", {
    to: message.to,
    subject: message.subject,
    text: message.text ?? "",
    html: message.html ?? "",
  });
}
