import { fireEvent, screen, waitFor } from "@testing-library/react-native";

import { MASKED, type Integration, type IntegrationProvider } from "@/api/office-integrations";
import { nativeRoute } from "@/features/office/site-paths";
import { AmoCrmScreen } from "@/features/settings/amocrm-screen";
import { FaceIdScreen } from "@/features/settings/face-id-screen";
import { IntegrationsScreen } from "@/features/settings/integrations-screen";
import { answer, clearClients, renderScreen, sentBody } from "@/features/student/test-support";

jest.mock("@react-native-async-storage/async-storage", () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);
jest.mock("expo-localization", () => ({ getLocales: () => [{ languageCode: "en" }] }));
jest.mock("expo-router", () => ({
  useRouter: () => ({
    push: jest.fn(),
    back: jest.fn(),
    canGoBack: () => true,
    replace: jest.fn(),
  }),
}));
let mockPermissions = ["settings.integrations", "leads.view"];
let mockBranches = [{ id: "b1", name: "Chilonzor" }];
jest.mock("@/lib/session", () => ({
  useMe: () => ({
    user: { id: "me" },
    permissions: mockPermissions,
    view: { current: "FULL", canSwitch: false },
    branches: mockBranches,
    activeBranch: mockBranches[0],
  }),
  can: (me: { permissions: string[] }, permission: string) =>
    me.permissions.includes("*") || me.permissions.includes(permission),
}));

/*
 * Integrations, AmoCRM and FaceID in the app (A-249): the site's three pages
 * under Settings. Each test plays the server. The secrets here are made up.
 */

type Call = [url: string, init?: RequestInit];
const fetchMock = jest.fn<Promise<Response>, Call>();
const realFetch = globalThis.fetch;

beforeEach(() => {
  fetchMock.mockReset();
  mockPermissions = ["settings.integrations", "leads.view"];
  mockBranches = [{ id: "b1", name: "Chilonzor" }];
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});
afterEach(() => {
  clearClients();
  globalThis.fetch = realFetch;
});

function calls(method: string, tail: string): Call[] {
  return fetchMock.mock.calls.filter(
    ([url, init]) => (init?.method ?? "GET") === method && url.split("?")[0]!.endsWith(tail),
  );
}

type Routes = Record<string, unknown | ((url: string) => unknown)>;
function serve(routes: Routes) {
  fetchMock.mockImplementation(async (url, init) => {
    const method = init?.method ?? "GET";
    const path = url.split("?")[0]!;
    const key = Object.keys(routes).find((k) => {
      const [verb, tail] = k.split(" ") as [string, string];
      return verb === method && path.endsWith(tail);
    });
    if (!key) return answer(404, { error: { code: "NOT_FOUND", message: "errors.notFound" } });
    const route = routes[key];
    const body = typeof route === "function" ? (route as (url: string) => unknown)(url) : route;
    if (body && typeof body === "object" && "ok" in body && "text" in body) return body as Response;
    return answer(body === undefined ? 204 : 200, body);
  });
}

function service(
  provider: IntegrationProvider,
  config: Record<string, unknown>,
  more: Partial<Integration> = {},
): Integration {
  return { provider, isEnabled: false, config, state: {}, updatedAt: null, ...more };
}

const SMS = service("SMS", { email: "office@example.uz", password: MASKED, sender: "4546" });
const TELEGRAM = service(
  "TELEGRAM",
  {
    botToken: MASKED,
    botUsername: "centre_bot",
    webhookSecret: MASKED,
    weeklyReport: true,
    lessonSummary: false,
    loginClientId: "",
    loginClientSecret: "",
    sharedWithAllCentres: true,
  },
  { isEnabled: true, state: { sharedBot: null }, updatedAt: "2026-11-20T10:00:00.000Z" },
);
const VIDEO = service(
  "VIDEO",
  {
    stunUrls: "stun:stun.example.org:3478",
    turnUrls: "",
    turnUsername: "",
    turnCredential: "",
    turnSecret: "",
    maxParticipants: 12,
    recordingKeepDays: 90,
    hlsRecordings: false,
    attendanceMinutes: 10,
    noShowMinutes: 15,
  },
  { isEnabled: true },
);
const AMOCRM = service("AMOCRM", {
  secretKey: "",
  integrationId: "",
  authorizationCode: "",
  subDomain: "",
  webhookSecret: "",
  leadSourceName: "Instagram",
  leadColumnId: "",
});
const FACE_ID = service("FACE_ID", { webhookSecret: MASKED, lateAfterMinutes: 5 });
const ALL: Integration[] = [
  SMS,
  TELEGRAM,
  AMOCRM,
  service("TELEPHONY", { webhookSecret: "" }),
  FACE_ID,
  VIDEO,
  service("PAYME", { merchantId: "", key: "", checkoutUrl: "https://checkout.paycom.uz" }),
  service("CLICK", { serviceId: "", merchantId: "", merchantUserId: "", secretKey: "" }),
  service("FISCAL", {
    apiUrl: "",
    apiKey: "",
    inn: "",
    cashRegisterId: "",
    vatPercent: 12,
    ikpuCode: "",
    autoIssue: true,
  }),
  service("INSTAGRAM", {
    webhookSecret: "",
    verifyToken: "",
    appSecret: "",
    pageAccessToken: "",
    instagramAccountId: "",
    welcomeReply: true,
  }),
  service("AI", { apiKey: "", model: "claude-opus-5-5" }),
];

