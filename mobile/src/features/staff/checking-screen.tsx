import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { useCheckingQueue, useReviewAnswer } from "@/api/hooks";
import type { CheckingItem } from "@/api/types";
import { Button } from "@/components/button";
import { Field } from "@/components/field";
import { Header } from "@/components/header";
import { Card, EmptyState, Loading, Notice, Screen } from "@/components/surface";
import { Text } from "@/components/text";
import { ApiError } from "@/lib/api";
import { dayAsDate } from "@/lib/days";
import { errorText, useDate, useTranslations } from "@/lib/i18n";
import { space } from "@/lib/theme";

import { OpenOnSite } from "./open-on-site";

/** Homework answers waiting for the teacher, oldest first: accept, or return with a word. */
export function CheckingScreen() {
  const t = useTranslations();
  const query = useCheckingQueue();
  const queue = query.data;
  const header = (
    <Header
      title={t("checking.title")}
      subtitle={
        queue && queue.total > 0 ? t("checking.waiting", { count: queue.total }) : undefined
      }
    />
  );
  if (query.isLoading) {
    return (
      <Screen header={header} scroll={false}>
        <Loading />
      </Screen>
    );
  }
  if (!queue) {
    const forbidden = query.error instanceof ApiError && query.error.status === 403;
    return (
      <Screen header={header}>
        <EmptyState
          title={forbidden ? t("mobile.noTeachingTitle") : errorText(t, query.error)}
          text={forbidden ? t("mobile.noTeachingText") : undefined}
          action={
            forbidden ? undefined : (
              <Button variant="outline" label={t("mobile.retry")} onPress={() => query.refetch()} />
            )
          }
        />
      </Screen>
    );
  }
  return (
    <Screen
      header={header}
      onRefresh={() => query.refetch()}
      refreshing={query.isRefetching}
      contentStyle={styles.column}
    >
      {queue.items.length === 0 ? (
        <EmptyState title={t("checking.emptyTitle")} text={t("checking.emptyHint")} />
      ) : (
        queue.items.map((item) => (
          <AnswerCard key={`${item.homeworkId}-${item.membershipId}`} item={item} />
        ))
      )}
    </Screen>
  );
}

function AnswerCard({ item }: { item: CheckingItem }) {
  const t = useTranslations();
  const formatDate = useDate();
  const review = useReviewAnswer();
  const [returning, setReturning] = useState(false);
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);

  const send = (status: "ACCEPTED" | "RETURNED") => {
    setError(null);
    review.mutate(
      {
        homeworkId: item.homeworkId,
        membershipId: item.membershipId,
        status,
        teacherComment: comment.trim() || null,
      },
      { onError: (e) => setError(errorText(t, e)) },
    );
  };

  return (
    <Card testID={`answer-${item.homeworkId}-${item.membershipId}`}>
      <View>
        <Text variant="heading">{item.fullName}</Text>
        <Text variant="small" tone="mutedForeground">
          {[
            item.groupName,
            item.lessonDate
              ? formatDate(dayAsDate(item.lessonDate), { day: "numeric", month: "short" })
              : null,
            item.lessonTopic,
          ]
            .filter(Boolean)
            .join(", ")}
        </Text>
      </View>
      <View style={styles.part}>
        <Text variant="smallStrong" tone="mutedForeground">
          {t("checking.task")}
        </Text>
        <Text numberOfLines={returning ? undefined : 4}>{item.title ?? item.text}</Text>
      </View>
      <View style={styles.part}>
        <Text variant="smallStrong" tone="mutedForeground">
          {t("checking.sentAt", {
            when: formatDate(new Date(item.submittedAt), {
              dateStyle: "medium",
              timeStyle: "short",
            }),
          })}
        </Text>
        <Text>{item.note ?? t("checking.noNote")}</Text>
      </View>
      {item.attachmentUrl || item.speaking ? (
        <OpenOnSite path="/checking" label={t("checking.attachment")} testID="answer-attachment" />
      ) : null}
      {returning ? (
        <Field
          label={t("checking.comment")}
          placeholder={t("checking.commentPlaceholder")}
          value={comment}
          onChangeText={setComment}
          multiline
          autoFocus
          testID="return-comment"
        />
      ) : null}
      {error ? <Notice tone="destructive">{error}</Notice> : null}
      <View style={styles.actions}>
        {returning ? (
          <>
            <Button
              compact
              variant="outline"
              label={t("common.cancel")}
              onPress={() => setReturning(false)}
            />
            <Button
              compact
              label={t("checking.returnSend")}
              onPress={() => send("RETURNED")}
              loading={review.isPending}
              testID="return-send"
            />
          </>
        ) : (
          <>
            <Button
              compact
              variant="outline"
              label={t("checking.return")}
              onPress={() => setReturning(true)}
              testID="return"
            />
            <Button
              compact
              label={t("checking.accept")}
              onPress={() => send("ACCEPTED")}
              loading={review.isPending}
              testID="accept"
            />
          </>
        )}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  column: { maxWidth: 720 },
  part: { gap: space[1] },
  actions: { flexDirection: "row", justifyContent: "flex-end", gap: space[2] },
});
