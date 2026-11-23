/**
 * The name of a history entry that changed no field, as a key under
 * `groups.history.actions`. A group's history also holds what happened to its
 * stream, its topics and its bookings: "stream.update" is not the group being
 * edited, so for anything but the group itself the whole action is looked up
 * first ("streamUpdate"), then its second word, then "update".
 *
 * Shared by the site's history tab and the app's history page.
 */
export function historyActionKey(action: string, has: (key: string) => boolean): string {
  const [entity = "", verb = "update"] = action.split(".");
  const whole = `${entity}${verb.charAt(0).toUpperCase()}${verb.slice(1)}`;
  if (entity !== "group" && has(whole)) return whole;
  return has(verb) ? verb : "update";
}
