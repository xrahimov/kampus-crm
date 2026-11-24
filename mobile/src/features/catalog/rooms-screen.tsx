import { Plus } from "lucide-react-native";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { useDeleteRoom, useRooms, useSaveRoom, type Room } from "@/api/office-catalog";
import { Button } from "@/components/button";
import { Confirm } from "@/components/confirm";
import { Field } from "@/components/field";
import { Header } from "@/components/header";
import { Select } from "@/components/select";
import { Sheet } from "@/components/sheet";
import { Card, EmptyState, Notice, Screen } from "@/components/surface";
import { Text } from "@/components/text";
import { PendingScreen } from "@/features/shared/pending-screen";
import { fieldErrorOf, hasFieldErrors } from "@/lib/form";
import { errorText, useTranslations } from "@/lib/i18n";
import { useLayout } from "@/lib/layout";
import { useMe } from "@/lib/session";
import { space, useTheme } from "@/lib/theme";

/**
 * The centre's rooms (A-234): the site's Settings → Rooms. Each room with its
 * branch and its seats; a press opens it to change or delete, and "New room"
 * adds one.
 */
export function RoomsScreen() {
  const t = useTranslations();
  const tr = useTranslations("settings.rooms");
  const { wide } = useLayout();
  const { colors } = useTheme();
  const query = useRooms();
  // The room in the form: one to change, "new", or none.
  const [form, setForm] = useState<Room | "new" | null>(null);
  const [shown, setShown] = useState<Room | "new">("new");
  const openForm = (next: Room | "new") => {
    setShown(next);
    setForm(next);
  };

  const header = (
    <Header
      back
      title={tr("title")}
      right={
        <Button
          compact
          icon={<Plus size={16} color={colors.primaryForeground} />}
          label={tr("add")}
          onPress={() => openForm("new")}
          testID="rooms-add"
        />
      }
    />
  );
  if (!query.data) return <PendingScreen header={header} query={query} />;
  const rooms = query.data.items;

  return (
    <Screen header={header} onRefresh={() => void query.refetch()} refreshing={query.isRefetching}>
      <Text variant="small" tone="mutedForeground">
        {tr("description")}
      </Text>
      {rooms.length === 0 ? (
        <EmptyState title={t("common.nothingFound")} />
      ) : (
        <View style={styles.grid} testID="rooms-list">
          {rooms.map((room) => (
            <View key={room.id} style={wide ? styles.cell : styles.full}>
              <Card onPress={() => openForm(room)} style={styles.card} testID={`room-${room.id}`}>
                <View style={styles.fill}>
                  <Text variant="heading" numberOfLines={1}>
                    {room.name}
                  </Text>
                  <Text variant="small" tone="mutedForeground" numberOfLines={1}>
                    {room.branchName}
                  </Text>
                </View>
                <View style={styles.seats}>
                  <Text variant="title" style={styles.number}>
                    {room.capacity}
                  </Text>
                  <Text variant="small" tone="mutedForeground">
                    {tr("capacity")}
                  </Text>
                </View>
              </Card>
            </View>
          ))}
        </View>
      )}
      <RoomFormSheet
        key={shown === "new" ? "new" : shown.id}
        open={form !== null}
        onClose={() => setForm(null)}
        room={shown === "new" ? undefined : shown}
      />
    </Screen>
  );
}

function RoomFormSheet({
  open,
  onClose,
  room,
}: {
  open: boolean;
  onClose: () => void;
  room?: Room;
}) {
  const t = useTranslations();
  const tr = useTranslations("settings.rooms");
  const me = useMe();
  const save = useSaveRoom(room?.id ?? null);
  const remove = useDeleteRoom();
  const defaultBranch = me.activeBranch?.id ?? me.branches[0]?.id ?? null;
  const [branchId, setBranchId] = useState<string | null>(room?.branchId ?? defaultBranch);
  const [name, setName] = useState(room?.name ?? "");
  const [capacity, setCapacity] = useState(room ? String(room.capacity) : "");
  const [missing, setMissing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setBranchId(room?.branchId ?? defaultBranch);
      setName(room?.name ?? "");
      setCapacity(room ? String(room.capacity) : "");
      setMissing(false);
      save.reset();
      remove.reset();
    }
  }
  const fieldError = fieldErrorOf(t, save.error);
  const required = (empty: boolean) => (missing && empty ? t("validation.required") : null);
  const seats = /^\d+$/.test(capacity.trim()) ? Number(capacity) : null;
  const seatsWrong = seats === null || seats < 1 || seats > 1000;

  const submit = () => {
    if (!branchId || !name.trim() || seatsWrong) {
      setMissing(true);
      return;
    }
    save.mutate({ branchId, name: name.trim(), capacity: seats ?? 1 }, { onSuccess: onClose });
  };

  return (
    <>
      <Sheet
        open={open && !deleting}
        onClose={onClose}
        title={room ? tr("edit") : tr("add")}
        testID="room-form"
        footer={
          <View style={styles.footer}>
            <Button
              label={t("common.save")}
              loading={save.isPending}
              onPress={submit}
              testID="room-save"
            />
            {room ? (
              <Button
                variant="ghost"
                label={t("common.delete")}
                onPress={() => setDeleting(true)}
                testID="room-delete"
              />
            ) : null}
          </View>
        }
      >
        <View style={styles.form}>
          {save.error && !hasFieldErrors(save.error) ? (
            <Notice tone="destructive" testID="room-problem">
              {errorText(t, save.error)}
            </Notice>
          ) : null}
          {!room && me.branches.length > 1 ? (
            <Select
              label={t("branch.select")}
              value={branchId}
              onChange={setBranchId}
              options={me.branches.map((b) => ({ value: b.id, label: b.name }))}
              error={fieldError("branchId") ?? required(!branchId)}
              testID="room-branch"
            />
          ) : null}
          <Field
            label={tr("name")}
            value={name}
            onChangeText={setName}
            maxLength={120}
            error={fieldError("name") ?? required(!name.trim())}
            testID="room-name"
          />
          <Field
            label={tr("capacity")}
            value={capacity}
            onChangeText={setCapacity}
            keyboardType="number-pad"
            maxLength={4}
            error={
              fieldError("capacity") ??
              (missing && seatsWrong
                ? t(
                    capacity.trim() === ""
                      ? "validation.required"
                      : seats !== null && seats > 1000
                        ? "validation.max"
                        : "validation.min",
                  )
                : null)
            }
            testID="room-capacity"
          />
        </View>
      </Sheet>
      <Confirm
        open={open && deleting}
        onClose={() => setDeleting(false)}
        title={tr("deleteTitle")}
        text={tr("deleteText", { name: room?.name ?? "" })}
        label={t("common.delete")}
        destructive
        loading={remove.isPending}
        problem={remove.error ? errorText(t, remove.error) : null}
        onConfirm={() => {
          if (!room) return;
          remove.mutate(room.id, {
            onSuccess: () => {
              setDeleting(false);
              onClose();
            },
          });
        }}
        testID="room-delete-confirm"
      />
    </>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -space[2], rowGap: space[3] },
  full: { width: "100%", paddingHorizontal: space[2] },
  cell: { width: "50%", paddingHorizontal: space[2] },
  card: { flexDirection: "row", alignItems: "center", gap: space[3], flex: 1 },
  fill: { flex: 1 },
  seats: { alignItems: "flex-end" },
  number: { fontVariant: ["tabular-nums"] },
  form: { gap: space[4] },
  footer: { gap: space[2] },
});
