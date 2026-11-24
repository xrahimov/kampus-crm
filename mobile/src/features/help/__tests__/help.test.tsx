import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { ScrollView } from "react-native";

import type { HelpHit, Manual } from "@/api/office-help";
import { HelpArticleScreen } from "@/features/help/help-article-screen";
import { HelpHomeScreen } from "@/features/help/help-home-screen";
import { HelpVideosScreen } from "@/features/help/help-videos-screen";
import { nativeRoute } from "@/features/office/site-paths";
import { answer, clearClients, renderScreen } from "@/features/student/test-support";
import { API_ORIGIN } from "@/lib/api";
import { SEARCH_REST_MS } from "@/lib/rested";

jest.mock("@react-native-async-storage/async-storage", () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);
jest.mock("expo-localization", () => ({ getLocales: () => [{ languageCode: "en" }] }));
const mockPush = jest.fn();
const mockReplace = jest.fn();
let mockParams: { slug: string; section?: string } = { slug: "getting-started" };
jest.mock("expo-router", () => ({
  useRouter: () => ({
    push: mockPush,
    back: jest.fn(),
    canGoBack: () => true,
    replace: mockReplace,
  }),
  useLocalSearchParams: () => mockParams,
}));
const mockOpenOnSite = jest.fn<Promise<void>, [string]>(async () => undefined);
jest.mock("@/lib/web", () => ({ openOnSite: (path: string) => mockOpenOnSite(path) }));
jest.mock("@/lib/session", () => ({
  useMe: () => ({
    user: { id: "me" },
    permissions: ["groups.view"],
    view: { current: "TEACHING", canSwitch: false },
    branches: [{ id: "b1", name: "Chilonzor" }],
    activeBranch: { id: "b1", name: "Chilonzor" },
  }),
  can: (me: { permissions: string[] }, permission: string) => me.permissions.includes(permission),
}));

/*
 * The manual in the app (A-252): the site's Help home, an article and the
 * videos page, from the manual the server answers as data. Each test here
 * plays the server; the words are a small made-up manual of the same shape.
 */

type Call = [url: string, init?: RequestInit];
const fetchMock = jest.fn<Promise<Response>, Call>();
const realFetch = globalThis.fetch;
const players = () =>
  (jest.requireMock("expo-video") as { __players: Array<{ source: string; play: jest.Mock }> })
    .__players;

/** Where the page was last told to go: the test runner's scroll view only notes it. */
const scrollTo = (ScrollView as unknown as { prototype: { scrollTo: jest.Mock } }).prototype
  .scrollTo;
const laidOutAt = (y: number) => ({
  nativeEvent: { layout: { x: 0, y, width: 358, height: 400 } },
});

beforeEach(() => {
  scrollTo.mockClear();
  fetchMock.mockReset();
  mockPush.mockReset();
  mockReplace.mockReset();
  mockOpenOnSite.mockClear();
  mockParams = { slug: "getting-started" };
  players().length = 0;
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});
afterEach(() => {
  clearClients();
  globalThis.fetch = realFetch;
});

const PAGE = { width: 1280, height: 800 };

