import { useRouter } from "expo-router";
import { Award, Ban, ClipboardCheck, ExternalLink, UserRound } from "lucide-react-native";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import {
  CEFR_LEVELS,
  useGraduatesReport,
  useIssueCertificate,
  useRevokeCertificate,
  useSaveGraduateResult,
  type CefrLevel,
  type GraduateRow,
} from "@/api/office-graduates";
import { reportQuery, type YesNo } from "@/api/office-reports";
import { Button } from "@/components/button";
import { Check } from "@/components/check";
import { Confirm } from "@/components/confirm";
import { DateField } from "@/components/date-field";
import { Field } from "@/components/field";
import { Header } from "@/components/header";
import { ActionRow } from "@/components/rows";
import { Select } from "@/components/select";
import { Sheet } from "@/components/sheet";
import { Badge, Card, Divider, EmptyState, Notice, Screen } from "@/components/surface";
import { Text } from "@/components/text";
import { useOpenSite } from "@/features/office/site-paths";
import { PendingScreen } from "@/features/shared/pending-screen";
import { centreToday, dayAsDate } from "@/lib/days";
import { fieldErrorOf, hasFieldErrors } from "@/lib/form";
import { errorText, useDate, useTranslations } from "@/lib/i18n";
import { can, useMe } from "@/lib/session";
import { space } from "@/lib/theme";

import {
  ExcelOnSite,
  Filters,
  Kpis,
  OptionFilter,
  PeriodFilters,
  Rows,
  useReportPeriod,
} from "./parts";

/** An IELTS band as it is typed: "6.5", "6,5", "7". Null when it is not 0 to 9 in halves. */
export function typedBand(text: string): number | null {
  const bare = text.trim().replace(",", ".");
  if (!/^\d(\.[05])?$/.test(bare)) return null;
  const value = Number(bare);
  return value <= 9 ? value : null;
}

/**
 * Reports, Graduates (A-239): who finished a group in a month. The key
 * figures, the site's filters, a card per graduate with what came of the
 * studies, and for someone who may change students: Record result, Issue
 * certificate and Revoke.
 */
