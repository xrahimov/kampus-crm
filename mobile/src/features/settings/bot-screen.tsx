import { Plus } from "lucide-react-native";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import {
  useAddBotRecipient,
  useBotRecipients,
  useRemoveBotRecipient,
  useStaffChoices,
  type BotRecipient,
  type StaffChoice,
} from "@/api/office-forms-bot";
import { useBranchRows, type BranchRow } from "@/api/office-general-settings";
import { Button } from "@/components/button";
import { Chip } from "@/components/chip";
import { Confirm } from "@/components/confirm";
import { Field } from "@/components/field";
import { Header } from "@/components/header";
import { Select } from "@/components/select";
import { Sheet } from "@/components/sheet";
import { Card, Divider, EmptyState, Notice, Screen } from "@/components/surface";
import { Text } from "@/components/text";
import { PendingScreen } from "@/features/shared/pending-screen";
import { fieldErrorOf, hasFieldErrors } from "@/lib/form";
import { errorText, useTranslations } from "@/lib/i18n";
import { can, useMe } from "@/lib/session";
import { space, useTheme } from "@/lib/theme";

import { Bin } from "./parts";

/** A Telegram chat's number, as the server takes it. */
const CHAT_ID = /^-?\d{4,20}$/;

/**
 * Bot notifications (A-247): the site's Settings → Bot notifications. The
 * staff the bot writes to in Telegram about payments and new students, each
 * with their chat's number and the branches they hear about. **Create** adds
 * a person who is not in the list yet; the bin removes one after a question.
 */
export function BotScreen() {
  const t = useTranslations();
  const tb = useTranslations("bot");
  const me = useMe();
  const { colors } = useTheme();
  const query = useBotRecipients();
  // The list of staff is its own right; without it nobody can be chosen.
  const maySeeStaff = can(me, "staff.view");
  const staff = useStaffChoices(maySeeStaff);
  const branches = useBranchRows();
  const remove = useRemoveBotRecipient();
  const [adding, setAdding] = useState(false);
  const [leaving, setLeaving] = useState<BotRecipient | null>(null);
  const [asked, setAsked] = useState<BotRecipient | null>(null);
  const taken = new Set((query.data ?? []).map((one) => one.userId));
  const candidates = (staff.data ?? []).filter((one) => !taken.has(one.id));

  const header = (
    <Header
      back
      title={tb("title")}
      right={
        <Button
          compact
          icon={<Plus size={16} color={colors.primaryForeground} />}
          label={tb("add")}
          disabled={candidates.length === 0 || !branches.data}
          onPress={() => setAdding(true)}
          testID="bot-add"
        />
      }
    />
  );
  if (!query.data) return <PendingScreen header={header} query={query} />;

  return (
    <Screen header={header} onRefresh={() => void query.refetch()} refreshing={query.isRefetching}>
      <Text variant="small" tone="mutedForeground">
        {tb("description")}
      </Text>
      {staff.error || branches.error ? (
        <Notice tone="warning" testID="bot-choices-problem">
          {errorText(t, staff.error ?? branches.error)}
        </Notice>
      ) : null}
      {query.data.length === 0 ? (
        <View testID="bot-empty">
          <EmptyState title={tb("empty")} text={tb("emptyHint")} />
        </View>
      ) : (
        <Card style={styles.flush} testID="bot-list">
          {query.data.map((row, index) => (
            <View key={row.id}>
              {index > 0 ? <Divider /> : null}
              <View style={styles.row} testID={`bot-${row.id}`}>
                <View style={styles.fill}>
                  <Text variant="bodyStrong" numberOfLines={1}>
                    {row.fullName}
                  </Text>
                  <Text variant="small" tone="mutedForeground" style={styles.number}>
                    {row.phone}
                  </Text>
                  <Text variant="small" tone="mutedForeground" style={styles.number}>
                    {tb("columns.chatId")}: {row.chatId}
                  </Text>
                  <Text variant="small" tone="mutedForeground">
                    {row.branchNames.length === 0 ? tb("allBranches") : row.branchNames.join(", ")}
                  </Text>
                </View>
                <Bin
                  label={`${t("common.delete")}: ${row.fullName}`}
                  onPress={() => {
                    remove.reset();
                    setAsked(row);
                    setLeaving(row);
                  }}
                  testID={`bot-remove-${row.id}`}
                />
              </View>
            </View>
          ))}
        </Card>
      )}
      <RecipientSheet
        open={adding}
        onClose={() => setAdding(false)}
        candidates={candidates}
        branches={(branches.data ?? []).filter((one) => one.isActive)}
      />
      <Confirm
        open={leaving !== null}
        onClose={() => setLeaving(null)}
        title={tb("remove")}
        text={asked?.fullName}
        label={t("common.delete")}
        destructive
        loading={remove.isPending}
        problem={remove.error ? errorText(t, remove.error) : null}
        onConfirm={() => {
          if (!leaving) return;
          remove.mutate(leaving.id, { onSuccess: () => setLeaving(null) });
        }}
        testID="bot-remove-confirm"
      />
    </Screen>
  );
}