function manual(change: Partial<Manual> = {}): Manual {
  return {
    locale: "en",
    audience: "TEACHER",
    audiences: [
      { id: "CEO", title: "Director", summary: "", startHere: "Start with the dashboard." },
      { id: "TEACHER", title: "Teacher", summary: "", startHere: "Start with Today." },
      { id: "STUDENT", title: "Student", summary: "", startHere: "Open your own page." },
    ],
    articles: [
      {
        id: "gettingStarted",
        slug: "getting-started",
        audiences: ["CEO", "TEACHER"],
        path: "/dashboard",
        title: "Getting started",
        summary: "Signing in and finding your way.",
        sections: [
          {
            id: "sign-in",
            title: "Signing in",
            body: [
              "Press **Sign in** on the first page.",
              { steps: ["Type your phone.", "Press **Get a code**."] },
              { note: "A new account waits for the centre's staff." },
            ],
            video: {
              id: "sign-in",
              title: "How to sign in",
              note: "Two minutes.",
              src: "/api/v1/help-videos/en/sign-in",
            },
            screenshot: { src: "/help/en/login.jpg", ...PAGE },
            more: [{ src: "/help/en/phone-login.jpg", width: 780, height: 1688 }],
          },
          {
            id: "language",
            title: "Changing the language",
            body: ["Three languages."],
            video: null,
            screenshot: null,
            more: [],
          },
        ],
      },
      {
        id: "payments",
        slug: "payments",
        audiences: ["CEO"],
        path: "/cashdesk",
        title: "Payments",
        summary: "Taking money and giving it back.",
        sections: [
          {
            id: "refund",
            title: "Giving money back",
            body: ["Press **Refund** on the payment."],
            video: null,
            screenshot: null,
            more: [],
          },
        ],
      },
      {
        id: "organizations",
        slug: "organizations",
        audiences: ["CEO"],
        path: "/settings/organizations",
        title: "Organisations",
        summary: "For the site's owner.",
        sections: [
          {
            id: "new",
            title: "A new one",
            body: ["Add it."],
            video: null,
            screenshot: null,
            more: [],
          },
        ],
      },
      {
        id: "studentPortal",
        slug: "student-portal",
        audiences: ["STUDENT"],
        path: null,
        title: "The student's page",
        summary: "What a student sees.",
        sections: [
          {
            id: "open",
            title: "Opening it",
            body: ["By the link."],
            video: null,
            screenshot: null,
            more: [],
          },
        ],
      },
    ],
    ...change,
  };
}

const HIT: HelpHit = {
  articleId: "payments",
  slug: "payments",
  articleTitle: "Payments",
  sectionId: "refund",
  sectionTitle: "Giving money back",
  snippet: "Press **Refund** on the payment.",
  score: 9,
};

/** The server: the manual, and what the search finds. */
function serve(data: Manual | Response = manual(), hits: HelpHit[] | Response = [HIT]) {
  fetchMock.mockImplementation(async (url) => {
    const path = url.split("?")[0]!;
    if (path.endsWith("/help/search")) return "ok" in hits ? hits : answer(200, hits);
    if (path.endsWith("/help")) return "ok" in data ? data : answer(200, data);
    return answer(404, { error: { code: "NOT_FOUND", message: "errors.notFound" } });
  });
}
const asked = (tail: string) =>
  fetchMock.mock.calls.map(([url]) => url).filter((url) => url.split("?")[0]!.endsWith(tail));
const selected = (testID: string) =>
  screen.getByTestId(testID).props.accessibilityState?.selected === true;
/** Types into the search and lets the typing rest. */
async function search(words: string) {
  await fireEvent.changeText(screen.getByTestId("help-search"), words);
  await act(async () => {
    await new Promise((done) => setTimeout(done, SEARCH_REST_MS + 60));
  });
}

describe("where the manual's pages are in the app", () => {
  it("opens Help, its videos and an article inside the app", () => {
    expect(nativeRoute("/help")).toBe("/staff/help");
    expect(nativeRoute("/help/videos")).toBe("/staff/help/videos");
    expect(nativeRoute("/help/payments")).toEqual({
      pathname: "/staff/help/[slug]",
      params: { slug: "payments" },
    });
    expect(nativeRoute("/help/payments/more")).toBeNull();
  });
});

