import { useState } from "react";
import { StyleSheet, View } from "react-native";

import {
  useSendSms,
  useSmsCount,
  useSmsTemplates,
  type SmsTarget,
} from "@/api/office-student-page";
import { Button } from "@/components/button";
import { Field } from "@/components/field";
import { Select } from "@/components/select";
import { Sheet } from "@/components/sheet";
import { Notice } from "@/components/surface";
import { Text } from "@/components/text";
import { errorText, useTranslations } from "@/lib/i18n";
import { smsParts } from "@/lib/sms-parts";
import { space } from "@/lib/theme";

/** The longest message the server takes. */
const MAX_LENGTH = 1000;

/**
 * "Send SMS" (A-240), as the site's: how many phones it reaches and whose, a
 * template to start from, the message with its count of characters and SMS,
 * then what came of it. The sheet stays open on the result, so a message that
 * was only recorded (no gateway) or failed is not missed.
 */
export function SendSmsSheet({
  open,
  onClose,
  target,
  title,
  testID = "sms",
}: {
  open: boolean;
  onClose: () => void;
  target: SmsTarget | null;
  title?: string;
  testID?: string;
}) {
  const t = useTranslations();
  const ts = useTranslations("sms.send");
  const count = useSmsCount(open ? target : null);
  const templates = useSmsTemplates(open);
  const send = useSendSms();
  const [text, setText] = useState("");
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setText("");
      setTemplateId(null);
      send.reset();
    }
  }
  const result = send.data;
  const { chars, parts } = smsParts(text);
  const list = templates.data ?? [];
  const nobody = count.data !== undefined && count.data.count === 0;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title ?? ts("title")}
      testID={testID}
      footer={
        result ? (
          <Button
            variant="outline"
            label={t("common.close")}
            onPress={onClose}
            testID={`${testID}-done`}
          />
        ) : (
          <Button
            label={ts("button")}
            loading={send.isPending}
            disabled={text.trim().length === 0 || nobody || !target}
            onPress={() => {
              if (target) send.mutate({ target, text: text.trim() });
            }}
            testID={`${testID}-send`}
          />
        )
      }
    >
      <View style={styles.form}>
        {result ? (
          <Notice
            tone={result.failed === 0 ? "success" : "destructive"}
            testID={`${testID}-result`}
          >
            {[
              ts("result", { sent: result.sent, failed: result.failed }),
              result.adapter === "fake" ? ts("fakeAdapter") : null,
            ]
              .filter(Boolean)
              .join(" ")}
          </Notice>
        ) : (
          <>
            <Text variant="small" tone="mutedForeground" testID={`${testID}-recipients`}>
              {count.data
                ? ts("recipients", { count: count.data.count, skipped: count.data.skipped })
                : count.error
                  ? errorText(t, count.error)
                  : ts("counting")}
            </Text>
            {count.data && count.data.sample.length > 0 ? (
              <Text variant="small" tone="mutedForeground" testID={`${testID}-sample`}>
                {count.data.sample.join(", ")}
                {count.data.count > count.data.sample.length ? "…" : ""}
              </Text>
            ) : null}
            {list.length > 0 ? (
              <Select
                label={ts("template")}
                value={templateId}
                onChange={(id) => {
                  setTemplateId(id);
                  const template = list.find((x) => x.id === id);
                  if (template) setText(template.text);
                }}
                placeholder={ts("noTemplate")}
                clearLabel={ts("noTemplate")}
                options={list.map((x) => ({
                  value: x.id,
                  label: `${x.categoryName}: ${x.text.slice(0, 60)}`,
                }))}
                testID={`${testID}-template`}
              />
            ) : null}
            <Field
              label={ts("text")}
              value={text}
              onChangeText={setText}
              multiline
              maxLength={MAX_LENGTH}
              hint={ts("counter", { chars, parts })}
              style={styles.text}
              testID={`${testID}-text`}
            />
            {send.error ? (
              <Notice tone="destructive" testID={`${testID}-problem`}>
                {errorText(t, send.error)}
              </Notice>
            ) : null}
          </>
        )}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  form: { gap: space[3] },
  text: { minHeight: 120, textAlignVertical: "top" },
});
