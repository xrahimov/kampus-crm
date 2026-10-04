/**
 * AmoCRM (EXP §8 Settings → Integrations → AmoCRM) behind an interface (A-20).
 * The real client exchanges the Authorization Code for tokens once, refreshes
 * them when they expire and creates a lead in amoCRM for every Kampus lead.
 */
export interface AmoCrmLead {
  name: string;
  phone?: string | null;
  source?: string | null;
}

export interface AmoCrmTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: string; // ISO
}

export interface AmoCrmClient {
  readonly name: "fake" | "amocrm";
  /** Checks the credentials; returns the account name when they work. */
  testConnection(): Promise<{ ok: boolean; account?: string; error?: string }>;
  pushLead(lead: AmoCrmLead): Promise<{ externalId: string }>;
  /** Tokens to persist after a call (the real client rotates them). */
  tokens(): AmoCrmTokens | null;
}

export interface AmoCrmConfig {
  secretKey: string;
  integrationId: string;
  authorizationCode: string;
  subDomain: string;
  redirectUri: string;
  tokens: AmoCrmTokens | null;
}

export const fakeAmoCrmLeads: AmoCrmLead[] = [];

export class FakeAmoCrmClient implements AmoCrmClient {
  readonly name = "fake" as const;
  async testConnection() {
    return { ok: true, account: "fake" };
  }
  async pushLead(lead: AmoCrmLead) {
    fakeAmoCrmLeads.push(lead);
    if (fakeAmoCrmLeads.length > 500) fakeAmoCrmLeads.splice(0, fakeAmoCrmLeads.length - 500);
    return { externalId: `fake-${fakeAmoCrmLeads.length}` };
  }
  tokens() {
    return null;
  }
}

export class HttpAmoCrmClient implements AmoCrmClient {
  readonly name = "amocrm" as const;
  private current: AmoCrmTokens | null;

  constructor(private readonly config: AmoCrmConfig) {
    this.current = config.tokens;
  }

  private get base() {
    return `https://${this.config.subDomain}.amocrm.ru`;
  }

  private async oauth(body: Record<string, string>): Promise<AmoCrmTokens> {
    const res = await fetch(`${this.base}/oauth2/access_token`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        client_id: this.config.integrationId,
        client_secret: this.config.secretKey,
        redirect_uri: this.config.redirectUri,
        ...body,
      }),
    });
    const data = (await res.json().catch(() => null)) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      hint?: string;
    } | null;
    if (!res.ok || !data?.access_token || !data.refresh_token) {
      throw new Error(`amocrm: oauth failed (${res.status}) ${data?.hint ?? ""}`.trim());
    }
    this.current = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: new Date(Date.now() + (data.expires_in ?? 86_400) * 1000).toISOString(),
    };
    return this.current;
  }

  private async token(): Promise<string> {
    if (!this.current) {
      return (
        await this.oauth({ grant_type: "authorization_code", code: this.config.authorizationCode })
      ).accessToken;
    }
    if (new Date(this.current.expiresAt).getTime() - Date.now() < 60_000) {
      return (
        await this.oauth({ grant_type: "refresh_token", refresh_token: this.current.refreshToken })
      ).accessToken;
    }
    return this.current.accessToken;
  }

  async testConnection() {
    try {
      const token = await this.token();
      const res = await fetch(`${this.base}/api/v4/account`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = (await res.json().catch(() => null)) as { name?: string } | null;
      if (!res.ok) return { ok: false, error: `amocrm: account failed (${res.status})` };
      return { ok: true, account: data?.name };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  async pushLead(lead: AmoCrmLead) {
    const token = await this.token();
    const res = await fetch(`${this.base}/api/v4/leads/complex`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify([
        {
          name: lead.name,
          _embedded: lead.phone
            ? {
                contacts: [
                  {
                    name: lead.name,
                    custom_fields_values: [
                      {
                        field_code: "PHONE",
                        values: [{ value: lead.phone, enum_code: "WORK" }],
                      },
                    ],
                  },
                ],
              }
            : undefined,
        },
      ]),
    });
    const data = (await res.json().catch(() => null)) as Array<{ id?: number }> | null;
    if (!res.ok) throw new Error(`amocrm: lead failed (${res.status})`);
    return { externalId: String(data?.[0]?.id ?? "") };
  }

  tokens() {
    return this.current;
  }
}

let fake: FakeAmoCrmClient | null = null;

export function createAmoCrmClient(
  config:
    | (Omit<AmoCrmConfig, "redirectUri" | "tokens"> & {
        isEnabled: boolean;
        tokens?: AmoCrmTokens | null;
      })
    | null,
  redirectUri: string,
): AmoCrmClient {
  if (config?.isEnabled && config.subDomain && config.integrationId && config.secretKey) {
    return new HttpAmoCrmClient({ ...config, redirectUri, tokens: config.tokens ?? null });
  }
  fake ??= new FakeAmoCrmClient();
  return fake;
}
