import type { FormAnswer } from "@/lib/send-form";

/*
 * How a phone posts a form with a file (found on a device: a form given to
 * the `fetch` Expo installs is refused when a file is named by its address,
 * so photos, recordings and documents never left the phone).
 */

type Send = (
  url: string,
  headers: Record<string, string>,
  body: FormData | Uint8Array,
) => Promise<FormAnswer>;
// The test setup swaps this module for the web's; here the phone's own is wanted.
const { sendForm } = jest.requireActual<{ sendForm: Send }>("@/lib/send-form.native");

class FakeRequest {
  static last: FakeRequest | null = null;
  method = "";
  url = "";
  headers: Record<string, string> = {};
  body: unknown = null;
  withCredentials = true;
  status = 0;
  responseText = "";
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  ontimeout: (() => void) | null = null;
  onabort: (() => void) | null = null;
  constructor() {
    FakeRequest.last = this;
  }
  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }
  setRequestHeader(name: string, value: string) {
    this.headers[name] = value;
  }
  send(body: unknown) {
    this.body = body;
  }
}

const realRequest = globalThis.XMLHttpRequest;
const realFetch = globalThis.fetch;
const fetchMock = jest.fn();

beforeEach(() => {
  FakeRequest.last = null;
  fetchMock.mockReset();
  globalThis.XMLHttpRequest = FakeRequest as unknown as typeof XMLHttpRequest;
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});
afterEach(() => {
  globalThis.XMLHttpRequest = realRequest;
  globalThis.fetch = realFetch;
});

function formWithFile(): FormData {
  const form = new FormData();
  form.append("note", "Done");
  form.append("file", {
    uri: "file:///photos/page.jpg",
    name: "page.jpg",
    type: "image/jpeg",
  } as unknown as Blob);
  return form;
}

describe("posting a form from a phone", () => {
  it("goes out through the phone's own request, never through fetch, with the file by its address", async () => {
    const form = formWithFile();
    const sending = sendForm("https://kampus.test/api/v1/uploads/documents", { A: "1" }, form);
    const request = FakeRequest.last!;
    expect(fetchMock).not.toHaveBeenCalled();
    expect(request.method).toBe("POST");
    expect(request.url).toBe("https://kampus.test/api/v1/uploads/documents");
    expect(request.headers).toEqual({ A: "1" });
    expect(request.withCredentials).toBe(false);
    // The very form is handed over: React Native reads the file from its address.
    expect(request.body).toBe(form);
    // No Content-Type of our own: the form's boundary must be the request's.
    expect(Object.keys(request.headers).map((h) => h.toLowerCase())).not.toContain("content-type");

    request.status = 201;
    request.responseText = '{"url":"/api/v1/files/documents/page.jpg"}';
    request.onload?.();
    const answer = await sending;
    expect(answer.status).toBe(201);
    expect(answer.ok).toBe(true);
    expect(await answer.text()).toBe('{"url":"/api/v1/files/documents/page.jpg"}');
  });

  it("sends a picture made in the app as its bytes, with the type it was given", async () => {
    const png = new Uint8Array([137, 80, 78, 71]);
    const sending = sendForm(
      "https://kampus.test/api/v1/video/rooms/r1/board",
      { "Content-Type": "image/png" },
      png,
    );
    const request = FakeRequest.last!;
    expect(fetchMock).not.toHaveBeenCalled();
    expect(request.body).toBe(png);
    expect(request.headers).toEqual({ "Content-Type": "image/png" });
    request.status = 201;
    request.responseText = "{}";
    request.onload?.();
    expect((await sending).ok).toBe(true);
  });

  it("hands a refusal over with its status and text", async () => {
    const sending = sendForm("https://kampus.test/x", {}, formWithFile());
    const request = FakeRequest.last!;
    request.status = 422;
    request.responseText = '{"error":{"code":"VALIDATION"}}';
    request.onload?.();
    const answer = await sending;
    expect(answer.ok).toBe(false);
    expect(answer.status).toBe(422);
  });

  it("fails when nothing comes back", async () => {
    const sending = sendForm("https://kampus.test/x", {}, formWithFile());
    FakeRequest.last!.onerror?.();
    await expect(sending).rejects.toThrow();
  });
});
