/** Names shared by the proxy, the API and the browser client. */
export const SESSION_COOKIE = "kampus_session";
export const CSRF_COOKIE = "kampus_csrf";
export const CSRF_HEADER = "x-csrf-token";

/** Session lifetime: 12 hours, extended on activity (sliding). */
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
/** How often the sliding expiry is pushed forward. */
export const SESSION_TOUCH_INTERVAL_MS = 5 * 60 * 1000;

/** Login rate limiting: 5 failures in 15 minutes locks for 15 minutes. */
export const LOGIN_MAX_FAILURES = 5;
export const LOGIN_WINDOW_MS = 15 * 60 * 1000;
