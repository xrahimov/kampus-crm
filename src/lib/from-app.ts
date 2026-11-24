/**
 * A page of the site opened from the phone app (A-204) arrives with this
 * cookie for half an hour. The person asked for that one page, so what would
 * otherwise open over it by itself (the day's summary) stays closed (A-234).
 */
export const FROM_APP_COOKIE = "kampus_from_app";
export const FROM_APP_SECONDS = 30 * 60;

/** True in a browser that the phone app opened a moment ago. */
export function openedFromApp(cookies: string): boolean {
  return cookies.split(";").some((part) => part.trim() === `${FROM_APP_COOKIE}=1`);
}
