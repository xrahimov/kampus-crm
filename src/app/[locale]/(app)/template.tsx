import { PageTransition } from "@/components/motion/page-transition";

/**
 * A template is re-created when the first part of the address changes
 * (Students → Groups), not when a filter or a tab changes, so the page
 * change plays once per page and never while someone types in a search box
 * (A-192).
 */
export default function AppTemplate({ children }: { children: React.ReactNode }) {
  return <PageTransition>{children}</PageTransition>;
}
