import { Platform } from "react-native";

import { ApiError, NetworkError, setApiToken } from "@/lib/api";
import { saveFile } from "@/lib/save-file";
import { headerOf, nameOf, refusalOf } from "@/lib/save-file-parts";

const mockFetch = jest.fn();
const mockConfig = jest.fn();
const mockFs = {
  dirs: { CacheDir: "/cache" },
  exists: jest.fn<Promise<boolean>, [string]>(),
  mkdir: jest.fn<Promise<void>, [string]>(),
  unlink: jest.fn<Promise<void>, [string]>(),
  mv: jest.fn<Promise<void>, [string, string]>(),
};
const mockOpen = { file: jest.fn<Promise<void>, [string, unknown?]>() };
const mockMedia = { copyToMediaStore: jest.fn<Promise<string>, [unknown, string, string]>() };
jest.mock("react-native-blob-util", () => ({
  __esModule: true,
  default: {
    config: (options: unknown) => {
      mockConfig(options);
      return { fetch: (...args: unknown[]) => mockFetch(...args) };
    },
    // Read when used: the module is loaded before the lines above have run.
    get fs() {
      return mockFs;
    },
    get open() {
      return mockOpen;
    },
    get media() {
      return mockMedia;
    },
  },
}));

/*
 * A file the server makes, on its way to the phone (A-256): its name, the
 * server's refusal, and what an iPhone and an Android phone do with it.
 */

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const DISPOSITION = `attachment; filename="O_quvchilar.xlsx"; filename*=UTF-8''O%27quvchilar.xlsx`;

/** The phone's answer to the download: where it wrote the body, and what came with it. */
function fetched(status = 200, headers: Record<string, string> = {}, text = "") {
  const flush = jest.fn(async () => undefined);
  return {
    info: () => ({ status, headers }),
    path: () => "/cache/tmp_1",
    text: async () => text,
    flush,
  };
}

const realOS = Platform.OS;
beforeEach(() => {
  jest.clearAllMocks();
  setApiToken("token-1");
  mockFs.exists.mockResolvedValue(false);
  mockFs.mkdir.mockResolvedValue();
  mockFs.unlink.mockResolvedValue();
  mockFs.mv.mockResolvedValue();
  mockOpen.file.mockResolvedValue();
  mockMedia.copyToMediaStore.mockResolvedValue("content://downloads/1");
  mockFetch.mockResolvedValue(
    fetched(200, { "Content-Disposition": DISPOSITION, "Content-Type": XLSX }),
  );
});
afterEach(() => {
  Platform.OS = realOS;
  setApiToken(null);
});

describe("the name of a download", () => {
  it("is the server's own, in its full spelling where it gives one", () => {
    expect(nameOf(DISPOSITION, "kampus.xlsx")).toBe("O'quvchilar.xlsx");
    expect(nameOf('attachment; filename="Debtors.xlsx"', "kampus.xlsx")).toBe("Debtors.xlsx");
    expect(nameOf("attachment; filename=plain.xlsx", "kampus.xlsx")).toBe("plain.xlsx");
  });

  it("falls back when the server gives none or a broken one", () => {
    expect(nameOf(null, "kampus.xlsx")).toBe("kampus.xlsx");
    expect(nameOf("attachment", "kampus.xlsx")).toBe("kampus.xlsx");
    expect(nameOf(`attachment; filename="a.xlsx"; filename*=UTF-8''%E0%A4%A`, "k.xlsx")).toBe(
      "a.xlsx",
    );
  });

  it("is never a path", () => {
    expect(nameOf(`attachment; filename*=UTF-8''..%2F..%2Fsecret.xlsx`, "k.xlsx")).toBe(
      "_.._secret.xlsx",
    );
    expect(nameOf('attachment; filename="a/b\\c.xlsx"', "k.xlsx")).toBe("a_b_c.xlsx");
  });

  it("finds a header however the phone spelled it", () => {
    expect(headerOf({ "content-type": XLSX }, "content-type")).toBe(XLSX);
    expect(headerOf({ "Content-Type": XLSX }, "content-type")).toBe(XLSX);
    expect(headerOf(undefined, "content-type")).toBeNull();
  });
});

