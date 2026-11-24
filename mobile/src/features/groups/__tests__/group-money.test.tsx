import { fireEvent, screen, waitFor } from "@testing-library/react-native";

import type { Discount, GroupPackages, LessonPackage } from "@/api/office-group-money";
import type { Member } from "@/api/office-groups";
import { GroupDiscountsScreen } from "@/features/groups/discounts-screen";
import { GroupPackagesScreen } from "@/features/groups/packages-screen";
import { answer, clearClients, renderScreen, sentBody } from "@/features/student/test-support";
import { centreToday } from "@/lib/days";

jest.mock("@react-native-async-storage/async-storage", () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);
jest.mock("expo-localization", () => ({ getLocales: () => [{ languageCode: "en" }] }));
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), canGoBack: () => true }),
  useLocalSearchParams: () => ({ id: "g1" }),
}));
let mockPermissions: string[] = [];
jest.mock("@/lib/session", () => ({
  useMe: () => ({
    user: { id: "u1" },
    permissions: mockPermissions,
    view: { current: "FULL", canSwitch: false },
    branches: [{ id: "b1", name: "Chilonzor" }],
    activeBranch: { id: "b1", name: "Chilonzor" },
  }),
  can: (me: { permissions: string[] }, permission: string) => me.permissions.includes(permission),
}));

/*
 * A group's discounts and lesson packages in the app (A-254): the site's two
 * tabs as two pages of a group. Each test plays the server.
 */

type Call = [url: string, init?: RequestInit];
const fetchMock = jest.fn<Promise<Response>, Call>();
const realFetch = globalThis.fetch;

beforeEach(() => {
  fetchMock.mockReset();
  mockPermissions = ["groups.view", "groups.update", "discounts.give", "payments.create"];
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});
afterEach(() => {
  clearClients();
  globalThis.fetch = realFetch;
});

type Routes = Record<string, unknown | (() => unknown)>;
/** A route answers with a body, or with a whole answer (a refusal) made by `answer`. */
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
    const body = typeof route === "function" ? (route as () => unknown)() : route;
    if (body && typeof body === "object" && "ok" in body && "text" in body) return body as Response;
    return answer(body === undefined ? 204 : 200, body);
  });
}
const sent = (method: string, tail: string) =>
  fetchMock.mock.calls
    .filter(
      ([url, init]) => (init?.method ?? "GET") === method && url.split("?")[0]!.endsWith(tail),
    )
    .map(([, init]) => sentBody(init));

const GROUP = { id: "g1", name: "GE-Morning A1", status: "ACTIVE", coursePrice: 600000 };

function member(change: Partial<Member> = {}): Member {
  return {
    id: "m1",
    groupId: "g1",
    studentId: "s1",
    fullName: "Sardor Karimov",
    phone: null,
    status: "ACTIVE",
    joinedAt: "2026-09-01",
    leftAt: null,
    customPrice: null,
    note: null,
    billingFrom: null,
    leaveReason: null,
    balance: 0,
    lessonsLeft: null,
    ...change,
  };
}
const MEMBERS = [
  member(),
  member({ id: "m2", studentId: "s2", fullName: "Malika Saidova", customPrice: 500000 }),
  member({ id: "m3", studentId: "s3", fullName: "Left Long Ago", status: "ARCHIVED" }),
];

function discount(change: Partial<Discount> = {}): Discount {
  return {
    id: "d1",
    membershipId: "m1",
    studentId: "s1",
    studentName: "Sardor Karimov",
    discountedPrice: 450000,
    amount: 150000,
    percent: 25,
    months: 3,
    remainingMonths: 2,
    givenAt: "2026-11-02",
    comment: "Two children here",
    createdByName: "Dilnoza Karimova",
    familyId: null,
    ...change,
  };
}

