import { expect, test, type Page } from "@playwright/test";

const CEO_PHONE = process.env.SEED_ADMIN_PHONE ?? "+998900000001";
const PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "Kampus!2026";

async function signIn(page: Page, phone: string) {
  await page.goto("/en/login");
  await page.getByLabel("Phone number").fill(phone);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/en\/(dashboard|today)/);
}

interface Org {
  id: string;
  name: string;
  domain: string | null;
}

test.describe("own address per centre", () => {
  test("the site owner gives a centre an address; the login page and the certificate check follow it", async ({
    page,
    request,
  }) => {
    await signIn(page, CEO_PHONE);
    const cookies = await page.context().cookies();
    const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
    const csrf = cookies.find((c) => c.name === "kampus_csrf")?.value ?? "";
    const headers = {
      cookie: cookieHeader,
      "x-csrf-token": csrf,
      "content-type": "application/json",
    };

    const list = await page.request.get("/api/v1/organizations", {
      headers: { cookie: cookieHeader },
    });
    expect(list.status()).toBe(200);
    const orgs = (await list.json()) as Org[];
    const org = orgs.find((o) => o.id === "org_demo") ?? orgs[0];
    if (!org) throw new Error("no organisation to test with");
    const domain = `e2e-${Date.now()}.kampus.test`;

    const patch = async (value: string) => {
      const res = await page.request.patch(`/api/v1/organizations/${org.id}`, {
        headers,
        data: { name: org.name, domain: value },
      });
      expect(res.status()).toBe(200);
      return (await res.json()) as Org;
    };

    try {
      expect((await patch(domain)).domain).toBe(domain);

      // The list shows the address.
      await page.goto("/en/settings/organizations");
      await expect(
        page.getByTestId("organization-domain").filter({ hasText: domain }),
      ).toBeVisible();

      // A visit on that name brands the login page; the main address stays Kampus.
      // (The page also embeds every translation for the client, so the checks
      // look at rendered markup, not bare substrings.)
      const branded = await request.get("/en/login", { headers: { "x-forwarded-host": domain } });
      expect(branded.status()).toBe(200);
      const brandedHtml = await branded.text();
      expect(brandedHtml).toContain(`${org.name}</h2>`);
      expect(brandedHtml).toContain(">Powered by Kampus<");
      const plainHtml = await (await request.get("/en/login")).text();
      expect(plainHtml).toContain("Kampus</h2>");
      expect(plainHtml).toContain(">Learning center CRM<");
      expect(plainHtml).not.toContain(">Powered by Kampus<");

      // Caddy's certificate check: only the main address and claimed names.
      expect((await request.get(`/api/v1/public/tls-ask?domain=${domain}`)).status()).toBe(200);
      expect((await request.get("/api/v1/public/tls-ask?domain=nobody.example.com")).status()).toBe(
        403,
      );
      expect((await request.get("/api/v1/public/tls-ask?domain=127.0.0.1")).status()).toBe(403);
      expect((await request.get("/api/v1/public/tls-ask")).status()).toBe(403);

      // Not a host name: refused with a field error.
      const bad = await page.request.patch(`/api/v1/organizations/${org.id}`, {
        headers,
        data: { name: org.name, domain: "https://x.uz" },
      });
      expect(bad.status()).toBe(400);
    } finally {
      expect((await patch("")).domain).toBeNull();
    }
    expect((await request.get(`/api/v1/public/tls-ask?domain=${domain}`)).status()).toBe(403);
  });
});
