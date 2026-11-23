import { Redirect } from "expo-router";

import { hasHome } from "@/features/office/site-paths";
import { useSession } from "@/lib/session";

/** The front door: everyone is sent to the side of Kampus their sign-in opened. */
export default function Index() {
  const { state } = useSession();
  if (state.status === "staff") {
    return <Redirect href={hasHome(state.me) ? "/staff/home" : "/staff"} />;
  }
  if (state.status === "student") return <Redirect href="/student" />;
  return <Redirect href="/sign-in" />;
}
