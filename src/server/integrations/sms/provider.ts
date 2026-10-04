/**
 * SMS behind an interface (A-20): the Eskiz adapter talks to the real gateway,
 * the fake one records messages in memory for development and tests.
 */
export interface SmsSendResult {
  providerId: string;
}

export interface SmsProvider {
  readonly name: "fake" | "eskiz";
  send(input: { phone: string; text: string }): Promise<SmsSendResult>;
  /** "Eskizdan import qilish": the templates registered on the provider side. */
  listTemplates(): Promise<Array<{ id: string; text: string }>>;
}

export interface EskizConfig {
  email: string;
  password: string;
  /** Sender name ("from"); Eskiz's shared sender is 4546. */
  sender: string;
  baseUrl?: string;
}

/** Messages the fake provider "sent" during this process, newest last. */
export const fakeSmsOutbox: Array<{ phone: string; text: string; providerId: string }> = [];

export class FakeSmsProvider implements SmsProvider {
  readonly name = "fake" as const;
  private counter = 0;

  async send(input: { phone: string; text: string }): Promise<SmsSendResult> {
    if (input.phone.endsWith("0000")) throw new Error("fake: unreachable number");
    const providerId = `fake-${Date.now()}-${++this.counter}`;
    fakeSmsOutbox.push({ ...input, providerId });
    if (fakeSmsOutbox.length > 500) fakeSmsOutbox.splice(0, fakeSmsOutbox.length - 500);
    return { providerId };
  }

  async listTemplates(): Promise<Array<{ id: string; text: string }>> {
    return [
      { id: "fake-1", text: "Hurmatli {studentName}, {groupName} guruhidagi darsingiz {date}." },
      { id: "fake-2", text: "{centerName}: to'lovingiz qabul qilindi, {amount}." },
    ];
  }
}

/**
 * Eskiz (notify.eskiz.uz) REST adapter: token login, then one POST per message.
 * Written from the public API description and not yet run against a live
 * account (A-84), so errors surface as FAILED rows in the SMS log.
 */
export class EskizSmsProvider implements SmsProvider {
  readonly name = "eskiz" as const;
  private token: string | null = null;
  private readonly baseUrl: string;

  constructor(private readonly config: EskizConfig) {
    this.baseUrl = config.baseUrl ?? "https://notify.eskiz.uz";
  }

  private async login(): Promise<string> {
    const body = new FormData();
    body.set("email", this.config.email);
    body.set("password", this.config.password);
    const res = await fetch(`${this.baseUrl}/api/auth/login`, { method: "POST", body });
    const data = (await res.json().catch(() => null)) as { data?: { token?: string } } | null;
    if (!res.ok || !data?.data?.token) throw new Error(`eskiz: login failed (${res.status})`);
    this.token = data.data.token;
    return this.token;
  }

  private async authed(path: string, init: RequestInit, retry = true): Promise<Response> {
    const token = this.token ?? (await this.login());
    const res = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}` },
    });
    if (res.status === 401 && retry) {
      this.token = null;
      return this.authed(path, init, false);
    }
    return res;
  }

  async send(input: { phone: string; text: string }): Promise<SmsSendResult> {
    const body = new FormData();
    body.set("mobile_phone", input.phone.replace(/^\+/, ""));
    body.set("message", input.text);
    body.set("from", this.config.sender);
    const res = await this.authed("/api/message/sms", { method: "POST", body });
    const data = (await res.json().catch(() => null)) as {
      id?: string | number;
      message?: string;
    } | null;
    if (!res.ok) throw new Error(`eskiz: ${data?.message ?? res.statusText} (${res.status})`);
    return { providerId: String(data?.id ?? "") };
  }

  async listTemplates(): Promise<Array<{ id: string; text: string }>> {
    const res = await this.authed("/api/user/templates", { method: "GET" });
    const data = (await res.json().catch(() => null)) as {
      result?: Array<{ id: string | number; template: string }>;
    } | null;
    if (!res.ok) throw new Error(`eskiz: templates failed (${res.status})`);
    return (data?.result ?? []).map((t) => ({ id: String(t.id), text: t.template }));
  }
}

let fake: FakeSmsProvider | null = null;

/** The configured provider: Eskiz when enabled with credentials, otherwise the fake. */
export function createSmsProvider(
  config: { isEnabled: boolean; email: string; password: string; sender: string } | null,
): SmsProvider {
  if (config?.isEnabled && config.email && config.password) {
    return new EskizSmsProvider({
      email: config.email,
      password: config.password,
      sender: config.sender || "4546",
    });
  }
  fake ??= new FakeSmsProvider();
  return fake;
}