describe("the Help home", () => {
  it("asks for the manual in the app's language and opens on the reader's own role", async () => {
    serve();
    await renderScreen(<HelpHomeScreen />);
    await screen.findByTestId("help-articles");
    expect(asked("/help")).toHaveLength(1);
    expect(asked("/help")[0]).toMatch(/\/api\/v1\/help\?locale=en$/);
    expect(screen.getByText("Help and manuals")).toBeTruthy();
    expect(selected("help-audience-TEACHER")).toBe(true);
    expect(screen.getByTestId("help-start-here")).toHaveTextContent("Start with Today.");
    // A teacher's manual: the article for teachers, not the director's or the student's.
    expect(screen.getByTestId("help-article-getting-started")).toHaveTextContent(/Getting started/);
    expect(screen.getByTestId("help-article-getting-started")).toHaveTextContent(/2 sections/);
    expect(screen.queryByTestId("help-article-payments")).toBeNull();
    expect(screen.queryByTestId("help-article-student-portal")).toBeNull();
  });

  it("shows another role's articles, or all of them, at a press", async () => {
    serve();
    await renderScreen(<HelpHomeScreen />);
    await fireEvent.press(await screen.findByTestId("help-audience-CEO"));
    expect(screen.getByTestId("help-start-here")).toHaveTextContent("Start with the dashboard.");
    expect(screen.getByTestId("help-article-payments")).toHaveTextContent(/1 section/);
    expect(screen.queryByTestId("help-article-student-portal")).toBeNull();
    await fireEvent.press(screen.getByTestId("help-audience-ALL"));
    expect(selected("help-audience-ALL")).toBe(true);
    expect(screen.queryByTestId("help-start-here")).toBeNull();
    for (const slug of ["getting-started", "payments", "organizations", "student-portal"]) {
      expect(screen.getByTestId(`help-article-${slug}`)).toBeTruthy();
    }
    // The manual came once: choosing a role asks the server nothing.
    expect(asked("/help")).toHaveLength(1);
  });

  it("opens an article and the videos page", async () => {
    serve();
    await renderScreen(<HelpHomeScreen />);
    await fireEvent.press(await screen.findByTestId("help-article-getting-started"));
    expect(mockPush).toHaveBeenLastCalledWith({
      pathname: "/staff/help/[slug]",
      params: { slug: "getting-started" },
    });
    expect(screen.getByTestId("help-videos-link")).toHaveTextContent(/How-to videos/);
    expect(screen.getByTestId("help-videos-link")).toHaveTextContent(/1 short video/);
    await fireEvent.press(screen.getByTestId("help-videos-link"));
    expect(mockPush).toHaveBeenLastCalledWith("/staff/help/videos");
  });

  it("does not offer videos a server does not have", async () => {
    const none = manual();
    none.articles[0]!.sections[0]!.video = null;
    serve(none);
    await renderScreen(<HelpHomeScreen />);
    await screen.findByTestId("help-articles");
    expect(screen.queryByTestId("help-videos-link")).toBeNull();
  });

  it("searches with the site's search and opens the section found", async () => {
    serve();
    await renderScreen(<HelpHomeScreen />);
    await screen.findByTestId("help-articles");
    // One letter is not a search, as on the site.
    await search("r");
    expect(asked("/help/search")).toHaveLength(0);
    expect(screen.getByTestId("help-articles")).toBeTruthy();

    await search(" refund ");
    await screen.findByTestId("help-hit-payments-refund");
    expect(asked("/help/search").at(-1)).toMatch(/\/help\/search\?locale=en&q=refund$/);
    expect(screen.getByTestId("help-results-count")).toHaveTextContent("1 section found");
    const hit = screen.getByTestId("help-hit-payments-refund");
    expect(hit).toHaveTextContent(/Payments/);
    expect(hit).toHaveTextContent(/Giving money back/);
    // The marks around a button's name are not shown as stars.
    expect(hit).toHaveTextContent(/Press Refund on the payment\./);
    // The roles and the articles give way to what was found.
    expect(screen.queryByTestId("help-articles")).toBeNull();
    await fireEvent.press(hit);
    expect(mockPush).toHaveBeenLastCalledWith({
      pathname: "/staff/help/[slug]",
      params: { slug: "payments", section: "refund" },
    });

    // Emptied, the search gives the manual back.
    await search("");
    expect(screen.getByTestId("help-articles")).toBeTruthy();
  });

  it("says so when nothing is found, and when the search cannot be reached", async () => {
    serve(manual(), []);
    await renderScreen(<HelpHomeScreen />);
    await screen.findByTestId("help-articles");
    await search("zebra");
    await waitFor(() =>
      expect(screen.getByTestId("help-results-count")).toHaveTextContent(
        "Nothing found for “zebra”. Try another word.",
      ),
    );
    serve(manual(), answer(500, { error: { code: "INTERNAL", message: "errors.internal" } }));
    await search("zebras");
    await screen.findByTestId("help-search-problem");
  });

  it("says why when the manual did not come, and tries again", async () => {
    serve(answer(500, { error: { code: "INTERNAL", message: "errors.internal" } }));
    await renderScreen(<HelpHomeScreen />);
    const retry = await screen.findByTestId("retry");
    expect(screen.queryByTestId("help-search")).toBeNull();
    serve();
    await fireEvent.press(retry);
    await screen.findByTestId("help-articles");
  });
});

