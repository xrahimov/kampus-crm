import { ArrowRight } from "lucide-react-native";
import { useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";

import { useBulkLeads, useLeadsToGroup, type BoardColumn, type LeadBoard } from "@/api/leads";
import { Button } from "@/components/button";
import { Confirm } from "@/components/confirm";
import { ActionRow } from "@/components/rows";
import { Sheet } from "@/components/sheet";
import { Card, Divider, Notice } from "@/components/surface";
import { Text } from "@/components/text";
import { SendSmsSheet } from "@/features/office/sms-sheet";
import { errorText, useTranslations } from "@/lib/i18n";
import { can, useMe } from "@/lib/session";
import { space, useTheme } from "@/lib/theme";

import { JoinGroupSheet } from "./join-group-sheet";

type Doing = null | "move" | "archive" | "restore" | "sms" | "group";

/**
 * What is done to the ticked leads together (A-259), as the site's bar over
 * the board: moved to a column, sent an SMS, archived (or brought back, in the
 * archive), or made students of one group. What came of it stays on the page
 * after the ticks are cleared.
 */
export function LeadsBulkBar({
  ids,
  onClear,
  board,
  columns,
  archived,
  groups,
}: {
  /** The ticked leads that are on the screen now. */
  ids: string[];
  onClear: () => void;
  board: LeadBoard;
  columns: BoardColumn[];
  /** The archive is shown: its leads can only be brought back. */
  archived: boolean;
  /** The groups a lead may join; only the board's branch is offered. */
  groups: Array<{ id: string; name: string; branchId: string }>;
}) {
  const t = useTranslations();
  const tl = useTranslations("leads");
  const me = useMe();
  const { colors } = useTheme();
  const bulk = useBulkLeads();
  const join = useLeadsToGroup(ids);
  const [doing, setDoing] = useState<Doing>(null);
  const [note, setNote] = useState<string | null>(null);
  const count = ids.length;
  const maySms = can(me, "sms.send");
  const mayJoin = can(me, "groups.update");

  const start = (next: Doing) => {
    bulk.reset();
    join.reset();
    setNote(null);
    setDoing(next);
  };
  const done = (text: string) => {
    setDoing(null);
    setNote(text);
    onClear();
  };
  const run = (input: Parameters<typeof bulk.mutate>[0]) =>
    bulk.mutate(input, {
      onSuccess: (result) => done(tl("bulk.done", { done: result.done, skipped: result.skipped })),
    });

  return (
    <>
      {note ? (
        <Notice tone="success" testID="leads-bulk-note">
          {note}
        </Notice>
      ) : null}
      {count > 0 ? (
        <Card style={styles.bar} testID="leads-bulk">
          <Text variant="bodyStrong" testID="leads-bulk-count">
            {tl("bulk.selected", { count })}
          </Text>
          <View style={styles.wrap}>
            {!archived && columns.length > 1 ? (
              <Button
                variant="outline"
                compact
                label={tl("bulk.move")}
                onPress={() => start("move")}
                testID="bulk-move"
              />
            ) : null}
            {maySms && !archived ? (
              <Button
                variant="outline"
                compact
                label={tl("bulk.sms")}
                onPress={() => start("sms")}
                testID="bulk-sms"
              />
            ) : null}
            {mayJoin ? (
              <Button
                variant="outline"
                compact
                label={tl("addToGroup.button", { count })}
                onPress={() => start("group")}
                testID="bulk-group"
              />
            ) : null}
            <Button
              variant={archived ? "outline" : "destructive"}
              compact
              label={archived ? tl("bulk.restore") : tl("bulk.archive")}
              onPress={() => start(archived ? "restore" : "archive")}
              testID="bulk-archive"
            />
            <Button
              variant="ghost"
              compact
              label={tl("bulk.clear")}
              onPress={() => {
                setNote(null);
                onClear();
              }}
              testID="bulk-clear"
            />
          </View>
        </Card>
      ) : null}
      <Sheet
        open={doing === "move"}
        onClose={() => setDoing(null)}
        title={tl("bulk.move")}
        testID="bulk-move-list"
      >
        <View>
          {bulk.error ? (
            <Notice tone="destructive" testID="bulk-move-problem">
              {errorText(t, bulk.error)}
            </Notice>
          ) : null}
          {bulk.isPending ? (
            // The rows give way while the server works, so a second tap cannot follow the first.
            <ActivityIndicator color={colors.ring} style={styles.busy} testID="bulk-move-busy" />
          ) : (
            columns.map((column, index) => (
              <View key={column.id}>
                {index > 0 ? <Divider /> : null}
                <ActionRow
                  icon={ArrowRight}
                  label={column.name}
                  onPress={() => run({ action: "move", columnId: column.id, leadIds: ids })}
                  testID={`bulk-move-${column.id}`}
                />
              </View>
            ))
          )}
        </View>
      </Sheet>
      <Confirm
        open={doing === "archive" || doing === "restore"}
        onClose={() => setDoing(null)}
        title={tl(archived ? "bulk.restoreTitle" : "bulk.archiveTitle", { count })}
        text={tl(archived ? "bulk.restoreText" : "bulk.archiveText")}
        label={archived ? tl("bulk.restore") : tl("bulk.archive")}
        destructive={!archived}
        loading={bulk.isPending}
        problem={bulk.error ? errorText(t, bulk.error) : null}
        onConfirm={() => run({ action: archived ? "restore" : "archive", leadIds: ids })}
        testID="bulk-confirm"
      />
      <SendSmsSheet
        open={doing === "sms"}
        onClose={() => setDoing(null)}
        target={doing === "sms" && count > 0 ? { kind: "leads", leadIds: ids } : null}
        title={tl("bulk.smsTitle", { count })}
        testID="bulk-sms-sheet"
      />
      <JoinGroupSheet
        open={doing === "group"}
        onClose={() => setDoing(null)}
        title={tl("addToGroup.title")}
        hint={tl("addToGroup.hint", { count })}
        groups={groups.filter((g) => g.branchId === board.branchId)}
        saving={join.isPending}
        error={join.error}
        onSave={(input) =>
          join.mutate(input, {
            onSuccess: (result) =>
              done(tl("addToGroup.done", { added: result.added, skipped: result.skipped })),
          })
        }
        testID="bulk-join"
      />
    </>
  );
}

const styles = StyleSheet.create({
  bar: { gap: space[3] },
  busy: { paddingVertical: space[5] },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: space[2] },
});
