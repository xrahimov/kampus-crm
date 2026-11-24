import { Plus } from "lucide-react-native";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { useRoleStep, useRoles, type RoleRow } from "@/api/office-staff";
import { Button } from "@/components/button";
import { Check } from "@/components/check";
import { Confirm } from "@/components/confirm";
import { Field } from "@/components/field";
import { Header } from "@/components/header";
import { Sheet } from "@/components/sheet";
import { Badge, Card, Divider, Notice, Screen } from "@/components/surface";
import { Text } from "@/components/text";
import { PendingScreen } from "@/features/shared/pending-screen";
import { fieldErrorOf, hasFieldErrors } from "@/lib/form";
import { errorText, useTranslations } from "@/lib/i18n";
import { useLayout } from "@/lib/layout";
import { useMe } from "@/lib/session";
import { space, useTheme } from "@/lib/theme";

import { RowPress } from "./parts";
import { ALL_PERMISSIONS, permissionGroups, type Permission } from "./permissions";

const GROUPS = permissionGroups();

/**
 * Roles (A-244): the site's Settings → Roles. What each role may do: the
 * roles Kampus comes with and the centre's own, each with how many
 * permissions and people it has. A press opens the role: its name, whether it
 * is in use, and a tick per permission under its module. Nobody hands out
 * more than they hold themselves, so those ticks are greyed. The CEO role is
 * everything and cannot be opened.
 */
export function RolesScreen() {
  const t = useTranslations();
  const tr = useTranslations("settings.roles");
  const { colors } = useTheme();
  const query = useRoles();
  const [form, setForm] = useState<RoleRow | "new" | null>(null);
  const [shown, setShown] = useState<RoleRow | "new">("new");
  const openForm = (next: RoleRow | "new") => {
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
          testID="roles-add"
        />
      }
    />
  );
  if (!query.data) return <PendingScreen header={header} query={query} />;
  const roleName = (role: RoleRow) =>
    t.has(`roles.${role.code}`) ? t(`roles.${role.code}`) : role.name;
  return (
    <Screen header={header} onRefresh={() => void query.refetch()} refreshing={query.isRefetching}>
      <Text variant="small" tone="mutedForeground">
        {tr("description")}
      </Text>
      <Card style={styles.flush} testID="roles-list">
        {query.data.map((role, index) => {
          const line = (
            <>
              <View style={styles.fill}>
                <View style={styles.name}>
                  <Text variant="bodyStrong" numberOfLines={2}>
                    {roleName(role)}
                  </Text>
                  {role.isSystem ? <Badge label={tr("system")} /> : null}
                </View>
                <Text variant="small" tone="mutedForeground">
                  {role.permissions.includes(ALL_PERMISSIONS)
                    ? tr("allPermissions")
                    : tr("permissionCount", { count: role.permissions.length })}
                  {" · "}
                  {tr("users")}: {role.userCount}
                </Text>
              </View>
              <Badge
                tone={role.isActive ? "success" : "neutral"}
                label={t(role.isActive ? "common.active" : "common.inactive")}
              />
            </>
          );
          return (
            <View key={role.id}>
              {index > 0 ? <Divider /> : null}
              {role.code === "CEO" ? (
                <View style={styles.row} testID={`role-${role.code}`}>
                  {line}
                </View>
              ) : (
                <RowPress onPress={() => openForm(role)} testID={`role-${role.code}`}>
                  {line}
                </RowPress>
              )}
            </View>
          );
        })}
      </Card>
      <RoleSheet
        key={shown === "new" ? "new" : shown.id}
        open={form !== null}
        onClose={() => setForm(null)}
        role={shown === "new" ? undefined : shown}
        title={shown === "new" ? tr("add") : tr("edit")}
        name={shown === "new" ? "" : roleName(shown)}
      />
    </Screen>
  );
}