export function GraduatesReportScreen() {
  const t = useTranslations();
  const tg = useTranslations("reports.graduates");
  const tf = useTranslations("reports.filters");
  const me = useMe();
  const router = useRouter();
  const site = useOpenSite();
  const state = useReportPeriod();
  const [groupId, setGroup] = useState<string | null>(null);
  const [teacherId, setTeacher] = useState<string | null>(null);
  const [courseId, setCourse] = useState<string | null>(null);
  const [result, setResult] = useState<YesNo | null>(null);
  const [picked, setPicked] = useState<GraduateRow | null>(null);
  const [doing, setDoing] = useState<"menu" | "result" | "certificate" | "revoke" | null>(null);
  const filters = { ...state.period, groupId, teacherId, courseId, result };
  const query = useGraduatesReport(filters);
  const revoke = useRevokeCertificate();
  const mayRecord = can(me, "students.update");
  const mayOpen = can(me, "students.view");

  const header = <Header back title={tg("title")} />;
  if (!query.data) return <PendingScreen header={header} query={query} />;
  const report = query.data;
  const k = report.kpis;
  const percent = (value: number | null) => (value === null ? "—" : `${value}%`);
  const live = picked?.certificate && !picked.certificate.revokedAt ? picked.certificate : null;

  return (
    <Screen header={header} onRefresh={() => void query.refetch()} refreshing={query.isRefetching}>
      <Filters testID="report-filters">
        <PeriodFilters
          state={state}
          onChange={() => {
            // Groups, teachers and courses belong to a branch.
            setGroup(null);
            setTeacher(null);
            setCourse(null);
          }}
        />
        <OptionFilter
          label={tf("group")}
          value={groupId}
          onChange={setGroup}
          options={report.options.groups.map((g) => ({ value: g.id, label: g.name }))}
          testID="graduates-group"
        />
        <OptionFilter
          label={tf("teacher")}
          value={teacherId}
          onChange={setTeacher}
          options={report.options.teachers.map((x) => ({ value: x.id, label: x.fullName }))}
          testID="graduates-teacher"
        />
        <OptionFilter
          label={tf("course")}
          value={courseId}
          onChange={setCourse}
          options={report.options.courses.map((c) => ({ value: c.id, label: c.name }))}
          testID="graduates-course"
        />
        <OptionFilter<YesNo>
          label={tg("columns.results")}
          value={result}
          onChange={setResult}
          options={[
            { value: "yes", label: tg("withResult") },
            { value: "no", label: tg("noResult") },
          ]}
          testID="graduates-result"
        />
      </Filters>
      <Kpis
        columns={3}
        items={[
          { key: "count", label: tg("kpis.count"), value: String(k.count) },
          {
            key: "bestTeacher",
            label: tg("kpis.bestTeacher"),
            value: k.bestTeacher?.name ?? "—",
            hint: k.bestTeacher ? tg("kpis.graduates", { count: k.bestTeacher.count }) : null,
          },
          {
            key: "avgIelts",
            label: tg("kpis.avgIelts"),
            value: k.avgIelts === null ? "—" : String(k.avgIelts),
          },
          { key: "commonCefr", label: tg("kpis.commonCefr"), value: k.commonCefr ?? "—" },
          { key: "university", label: tg("kpis.university"), value: percent(k.universityPercent) },
          { key: "employed", label: tg("kpis.employed"), value: percent(k.employedPercent) },
        ]}
      />
      {site.error ? <Notice tone="destructive">{site.error}</Notice> : null}
      {report.rows.length === 0 ? (
        <EmptyState title={tg("empty")} text={tg("emptyHint")} />
      ) : (
        <Rows testID="graduates-list">
          {report.rows.map((row) => (
            <GraduateCard
              key={row.membershipId}
              row={row}
              onPress={
                mayRecord || mayOpen || (row.certificate && !row.certificate.revokedAt)
                  ? () => {
                      setPicked(row);
                      setDoing("menu");
                    }
                  : undefined
              }
            />
          ))}
        </Rows>
      )}
      <ExcelOnSite path={`/reports/graduates${reportQuery({ ...filters })}`} />

      <Sheet
        open={doing === "menu"}
        onClose={() => setDoing(null)}
        title={picked?.fullName ?? ""}
        testID="graduate-menu"
      >
        <View>
          {mayRecord ? (
            <>
              <ActionRow
                icon={ClipboardCheck}
                label={tg("record.button")}
                onPress={() => setDoing("result")}
                testID="graduate-do-result"
              />
              <Divider />
              {live ? (
                <ActionRow
                  icon={Ban}
                  destructive
                  label={`${tg("certificate.revoke")}: ${tg("certificate.number", { number: live.number })}`}
                  onPress={() => {
                    revoke.reset();
                    setDoing("revoke");
                  }}
                  testID="graduate-do-revoke"
                />
              ) : (
                <ActionRow
                  icon={Award}
                  label={tg("certificate.issue")}
                  onPress={() => setDoing("certificate")}
                  testID="graduate-do-certificate"
                />
              )}
            </>
          ) : null}
          {live ? (
            <>
              {mayRecord ? <Divider /> : null}
              <ActionRow
                icon={ExternalLink}
                label={t("mobile.reports.certificateOnSite", { number: live.number })}
                onPress={() => {
                  setDoing(null);
                  site.open(`/certificates/${live.id}`);
                }}
                testID="graduate-do-open-certificate"
              />
            </>
          ) : null}
          {mayOpen && picked ? (
            <>
              {mayRecord || live ? <Divider /> : null}
              <ActionRow
                icon={UserRound}
                label={t("mobile.groups.openStudent")}
                onPress={() => {
                  setDoing(null);
                  router.push({
                    pathname: "/staff/student/[id]",
                    params: { id: picked.studentId },
                  });
                }}
                testID="graduate-do-student"
              />
            </>
          ) : null}
        </View>
      </Sheet>
      <ResultSheet open={doing === "result"} onClose={() => setDoing(null)} row={picked} />
      <CertificateSheet
        open={doing === "certificate"}
        onClose={() => setDoing(null)}
        row={picked}
      />
      <Confirm
        open={doing === "revoke"}
        onClose={() => setDoing(null)}
        title={tg("certificate.revokeTitle")}
        text={tg("certificate.revokeText", {
          name: picked?.fullName ?? "",
          number: live?.number ?? "",
        })}
        label={tg("certificate.revoke")}
        destructive
        loading={revoke.isPending}
        problem={revoke.error ? errorText(t, revoke.error) : null}
        onConfirm={() => {
          if (live) revoke.mutate(live.id, { onSuccess: () => setDoing(null) });
        }}
        testID="graduate-revoke"
      />
    </Screen>
  );
}