describe("the server's refusal", () => {
  it("is the error the app's other calls throw", () => {
    const error = refusalOf(
      403,
      JSON.stringify({ error: { code: "FORBIDDEN", message: "errors.forbidden" } }),
    );
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(403);
    expect(error.message).toBe("errors.forbidden");
  });

  it("is the general error when the answer is not the server's own", () => {
    expect(refusalOf(502, "<html>Bad gateway</html>").message).toBe("errors.internal");
  });
});

describe("a file fetched on an iPhone", () => {
  beforeEach(() => {
    Platform.OS = "ios";
  });

  it("is asked for with the session, kept under the server's name and shown", async () => {
    await expect(saveFile("/students/export.xlsx?locale=en", "kampus.xlsx")).resolves.toBe(
      "opened",
    );
    expect(mockConfig).toHaveBeenCalledWith({ fileCache: true });
    const [method, url, headers] = mockFetch.mock.calls[0] as [string, string, object];
    expect(method).toBe("GET");
    expect(url).toMatch(/\/api\/v1\/students\/export\.xlsx\?locale=en$/);
    expect(headers).toMatchObject({ Authorization: "Bearer token-1" });
    expect(mockFs.mkdir).toHaveBeenCalledWith("/cache/downloads");
    expect(mockFs.mv).toHaveBeenCalledWith("/cache/tmp_1", "/cache/downloads/O'quvchilar.xlsx");
    expect(mockOpen.file).toHaveBeenCalledWith("/cache/downloads/O'quvchilar.xlsx");
    // Downloads is Android's.
    expect(mockMedia.copyToMediaStore).not.toHaveBeenCalled();
  });

  it("replaces the file of the same name fetched before", async () => {
    mockFs.exists.mockResolvedValue(true);
    await saveFile("/students/export.xlsx?locale=en", "kampus.xlsx");
    expect(mockFs.mkdir).not.toHaveBeenCalled();
    expect(mockFs.unlink).toHaveBeenCalledWith("/cache/downloads/O'quvchilar.xlsx");
  });

  it("throws the server's refusal and keeps nothing", async () => {
    const answer = fetched(
      403,
      {},
      JSON.stringify({ error: { code: "FORBIDDEN", message: "errors.forbidden" } }),
    );
    mockFetch.mockResolvedValue(answer);
    await expect(saveFile("/debts/export.xlsx?locale=en", "kampus.xlsx")).rejects.toMatchObject({
      status: 403,
      message: "errors.forbidden",
    });
    expect(answer.flush).toHaveBeenCalled();
    expect(mockFs.mv).not.toHaveBeenCalled();
    expect(mockOpen.file).not.toHaveBeenCalled();
  });

  it("says the server could not be reached", async () => {
    mockFetch.mockRejectedValue(new Error("offline"));
    await expect(saveFile("/debts/export.xlsx?locale=en", "kampus.xlsx")).rejects.toBeInstanceOf(
      NetworkError,
    );
  });
});

describe("a file fetched on an Android phone", () => {
  beforeEach(() => {
    Platform.OS = "android";
  });

  it("goes to Downloads and is opened in the app that reads it", async () => {
    await expect(saveFile("/groups/export.xlsx?locale=en", "kampus.xlsx")).resolves.toBe("opened");
    expect(mockMedia.copyToMediaStore).toHaveBeenCalledWith(
      { name: "O'quvchilar.xlsx", parentFolder: "", mime: XLSX },
      "Download",
      "/cache/downloads/O'quvchilar.xlsx",
    );
    expect(mockOpen.file).toHaveBeenCalledWith("/cache/downloads/O'quvchilar.xlsx", { mime: XLSX });
  });

  it("stays in Downloads when no app opens it", async () => {
    mockOpen.file.mockRejectedValue(new Error("ENOAPP"));
    await expect(saveFile("/groups/export.xlsx?locale=en", "kampus.xlsx")).resolves.toBe("saved");
  });

  it("is opened even where Downloads cannot be written to", async () => {
    mockMedia.copyToMediaStore.mockRejectedValue(new Error("EUNSPECIFIED"));
    await expect(saveFile("/groups/export.xlsx?locale=en", "kampus.xlsx")).resolves.toBe("opened");
  });

  it("says so when it could neither be kept nor opened", async () => {
    mockMedia.copyToMediaStore.mockRejectedValue(new Error("EUNSPECIFIED"));
    mockOpen.file.mockRejectedValue(new Error("ENOAPP"));
    await expect(saveFile("/groups/export.xlsx?locale=en", "kampus.xlsx")).resolves.toBe("noApp");
  });
});
