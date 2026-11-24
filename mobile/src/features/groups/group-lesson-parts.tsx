import { useState } from "react";
import { StyleSheet, View } from "react-native";

import {
  useAddExtraLesson,
  useGroupWaitlist,
  useOfferSeats,
  type WaitlistOffer,
} from "@/api/group-lessons";
import type { Group } from "@/api/types";
import { Button } from "@/components/button";
import { DateField } from "@/components/date-field";
import { Sheet } from "@/components/sheet";
import { Divider, Loading, Notice } from "@/components/surface";
import { Text } from "@/components/text";
import { TimeField } from "@/components/time-field";
import { centreToday } from "@/lib/days";
import { fieldErrorOf, hasFieldErrors } from "@/lib/form";
import { errorText, useTranslations } from "@/lib/i18n";
import { space } from "@/lib/theme";

/**
 * A lesson outside the group's days (A-262), as the site's "Extra lesson" on
 * the attendance sheet. It starts from the hours the group usually has, and
 * `onAdded` gets its day, so the month it landed in can be shown.
 */
export function ExtraLessonSheet({
  group,
  open,
  onClose,
  onAdded,
}: {
  group: Group;
  open: boolean;
  onClose: () => void;
  onAdded: (date: string) => void;
}) {
  const t = useTranslations();
  const ta = useTranslations("groups.attendance");
  const add = useAddExtraLesson(group.id);
  const usual = group.slots[0];
  const [date, setDate] = useState<string | null>(centreToday);
  const [start, setStart] = useState<string | null>(usual?.startTime ?? "09:00");
  const [end, setEnd] = useState<string | null>(usual?.endTime ?? "10:30");
  const [tried, setTried] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setDate(centreToday());
      setStart(usual?.startTime ?? "09:00");
      setEnd(usual?.endTime ?? "10:30");
      setTried(false);
      add.reset();
    }
  }
  const fieldError = fieldErrorOf(t, add.error);
  const required = (missing: boolean) => (tried && missing ? t("validation.required") : null);
  const backwards = !!start && !!end && end <= start;

  const submit = () => {
    setTried(true);
    if (!date || !start || !end || backwards) return;
    add.mutate(
      { date, startTime: start, endTime: end },
      {
        onSuccess: () => {
          onClose();
          onAdded(date);
        },
      },
    );
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={ta("extraLesson")}
      testID="extra-lesson"
      footer={
        <Button
          label={t("common.save")}
          loading={add.isPending}
          onPress={submit}
          testID="extra-lesson-save"
        />
      }
    >
      <View style={styles.form}>
        {add.error && !hasFieldErrors(add.error) ? (
          <Notice tone="destructive" testID="extra-lesson-problem">
            {errorText(t, add.error)}
          </Notice>
        ) : null}
        <DateField
          label={ta("date")}
          value={date}
          onChange={setDate}
          error={fieldError("date") ?? required(!date)}
          testID="extra-lesson-date"
        />
        <View style={styles.pair}>
          <View style={styles.fill}>
            <TimeField
              label={ta("start")}
              value={start}
              onChange={setStart}
              error={fieldError("startTime") ?? required(!start)}
              testID="extra-lesson-start"
            />
          </View>
          <View style={styles.fill}>
            <TimeField
              label={ta("end")}
              value={end}
              onChange={setEnd}
              error={
                fieldError("endTime") ??
                required(!end) ??
                (tried && backwards ? t("mobile.lessons.endAfterStart") : null)
              }
              testID="extra-lesson-end"
            />
          </View>
        </View>
      </View>
    </Sheet>
  );
}

/**
 * "Offer seats to the waiting list" (A-138, in the app A-262): the group's free
 * seats and who is next in line for its course, then one press that tells
 * them and marks them offered. `onDone` gets how many were told and how.
 */
export function OfferSeatsSheet({
  groupId,
  open,
  onClose,
  onDone,
}: {
  groupId: string;
  open: boolean;
  onClose: () => void;
  onDone: (result: WaitlistOffer) => void;
}) {
  const t = useTranslations();
  const tw = useTranslations("groups.waitlist");
  const list = useGroupWaitlist(groupId, open);
  const offer = useOfferSeats(groupId);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) offer.reset();
  }
  const data = list.data;
  const count = data?.next.length ?? 0;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={tw("title")}
      testID="offer-seats"
      footer={
        <Button
          label={tw("offer", { count })}
          disabled={count === 0}
          loading={offer.isPending}
          onPress={() =>
            offer.mutate(undefined, {
              onSuccess: (result) => {
                onClose();
                onDone(result);
              },
            })
          }
          testID="offer-seats-send"
        />
      }
    >
      <View style={styles.form}>
        <Text tone="mutedForeground">{tw("hint")}</Text>
        {offer.error ? (
          <Notice tone="destructive" testID="offer-seats-problem">
            {errorText(t, offer.error)}
          </Notice>
        ) : null}
        {list.isLoading ? (
          <Loading />
        ) : !data ? (
          <Notice tone="destructive" testID="offer-seats-unread">
            {errorText(t, list.error)}
          </Notice>
        ) : (
          <>
            <View>
              <View style={styles.fact}>
                <Text tone="mutedForeground" style={styles.fill}>
                  {tw("freeSeats")}
                </Text>
                <Text variant="bodyStrong" testID="offer-seats-free">
                  {data.freeSeats === null ? tw("freeSeatsUnknown") : String(data.freeSeats)}
                </Text>
              </View>
              <Divider />
              <View style={styles.fact}>
                <Text tone="mutedForeground" style={styles.fill}>
                  {tw("waiting")}
                </Text>
                <Text variant="bodyStrong" testID="offer-seats-waiting">
                  {String(data.waiting)}
                </Text>
              </View>
            </View>
            {count === 0 ? (
              <Text tone="mutedForeground" testID="offer-seats-none">
                {data.waiting > 0 ? tw("noSeats") : tw("none")}
              </Text>
            ) : (
              <View style={styles.next} testID="offer-seats-next">
                {data.next.map((one, index) => (
                  <View key={one.id} style={styles.person} testID={`offer-seats-${one.id}`}>
                    <Text tone="mutedForeground" style={styles.place}>
                      {index + 1}.
                    </Text>
                    <Text variant="bodyStrong" style={styles.fill} numberOfLines={2}>
                      {one.fullName}
                    </Text>
                    <Text variant="small" tone="mutedForeground">
                      {one.phone}
                    </Text>
                  </View>
                ))}
              </View>
            )}
            <Notice tone={data.smsActive ? "success" : "neutral"} testID="offer-seats-sms">
              {data.smsActive ? tw("smsOn") : tw("smsOff")}
            </Notice>
          </>
        )}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  form: { gap: space[4] },
  pair: { flexDirection: "row", gap: space[3] },
  fact: { flexDirection: "row", alignItems: "center", gap: space[3], paddingVertical: space[2] },
  next: { gap: space[2] },
  person: { flexDirection: "row", alignItems: "center", gap: space[2] },
  place: { width: 24 },
});
