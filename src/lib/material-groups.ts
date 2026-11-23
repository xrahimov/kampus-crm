/*
 * Materials sorted into the lessons they belong to. Shared by the site's
 * materials tabs and the phone app, so it names no page and no package.
 */

/** The key of the group that holds materials tied to no lesson. */
export const NO_LESSON_KEY = "__none__";

interface Anchored {
  lessonId: string | null;
  lessonDate: string | null;
  lessonTopic: string | null;
}

export interface MaterialGroup<T> {
  key: string;
  lessonDate: string | null;
  lessonTopic: string | null;
  items: T[];
}

/** Materials by lesson, newest lesson first, the group-wide ones last. */
export function groupByLesson<T extends Anchored>(items: T[]): Array<MaterialGroup<T>> {
  const map = new Map<string, MaterialGroup<T>>();
  for (const m of items) {
    const key = m.lessonId ?? NO_LESSON_KEY;
    const g = map.get(key) ?? {
      key,
      lessonDate: m.lessonDate,
      lessonTopic: m.lessonTopic,
      items: [],
    };
    g.items.push(m);
    map.set(key, g);
  }
  return [...map.values()].sort((a, b) => {
    if (!a.lessonDate) return 1;
    if (!b.lessonDate) return -1;
    return b.lessonDate.localeCompare(a.lessonDate);
  });
}