function RecipientSheet({
  open,
  onClose,
  candidates,
  branches,
}: {
  open: boolean;
  onClose: () => void;
  candidates: StaffChoice[];
  branches: BranchRow[];
}) {
  const t = useTranslations();
  const tb = useTranslations("bot");
  const save = useAddBotRecipient();
  const [userId, setUserId] = useState<string | null>(null);
  const [chatId, setChatId] = useState("");
  const [branchIds, setBranchIds] = useState<string[]>([]);
  const [tried, setTried] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      // As on the site: the first person not in the list yet is already chosen.
      setUserId(candidates[0]?.id ?? null);
      setChatId("");
      setBranchIds([]);
      setTried(false);
      save.reset();
    }
  }
  const fieldError = fieldErrorOf(t, save.error);
  const chatOk = CHAT_ID.test(chatId.trim());

  const submit = () => {
    setTried(true);
    if (!userId || !chatOk) return;
    save.mutate({ userId, chatId: chatId.trim(), branchIds }, { onSuccess: onClose });
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={tb("add")}
      testID="bot-form"
      footer={
        <Button
          label={t("common.save")}
          loading={save.isPending}
          onPress={submit}
          testID="bot-save"
        />
      }
    >
      <View style={styles.form}>
        {save.error && !hasFieldErrors(save.error) ? (
          <Notice tone="destructive" testID="bot-problem">
            {errorText(t, save.error)}
          </Notice>
        ) : null}
        <Select
          label={tb("columns.staff")}
          value={userId}
          onChange={(value) => {
            if (value) setUserId(value);
          }}
          options={candidates.map((one) => ({
            value: one.id,
            label: `${one.fullName} · ${one.phone}`,
          }))}
          error={fieldError("userId") ?? (tried && !userId ? t("validation.required") : null)}
          testID="bot-staff"
        />
        <Field
          label={tb("columns.chatId")}
          value={chatId}
          onChangeText={setChatId}
          keyboardType="numbers-and-punctuation"
          autoCorrect={false}
          maxLength={21}
          hint={tb("chatIdHint")}
          error={fieldError("chatId") ?? (tried && !chatOk ? t("validation.chatId") : null)}
          testID="bot-chat-id"
        />
        <View style={styles.block}>
          <Text variant="smallStrong">{tb("columns.branches")}</Text>
          <Text variant="small" tone="mutedForeground">
            {tb("branchesHint")}
          </Text>
          <View style={styles.chips} testID="bot-branches">
            {branches.map((branch) => {
              const on = branchIds.includes(branch.id);
              return (
                <Chip
                  key={branch.id}
                  label={branch.name}
                  on={on}
                  onPress={() =>
                    setBranchIds((now) =>
                      on ? now.filter((id) => id !== branch.id) : [...now, branch.id],
                    )
                  }
                  testID={`bot-branch-${branch.id}`}
                />
              );
            })}
          </View>
        </View>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  flush: { padding: 0, gap: 0, overflow: "hidden" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    paddingHorizontal: space[4],
    paddingVertical: space[3],
  },
  number: { fontVariant: ["tabular-nums"] },
  form: { gap: space[4] },
  block: { gap: space[1] },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space[2], marginTop: space[1] },
});
