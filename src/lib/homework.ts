/** A lesson as the "Set homework" dialog lists it. */
export interface AssignableLesson {
  id: string;
  /** "YYYY-MM-DD", the centre's day. */
  date: string;
  hasHomework: boolean;
}

/**
 * The lesson "Set homework" starts on: the latest lesson up to today that has no
 * homework yet (the one just taught), otherwise the nearest coming one. The
 * list also holds two weeks of coming lessons, newest first, so taking its
 * first free entry put today's homework on a lesson two weeks ahead.
 */
export function defaultHomeworkLesson(lessons: AssignableLesson[], today: string): string {
  const free = lessons.filter((l) => !l.hasHomework);
  const taught = free.filter((l) => l.date <= today).sort((a, b) => b.date.localeCompare(a.date));
  if (taught[0]) return taught[0].id;
  const coming = free.filter((l) => l.date > today).sort((a, b) => a.date.localeCompare(b.date));
  return coming[0]?.id ?? "";
}
