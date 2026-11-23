import { phoneTyped } from "@/lib/phone";

describe("typing a phone number", () => {
  it("keeps digits, the plus and the signs people space a number with", () => {
    expect(phoneTyped("+998 (90) 000-00-04")).toBe("+998 (90) 000-00-04");
  });

  it("drops letters and other signs from a keyboard or a paste", () => {
    expect(phoneTyped("+998q90w0000004")).toBe("+998900000004");
    expect(phoneTyped("tel: +998 90 000 00 04.")).toBe(" +998 90 000 00 04");
  });
});