const refusal = (fields: Record<string, string[]>) =>
  answer(400, { error: { code: "VALIDATION", message: "errors.validation", fields } });

describe("where the pages live", () => {
  it("opens Integrations, AmoCRM and FaceID in the app", () => {
    expect(nativeRoute("/settings/integrations")).toBe("/staff/settings/integrations");
    expect(nativeRoute("/settings/integrations/amocrm")).toBe(
      "/staff/settings/integrations/amocrm",
    );
    expect(nativeRoute("/settings/integrations/face-id")).toBe(
      "/staff/settings/integrations/face-id",
    );
    expect(nativeRoute("/settings/integrations/other")).toBeNull();
  });
});

describe("Integrations", () => {
  it("lists the nine services of the page and says which are on", async () => {
    serve({ "GET /integrations": ALL });
    await renderScreen(<IntegrationsScreen />);
    await screen.findByTestId("integrations-list");
    for (const id of [
      "sms",
      "telegram",
      "telephony",
      "video",
      "payme",
      "click",
      "fiscal",
      "instagram",
      "ai",
    ]) {
      expect(screen.getByTestId(`integration-row-${id}`)).toBeOnTheScreen();
    }
    // AmoCRM and FaceID have pages of their own.
    expect(screen.queryByTestId("integration-row-amocrm")).toBeNull();
    expect(screen.queryByTestId("integration-row-face-id")).toBeNull();
    expect(screen.getByTestId("integration-state-telegram")).toHaveTextContent("Enabled");
    expect(screen.getByTestId("integration-state-sms")).toHaveTextContent("Inactive");
  });

  it("opens a service, changes it and leaves an untouched secret as it is", async () => {
    serve({
      "GET /integrations": ALL,
      "PUT /integrations/sms": {
        ...SMS,
        isEnabled: true,
        config: { ...SMS.config, sender: "KAMPUS" },
      },
    });
    await renderScreen(<IntegrationsScreen />);
    await fireEvent.press(await screen.findByTestId("integration-row-sms"));
    expect(await screen.findByTestId("sms-email")).toHaveProp("value", "office@example.uz");
    // What is typed into a secret is hidden.
    expect(screen.getByTestId("sms-password")).toHaveProp("secureTextEntry", true);
    expect(screen.getByTestId("sms-email").props.secureTextEntry).toBeFalsy();
    await fireEvent.press(screen.getByTestId("sms-enabled"));
    await fireEvent.changeText(screen.getByTestId("sms-sender"), "KAMPUS");
    await fireEvent.press(screen.getByTestId("sms-save"));
    expect(await screen.findByTestId("sms-saved")).toHaveTextContent("Saved.");
    expect(sentBody(calls("PUT", "/integrations/sms")[0]![1])).toEqual({
      isEnabled: true,
      email: "office@example.uz",
      password: MASKED,
      sender: "KAMPUS",
    });
    // Any change after the save takes "Saved." away.
    await fireEvent.changeText(screen.getByTestId("sms-sender"), "KAMPUS2");
    expect(screen.queryByTestId("sms-saved")).toBeNull();
  });

  it("masks a secret again once it is saved", async () => {
    // The list comes anew after a save, with the service's new time on it.
    let saved = false;
    const after = service(
      "TELEPHONY",
      { webhookSecret: MASKED },
      { updatedAt: "2026-11-24T06:30:00.000Z" },
    );
    serve({
      "GET /integrations": () =>
        saved ? ALL.map((one) => (one.provider === "TELEPHONY" ? after : one)) : ALL,
      "PUT /integrations/telephony": () => {
        saved = true;
        return after;
      },
    });
    await renderScreen(<IntegrationsScreen />);
    await fireEvent.press(await screen.findByTestId("integration-row-telephony"));
    await fireEvent.changeText(await screen.findByTestId("telephony-webhookSecret"), "made-up-1");
    await fireEvent.press(screen.getByTestId("telephony-save"));
    await screen.findByTestId("telephony-saved");
    expect(sentBody(calls("PUT", "/integrations/telephony")[0]![1])).toEqual({
      isEnabled: false,
      webhookSecret: "made-up-1",
    });
    expect(screen.getByTestId("telephony-webhookSecret")).toHaveProp("value", MASKED);
    // "Saved." is still there once the list has come anew.
    await waitFor(() => expect(calls("GET", "/integrations")).toHaveLength(2));
    expect(screen.getByTestId("telephony-saved")).toBeOnTheScreen();
    // The address a provider calls stands under the fields.
    expect(screen.getByTestId("telephony-webhook")).toHaveTextContent(
      /\/api\/v1\/webhooks\/telephony$/,
    );
  });

  it("keeps the shared-bot tick from everyone but the server's owner", async () => {
    serve({ "GET /integrations": ALL, "PUT /integrations/telegram": TELEGRAM });
    await renderScreen(<IntegrationsScreen />);
    await fireEvent.press(await screen.findByTestId("integration-row-telegram"));
    await screen.findByTestId("telegram-botUsername");
    expect(screen.queryByTestId("telegram-sharedWithAllCentres")).toBeNull();
    await fireEvent.press(screen.getByTestId("telegram-lessonSummary"));
    await fireEvent.press(screen.getByTestId("telegram-save"));
    await screen.findByTestId("telegram-saved");
    // What the server holds for the hidden tick goes back as it was.
    expect(sentBody(calls("PUT", "/integrations/telegram")[0]![1])).toEqual({
      isEnabled: true,
      botToken: MASKED,
      botUsername: "centre_bot",
      webhookSecret: MASKED,
      weeklyReport: true,
      lessonSummary: true,
      loginClientId: "",
      loginClientSecret: "",
      sharedWithAllCentres: true,
    });
  });

  it("shows the owner the tick, and a centre the bot that serves it", async () => {
    const owner = { ...TELEGRAM, state: { sharedBot: null, mayShare: true } };
    serve({ "GET /integrations": ALL.map((one) => (one.provider === "TELEGRAM" ? owner : one)) });
    await renderScreen(<IntegrationsScreen />);
    await fireEvent.press(await screen.findByTestId("integration-row-telegram"));
    expect(await screen.findByTestId("telegram-sharedWithAllCentres")).toBeOnTheScreen();
    expect(screen.queryByTestId("telegram-shared-bot")).toBeNull();
    clearClients();

    const served = { ...TELEGRAM, state: { sharedBot: { username: "kampus_crm_bot" } } };
    serve({ "GET /integrations": ALL.map((one) => (one.provider === "TELEGRAM" ? served : one)) });
    await renderScreen(<IntegrationsScreen />);
    await fireEvent.press(await screen.findByTestId("integration-row-telegram"));
    expect(await screen.findByTestId("telegram-shared-bot")).toHaveTextContent(/@kampus_crm_bot/);
  });

  it("sends numbers as numbers and shows a refusal under its field", async () => {
    serve({
      "GET /integrations": ALL,
      "PUT /integrations/video": refusal({ stunUrls: ["validation.iceUrl"] }),
    });
    await renderScreen(<IntegrationsScreen />);
    await fireEvent.press(await screen.findByTestId("integration-row-video"));
    // Only digits go into a number.
    await fireEvent.changeText(await screen.findByTestId("video-maxParticipants"), "8 people");
    expect(screen.getByTestId("video-maxParticipants")).toHaveProp("value", "8");
    await fireEvent.changeText(screen.getByTestId("video-stunUrls"), "stun.example.org");
    await fireEvent.press(screen.getByTestId("video-hlsRecordings"));
    await fireEvent.press(screen.getByTestId("video-save"));
    expect(
      await screen.findByText(
        "Enter addresses starting with stun:, turn: or turns:, separated by commas.",
      ),
    ).toBeOnTheScreen();
    // Said once, under the field, not again above the button.
    expect(screen.queryByTestId("video-problem")).toBeNull();
    expect(screen.queryByTestId("video-saved")).toBeNull();
    expect(sentBody(calls("PUT", "/integrations/video")[0]![1])).toMatchObject({
      isEnabled: true,
      stunUrls: "stun.example.org",
      maxParticipants: 8,
      recordingKeepDays: 90,
      hlsRecordings: true,
      attendanceMinutes: 10,
      noShowMinutes: 15,
    });
  });

  it("starts a service again from what the server holds when it is opened anew", async () => {
    serve({ "GET /integrations": ALL });
    await renderScreen(<IntegrationsScreen />);
    await fireEvent.press(await screen.findByTestId("integration-row-sms"));
    await fireEvent.changeText(await screen.findByTestId("sms-sender"), "typed");
    await fireEvent.press(screen.getByTestId("integration-form-close"));
    await waitFor(() => expect(screen.queryByTestId("sms-sender")).toBeNull());
    await fireEvent.press(screen.getByTestId("integration-row-ai"));
    expect(await screen.findByTestId("ai-model")).toHaveProp("value", "claude-opus-5-5");
    await fireEvent.press(screen.getByTestId("integration-form-close"));
    await waitFor(() => expect(screen.queryByTestId("ai-model")).toBeNull());
    await fireEvent.press(screen.getByTestId("integration-row-sms"));
    expect(await screen.findByTestId("sms-sender")).toHaveProp("value", "4546");
  });

  it("runs the waiting jobs and says what came of it", async () => {
    serve({
      "GET /integrations": ALL,
      "POST /jobs/run": { claimed: 3, done: 2, failed: 1, pending: 4 },
    });
    await renderScreen(<IntegrationsScreen />);
    await fireEvent.press(await screen.findByTestId("run-queue"));
    expect(await screen.findByTestId("queue-result")).toHaveTextContent(
      "Claimed 3, done 2, failed 1; 4 still pending.",
    );
  });
});

