/// <reference types="react/experimental" />
import { ViewTransition } from "react";

/**
 * The page inside the app frame (A-192). When the module changes, the old
 * page lifts away and the new one settles in, by the browser's view
 * transitions; `.page-leave` / `.page-arrive` in globals.css say how.
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  return (
    <ViewTransition enter="page-arrive" exit="page-leave" default="none">
      <div>{children}</div>
    </ViewTransition>
  );
}

/**
 * Something that is on two pages at once, such as a student's name in the
 * list and on the student's own page: give both the same `name` and it
 * travels from one place to the other when the page changes.
 */
export function Morph({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <ViewTransition name={name} share="morph" default="none">
      {children}
    </ViewTransition>
  );
}
