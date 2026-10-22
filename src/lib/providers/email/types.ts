export type EmailProviderName = "console";

export type OutboundEmail = {
  to: string;
  subject: string;
  html?: string;
  text?: string;
};

export interface EmailSender {
  send(message: OutboundEmail): Promise<void>;
}
