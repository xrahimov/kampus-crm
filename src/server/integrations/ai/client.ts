import Anthropic from "@anthropic-ai/sdk";

/*
 * The model behind the Assistant page (round 2 item G4, A-149). The real client
 * is Claude through the centre's own Anthropic key; the fake one answers from
 * the same tools with set phrases, so the page works before a key exists and
 * tests need no network.
 */

export interface AiCompletion {
  content: Anthropic.ContentBlock[];
  stopReason: Anthropic.Message["stop_reason"];
}

export interface AiClient {
  readonly name: "fake" | "anthropic";
  readonly model: string;
  complete(params: AiRequest): Promise<AiCompletion>;
}

export interface AiRequest {
  system: string;
  /**
   * What changes from one request to the next (the page the person is on), sent
   * after the stable prompt so that prompt stays cached.
   */
  context?: string;
  messages: Anthropic.MessageParam[];
  tools: Anthropic.Tool[];
  /** How hard the model works; a chat over data is "medium", a short summary "low". */
  effort?: "low" | "medium";
}

export const DEFAULT_AI_MODEL = "claude-opus-5-5";
/** Enough for a long answer with a table; the page is not a document writer. */
const MAX_TOKENS = 8_000;

export class AnthropicAiClient implements AiClient {
  readonly name = "anthropic" as const;
  private readonly client: Anthropic;
  constructor(
    apiKey: string,
    readonly model: string,
  ) {
    this.client = new Anthropic({ apiKey, maxRetries: 1, timeout: 90_000 });
  }

  async complete(params: AiRequest): Promise<AiCompletion> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: MAX_TOKENS,
      // Adaptive thinking is on by default on current models; medium effort fits a chat over data.
      output_config: { effort: params.effort ?? "medium" },
      system: [
        { type: "text", text: params.system, cache_control: { type: "ephemeral" } },
        ...(params.context ? [{ type: "text" as const, text: params.context }] : []),
      ],
      ...(params.tools.length > 0 ? { tools: params.tools } : {}),
      messages: params.messages,
    });
    return { content: response.content, stopReason: response.stop_reason };
  }
}

/** Keywords in several languages that pick the tool the fake client "decides" to call. */
const FAKE_ROUTES: Array<{ tool: string; words: RegExp; input: Record<string, unknown> }> = [
  { tool: "homework_to_check", words: /(homework|uyga vazifa|домашн)/i, input: {} },
  {
    tool: "attendance_overview",
    words: /(absent|attendance|davomat|kelmagan|посещаем|отсутств)/i,
    input: {},
  },
  { tool: "my_day", words: /(do i have|my day|my lessons|darslarim|у меня|мои уроки)/i, input: {} },
  { tool: "list_debtors", words: /\b(debt|owe|qarz|долг|должн)/i, input: { limit: 10 } },
  {
    tool: "payments_summary",
    words: /\b(payment|paid|income|revenue|to'lov|tushum|оплат|поступ|выручк)/i,
    input: {},
  },
  {
    tool: "todays_schedule",
    words: /\b(today|lesson|schedule|bugun|dars|сегодня|урок|расписан)/i,
    input: {},
  },
  { tool: "list_groups", words: /\b(group|guruh|групп)/i, input: {} },
  { tool: "count_students", words: /\b(student|o'quvchi|talaba|учени|студент)/i, input: {} },
  { tool: "dashboard_kpis", words: /\b(kpi|overview|summary|umumiy|обзор|итог)/i, input: {} },
];

/**
 * Picks a tool by the words in the question, then phrases the result; a
 * request for a draft gets a plain draft and anything else a short answer
 * that names the scope the real model is told to keep (A-185) and what test
 * mode can do. Deterministic, so tests can assert it.
 */
export class FakeAiClient implements AiClient {
  readonly name = "fake" as const;
  readonly model = "test";

  async complete(params: AiRequest): Promise<AiCompletion> {
    const last = params.messages.at(-1);
    // Second round: the tool answered; phrase it.
    if (last?.role === "user" && Array.isArray(last.content)) {
      const results = last.content.filter(
        (b): b is Anthropic.ToolResultBlockParam => b.type === "tool_result",
      );
      const text = results
        .map((r) => (typeof r.content === "string" ? r.content : JSON.stringify(r.content)))
        .join("\n\n");
      return {
        content: [
          { type: "text", text: `Here is what I found in Kampus:\n\n${text}`, citations: null },
        ],
        stopReason: "end_turn",
      };
    }
    const question = typeof last?.content === "string" ? last.content : "";
    if (/\b(draft|write|compose|sms|xabar|yoz|напиши|составь|черновик)/i.test(question)) {
      return {
        content: [
          {
            type: "text",
            text: "Draft:\n\nAssalomu alaykum! Farzandingizning ushbu oy uchun kurs to'lovi hali qabul qilinmadi. Iltimos, yaqin kunlarda to'lovni amalga oshiring. Savollar bo'lsa, markazga qo'ng'iroq qiling. Rahmat!",
            citations: null,
          },
        ],
        stopReason: "end_turn",
      };
    }
    const route = FAKE_ROUTES.find((r) => r.words.test(question));
    const tool = route && params.tools.find((t) => t.name === route.tool);
    if (!tool) {
      return {
        content: [
          {
            type: "text",
            text: "I only help with this centre's work in Kampus and with teaching questions. Test mode: without an API key I can only look up debtors, students, payments, groups, lessons, attendance and homework to check, or draft a message. Ask about one of those.",
            citations: null,
          },
        ],
        stopReason: "end_turn",
      };
    }
    return {
      content: [
        {
          type: "tool_use",
          id: `fake-${tool.name}`,
          name: tool.name,
          input: route.input,
          caller: { type: "direct" },
        },
      ],
      stopReason: "tool_use",
    };
  }
}

let fake: FakeAiClient | undefined;

export function createAiClient(
  config: { isEnabled: boolean; apiKey: string; model: string } | null,
): AiClient {
  if (config?.isEnabled && config.apiKey) {
    return new AnthropicAiClient(config.apiKey, config.model || DEFAULT_AI_MODEL);
  }
  fake ??= new FakeAiClient();
  return fake;
}
