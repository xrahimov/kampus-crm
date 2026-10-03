import { describe, expect, it } from "vitest";

import { AppError } from "@/server/errors/app-error";
import { parseListQuery } from "@/server/http/list-query";

const options = {
  sortable: ["name", "createdAt"] as const,
  defaultSort: { field: "createdAt", direction: "desc" } as const,
};

describe("parseListQuery", () => {
  it("applies defaults", () => {
    const parsed = parseListQuery(new URLSearchParams(), options);
    expect(parsed).toMatchObject({
      page: 1,
      pageSize: 20,
      skip: 0,
      take: 20,
      sort: options.defaultSort,
    });
    expect(parsed.q).toBeUndefined();
  });

  it("computes skip/take and parses sort and q", () => {
    const parsed = parseListQuery(
      new URLSearchParams("page=3&pageSize=10&sort=name:asc&q=ali"),
      options,
    );
    expect(parsed).toMatchObject({ page: 3, pageSize: 10, skip: 20, take: 10, q: "ali" });
    expect(parsed.sort).toEqual({ field: "name", direction: "asc" });
  });

  it("caps the page size at 100", () => {
    expect(() => parseListQuery(new URLSearchParams("pageSize=500"), options)).toThrow(AppError);
  });

  it("rejects sorting by a column that is not whitelisted", () => {
    let caught: unknown;
    try {
      parseListQuery(new URLSearchParams("sort=passwordHash:asc"), options);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(AppError);
    expect((caught as AppError).fields).toEqual({ sort: ["validation.sortField"] });
  });

  it("rejects a malformed sort value", () => {
    expect(() => parseListQuery(new URLSearchParams("sort=name"), options)).toThrow(AppError);
  });
});
