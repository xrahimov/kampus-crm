import listing from "../listing.json";

/*
 * The store page's texts (A-268). Google Play cuts nothing for us: a title
 * over 30 characters, a short description over 80 or a full one over 4000 is
 * refused when it is saved.
 */
const LANGUAGES = ["en-US", "ru-RU", "uz"] as const;

describe("the Google Play listing", () => {
  it("has the three languages and nothing else", () => {
    expect(Object.keys(listing).sort()).toEqual([...LANGUAGES].sort());
  });

  it.each(LANGUAGES)("%s fits Google Play's limits", (language) => {
    const text = listing[language];
    expect(text.title.length).toBeGreaterThan(0);
    expect(text.title.length).toBeLessThanOrEqual(30);
    expect(text.title).toContain("Kampus");
    expect(text.shortDescription.length).toBeLessThanOrEqual(80);
    expect(text.fullDescription.length).toBeLessThanOrEqual(4000);
  });

  it.each(LANGUAGES)("%s says who can sign in and links to the privacy policy", (language) => {
    const text = listing[language].fullDescription;
    const page = { "en-US": "en", "ru-RU": "ru", uz: "uz" }[language];
    expect(text).toContain(`https://kampus.center/${page}/privacy`);
    // The same parts in each language: three headed lists of what each kind of person gets.
    expect(text.match(/^• /gm)!.length).toBe(
      listing["en-US"].fullDescription.match(/^• /gm)!.length,
    );
  });
});
