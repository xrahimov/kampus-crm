import { useRouter } from "expo-router";
import { BarChart3, Columns3, MessageSquare, Pencil, Plus, Trash2 } from "lucide-react-native";
import { useState, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";

import {
  useDeleteBoard,
  useDeleteColumn,
  useSaveBoard,
  useSaveColumn,
  type BoardColumn,
  type LeadBoard,
} from "@/api/leads";
import { Button } from "@/components/button";
import { Confirm } from "@/components/confirm";
import { Field } from "@/components/field";
import { ActionRow } from "@/components/rows";
import { Select } from "@/components/select";
import { Sheet } from "@/components/sheet";
import { Divider, Notice } from "@/components/surface";
import { SendSmsSheet } from "@/features/office/sms-sheet";
import { fieldErrorOf, hasFieldErrors } from "@/lib/form";
import { errorText, useTranslations } from "@/lib/i18n";
import { can, useMe } from "@/lib/session";
import { space } from "@/lib/theme";

/**
 * One name asked for in a sheet: the site's name dialog, for a board, a column
 * or anything else that is only a name. `onSubmit` saves; when it throws, the
 * sheet stays open and says why.
 */
export function NameSheet({
  open,
  onClose,
  title,
  label,
  initial = "",
  maxLength = 120,
  onSubmit,
  children,
  testID,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  label: string;
  initial?: string;
  maxLength?: number;
  onSubmit: (name: string) => Promise<unknown>;
  /** More to choose above the name, such as the branch of a new board. */
  children?: ReactNode;
  testID: string;
}) {
  const t = useTranslations();
  const [name, setName] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [missing, setMissing] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setName(initial);
      setError(null);
      setMissing(false);
    }
  }

  const submit = async () => {
    const value = name.trim();
    if (!value) {
      setMissing(true);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSubmit(value);
      onClose();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      testID={testID}
      footer={
        <Button
          label={t("common.save")}
          loading={busy}
          onPress={() => void submit()}
          testID={`${testID}-save`}
        />
      }
    >
      <View style={styles.form}>
        {error && !hasFieldErrors(error) ? (
          <Notice tone="destructive" testID={`${testID}-problem`}>
            {errorText(t, error)}
          </Notice>
        ) : null}
        {children}
        <Field
          label={label}
          value={name}
          onChangeText={setName}
          maxLength={maxLength}
          error={
            fieldErrorOf(t, error)("name") ??
            (missing && !name.trim() ? t("validation.required") : null)
          }
          testID={`${testID}-name`}
        />
      </View>
    </Sheet>
  );
}

/** What is being done to the board: its menu, or one of the things on it. */
export type BoardDoing = null | "menu" | "new" | "rename" | "column" | "delete";

/**
 * The board's own set-up on the Leads page (A-258), as the site has it beside
 * the board's name: the Sources report, a new board, the board renamed, a
 * column added, the board deleted. Each shows to whoever may do it.
 */
export function BoardSetup({
  doing,
  onDoing,
  board,
  onBoard,
}: {
  doing: BoardDoing;
  onDoing: (doing: BoardDoing) => void;
  board: LeadBoard | null;
  /** A new board is the one to show; with the board deleted, the first one is. */
  onBoard: (id: string | null) => void;
}) {
  const t = useTranslations();
  const tl = useTranslations("leads");
  const me = useMe();
  const router = useRouter();
  const mayChange = can(me, "leads.update");
  const mayDelete = can(me, "leads.delete");
  const create = useSaveBoard(null);
  const rename = useSaveBoard(board?.id ?? null);
  const column = useSaveColumn(board ? { boardId: board.id } : null);
  const remove = useDeleteBoard();
  const defaultBranch = me.activeBranch?.id ?? me.branches[0]?.id ?? null;
  const [branchId, setBranchId] = useState<string | null>(defaultBranch);
  const close = () => onDoing(null);

  return (
    <>
      <Sheet
        open={doing === "menu"}
        onClose={close}
        title={board?.name ?? tl("title")}
        testID="board-menu"
      >
        <View>
          <ActionRow
            icon={BarChart3}
            label={tl("sources")}
            onPress={() => {
              close();
              router.push("/staff/leads/sources");
            }}
            testID="board-do-sources"
          />
          {mayChange ? (
            <>
              <Divider />
              <ActionRow
                icon={Plus}
                label={tl("createBoard")}
                onPress={() => {
                  setBranchId(defaultBranch);
                  onDoing("new");
                }}
                testID="board-do-new"
              />
            </>
          ) : null}
          {mayChange && board ? (
            <>
              <Divider />
              <ActionRow
                icon={Pencil}
                label={tl("editBoard")}
                onPress={() => onDoing("rename")}
                testID="board-do-rename"
              />
              <Divider />
              <ActionRow
                icon={Columns3}
                label={tl("addColumn")}
                onPress={() => onDoing("column")}
                testID="board-do-column"
              />
            </>
          ) : null}
          {mayDelete && board ? (
            <>
              <Divider />
              <ActionRow
                icon={Trash2}
                label={tl("deleteBoard")}
                destructive
                onPress={() => {
                  remove.reset();
                  onDoing("delete");
                }}
                testID="board-do-delete"
              />
            </>
          ) : null}
        </View>
      </Sheet>
      <NameSheet
        open={doing === "new"}
        onClose={close}
        title={tl("createBoard")}
        label={tl("boardName")}
        onSubmit={async (name) => {
          const created = await create.mutateAsync({ name, branchId });
          onBoard(created.id);
        }}
        testID="board-new"
      >
        {me.branches.length > 1 ? (
          <Select
            label={t("branch.select")}
            value={branchId}
            onChange={setBranchId}
            options={me.branches.map((b) => ({ value: b.id, label: b.name }))}
            testID="board-new-branch"
          />
        ) : null}
      </NameSheet>
      <NameSheet
        open={doing === "rename"}
        onClose={close}
        title={tl("editBoard")}
        label={tl("boardName")}
        initial={board?.name ?? ""}
        onSubmit={(name) => rename.mutateAsync({ name })}
        testID="board-rename"
      />
      <NameSheet
        open={doing === "column"}
        onClose={close}
        title={tl("addColumn")}
        label={tl("columnName")}
        maxLength={60}
        onSubmit={(name) => column.mutateAsync(name)}
        testID="column-new"
      />
      <Confirm
        open={doing === "delete"}
        onClose={close}
        title={tl("deleteBoardTitle")}
        text={tl("deleteBoardText", { name: board?.name ?? "" })}
        label={t("common.delete")}
        destructive
        loading={remove.isPending}
        problem={remove.error ? errorText(t, remove.error) : null}
        onConfirm={() => {
          if (!board) return;
          remove.mutate(board.id, {
            onSuccess: () => {
              close();
              onBoard(null);
            },
          });
        }}
        testID="board-delete"
      />
    </>
  );
}