function GraduateCard({ row, onPress }: { row: GraduateRow; onPress?: () => void }) {
  const tg = useTranslations("reports.graduates");
  const date = useDate();
  const r = row.result;
  const live = row.certificate && !row.certificate.revokedAt ? row.certificate : null;
  return (
    <Card onPress={onPress} style={styles.card} testID={`graduate-${row.membershipId}`}>
      <View style={styles.between}>
        <Text variant="bodyStrong" numberOfLines={2} style={styles.fill}>
          {row.fullName}
        </Text>
        <Text variant="small" tone="mutedForeground">
          {date(dayAsDate(row.graduatedAt), { dateStyle: "medium" })}
        </Text>
      </View>
      <Text variant="small" tone="mutedForeground">
        {[row.groupName, row.branchName, row.teacherName].filter(Boolean).join(", ")}
      </Text>
      <View style={styles.badges} testID={`graduate-${row.membershipId}-results`}>
        {row.examResult ? <Badge label={tg("exam", { score: row.examResult })} /> : null}
        {r && r.ieltsScore !== null ? (
          <Badge tone="accent" label={`IELTS ${r.ieltsScore}`} />
        ) : null}
        {r?.cefrLevel ? <Badge label={r.cefrLevel} /> : null}
        {r?.university ? <Badge tone="success" label={tg("record.university")} /> : null}
        {r?.employed ? <Badge tone="success" label={tg("record.employed")} /> : null}
        {!r && !row.examResult ? <Badge tone="warning" label={tg("noResult")} /> : null}
      </View>
      {live ? (
        <Text variant="small" tone="mutedForeground" testID={`graduate-${row.membershipId}-paper`}>
          {tg("certificate.number", { number: live.number })}
        </Text>
      ) : null}
      {r?.note ? <Text>{r.note}</Text> : null}
    </Card>
  );
}