function RoleSheet({
  open,
  onClose,
  role,
  title,
  name: shownName,
}: {
  open: boolean;
  onClose: () => void;
  role?: RoleRow;
  title: string;
  /** The role's name as the list shows it, for the question before deleting. */
  name: string;
}) {
  const t = useTranslations();
  const tr = useTranslations("settings.roles");
  const me = useMe();
  const { wide } = useLayout();
  const { colors } = useTheme();
  const save = useRoleStep();
  const remove = useRoleStep();
  const [name, setName] = useState(role?.name ?? "");
  const [isActive, setIsActive] = useState(role?.isActive ?? true);
  const [held, setHeld] = useState<string[]>(role?.permissions ?? []);
  const [missing, setMissing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setName(role?.name ?? "");
      setIsActive(role?.isActive ?? true);
      setHeld(role?.permissions ?? []);
      setMissing(false);
      save.reset();
      remove.reset();
    }
  }
  const fieldError = fieldErrorOf(t, save.error);
  /* A person hands out only what they hold themselves. */
  const mayGrant = (permission: Permission) =>
    me.permissions.includes(ALL_PERMISSIONS) || me.permissions.includes(permission);
  const set = (permissions: Permission[], on: boolean) =>
    setHeld((now) => {
      const next = new Set(now);
      for (const permission of permissions) {
        if (on) next.add(permission);
        else next.delete(permission);
      }
      return Array.from(next);
    });

  const submit = () => {
    if (!name.trim()) {
      setMissing(true);
      return;
    }
    save.mutate(
      { id: role?.id ?? null, input: { name: name.trim(), isActive, permissions: held } },
      { onSuccess: onClose },
    );
  };

  return (
    <>
      <Sheet
        open={open && !deleting}
        onClose={onClose}
        title={title}
        testID="role-form"
        footer={
          <View style={styles.footer}>
            <Button
              label={t("common.save")}
              loading={save.isPending}
              onPress={submit}
              testID="role-save"
            />
            {role && !role.isSystem ? (
              <Button
                variant="ghost"
                label={t("common.delete")}
                onPress={() => setDeleting(true)}
                testID="role-delete"
              />
            ) : null}
          </View>
        }
      >
        <View style={styles.form}>
          {save.error && !(hasFieldErrors(save.error) && fieldError("name")) ? (
            <Notice tone="destructive" testID="role-problem">
              {errorText(t, save.error)}
            </Notice>
          ) : null}
          {role?.isSystem ? (
            <Text variant="small" tone="mutedForeground" testID="role-system-hint">
              {tr("systemHint")}
            </Text>
          ) : null}
          <Field
            label={tr("name")}
            value={name}
            onChangeText={setName}
            maxLength={80}
            error={
              fieldError("name") ?? (missing && !name.trim() ? t("validation.required") : null)
            }
            testID="role-name"
          />
          <Check
            label={t("common.active")}
            value={isActive}
            onChange={setIsActive}
            testID="role-active"
          />
          <Text variant="bodyStrong">{tr("permissions")}</Text>
          {GROUPS.map((group) => {
            const grantable = group.permissions.filter(mayGrant);
            const allOn = grantable.length > 0 && grantable.every((p) => held.includes(p));
            return (
              <View
                key={group.module}
                style={[styles.group, { borderColor: colors.border }]}
                testID={`role-module-${group.module}`}
              >
                <Check
                  label={t(`permissions.modules.${group.module}`)}
                  value={allOn}
                  onChange={(on) => set(grantable, on)}
                  disabled={grantable.length === 0}
                  testID={`role-all-${group.module}`}
                />
                <View style={styles.permissions}>
                  {group.permissions.map((permission) => (
                    <View key={permission} style={wide ? styles.half : styles.full}>
                      <Check
                        label={t(`permissions.names.${permission}`)}
                        value={held.includes(permission)}
                        onChange={(on) => set([permission], on)}
                        disabled={!mayGrant(permission)}
                        testID={`role-permission-${permission}`}
                      />
                    </View>
                  ))}
                </View>
              </View>
            );
          })}
        </View>
      </Sheet>
      <Confirm
        open={open && deleting}
        onClose={() => setDeleting(false)}
        title={tr("deleteTitle")}
        text={tr("deleteText", { name: shownName })}
        label={t("common.delete")}
        destructive
        loading={remove.isPending}
        problem={remove.error ? errorText(t, remove.error) : null}
        onConfirm={() => {
          if (!role) return;
          remove.mutate(
            { id: role.id, input: null },
            {
              onSuccess: () => {
                setDeleting(false);
                onClose();
              },
            },
          );
        }}
        testID="role-delete-confirm"
      />
    </>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  flush: { padding: 0, gap: 0, overflow: "hidden" },
  name: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: space[2] },
  // The CEO's line: the look of a line that opens, without the press.
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    paddingHorizontal: space[4],
    paddingVertical: space[3],
    minHeight: 48,
  },
  form: { gap: space[4] },
  footer: { gap: space[2] },
  group: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: space[3],
    gap: space[2],
  },
  permissions: { flexDirection: "row", flexWrap: "wrap", paddingLeft: space[6] },
  full: { width: "100%" },
  half: { width: "50%" },
});