/**
 * A column's own menu (A-258): renamed, or deleted when it is empty and not
 * the board's last. The server says which of the two holds a column back.
 * A column with leads can be sent one SMS, by whoever may send them (A-259).
 */
export function ColumnSetup({
  column,
  onClose,
}: {
  column: BoardColumn | null;
  onClose: () => void;
}) {
  const t = useTranslations();
  const tl = useTranslations("leads");
  // The column last opened stays in the sheets while they slide away.
  const [shown, setShown] = useState<BoardColumn | null>(column);
  const me = useMe();
  const [doing, setDoing] = useState<"menu" | "rename" | "delete" | "sms">("menu");
  const [seen, setSeen] = useState<string | null>(column?.id ?? null);
  if ((column?.id ?? null) !== seen) {
    setSeen(column?.id ?? null);
    if (column) {
      setShown(column);
      setDoing("menu");
    }
  }
  const rename = useSaveColumn(shown ? { columnId: shown.id } : null);
  const remove = useDeleteColumn();
  const open = column !== null;

  return (
    <>
      <Sheet
        open={open && doing === "menu"}
        onClose={onClose}
        title={shown?.name ?? ""}
        testID="column-menu"
      >
        <View>
          {can(me, "sms.send") && (shown?.total ?? 0) > 0 ? (
            <>
              <ActionRow
                icon={MessageSquare}
                label={tl("columnSms")}
                onPress={() => setDoing("sms")}
                testID="column-do-sms"
              />
              <Divider />
            </>
          ) : null}
          <ActionRow
            icon={Pencil}
            label={tl("editColumn")}
            onPress={() => setDoing("rename")}
            testID="column-do-rename"
          />
          <Divider />
          <ActionRow
            icon={Trash2}
            label={t("common.delete")}
            destructive
            onPress={() => {
              remove.reset();
              setDoing("delete");
            }}
            testID="column-do-delete"
          />
        </View>
      </Sheet>
      <NameSheet
        open={open && doing === "rename"}
        onClose={onClose}
        title={tl("editColumn")}
        label={tl("columnName")}
        initial={shown?.name ?? ""}
        maxLength={60}
        onSubmit={(name) => rename.mutateAsync(name)}
        testID="column-rename"
      />
      <Confirm
        open={open && doing === "delete"}
        onClose={onClose}
        title={tl("deleteColumnTitle")}
        text={tl("deleteColumnText", { name: shown?.name ?? "" })}
        label={t("common.delete")}
        destructive
        loading={remove.isPending}
        problem={remove.error ? errorText(t, remove.error) : null}
        onConfirm={() => {
          if (shown) remove.mutate(shown.id, { onSuccess: onClose });
        }}
        testID="column-delete"
      />
      <SendSmsSheet
        open={open && doing === "sms"}
        onClose={onClose}
        target={
          open && doing === "sms" && shown ? { kind: "leadColumn", columnId: shown.id } : null
        }
        title={t("sms.send.toStudent", { name: shown?.name ?? "" })}
        testID="column-sms"
      />
    </>
  );
}

const styles = StyleSheet.create({
  form: { gap: space[4] },
});
