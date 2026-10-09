/**
 * Telegram staff notifications (EXP §8 Bot xabarnoma) behind an interface (A-20).
 */
/** Bot API `reply_markup`: the buttons under a message, or the order to take them away. */
export type TelegramReplyMarkup =
  | {
      keyboard: Array<Array<{ text: string }>>;
      resize_keyboard?: boolean;
      is_persistent?: boolean;
    }
  | { remove_keyboard: true };

export interface TelegramSendOptions {
  replyMarkup?: TelegramReplyMarkup;
}

export interface TelegramNotifier {
  readonly name: "fake" | "telegram";
  sendMessage(chatId: string, text: string, options?: TelegramSendOptions): Promise<void>;
}

/** Messages the fake notifier delivered during this process. */
export const fakeTelegramOutbox: Array<{
  chatId: string;
  text: string;
  replyMarkup?: TelegramReplyMarkup;
}> = [];

export class FakeTelegramNotifier implements TelegramNotifier {
  readonly name = "fake" as const;
  async sendMessage(chatId: string, text: string, options?: TelegramSendOptions): Promise<void> {
    fakeTelegramOutbox.push(
      options?.replyMarkup ? { chatId, text, replyMarkup: options.replyMarkup } : { chatId, text },
    );
    if (fakeTelegramOutbox.length > 500) {
      fakeTelegramOutbox.splice(0, fakeTelegramOutbox.length - 500);
    }
  }
}

/** Bot API `sendMessage`; needs the bot token from Settings → Integrations (A-85). */
export class BotApiTelegramNotifier implements TelegramNotifier {
  readonly name = "telegram" as const;
  constructor(
    private readonly token: string,
    private readonly baseUrl = "https://api.telegram.org",
  ) {}

  async sendMessage(chatId: string, text: string, options?: TelegramSendOptions): Promise<void> {
    const res = await fetch(`${this.baseUrl}/bot${this.token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        ...(options?.replyMarkup ? { reply_markup: options.replyMarkup } : {}),
      }),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as { description?: string } | null;
      throw new Error(`telegram: ${data?.description ?? res.statusText} (${res.status})`);
    }
  }
}

let fake: FakeTelegramNotifier | null = null;

export function createTelegramNotifier(
  config: { isEnabled: boolean; botToken: string } | null,
): TelegramNotifier {
  if (config?.isEnabled && config.botToken) return new BotApiTelegramNotifier(config.botToken);
  fake ??= new FakeTelegramNotifier();
  return fake;
}