describe("an article of the manual", () => {
  it("shows what it is about, who it is for and its sections in order", async () => {
    serve();
    await renderScreen(<HelpArticleScreen />);
    await screen.findByTestId("help-article");
    expect(screen.getByText("Getting started")).toBeTruthy();
    expect(screen.getByText("Signing in and finding your way.")).toBeTruthy();
    expect(screen.getByTestId("help-written-for")).toHaveTextContent(
      "Written for: Director, Teacher",
    );
    const section = screen.getByTestId("help-section-sign-in");
    expect(section).toHaveTextContent(/Press Sign in on the first page\./);
    expect(screen.getByTestId("help-steps")).toHaveTextContent(
      "1Type your phone.2Press Get a code.",
    );
    expect(screen.getByTestId("help-note")).toHaveTextContent(
      "A new account waits for the centre's staff.",
    );
    expect(screen.getByTestId("help-section-language")).toHaveTextContent(/Three languages\./);
    // "On this page" names every section.
    expect(screen.getByTestId("help-go-sign-in")).toHaveTextContent("Signing in");
    expect(screen.getByTestId("help-go-language")).toHaveTextContent("Changing the language");
  });

  it("keeps each picture's own shape and opens it where it can be enlarged", async () => {
    serve();
    await renderScreen(<HelpArticleScreen />);
    const pictures = await screen.findAllByTestId("help-picture");
    expect(pictures).toHaveLength(2);
    const images = screen.getAllByTestId("help-picture-image", { includeHiddenElements: true });
    expect(images.map((image) => image.props.source.uri)).toEqual([
      `${API_ORIGIN}/help/en/login.jpg`,
      `${API_ORIGIN}/help/en/phone-login.jpg`,
    ]);
    const shape = (index: number) =>
      Object.assign({}, ...[images[index]!.props.style].flat(3).filter(Boolean)) as {
        aspectRatio: number;
        maxWidth: number;
      };
    expect(shape(0)).toMatchObject({ aspectRatio: 1.6, maxWidth: 1280 });
    expect(shape(1).aspectRatio).toBeCloseTo(780 / 1688);
    expect(shape(1).maxWidth).toBe(780);
    await fireEvent.press(pictures[0]!);
    expect(mockPush).toHaveBeenLastCalledWith({
      pathname: "/file",
      params: { url: "/help/en/login.jpg", title: "Signing in" },
    });
  });

  it("fetches nothing of a video until it is pressed, then plays it", async () => {
    serve();
    await renderScreen(<HelpArticleScreen />);
    const play = await screen.findByTestId("help-video-play-sign-in");
    expect(screen.getByTestId("help-video-sign-in")).toHaveTextContent(/How to sign in/);
    expect(screen.getByTestId("help-video-sign-in")).toHaveTextContent(/Two minutes\./);
    expect(players()).toHaveLength(0);
    await fireEvent.press(play);
    expect(screen.getByTestId("help-video-player")).toBeTruthy();
    expect(players()).toHaveLength(1);
    expect(players()[0]!.source).toBe(`${API_ORIGIN}/api/v1/help-videos/en/sign-in`);
    expect(players()[0]!.play).toHaveBeenCalled();
  });

  it("opens the page it describes inside the app where the app has it", async () => {
    serve();
    await renderScreen(<HelpArticleScreen />);
    await fireEvent.press(await screen.findByTestId("help-open-page"));
    expect(mockPush).toHaveBeenLastCalledWith("/staff/home");
    expect(mockOpenOnSite).not.toHaveBeenCalled();
  });

  it("opens the page it describes on the site where the app has none", async () => {
    mockParams = { slug: "organizations" };
    serve();
    await renderScreen(<HelpArticleScreen />);
    await fireEvent.press(await screen.findByTestId("help-open-page"));
    expect(mockOpenOnSite).toHaveBeenCalledWith("/en/settings/organizations");
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("has no such button for an article about no one page, and no list for one section", async () => {
    mockParams = { slug: "student-portal" };
    serve();
    await renderScreen(<HelpArticleScreen />);
    await screen.findByTestId("help-article");
    expect(screen.queryByTestId("help-open-page")).toBeNull();
    expect(screen.queryByTestId("help-on-this-page")).toBeNull();
    // The last article has nothing after it.
    expect(screen.queryByTestId("help-next")).toBeNull();
    expect(screen.getByTestId("help-previous")).toHaveTextContent(/PreviousOrganisations/);
  });

  it("leads to the articles before and after it", async () => {
    serve();
    await renderScreen(<HelpArticleScreen />);
    await screen.findByTestId("help-article");
    // The first article has nothing before it.
    expect(screen.queryByTestId("help-previous")).toBeNull();
    expect(screen.getByTestId("help-next")).toHaveTextContent(/NextPayments/);
    await fireEvent.press(screen.getByTestId("help-next"));
    // It takes this article's place, so Back still goes to Help.
    expect(mockReplace).toHaveBeenLastCalledWith({
      pathname: "/staff/help/[slug]",
      params: { slug: "payments" },
    });
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("opens at the section a search result named, once the page is laid out", async () => {
    mockParams = { slug: "getting-started", section: "language" };
    serve();
    await renderScreen(<HelpArticleScreen />);
    await screen.findByTestId("help-article");
    expect(scrollTo).not.toHaveBeenCalled();
    // The article starts 16 points down the page; the section 900 points down the article.
    await fireEvent(screen.getByTestId("help-article"), "layout", laidOutAt(16));
    await fireEvent(screen.getByTestId("help-section-sign-in"), "layout", laidOutAt(300));
    expect(scrollTo).not.toHaveBeenCalled();
    await fireEvent(screen.getByTestId("help-section-language"), "layout", laidOutAt(900));
    expect(scrollTo).toHaveBeenCalledTimes(1);
    const [{ y, animated }] = scrollTo.mock.calls[0] as [{ y: number; animated: boolean }];
    // Under the header, with a little air above the heading; it is there, it does not travel.
    expect(y).toBeGreaterThan(800);
    expect(y).toBeLessThanOrEqual(916);
    expect(animated).toBe(false);
    // Measured again at the same place, the page is not moved a second time.
    await fireEvent(screen.getByTestId("help-section-language"), "layout", laidOutAt(900));
    expect(scrollTo).toHaveBeenCalledTimes(1);
  });

  it("goes to a section from the list of what is on the page", async () => {
    serve();
    await renderScreen(<HelpArticleScreen />);
    await screen.findByTestId("help-article");
    await fireEvent(screen.getByTestId("help-article"), "layout", laidOutAt(16));
    await fireEvent(screen.getByTestId("help-section-language"), "layout", laidOutAt(900));
    // Opened without a section, the article stays at its top.
    expect(scrollTo).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId("help-go-language"));
    expect(scrollTo).toHaveBeenCalledTimes(1);
    expect((scrollTo.mock.calls[0] as [{ animated: boolean }])[0].animated).toBe(true);
  });

  it("says nothing is found for an article that is not in the reader's manual", async () => {
    mockParams = { slug: "no-such-article" };
    serve();
    await renderScreen(<HelpArticleScreen />);
    await screen.findByText("Nothing found.");
    expect(screen.queryByTestId("help-article")).toBeNull();
  });
});

describe("the how-to videos page", () => {
  it("lists every video with the way to its steps", async () => {
    serve();
    await renderScreen(<HelpVideosScreen />);
    await screen.findByTestId("help-videos");
    expect(screen.getByText("How-to videos")).toBeTruthy();
    expect(screen.getByTestId("help-video-sign-in")).toHaveTextContent(/How to sign in/);
    expect(players()).toHaveLength(0);
    const steps = screen.getByTestId("help-video-steps-sign-in");
    expect(steps).toHaveTextContent("Read the steps: Getting started");
    await fireEvent.press(steps);
    expect(mockPush).toHaveBeenLastCalledWith({
      pathname: "/staff/help/[slug]",
      params: { slug: "getting-started", section: "sign-in" },
    });
  });

  it("says so when the server has no videos in this language", async () => {
    const none = manual();
    none.articles[0]!.sections[0]!.video = null;
    serve(none);
    await renderScreen(<HelpVideosScreen />);
    await screen.findByText("There are no videos in this language on this server yet.");
    expect(screen.queryByTestId("help-videos")).toBeNull();
  });
});
