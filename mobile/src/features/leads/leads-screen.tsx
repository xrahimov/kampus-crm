import { useLocalSearchParams, useRouter } from "expo-router";
import { MoreHorizontal, Plus } from "lucide-react-native";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";

import { useBoard, useLeadOptions, type BoardColumn, type Lead } from "@/api/leads";
import { Button } from "@/components/button";
import { Check } from "@/components/check";
import { Field } from "@/components/field";
import { Header } from "@/components/header";
import { Select } from "@/components/select";
import { Card, Divider, EmptyState, Notice, Screen } from "@/components/surface";
import { Text } from "@/components/text";
import { PendingScreen } from "@/features/shared/pending-screen";
import { ExcelButton } from "@/features/files/excel-button";
import { errorText, useTranslations } from "@/lib/i18n";
import { useLayout } from "@/lib/layout";
import { useRested } from "@/lib/rested";
import { can, useMe } from "@/lib/session";
import { radius, space, useTheme } from "@/lib/theme";

import { BoardSetup, ColumnSetup, type BoardDoing } from "./board-setup";
import { LeadRow } from "./lead-bits";
import { LeadsBulkBar } from "./leads-bulk";
import { LeadFlow } from "./lead-flow";
import { LeadFormSheet } from "./lead-form";

const COLUMN_WIDTH = 320;

/**
 * Leads (A-232): the site's board. On a phone one column is on the screen at a
 * time and the columns are the chips above it; on a tablet the columns stand
 * side by side, as on the site. A press on a lead opens its card with all that
 * is done with it; moving it to another column is a choice on that card, since
 * dragging across a phone's screen is no way to work.
 *
 * Boards and columns are set up from here too (A-258): the button in the top
 * bar has the board's own things, a column's "more" button its own. A search
 * result or a notification about a lead opens the board with its name already
 * searched.
 */
