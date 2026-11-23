import { Star } from "lucide-react-native";
import { useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";

import { rateLesson } from "@/api/portal";
import type { LessonRating as Rating, PortalLesson } from "@/api/types";
import { Button } from "@/components/button";
import { Text } from "@/components/text";
import { errorText, useTranslations } from "@/lib/i18n";
import { font, radius, space, useTheme } from "@/lib/theme";

const STARS = [1, 2, 3, 4, 5];

/**
 * The student's one-to-five rating of a lesson that is over, with an optional
 * line (A-215, the site's A-168). A tap on a star saves at once; the line
 * opens after the first rating.
 */
export function LessonRating({ token, lesson }: { token: string; lesson: PortalLesson }) {
  const t = useTranslations("portal.lessons");
  const ta = useTranslations();
  const { colors } = useTheme();
  const [rating, setRating] = useState<Rating | null>(lesson.rating);
  const [comment, setComment] = useState(lesson.rating?.comment ?? "");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  if (!lesson.canRate && !rating) return null;

  const save = (stars: number, closeAfter: boolean) => {
    setBusy(true);
    setProblem(null);
    rateLesson(token, lesson.id, stars, comment.trim() || null)
      .then((saved) => {
        setRating(saved);
        if (closeAfter) setOpen(false);
      })
      .catch((error: unknown) => setProblem(errorText(ta, error)))
      .finally(() => setBusy(false));
  };

  return (
    <View style={styles.wrap} testID={`rating-${lesson.id}`}>
      <View style={styles.row}>
        <View
          style={styles.stars}
          accessibilityRole="radiogroup"
          accessibilityLabel={t("yourRating")}
        >
          {STARS.map((n) => {
            const on = rating !== null && n <= rating.rating;
            return (
              <Pressable
                key={n}
                onPress={() => {
                  save(n, false);
                  if (!rating) setOpen(true);
                }}
                disabled={busy || !lesson.canRate}
                accessibilityRole="radio"
                accessibilityState={{ checked: rating?.rating === n }}
                accessibilityLabel={t("stars", { count: n })}
                hitSlop={4}
                style={styles.star}
                testID={`rate-${lesson.id}-${n}`}
              >
                <Star
                  size={22}
                  color={on ? colors.warning : colors.input}
                  fill={on ? colors.warning : "transparent"}
                />
              </Pressable>
            );
          })}
        </View>
        {rating && lesson.canRate && !open ? (
          <Pressable
            onPress={() => setOpen(true)}
            accessibilityRole="button"
            hitSlop={8}
            testID={`rate-comment-open-${lesson.id}`}
          >
            <Text variant="small" tone="primary">
              {rating.comment ? t("changeComment") : t("addComment")}
            </Text>
          </Pressable>
        ) : null}
      </View>
      {rating?.comment && !open ? (
        <Text variant="small" tone="mutedForeground" testID={`rate-comment-text-${lesson.id}`}>
          {rating.comment}
        </Text>
      ) : null}
      {open && rating ? (
        <View style={styles.row}>
          <TextInput
            value={comment}
            onChangeText={setComment}
            maxLength={500}
            placeholder={t("commentPlaceholder")}
            placeholderTextColor={colors.mutedForeground}
            accessibilityLabel={t("commentPlaceholder")}
            style={[
              styles.input,
              {
                color: colors.foreground,
                backgroundColor: colors.background,
                borderColor: colors.input,
              },
            ]}
            testID={`rate-comment-${lesson.id}`}
          />
          <Button
            compact
            variant="outline"
            label={t("send")}
            disabled={busy}
            onPress={() => save(rating.rating, true)}
            testID={`rate-send-${lesson.id}`}
          />
        </View>
      ) : null}
      {problem ? (
        <Text variant="small" tone="destructive" accessibilityRole="alert">
          {problem}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space[2] },
  row: { flexDirection: "row", alignItems: "center", gap: space[3] },
  stars: { flexDirection: "row" },
  star: { padding: 5 },
  input: {
    flex: 1,
    minHeight: 40,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: space[3],
    paddingVertical: space[1],
    fontFamily: font.regular,
    fontSize: 15,
  },
});