describe("a group's discounts", () => {
  it("lists who pays less, by how much and for how long", async () => {
    serve({
      "GET /groups/g1": GROUP,
      "GET /groups/g1/discounts": [
        discount(),
        discount({ id: "d2", studentName: "Malika Saidova", familyId: "f1", comment: null }),
        discount({ id: "d3", studentName: "Bobur Aliyev", remainingMonths: 0 }),
      ],
    });
    await renderScreen(<GroupDiscountsScreen />);
    const row = await screen.findByTestId("discount-d1");
    expect(row).toHaveTextContent(
      "Sardor KarimovDiscounted priceUZS 450,000DiscountUZS 150,000 (25%)Months3Left2GivenNov 2, 2026Given byDilnoza KarimovaTwo children hereDelete",
    );
    // A family's discount is managed on the student's page; a used-up one has nothing to end.
    expect(screen.getByTestId("discount-d2")).toHaveTextContent(/Family/);
    expect(screen.queryByTestId("discount-remove-d2")).toBeNull();
    expect(screen.queryByTestId("discount-remove-d3")).toBeNull();
    expect(screen.getByTestId("discount-give")).toBeTruthy();
  });

  it("shows them without the buttons to someone who may not give discounts", async () => {
    mockPermissions = ["groups.view"];
    serve({ "GET /groups/g1": GROUP, "GET /groups/g1/discounts": [discount()] });
    await renderScreen(<GroupDiscountsScreen />);
    await screen.findByTestId("discount-d1");
    expect(screen.queryByTestId("discount-give")).toBeNull();
    expect(screen.queryByTestId("discount-remove-d1")).toBeNull();
  });

  it("gives nothing in an archived group, and says when there are none", async () => {
    serve({ "GET /groups/g1": { ...GROUP, status: "ARCHIVED" }, "GET /groups/g1/discounts": [] });
    await renderScreen(<GroupDiscountsScreen />);
    await screen.findByText("No discounts in this group.");
    await waitFor(() => expect(screen.queryByTestId("discount-give")).toBeNull());
  });

  it("gives a discount to a student who is still in the group, from their own price", async () => {
    serve({
      "GET /groups/g1": GROUP,
      "GET /groups/g1/discounts": [],
      "GET /groups/g1/members": MEMBERS,
      "POST /groups/g1/discounts": discount(),
    });
    await renderScreen(<GroupDiscountsScreen />);
    await fireEvent.press(await screen.findByTestId("discount-give"));
    expect(screen.getByText("Regular price: UZS 600,000")).toBeTruthy();
    // Nothing chosen and nothing typed: the form says what is missing and sends nothing.
    await fireEvent.changeText(screen.getByTestId("discount-months"), "");
    await fireEvent.press(screen.getByTestId("discount-save"));
    expect(screen.getByText("Choose a student.")).toBeTruthy();
    expect(screen.getAllByText("Required.")).toHaveLength(2);
    expect(sent("POST", "/groups/g1/discounts")).toHaveLength(0);

    await fireEvent.press(screen.getByTestId("discount-student"));
    await screen.findByTestId("discount-student-option-m1");
    // Someone who left is not offered.
    expect(screen.queryByTestId("discount-student-option-m3")).toBeNull();
    await fireEvent.press(screen.getByTestId("discount-student-option-m2"));
    await fireEvent.changeText(screen.getByTestId("discount-price-field"), "400 000");
    // Malika has a price of her own: the discount is counted from it.
    expect(screen.getByText("Regular price: UZS 500,000")).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId("discount-months"), "3");
    await fireEvent.changeText(
      screen.getByTestId("discount-comment-field"),
      "  Sister studies here  ",
    );
    await fireEvent.press(screen.getByTestId("discount-save"));
    await waitFor(() => expect(sent("POST", "/groups/g1/discounts")).toHaveLength(1));
    expect(sent("POST", "/groups/g1/discounts")[0]).toEqual({
      membershipId: "m2",
      discountedPrice: 400000,
      months: 3,
      comment: "Sister studies here",
    });
  });

  it("shows the server's refusal under the field it is about", async () => {
    serve({
      "GET /groups/g1": GROUP,
      "GET /groups/g1/discounts": [],
      "GET /groups/g1/members": MEMBERS,
      "POST /groups/g1/discounts": answer(422, {
        error: {
          code: "VALIDATION",
          message: "errors.validation",
          fields: { months: ["validation.max"] },
        },
      }),
    });
    await renderScreen(<GroupDiscountsScreen />);
    await fireEvent.press(await screen.findByTestId("discount-give"));
    await fireEvent.press(screen.getByTestId("discount-student"));
    await fireEvent.press(await screen.findByTestId("discount-student-option-m1"));
    await fireEvent.changeText(screen.getByTestId("discount-price-field"), "400000");
    await fireEvent.changeText(screen.getByTestId("discount-months"), "99");
    await fireEvent.press(screen.getByTestId("discount-save"));
    await waitFor(() => expect(sent("POST", "/groups/g1/discounts")).toHaveLength(1));
    await waitFor(() => expect(screen.queryByTestId("form-problem")).toBeNull());
    expect(screen.getByTestId("discount-sheet")).toBeTruthy();
  });

  it("ends a discount after asking", async () => {
    serve({
      "GET /groups/g1": GROUP,
      "GET /groups/g1/discounts": [discount()],
      "DELETE /discounts/d1": undefined,
    });
    await renderScreen(<GroupDiscountsScreen />);
    await fireEvent.press(await screen.findByTestId("discount-remove-d1"));
    expect(
      screen.getByText("The discount for “Sardor Karimov” ends now. Past months stay as charged."),
    ).toBeTruthy();
    expect(sent("DELETE", "/discounts/d1")).toHaveLength(0);
    await fireEvent.press(screen.getByTestId("discount-remove-confirm"));
    await waitFor(() => expect(sent("DELETE", "/discounts/d1")).toHaveLength(1));
    // The list is asked for again.
    await waitFor(() => expect(sent("GET", "/groups/g1/discounts")).toHaveLength(2));
  });
});