describe("a refusal no field can show", () => {
  it("is said above the button", async () => {
    serve({
      "GET /integrations/face-id": FACE_ID,
      "PUT /integrations/face-id": answer(403, {
        error: { code: "FORBIDDEN", message: "errors.forbidden" },
      }),
    });
    await renderScreen(<FaceIdScreen />);
    await fireEvent.press(await screen.findByTestId("face-id-save"));
    expect(await screen.findByTestId("face-id-problem")).toBeOnTheScreen();
    expect(screen.queryByTestId("face-id-saved")).toBeNull();
  });
});

describe("AmoCRM", () => {
  const OPTIONS = {
    teachers: [],
    sources: [],
    lessonTimes: [],
    owners: [],
    groups: [],
    courses: [],
    waiting: 0,
    unreadConversations: 0,
    boards: [
      {
        id: "bd1",
        name: "Main board",
        branchId: "b1",
        columns: [
          { id: "c1", name: "New" },
          { id: "c2", name: "Called" },
        ],
      },
    ],
  };

  it("chooses the column for amoCRM's leads from the boards", async () => {
    serve({
      "GET /integrations/amocrm": AMOCRM,
      "GET /leads/options": OPTIONS,
      "PUT /integrations/amocrm": { ...AMOCRM, updatedAt: "2026-11-24T06:00:00.000Z" },
    });
    await renderScreen(<AmoCrmScreen />);
    expect(await screen.findByTestId("amocrm-state")).toHaveTextContent("Not connected yet.");
    await fireEvent.changeText(screen.getByTestId("amocrm-subDomain"), "mycentre");
    await fireEvent.press(screen.getByTestId("amocrm-leadColumnId"));
    await fireEvent.press(await screen.findByTestId("amocrm-leadColumnId-option-c2"));
    await fireEvent.press(screen.getByTestId("amocrm-save"));
    await waitFor(() => expect(calls("PUT", "/integrations/amocrm")).toHaveLength(1));
    expect(sentBody(calls("PUT", "/integrations/amocrm")[0]![1])).toEqual({
      isEnabled: false,
      secretKey: "",
      integrationId: "",
      authorizationCode: "",
      subDomain: "mycentre",
      webhookSecret: "",
      leadSourceName: "Instagram",
      leadColumnId: "c2",
    });
  });

  it("names the branch of a board when the person has more than one", async () => {
    mockBranches = [
      { id: "b1", name: "Chilonzor" },
      { id: "b2", name: "Yunusobod" },
    ];
    serve({ "GET /integrations/amocrm": AMOCRM, "GET /leads/options": OPTIONS });
    await renderScreen(<AmoCrmScreen />);
    await fireEvent.press(await screen.findByTestId("amocrm-leadColumnId"));
    expect(await screen.findByTestId("amocrm-leadColumnId-option-c1")).toHaveTextContent(
      /Chilonzor · Main board · New/,
    );
  });

  it("keeps the column that is set for someone who may not see leads", async () => {
    mockPermissions = ["settings.integrations"];
    const set = { ...AMOCRM, config: { ...AMOCRM.config, leadColumnId: "c9" } };
    serve({ "GET /integrations/amocrm": set, "PUT /integrations/amocrm": set });
    await renderScreen(<AmoCrmScreen />);
    await fireEvent.press(await screen.findByTestId("amocrm-save"));
    await waitFor(() => expect(calls("PUT", "/integrations/amocrm")).toHaveLength(1));
    expect(sentBody(calls("PUT", "/integrations/amocrm")[0]![1])).toMatchObject({
      leadColumnId: "c9",
    });
    expect(calls("GET", "/leads/options")).toHaveLength(0);
  });

  it("tests the connection and says who answered", async () => {
    serve({
      "GET /integrations/amocrm": { ...AMOCRM, state: { hasTokens: true } },
      "GET /leads/options": OPTIONS,
      "POST /integrations/amocrm-test": { ok: true, account: "mycentre", adapter: "http" },
    });
    await renderScreen(<AmoCrmScreen />);
    expect(await screen.findByTestId("amocrm-state")).toHaveTextContent(
      "Tokens are stored; the connection works.",
    );
    await fireEvent.press(screen.getByTestId("amocrm-test"));
    expect(await screen.findByTestId("amocrm-test-result")).toHaveTextContent(
      "Connected: mycentre",
    );
  });

  it("says so when amoCRM refuses, and when only the stand-in answered", async () => {
    let reply: unknown = { ok: false, error: "errors.integration", adapter: "http" };
    serve({
      "GET /integrations/amocrm": AMOCRM,
      "GET /leads/options": OPTIONS,
      "POST /integrations/amocrm-test": () => reply,
    });
    await renderScreen(<AmoCrmScreen />);
    await fireEvent.press(await screen.findByTestId("amocrm-test"));
    await screen.findByTestId("amocrm-test-result");
    expect(screen.queryByText(/Connected:/)).toBeNull();
    reply = { ok: true, adapter: "fake" };
    await fireEvent.press(screen.getByTestId("amocrm-test"));
    await waitFor(() =>
      expect(screen.getByTestId("amocrm-test-result")).toHaveTextContent(
        "No credentials yet; the fake client answered.",
      ),
    );
  });
});

