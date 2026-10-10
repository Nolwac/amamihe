import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export interface EmailMessage {
  id: string;
  to: string;
  subject: string;
  text: string;
}
/** Authentication depends on this contract, never on a provider SDK. */
export interface EmailProvider {
  send(message: EmailMessage): Promise<void>;
}
export class AgentMailProvider implements EmailProvider {
  constructor(
    private apiKey: string,
    private inbox: string,
  ) {}
  async send(message: EmailMessage) {
    const response = await fetch(
      `https://api.agentmail.to/v0/inboxes/${encodeURIComponent(this.inbox)}/messages/send`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          to: message.to,
          subject: message.subject,
          text: message.text,
        }),
        signal: AbortSignal.timeout(15000),
      },
    );
    // Provider bodies may contain private mail content; never log or return them.
    if (!response.ok)
      throw new Error(
        "Email delivery is temporarily unavailable. Please try again.",
      );
  }
}
export async function emailConfiguration(): Promise<{
  provider: EmailProvider;
  codeSecret: string;
}> {
  if (process.env.EMAIL_CONFIG_FILE) {
    let settings;
    try {
      settings = JSON.parse(
        await readFile(process.env.EMAIL_CONFIG_FILE, "utf8"),
      );
    } catch {
      throw new Error("Could not read private email provider configuration.");
    }
    if (
      settings.provider !== "agentmail" ||
      typeof settings.apiKey !== "string" ||
      !settings.apiKey ||
      settings.inbox !== "amamihe@agentmail.to" ||
      typeof settings.codeSecret !== "string" ||
      settings.codeSecret.length < 32
    )
      throw new Error("Invalid private email provider configuration.");
    return {
      provider: new AgentMailProvider(settings.apiKey, settings.inbox),
      codeSecret: settings.codeSecret,
    };
  }
  if (
    process.env.EMAIL_PROVIDER === "test" &&
    process.env.NODE_ENV !== "production"
  ) {
    const directory =
      process.env.EMAIL_TEST_OUTBOX || path.resolve(".data/test-outbox");
    return {
      codeSecret: "isolated-test-code-secret-not-for-production",
      provider: {
        async send(message) {
          await mkdir(directory, { recursive: true, mode: 0o700 });
          await writeFile(
            path.join(directory, message.id + ".json"),
            JSON.stringify(message),
            { mode: 0o600 },
          );
        },
      },
    };
  }
  if (process.env.NODE_ENV === "production")
    throw new Error("Production requires private EMAIL_CONFIG_FILE.");
  return {
    codeSecret: "disabled-local-email-provider-secret",
    provider: {
      async send() {
        throw new Error("Email sending is not configured.");
      },
    },
  };
}