function pkg(change: Partial<LessonPackage> = {}): LessonPackage {
  return {
    id: "p1",
    groupId: "g1",
    name: "8 lessons",
    lessons: 8,
    price: 800000,
    isActive: true,
    sortOrder: 0,
    sold: 2,
    ...change,
  };
}

function packages(change: Partial<GroupPackages> = {}): GroupPackages {
  return {
    packages: [
      pkg(),
      pkg({ id: "p2", name: "12 lessons", lessons: 12, price: 1100000, sold: 0 }),
      pkg({ id: "p3", name: "Old 4", lessons: 4, price: 500000, isActive: false, sold: 5 }),
    ],
    credits: [
      {
        membershipId: "m1",
        studentId: "s1",
        studentName: "Sardor Karimov",
        status: "ACTIVE",
        purchased: 16,
        used: 15,
        left: 1,
        lastPurchaseAt: "2026-11-02",
      },
      {
        membershipId: "m2",
        studentId: "s2",
        studentName: "Malika Saidova",
        status: "ACTIVE",
        purchased: 8,
        used: 9,
        left: -1,
        lastPurchaseAt: null,
      },
      {
        membershipId: "m3",
        studentId: "s3",
        studentName: "Left Long Ago",
        status: "ARCHIVED",
        purchased: 8,
        used: 2,
        left: 6,
        lastPurchaseAt: "2026-09-01",
      },
    ],
    purchases: [
      {
        id: "pu1",
        membershipId: "m1",
        studentName: "Sardor Karimov",
        name: "8 lessons",
        lessons: 8,
        used: 7,
        price: 800000,
        purchasedAt: "2026-11-02",
        note: "Paid by the mother",
        paymentId: "pay1",
        createdByName: "Dilnoza Karimova",
      },
    ],
    ...change,
  };
}

const PAY_OPTIONS = {
  methods: [
    { id: "pm1", name: "Cash" },
    { id: "pm2", name: "Card" },
  ],
  printReceiptAfterPayment: false,
  refundsEnabled: false,
};

