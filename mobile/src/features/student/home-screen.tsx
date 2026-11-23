import { useRouter } from "expo-router";
import { Video } from "lucide-react-native";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { useStudentHome } from "@/api/hooks";
import type { StudentHomeGroup, StudentHomeHomework, StudentHomeProfile } from "@/api/types";
import { Button } from "@/components/button";
import { Header } from "@/components/header";
import { Badge, Card, EmptyState, Loading, Notice, Screen } from "@/components/surface";
import { Text } from "@/components/text";
import { DeviceSettings } from "@/features/shared/device-settings";
import { dayAsDate } from "@/lib/days";
import { errorText, useDate, useLocaleChoice, useMoney, useTranslations } from "@/lib/i18n";
import { useLayout } from "@/lib/layout";
import { useSession } from "@/lib/session";
import { space, useTheme } from "@/lib/theme";

import { openPersonalPage } from "./open-page";

/**
 * A student's or parent's home: each person they sign in for, that person's
 * groups with the next lesson and what is owed, and the homework still to do.
 */
export function StudentHomeScreen() {
  const t = useTranslations();
  const router = useRouter();
  const { wide } = useLayout();
  const { signOut } = useSession();
  const query = useStudentHome();
  const [leaving, setLeaving] = useState(false);
  const home = query.data;

  const header = (
    <Header
      title={home ? t("studentApp.hello", { name: home.account.name }) : t("studentApp.title")}
    />
  );
  if (query.isLoading) {
    return (
      <Screen header={header} scroll={false}>
        <Loading />
      </Screen>
    );
  }
  if (!home) {
    return (
      <Screen header={header}>
        <EmptyState
          title={errorText(t, query.error)}
          action={
            <Button variant="outline" label={t("mobile.retry")} onPress={() => query.refetch()} />
          }
        />
      </Screen>
    );
  }

  const settings = (
    <View style={styles.block}>
      <DeviceSettings />
      <Button
        variant="outline"
        label={
          home.account.hasPassword ? t("studentApp.changePassword") : t("studentApp.choosePassword")
        }
        onPress={() =>
          router.push({
            pathname: "/set-password",
            // A session a Telegram code opened may choose a password without the old one (A-196).
            params:
              home.account.hasPassword && home.signedInWith !== "TELEGRAM" ? { current: "1" } : {},
          })
        }
        testID="choose-password"
      />
      <Button
        variant="destructive"
        label={t("studentApp.signOut")}
        loading={leaving}
        onPress={() => {
          setLeaving(true);
          void signOut();
        }}
        testID="sign-out"
      />
    </View>
  );

  const profiles = (
    <View style={styles.block}>
      {query.isError ? <Notice tone="warning">{errorText(t, query.error)}</Notice> : null}
      {home.profiles.length === 0 ? (
        <EmptyState title={t("studentApp.noGroups")} />
      ) : (
        home.profiles.map((profile) => (
          <Profile key={profile.studentId} profile={profile} single={home.profiles.length === 1} />
        ))
      )}
    </View>
  );

  return (
    <Screen
      header={header}
      onRefresh={() => query.refetch()}
      refreshing={query.isRefetching}
      contentStyle={wide ? styles.split : undefined}
    >
      {wide ? (
        <>
          <View style={styles.main}>{profiles}</View>
          <View style={styles.side}>{settings}</View>
        </>
      ) : (
        <>
          {profiles}
          {settings}
        </>
      )}
    </Screen>
  );
}

function Profile({ profile, single }: { profile: StudentHomeProfile; single: boolean }) {
  const t = useTranslations();
  return (
    <View style={styles.block} testID={`profile-${profile.studentId}`}>
      {single && profile.relation === "SELF" ? null : (
        <View>
          <Text variant="title">{profile.fullName}</Text>
          <Text variant="small" tone="mutedForeground">
            {[profile.relation === "CHILD" ? t("studentApp.child") : null, profile.organizationName]
              .filter(Boolean)
              .join(", ")}
          </Text>
        </View>
      )}
      {profile.groups.length === 0 ? (
        <Card>
          <Text tone="mutedForeground">{t("studentApp.noGroups")}</Text>
        </Card>
      ) : (
        profile.groups.map((group) => <GroupCard key={group.membershipId} group={group} />)
      )}
      <Text variant="heading">{t("studentApp.homeworkTitle")}</Text>
      {profile.homework.length === 0 ? (
        <Card>
          <Text tone="mutedForeground">{t("studentApp.homeworkNone")}</Text>
        </Card>
      ) : (
        profile.homework.map((item) => (
          <HomeworkCard key={`${item.id}-${item.token}`} item={item} />
        ))
      )}
    </View>
  );
}

function GroupCard({ group }: { group: StudentHomeGroup }) {
  const t = useTranslations();
  const router = useRouter();
  const formatDate = useDate();
  const money = useMoney();
  const { colors } = useTheme();
  const next = group.nextLesson;
  return (
    <Card
      testID={`class-${group.membershipId}`}
      onPress={() =>
        router.push({ pathname: "/student/class/[token]", params: { token: group.token } })
      }
      style={group.live ? { borderColor: colors.ring } : undefined}
    >
      <View style={styles.rowTop}>
        <View style={styles.fill}>
          <Text variant="heading">{group.groupName}</Text>
          <Text variant="small" tone="mutedForeground">
            {[group.courseName, ...group.teachers].join(", ")}
          </Text>
        </View>
        {group.unreadNews > 0 ? <Badge tone="accent" label={String(group.unreadNews)} /> : null}
      </View>
      {next ? (
        <Text variant="figure">
          {formatDate(dayAsDate(next.date), { weekday: "short" })},{" "}
          {formatDate(dayAsDate(next.date), { day: "numeric", month: "short" })}, {next.startTime}–
          {next.endTime}
        </Text>
      ) : null}
      {group.balance < 0 ? (
        <Text variant="small" tone="destructive">
          {t("portal.money.debt", { amount: money(-group.balance) })}
        </Text>
      ) : null}
      {group.live ? (
        <Button
          label={`${t("studentApp.liveNow")}: ${t("studentApp.join")}`}
          icon={<Video size={18} color={colors.primaryForeground} />}
          onPress={() =>
            router.push({ pathname: "/student/room/[token]", params: { token: group.token } })
          }
          testID="join-lesson"
        />
      ) : null}
    </Card>
  );
}

function HomeworkCard({ item }: { item: StudentHomeHomework }) {
  const t = useTranslations();
  const formatDate = useDate();
  const { locale } = useLocaleChoice();
  const day = (iso: string) => formatDate(dayAsDate(iso), { day: "numeric", month: "short" });
  return (
    <Card onPress={() => void openPersonalPage(locale, item.token)} testID={`homework-${item.id}`}>
      <View style={styles.rowTop}>
        <Text variant="smallStrong" tone="mutedForeground" style={styles.fill}>
          {[
            item.groupName,
            item.lessonDate ? t("studentApp.lessonOf", { date: day(item.lessonDate) }) : null,
            item.dueDate ? t("studentApp.due", { date: day(item.dueDate) }) : null,
          ]
            .filter(Boolean)
            .join(", ")}
        </Text>
        {item.returned ? <Badge tone="warning" label={t("studentApp.returned")} /> : null}
      </View>
      <Text numberOfLines={4}>{item.title ?? item.text}</Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  block: { gap: space[4] },
  split: { flexDirection: "row", alignItems: "flex-start", gap: space[6] },
  main: { flex: 7 },
  side: { flex: 4 },
  rowTop: { flexDirection: "row", alignItems: "flex-start", gap: space[3] },
});
