// Sends a message to Telegram through the Bot API. Used only when TELEGRAM_BOT_TOKEN and
// TELEGRAM_CHAT_ID are both set.

const TIMEOUT_MS = 10_000;
// Telegram allows 4096 characters per message.
const MAX_MESSAGE = 4_000;

export type TelegramOptions = { token: string; chatId: string; send?: typeof fetch };

export type NotifyResult = { sent: boolean; error?: string };

export function telegramFromEnv(): Omit<TelegramOptions, "send"> | null {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  return token && chatId ? { token, chatId } : null;
}

export async function sendTelegram(
  message: string,
  options: TelegramOptions,
): Promise<NotifyResult> {
  const text =
    message.length > MAX_MESSAGE ? `${message.slice(0, MAX_MESSAGE - 20)}\n\n(truncated)` : message;

  try {
    const res = await (options.send ?? fetch)(
      `https://api.telegram.org/bot${options.token}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // No parse_mode: page text is sent as is and Telegram does not read it as Markdown
        // or HTML.
        body: JSON.stringify({
          chat_id: options.chatId,
          text,
          link_preview_options: { is_disabled: true },
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      },
    );
    if (res.ok) return { sent: true };
    return { sent: false, error: `Telegram answered ${res.status}` };
  } catch (err) {
    // A fetch error can carry the full URL, and that URL contains the bot token. Do not pass
    // it on.
    const name = err instanceof Error ? err.name : "error";
    return { sent: false, error: `Telegram could not be reached (${name})` };
  }
}
