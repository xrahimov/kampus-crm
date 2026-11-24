import { Stack } from "expo-router";

import { PasswordScreen } from "@/features/shared/password-screen";
import { useMe } from "@/lib/session";
import { useTheme } from "@/lib/theme";

/** The staff side: the four places of the navigation, and the screens pushed over them. */
export default function StaffLayout() {
  const { colors } = useTheme();
  const me = useMe();
  // Someone else chose the password: nothing else answers until the person picks their own (A-124).
  if (me.user.mustChangePassword) return <PasswordScreen forced askCurrent />;
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
        // A pushed screen slides in from the right on Android as it does on an iPhone (A-224).
        animation: "ios_from_right",
      }}
    >
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="lesson/[id]" />
      <Stack.Screen name="group/[id]" />
      <Stack.Screen name="chat/[id]" />
      <Stack.Screen name="materials/[id]" />
      <Stack.Screen name="homework/[id]" />
      <Stack.Screen name="stream/[id]" />
      <Stack.Screen name="gradebook/[id]" />
      <Stack.Screen name="notes/[id]" />
      <Stack.Screen name="plan/[id]" />
      <Stack.Screen name="coins/[id]" />
      <Stack.Screen name="tests/[id]" />
      <Stack.Screen name="exams/[id]" />
      <Stack.Screen name="exams/index" />
      <Stack.Screen name="exam/[id]" />
      <Stack.Screen name="debts" />
      <Stack.Screen name="cashdesk" />
      <Stack.Screen name="finance/index" />
      <Stack.Screen name="finance/[section]" />
      <Stack.Screen name="finance/costs/[id]" />
      <Stack.Screen name="finance/salary/[month]" />
      <Stack.Screen name="reports/index" />
      <Stack.Screen name="reports/payments" />
      <Stack.Screen name="reports/student-payments" />
      <Stack.Screen name="reports/churn" />
      <Stack.Screen name="reports/graduates" />
      <Stack.Screen name="reports/staff-attendance" />
      <Stack.Screen name="reports/coins" />
      <Stack.Screen name="reports/leads" />
      <Stack.Screen name="reports/referrals" />
      <Stack.Screen name="reports/students" />
      <Stack.Screen name="reports/statistics" />
      <Stack.Screen name="knowledge/[id]" />
      <Stack.Screen name="comments/[id]" />
      <Stack.Screen name="history/[id]" />
      <Stack.Screen name="student/[id]" />
      <Stack.Screen name="announcements" />
      <Stack.Screen name="notifications" />
      <Stack.Screen name="search" />
      <Stack.Screen name="salary" />
      <Stack.Screen name="leads/index" />
      <Stack.Screen name="leads/calls" />
      <Stack.Screen name="leads/waitlist" />
      <Stack.Screen name="leads/inbox/index" />
      <Stack.Screen name="leads/inbox/[id]" />
      <Stack.Screen name="absences" />
      <Stack.Screen name="join-requests" />
      <Stack.Screen name="members/[id]" />
      <Stack.Screen name="timetable" />
      <Stack.Screen name="teachers/index" />
      <Stack.Screen name="teachers/[id]" />
      <Stack.Screen name="settings/index" />
      <Stack.Screen name="settings/courses" />
      <Stack.Screen name="settings/rooms" />
      <Stack.Screen name="settings/general" />
      <Stack.Screen name="settings/staff" />
      <Stack.Screen name="settings/roles" />
      <Stack.Screen name="settings/days-off" />
      <Stack.Screen name="settings/schools" />
      <Stack.Screen name="settings/sms" />
      <Stack.Screen name="settings/receipt" />
      <Stack.Screen name="settings/coins" />
      <Stack.Screen name="settings/payments" />
      <Stack.Screen name="settings/calls" />
      <Stack.Screen name="settings/forms" />
      <Stack.Screen name="settings/bot" />
      <Stack.Screen name="settings/logs/logins" />
      <Stack.Screen name="settings/logs/actions" />
      <Stack.Screen name="settings/logs/sms" />
      <Stack.Screen name="settings/integrations/index" />
      <Stack.Screen name="settings/integrations/amocrm" />
      <Stack.Screen name="settings/integrations/face-id" />
      <Stack.Screen name="settings/tests/index" />
      <Stack.Screen name="settings/tests/[id]" />
      {/* A lesson is left with its own button, not by a stray swipe from the edge. */}
      <Stack.Screen name="room/[id]" options={{ gestureEnabled: false, animation: "fade" }} />
    </Stack>
  );
}