export function LeadsScreen() {
  const t = useTranslations();
  const tl = useTranslations("leads");
  const me = useMe();
  const router = useRouter();
  const { colors } = useTheme();
  const { wide } = useLayout();
  // A search result or a notification arrives with its board and the name to look for.
  const arrived = useLocalSearchParams<{ boardId?: string; q?: string }>();
  const [boardId, setBoardId] = useState<string | null>(arrived.boardId ?? null);
  const [typed, setTyped] = useState(arrived.q ?? "");
  const [seen, setSeen] = useState(`${arrived.boardId ?? ""}:${arrived.q ?? ""}`);
  if (seen !== `${arrived.boardId ?? ""}:${arrived.q ?? ""}`) {
    setSeen(`${arrived.boardId ?? ""}:${arrived.q ?? ""}`);
    setBoardId(arrived.boardId ?? null);
    setTyped(arrived.q ?? "");
  }
  const q = useRested(typed);
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [archived, setArchived] = useState(false);
  const [columnId, setColumnId] = useState<string | null>(null);
  const [picked, setPicked] = useState<Lead | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const [setup, setSetup] = useState<BoardDoing>(null);
  const [columnMenu, setColumnMenu] = useState<BoardColumn | null>(null);
  // The leads ticked for one thing done to all of them (A-259).
  const [ticked, setTicked] = useState<ReadonlySet<string>>(new Set());
  const tick = (id: string) =>
    setTicked((before) => {
      const next = new Set(before);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  const untick = () => setTicked(new Set());
  // "unassigned" here is the server's "none": the list's own "all" row already goes by that name.
  const query = useBoard({
    boardId,
    q,
    ownerId: ownerId === "unassigned" ? "none" : ownerId,
    archived,
  });
  const options = useLeadOptions();

  const header = (
    <Header
      title={tl("title")}
      back
      right={
        <Pressable
          onPress={() => setSetup("menu")}
          accessibilityRole="button"
          accessibilityLabel={t("common.actions")}
          hitSlop={8}
          style={styles.icon}
          testID="leads-menu"
        >
          <MoreHorizontal size={22} color={colors.foreground} />
        </Pressable>
      }
    />
  );
  if (!query.data) return <PendingScreen header={header} query={query} />;
  const { boards, board, columns, due, today } = query.data;
  const column = columns.find((c) => c.id === columnId) ?? columns[0] ?? null;
  const mayAdd = can(me, "leads.create") && !archived;
  const mayChange = can(me, "leads.update");
  // Only the ticked leads still on the screen count: a search may have taken some away.
  const tickedIds = columns.flatMap((c) =>
    c.leads.filter((l) => ticked.has(l.id)).map((l) => l.id),
  );
  const owners = options.data?.owners ?? [];

  return (
    <Screen
      header={header}
      onRefresh={() => {
        void query.refetch();
        void options.refetch();
      }}
      refreshing={query.isRefetching}
      contentStyle={styles.column}
    >
      <View style={styles.wrap}>
        <Button
          variant="outline"
          compact
          label={tl("calls.button", { count: due })}
          onPress={() => router.push("/staff/leads/calls")}
          testID="leads-calls"
        />
        <Button
          variant="outline"
          compact
          label={tl("waitlist.button", { count: options.data?.waiting ?? 0 })}
          onPress={() => router.push("/staff/leads/waitlist")}
          testID="leads-waitlist"
        />
        <Button
          variant="outline"
          compact
          label={tl("inbox.button", { count: options.data?.unreadConversations ?? 0 })}
          onPress={() => router.push("/staff/leads/inbox")}
          testID="leads-inbox"
        />
      </View>
      {query.error ? <Notice tone="destructive">{errorText(t, query.error)}</Notice> : null}
      {boards.length > 1 ? (
        <Select
          label={tl("board")}
          value={board?.id ?? null}
          onChange={(value) => {
            setBoardId(value);
            setColumnId(null);
            untick();
          }}
          options={boards.map((b) => ({
            value: b.id,
            label: b.name,
            note: `${b.branchName} · ${b.leadCount}`,
          }))}
          testID="leads-board"
        />
      ) : null}
      {!board ? (
        <>
          <EmptyState title={tl("noBoards")} text={mayChange ? tl("noBoardsHint") : undefined} />
          {mayChange ? (
            <Button
              icon={<Plus size={18} color={colors.primaryForeground} />}
              label={tl("createBoard")}
              onPress={() => setSetup("new")}
              style={styles.start}
              testID="board-create"
            />
          ) : null}
        </>
      ) : (
        <>
          <Field
            label={tl("calls.filters.search")}
            value={typed}
            onChangeText={setTyped}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            testID="leads-search"
          />
          <View style={styles.filters}>
            <View style={styles.fill}>
              <Select
                compact
                label={tl("filters.owner")}
                value={ownerId}
                onChange={setOwnerId}
                placeholder={`${tl("filters.owner")}: ${tl("filters.all")}`}
                clearLabel={`${tl("filters.owner")}: ${tl("filters.all")}`}
                options={[
                  { value: me.user.id, label: tl("filters.me") },
                  { value: "unassigned", label: tl("filters.unassigned") },
                  ...owners
                    .filter((o) => o.id !== me.user.id)
                    .map((o) => ({ value: o.id, label: o.fullName })),
                ]}
                testID="leads-owner"
              />
            </View>
            <Check
              label={tl("filters.archive")}
              value={archived}
              onChange={(value) => {
                setArchived(value);
                untick();
              }}
              testID="leads-archived"
            />
          </View>
          {mayChange ? (
            <LeadsBulkBar
              ids={tickedIds}
              onClear={untick}
              board={board}
              columns={columns}
              archived={archived}
              groups={options.data?.groups ?? []}
            />
          ) : null}
          {wide ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.boardRow}
              testID="leads-columns"
            >
              {columns.map((c) => (
                <View key={c.id} style={styles.boardColumn}>
                  <Column
                    column={c}
                    today={today}
                    titled
                    onLead={setPicked}
                    onAdd={mayAdd ? () => setAdding(c.id) : undefined}
                    onMenu={mayChange ? () => setColumnMenu(c) : undefined}
                    ticked={ticked}
                    onTick={mayChange ? tick : undefined}
                  />
                </View>
              ))}
            </ScrollView>
          ) : (
            <>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chips}
                testID="leads-columns"
              >
                {columns.map((c) => {
                  const on = c.id === column?.id;
                  return (
                    <Pressable
                      key={c.id}
                      onPress={() => setColumnId(c.id)}
                      accessibilityRole="tab"
                      accessibilityState={{ selected: on }}
                      style={[
                        styles.chip,
                        {
                          backgroundColor: on ? colors.primary : colors.card,
                          borderColor: on ? colors.primary : colors.border,
                        },
                      ]}
                      testID={`column-${c.id}`}
                    >
                      <Text variant="smallStrong" tone={on ? "primaryForeground" : "foreground"}>
                        {c.name}
                      </Text>
                      <Text variant="small" tone={on ? "primaryForeground" : "mutedForeground"}>
                        {c.leads.length}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
              {column ? (
                <Column
                  column={column}
                  today={today}
                  onLead={setPicked}
                  onAdd={mayAdd ? () => setAdding(column.id) : undefined}
                  onMenu={mayChange ? () => setColumnMenu(column) : undefined}
                  ticked={ticked}
                  onTick={mayChange ? tick : undefined}
                />
              ) : null}
            </>
          )}
          <ExcelButton
            path="/leads/export.xlsx"
            params={{
              boardId: board?.id ?? boardId,
              q,
              ownerId: ownerId === "unassigned" ? "none" : ownerId,
              archived: archived ? "true" : null,
            }}
            testID="leads-excel"
          />
        </>
      )}
      <BoardSetup
        doing={setup}
        onDoing={setSetup}
        board={board}
        onBoard={(id) => {
          setBoardId(id);
          setColumnId(null);
        }}
      />
      <ColumnSetup column={columnMenu} onClose={() => setColumnMenu(null)} />
      <LeadFlow lead={picked} onClose={() => setPicked(null)} today={today} />
      <LeadFormSheet
        open={adding !== null}
        onClose={() => setAdding(null)}
        boardId={board?.id ?? null}
        columnId={adding}
      />
    </Screen>
  );
}

function Column({
  column,
  today,
  titled = false,
  onLead,
  onAdd,
  onMenu,
  ticked,
  onTick,
}: {
  column: BoardColumn;
  today: string;
  /** With the column's name on top: the tablet's side-by-side columns. */
  titled?: boolean;
  onLead: (lead: Lead) => void;
  onAdd?: () => void;
  /** Opens the column's own menu: for whoever may rename or delete it. */
  onMenu?: () => void;
  ticked?: ReadonlySet<string>;
  /** With it every lead has a tick box. */
  onTick?: (id: string) => void;
}) {
  const t = useTranslations();
  const tl = useTranslations("leads");
  const { colors } = useTheme();
  const menu = onMenu ? (
    <Pressable
      onPress={onMenu}
      accessibilityRole="button"
      accessibilityLabel={t("common.actionsFor", { name: column.name })}
      hitSlop={8}
      style={styles.icon}
      testID={`column-menu-${column.id}`}
    >
      <MoreHorizontal size={20} color={colors.foreground} />
    </Pressable>
  ) : null;
  const add = onAdd ? (
    <Button
      variant="outline"
      compact
      icon={<Plus size={16} color={colors.foreground} />}
      label={tl("add")}
      onPress={onAdd}
      style={styles.start}
      testID={`lead-add-${column.id}`}
    />
  ) : null;
  return (
    <View style={styles.columnBody} testID={`column-body-${column.id}`}>
      {titled ? (
        <View style={styles.columnTitle}>
          <Text variant="heading" style={styles.fill} numberOfLines={1}>
            {column.name}
          </Text>
          <Text tone="mutedForeground">{column.leads.length}</Text>
          {menu}
        </View>
      ) : null}
      {titled ? (
        add
      ) : add || menu ? (
        // On a phone the column's name is on its chip, so its menu stands beside "Add lead".
        <View style={styles.columnTools}>
          {add ?? <View />}
          {menu}
        </View>
      ) : null}
      {column.leads.length === 0 ? (
        <Text tone="mutedForeground" testID={`column-empty-${column.id}`}>
          {tl("emptyColumn")}
        </Text>
      ) : (
        <Card style={styles.flush}>
          {column.leads.map((lead, index) => (
            <View key={lead.id}>
              {index > 0 ? <Divider /> : null}
              <LeadRow
                lead={lead}
                today={today}
                note={lead.ownerName}
                onPress={() => onLead(lead)}
                ticked={ticked?.has(lead.id)}
                onTick={onTick ? () => onTick(lead.id) : undefined}
              />
            </View>
          ))}
        </Card>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  column: { gap: space[4] },
  fill: { flex: 1 },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: space[2] },
  filters: { flexDirection: "row", alignItems: "center", gap: space[3] },
  chips: { gap: space[2], paddingRight: space[4] },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderRadius: radius.full,
    paddingHorizontal: space[3],
    paddingVertical: space[2],
  },
  boardRow: { gap: space[4], alignItems: "flex-start", paddingRight: space[4] },
  boardColumn: { width: COLUMN_WIDTH },
  columnBody: { gap: space[3] },
  columnTitle: { flexDirection: "row", alignItems: "center", gap: space[2] },
  columnTools: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  icon: { padding: space[1] },
  flush: { padding: 0, overflow: "hidden" },
  start: { alignSelf: "flex-start" },
});