describe("FaceID", () => {
  it("saves after how many minutes a check-in is late", async () => {
    let now = FACE_ID;
    serve({
      "GET /integrations/face-id": () => now,
      "PUT /integrations/face-id": () => {
        now = {
          ...FACE_ID,
          config: { ...FACE_ID.config, lateAfterMinutes: 10 },
          updatedAt: "2026-11-24T06:30:00.000Z",
        };
        return now;
      },
    });
    await renderScreen(<FaceIdScreen />);
    await fireEvent.changeText(await screen.findByTestId("face-id-lateAfterMinutes"), "10");
    await fireEvent.press(screen.getByTestId("face-id-save"));
    await screen.findByTestId("face-id-saved");
    // The page asks for the service anew; "Saved." and the new value stay.
    await waitFor(() => expect(calls("GET", "/integrations/face-id")).toHaveLength(2));
    expect(screen.getByTestId("face-id-saved")).toBeOnTheScreen();
    expect(screen.getByTestId("face-id-lateAfterMinutes")).toHaveProp("value", "10");
    expect(sentBody(calls("PUT", "/integrations/face-id")[0]![1])).toEqual({
      isEnabled: false,
      webhookSecret: MASKED,
      lateAfterMinutes: 10,
    });
    expect(screen.getByTestId("face-id-webhook")).toHaveTextContent(
      /\/api\/v1\/webhooks\/face-id$/,
    );
  });
});
