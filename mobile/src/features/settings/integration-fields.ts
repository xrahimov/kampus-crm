import type { IntegrationProvider } from "@/api/office-integrations";

/**
 * One field of a service's form (A-249). `secret` hides what is typed and
 * comes back masked; "number" takes digits; "boolean" is a tick.
 */
export interface IntegrationField {
  key: string;
  secret?: boolean;
  type?: "number" | "boolean";
}

/**
 * Every service's fields in the site's order (its Integrations, AmoCRM and
 * FaceID pages). A site test reads this file and fails when a field of the
 * server's schema is missing here or one here is not in the schema.
 *
 * amoCRM's `leadColumnId` is a choice from the boards' columns and Telegram's
 * `sharedWithAllCentres` is the server owner's alone: the screens add those
 * two themselves.
 */
export const INTEGRATION_FIELDS: Record<IntegrationProvider, IntegrationField[]> = {
  SMS: [{ key: "email" }, { key: "password", secret: true }, { key: "sender" }],
  TELEGRAM: [
    { key: "botToken", secret: true },
    { key: "botUsername" },
    { key: "webhookSecret", secret: true },
    { key: "weeklyReport", type: "boolean" },
    { key: "lessonSummary", type: "boolean" },
    { key: "loginClientId" },
    { key: "loginClientSecret", secret: true },
    { key: "sharedWithAllCentres", type: "boolean" },
  ],
  TELEPHONY: [{ key: "webhookSecret", secret: true }],
  VIDEO: [
    { key: "stunUrls" },
    { key: "turnUrls" },
    { key: "turnUsername" },
    { key: "turnCredential", secret: true },
    { key: "turnSecret", secret: true },
    { key: "maxParticipants", type: "number" },
    { key: "recordingKeepDays", type: "number" },
    { key: "hlsRecordings", type: "boolean" },
    { key: "attendanceMinutes", type: "number" },
    { key: "noShowMinutes", type: "number" },
  ],
  PAYME: [{ key: "merchantId" }, { key: "key", secret: true }, { key: "checkoutUrl" }],
  CLICK: [
    { key: "serviceId" },
    { key: "merchantId" },
    { key: "merchantUserId" },
    { key: "secretKey", secret: true },
  ],
  FISCAL: [
    { key: "apiUrl" },
    { key: "apiKey", secret: true },
    { key: "inn" },
    { key: "cashRegisterId" },
    { key: "vatPercent", type: "number" },
    { key: "ikpuCode" },
    { key: "autoIssue", type: "boolean" },
  ],
  INSTAGRAM: [
    { key: "webhookSecret", secret: true },
    { key: "verifyToken", secret: true },
    { key: "appSecret", secret: true },
    { key: "pageAccessToken", secret: true },
    { key: "instagramAccountId" },
    { key: "welcomeReply", type: "boolean" },
  ],
  AI: [{ key: "apiKey", secret: true }, { key: "model" }],
  AMOCRM: [
    { key: "secretKey", secret: true },
    { key: "integrationId" },
    { key: "authorizationCode", secret: true },
    { key: "subDomain" },
    { key: "webhookSecret", secret: true },
    { key: "leadSourceName" },
    { key: "leadColumnId" },
  ],
  FACE_ID: [
    { key: "webhookSecret", secret: true },
    { key: "lateAfterMinutes", type: "number" },
  ],
};

/** The services of the Integrations page, in its order; amoCRM and FaceID have pages of their own. */
export const INTEGRATIONS_PAGE: IntegrationProvider[] = [
  "SMS",
  "TELEGRAM",
  "TELEPHONY",
  "VIDEO",
  "PAYME",
  "CLICK",
  "FISCAL",
  "INSTAGRAM",
  "AI",
];

/** The end of each service's webhook address, after "/api/v1/webhooks/"; null when it has none. */
export const WEBHOOK_PATH: Record<IntegrationProvider, string | null> = {
  SMS: null,
  TELEGRAM: "telegram?secret=…",
  TELEPHONY: "telephony",
  VIDEO: null,
  PAYME: "payme",
  CLICK: "click",
  FISCAL: null,
  INSTAGRAM: "instagram?secret=…",
  AI: null,
  AMOCRM: "amocrm?secret=…",
  FACE_ID: "face-id",
};

/** The sentences under each service's fields, as keys under "integrations.<SERVICE>". */
export const HINTS: Record<IntegrationProvider, string[]> = {
  SMS: [],
  TELEGRAM: [],
  TELEPHONY: [],
  VIDEO: ["hint", "retentionHint", "hlsHint"],
  PAYME: ["hint"],
  CLICK: ["hint"],
  FISCAL: ["hint"],
  INSTAGRAM: ["hint"],
  AI: ["hint"],
  AMOCRM: ["inboundHint"],
  FACE_ID: ["payloadHint"],
};
