/*
 * The lesson link of a group (A-195): one address for the whole group that a
 * teacher copies from inside the video lesson. It names the group and nothing
 * else, so it is no credential: whoever opens it signs in first and is then
 * taken to their own page of that group.
 */

const GROUP_ID = /^[a-z0-9]{20,40}$/;

/** Whether a path segment can be a group's id at all (ids are cuids). */
export function isLessonLinkId(value: string): boolean {
  return GROUP_ID.test(value);
}

/** The path of a group's lesson link, without a locale: the visitor's own language is chosen on arrival. */
export function lessonLinkPath(groupId: string): string {
  return `/student/lesson/${groupId}`;
}

export function lessonLink(origin: string, groupId: string): string {
  return `${origin.replace(/\/$/, "")}${lessonLinkPath(groupId)}`;
}

/** The group a lesson-link path points at, or null when the path is something else. */
export function lessonLinkGroupId(path: string | null | undefined): string | null {
  const match = path?.match(/^\/(?:[a-z]{2}\/)?student\/lesson\/([a-z0-9]+)$/);
  return match && isLessonLinkId(match[1]!) ? match[1]! : null;
}