/** "Record result": the IELTS band, the CEFR level, university, work and a note. */
function ResultSheet({
  open,
  onClose,
  row,
}: {
  open: boolean;
  onClose: () => void;
  row: GraduateRow | null;
}) {
  const t = useTranslations();
  const tr = useTranslations("reports.graduates.record");
  const save = useSaveGraduateResult(row?.membershipId ?? null);
  const [ielts, setIelts] = useState("");
  const [cefr, setCefr] = useState<CefrLevel | null>(null);
  const [university, setUniversity] = useState(false);
  const [employed, setEmployed] = useState(false);
  const [note, setNote] = useState("");
  const [tried, setTried] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      const r = row?.result;
      setIelts(r && r.ieltsScore !== null ? String(r.ieltsScore) : "");
      setCefr(
        r?.cefrLevel && (CEFR_LEVELS as readonly string[]).includes(r.cefrLevel)
          ? (r.cefrLevel as CefrLevel)
          : null,
      );
      setUniversity(r?.university ?? false);
      setEmployed(r?.employed ?? false);
      setNote(r?.note ?? "");
      setTried(false);
      save.reset();
    }
  }
  const band = typedBand(ielts);
  const badBand = ielts.trim() !== "" && band === null;
  const fieldError = fieldErrorOf(t, save.error);
  const submit = () => {
    if (badBand) {
      setTried(true);
      return;
    }
    save.mutate(
      { ieltsScore: band, cefrLevel: cefr, university, employed, note: note.trim() || null },
      { onSuccess: onClose },
    );
  };
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={tr("title", { name: row?.fullName ?? "" })}
      testID="graduate-result"
      footer={
        <Button
          label={t("common.save")}
          loading={save.isPending}
          onPress={submit}
          testID="graduate-result-save"
        />
      }
    >
      <View style={styles.form}>
        {save.error && !hasFieldErrors(save.error) ? (
          <Notice tone="destructive" testID="graduate-result-problem">
            {errorText(t, save.error)}
          </Notice>
        ) : null}
        <Field
          label={tr("ielts")}
          value={ielts}
          onChangeText={setIelts}
          keyboardType="decimal-pad"
          placeholder="6.5"
          maxLength={3}
          error={fieldError("ieltsScore") ?? (tried && badBand ? t("mobile.reports.band") : null)}
          testID="graduate-result-ielts"
        />
        <Select
          label={tr("cefr")}
          value={cefr}
          onChange={setCefr}
          clearLabel="—"
          placeholder="—"
          options={CEFR_LEVELS.map((level) => ({ value: level, label: level }))}
          error={fieldError("cefrLevel")}
          testID="graduate-result-cefr"
        />
        <Check
          label={tr("university")}
          value={university}
          onChange={setUniversity}
          testID="graduate-result-university"
        />
        <Check
          label={tr("employed")}
          value={employed}
          onChange={setEmployed}
          testID="graduate-result-employed"
        />
        <Field
          label={tr("note")}
          value={note}
          onChangeText={setNote}
          multiline
          maxLength={500}
          error={fieldError("note")}
          testID="graduate-result-note"
        />
      </View>
    </Sheet>
  );
}

/** "Issue certificate": the title (the course at first), the level and the day. */
function CertificateSheet({
  open,
  onClose,
  row,
}: {
  open: boolean;
  onClose: () => void;
  row: GraduateRow | null;
}) {
  const t = useTranslations();
  const tc = useTranslations("reports.graduates.certificate");
  const issue = useIssueCertificate(row?.membershipId ?? null);
  const [title, setTitle] = useState("");
  const [level, setLevel] = useState("");
  const [day, setDay] = useState<string | null>(centreToday);
  const [tried, setTried] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setTitle(row?.courseName ?? "");
      setLevel(row?.result?.cefrLevel ?? "");
      setDay(centreToday());
      setTried(false);
      issue.reset();
    }
  }
  const fieldError = fieldErrorOf(t, issue.error);
  const submit = () => {
    if (!title.trim() || !day) {
      setTried(true);
      return;
    }
    issue.mutate(
      { title: title.trim(), level: level.trim() || null, issuedAt: day },
      { onSuccess: onClose },
    );
  };
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={tc("title", { name: row?.fullName ?? "" })}
      testID="graduate-certificate"
      footer={
        <Button
          label={tc("issue")}
          loading={issue.isPending}
          onPress={submit}
          testID="graduate-certificate-save"
        />
      }
    >
      <View style={styles.form}>
        <Text variant="small" tone="mutedForeground">
          {tc("hint")}
        </Text>
        {issue.error && !hasFieldErrors(issue.error) ? (
          <Notice tone="destructive" testID="graduate-certificate-problem">
            {errorText(t, issue.error)}
          </Notice>
        ) : null}
        <Field
          label={tc("titleField")}
          value={title}
          onChangeText={setTitle}
          maxLength={120}
          error={fieldError("title") ?? (tried && !title.trim() ? t("validation.required") : null)}
          testID="graduate-certificate-title"
        />
        <Field
          label={tc("level")}
          value={level}
          onChangeText={setLevel}
          maxLength={40}
          error={fieldError("level")}
          testID="graduate-certificate-level"
        />
        <DateField
          label={tc("issuedAt")}
          value={day}
          onChange={setDay}
          error={fieldError("issuedAt") ?? (tried && !day ? t("validation.required") : null)}
          testID="graduate-certificate-date"
        />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  between: { flexDirection: "row", alignItems: "flex-start", gap: space[2] },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: space[2] },
  card: { flex: 1, gap: space[1] },
  form: { gap: space[3] },
});