describe("a group's lesson packages", () => {
  it("shows the offers, every student's lessons and the packages sold", async () => {
    serve({ "GET /groups/g1": GROUP, "GET /groups/g1/packages": packages() });
    await renderScreen(<GroupPackagesScreen />);
    expect(await screen.findByTestId("package-p1")).toHaveTextContent(
      "8 lessonsOn saleLessons8PriceUZS 800,000Per lessonUZS 100,000Sold2EditStop selling",
    );
    // An unsold package is deleted; a sold one is only taken off sale.
    expect(screen.getByTestId("package-p2")).toHaveTextContent(/Sold0EditDelete$/);
    expect(screen.getByTestId("package-p3")).toHaveTextContent(/^Old 4Not sold/);

    expect(screen.getByTestId("credits-m1")).toHaveTextContent(
      "Sardor KarimovLeft: 1Bought16Used15Last packageNov 2, 2026Sell a package",
    );
    expect(screen.getByTestId("credits-m2")).toHaveTextContent(
      "Malika SaidovaLeft: -1Bought8Used9Last package—Sell a package",
    );
    // Someone who left is listed with what they have, and is sold nothing.
    expect(screen.queryByTestId("credits-sell-m3")).toBeNull();

    expect(screen.getByTestId("purchase-pu1")).toHaveTextContent(
      "Sardor KarimovNov 2, 2026Package8 lessonsUsed7 / 8PriceUZS 800,000Sold byDilnoza KarimovaPaid by the mother",
    );
  });

  it("explains itself while the group has no packages, and offers nothing to sell", async () => {
    serve({
      "GET /groups/g1": GROUP,
      "GET /groups/g1/packages": packages({ packages: [], purchases: [] }),
    });
    await renderScreen(<GroupPackagesScreen />);
    await screen.findByText("No packages yet.");
    expect(screen.getByTestId("package-add")).toBeTruthy();
    expect(screen.queryByTestId("package-sell")).toBeNull();
    expect(screen.queryByTestId("credits-sell-m1")).toBeNull();
    expect(screen.queryByText("Packages sold")).toBeNull();
  });

  it("keeps the buttons from someone who may only look", async () => {
    mockPermissions = ["groups.view"];
    serve({ "GET /groups/g1": GROUP, "GET /groups/g1/packages": packages() });
    await renderScreen(<GroupPackagesScreen />);
    await screen.findByTestId("package-p1");
    expect(screen.queryByTestId("package-add")).toBeNull();
    expect(screen.queryByTestId("package-sell")).toBeNull();
    expect(screen.queryByTestId("package-edit-p1")).toBeNull();
    expect(screen.queryByTestId("credits-sell-m1")).toBeNull();
  });

  it("adds a package", async () => {
    serve({
      "GET /groups/g1": GROUP,
      "GET /groups/g1/packages": packages(),
      "POST /groups/g1/packages": pkg({ id: "p9" }),
    });
    await renderScreen(<GroupPackagesScreen />);
    await fireEvent.press(await screen.findByTestId("package-add"));
    // Eight lessons stand in the form, as on the site; a name and a price are needed.
    expect(screen.getByTestId("package-lessons").props.value).toBe("8");
    await fireEvent.press(screen.getByTestId("package-save"));
    expect(screen.getAllByText("Required.")).toHaveLength(2);
    expect(sent("POST", "/groups/g1/packages")).toHaveLength(0);
    await fireEvent.changeText(screen.getByTestId("package-name"), " Sixteen ");
    await fireEvent.changeText(screen.getByTestId("package-lessons"), "16");
    await fireEvent.changeText(screen.getByTestId("package-price"), "1 500 000");
    await fireEvent.press(screen.getByTestId("package-save"));
    await waitFor(() => expect(sent("POST", "/groups/g1/packages")).toHaveLength(1));
    expect(sent("POST", "/groups/g1/packages")[0]).toEqual({
      name: "Sixteen",
      lessons: 16,
      price: 1500000,
      isActive: true,
    });
    await waitFor(() => expect(sent("GET", "/groups/g1/packages")).toHaveLength(2));
  });

  it("changes a package from what it is now, and can take it off sale", async () => {
    serve({
      "GET /groups/g1": GROUP,
      "GET /groups/g1/packages": packages(),
      "PATCH /groups/g1/packages/p1": pkg(),
    });
    await renderScreen(<GroupPackagesScreen />);
    await fireEvent.press(await screen.findByTestId("package-edit-p1"));
    expect(screen.getByTestId("package-name").props.value).toBe("8 lessons");
    expect(screen.getByTestId("package-price").props.value).toBe("800000");
    await fireEvent.changeText(screen.getByTestId("package-price"), "850000");
    await fireEvent.press(screen.getByTestId("package-active"));
    await fireEvent.press(screen.getByTestId("package-save"));
    await waitFor(() => expect(sent("PATCH", "/groups/g1/packages/p1")).toHaveLength(1));
    expect(sent("PATCH", "/groups/g1/packages/p1")[0]).toEqual({
      name: "8 lessons",
      lessons: 8,
      price: 850000,
      isActive: false,
    });
  });

  it("asks before removing, in the words that fit a sold package", async () => {
    serve({
      "GET /groups/g1": GROUP,
      "GET /groups/g1/packages": packages(),
      "DELETE /groups/g1/packages/p1": undefined,
    });
    await renderScreen(<GroupPackagesScreen />);
    await fireEvent.press(await screen.findByTestId("package-remove-p1"));
    expect(screen.getByText("Stop selling the package?")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("package-remove-confirm"));
    await waitFor(() => expect(sent("DELETE", "/groups/g1/packages/p1")).toHaveLength(1));
  });

  it("sells a package to the student whose row was pressed", async () => {
    serve({
      "GET /groups/g1": GROUP,
      "GET /groups/g1/packages": packages(),
      "GET /groups/g1/members": MEMBERS,
      "GET /payments/options": PAY_OPTIONS,
      "POST /groups/g1/packages/sell": { id: "pu2" },
    });
    await renderScreen(<GroupPackagesScreen />);
    await fireEvent.press(await screen.findByTestId("credits-sell-m2"));
    // The first package on sale stands chosen, with what the sale does.
    expect(await screen.findByTestId("sell-summary")).toHaveTextContent(
      "8 lessons are added and UZS 800,000 is taken as a payment.",
    );
    await fireEvent.press(screen.getByTestId("sell-package"));
    await screen.findByTestId("sell-package-option-p2");
    // A package that is not sold any more is not offered.
    expect(screen.queryByTestId("sell-package-option-p3")).toBeNull();
    await fireEvent.press(screen.getByTestId("sell-package-option-p2"));
    expect(screen.getByTestId("sell-summary")).toHaveTextContent(/^12 lessons are added/);
    await fireEvent.changeText(screen.getByTestId("sell-comment"), "Paid in the office");
    await waitFor(() => expect(sent("GET", "/payments/options")).toHaveLength(1));
    await fireEvent.press(screen.getByTestId("sell-save"));
    await waitFor(() => expect(sent("POST", "/groups/g1/packages/sell")).toHaveLength(1));
    // The first way to pay and today stand in the form unless changed.
    expect(sent("POST", "/groups/g1/packages/sell")[0]).toEqual({
      membershipId: "m2",
      packageId: "p2",
      paymentMethodId: "pm1",
      paidAt: centreToday(),
      comment: "Paid in the office",
    });
    await screen.findByTestId("package-sold");
    await waitFor(() => expect(sent("GET", "/groups/g1/packages")).toHaveLength(2));
  });

  it("asks who the package is for when it is sold from the top of the page", async () => {
    serve({
      "GET /groups/g1": GROUP,
      "GET /groups/g1/packages": packages(),
      "GET /groups/g1/members": MEMBERS,
      "GET /payments/options": PAY_OPTIONS,
      "POST /groups/g1/packages/sell": { id: "pu2" },
    });
    await renderScreen(<GroupPackagesScreen />);
    await fireEvent.press(await screen.findByTestId("package-sell"));
    await waitFor(() => expect(sent("GET", "/payments/options")).toHaveLength(1));
    await fireEvent.press(screen.getByTestId("sell-save"));
    expect(screen.getByText("Choose a student.")).toBeTruthy();
    expect(sent("POST", "/groups/g1/packages/sell")).toHaveLength(0);
    await fireEvent.press(screen.getByTestId("sell-student"));
    await screen.findByTestId("sell-student-option-m1");
    expect(screen.queryByTestId("sell-student-option-m3")).toBeNull();
    await fireEvent.press(screen.getByTestId("sell-student-option-m1"));
    await fireEvent.press(screen.getByTestId("sell-method"));
    await fireEvent.press(await screen.findByTestId("sell-method-option-pm2"));
    await fireEvent.press(screen.getByTestId("sell-save"));
    await waitFor(() => expect(sent("POST", "/groups/g1/packages/sell")).toHaveLength(1));
    expect(sent("POST", "/groups/g1/packages/sell")[0]).toMatchObject({
      membershipId: "m1",
      packageId: "p1",
      paymentMethodId: "pm2",
      comment: null,
    });
  });

  it("says why a sale was refused and keeps the form", async () => {
    serve({
      "GET /groups/g1": GROUP,
      "GET /groups/g1/packages": packages(),
      "GET /groups/g1/members": MEMBERS,
      "GET /payments/options": PAY_OPTIONS,
      "POST /groups/g1/packages/sell": answer(409, {
        error: { code: "CONFLICT", message: "errors.conflict" },
      }),
    });
    await renderScreen(<GroupPackagesScreen />);
    await fireEvent.press(await screen.findByTestId("credits-sell-m1"));
    await waitFor(() => expect(sent("GET", "/payments/options")).toHaveLength(1));
    await fireEvent.press(screen.getByTestId("sell-save"));
    await screen.findByTestId("form-problem");
    expect(screen.queryByTestId("package-sold")).toBeNull();
    expect(screen.getByTestId("sell-sheet")).toBeTruthy();
  });
});
