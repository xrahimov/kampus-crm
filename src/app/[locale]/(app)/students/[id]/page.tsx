import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";

import { Forbidden } from "@/features/settings/forbidden";
import type { SearchParams } from "@/features/settings/list-params";
import { StudentDetail } from "@/features/students/student-detail";
import { requireCurrentUser } from "@/server/auth/current-user";
import { isAppError } from "@/server/errors/app-error";
import { qrSvg } from "@/server/qr/qr";
import { can } from "@/server/rbac/authorize";
import { getStudentProgress } from "@/server/services/exams/exams.service";
import { listStudentAdjustments } from "@/server/services/students/adjustments.service";
import { listStudentPaymentHistory } from "@/server/services/students/history-import.service";
import { getStudentFamily } from "@/server/services/students/families.service";
import { getPaymentOptions, listPayments } from "@/server/services/students/payments.service";
import {
  getStudent,
  getStudentOptions,
  listStudentComments,
  listStudentHistory,
} from "@/server/services/students/students.service";
import { listStudentCalls } from "@/server/services/calls/calls.service";
import { listStudentSms } from "@/server/services/sms/sms.service";
import { getStudentTestResults } from "@/server/services/tests/tests.service";

type Props = {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<SearchParams>;
};

const str = (v: string | string[] | undefined) => (typeof v === "string" && v ? v : null);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const current = await requireCurrentUser();
  if (!can(current.actor, "students.view")) return {};
  try {
    return { title: (await getStudent(current.actor, id)).fullName };
  } catch {
    return {};
  }
}

export default async function Page({ params, searchParams }: Props) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const current = await requireCurrentUser();
  if (!can(current.actor, "students.view")) return <Forbidden />;

  let student;
  try {
    student = await getStudent(current.actor, id);
  } catch (error) {
    if (isAppError(error) && error.code === "NOT_FOUND") notFound();
    if (isAppError(error) && error.code === "FORBIDDEN") return <Forbidden />;
    throw error;
  }

  const sp = await searchParams;
  const page = Math.max(1, Number(str(sp.page) ?? 1) || 1);
  const pageSize = 20;
  const list = { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
  const paymentGroupId = str(sp.paymentGroup);

  const [
    comments,
    history,
    payments,
    options,
    paymentOptions,
    qr,
    progress,
    testResults,
    sms,
    calls,
    adjustments,
    legacyPayments,
    family,
  ] = await Promise.all([
    listStudentComments(current.actor, id),
    listStudentHistory(current.actor, id, list),
    listPayments(
      current.actor,
      { ...list, sort: { field: "paidAt", direction: "desc" } },
      { studentId: id, ...(paymentGroupId ? { groupId: paymentGroupId } : {}) },
    ),
    getStudentOptions(current.actor),
    getPaymentOptions(current.actor),
    qrSvg(`kampus:student:${id}`),
    getStudentProgress(current.actor, id),
    getStudentTestResults(current.actor, id, {}),
    listStudentSms(current.actor, id),
    listStudentCalls(current.actor, id),
    listStudentAdjustments(current.actor, id),
    listStudentPaymentHistory(current.actor, id),
    getStudentFamily(current.actor, id),
  ]);

  return (
    <StudentDetail
      student={student}
      comments={comments}
      history={history}
      payments={payments}
      adjustments={adjustments}
      legacyPayments={legacyPayments}
      paymentGroupId={paymentGroupId}
      progress={progress}
      testResults={testResults}
      sms={sms}
      calls={calls}
      qrSvg={qr}
      options={options}
      paymentOptions={paymentOptions}
      branches={current.branches}
      family={family}
      can={{
        update: can(current.actor, "students.update"),
        delete: can(current.actor, "students.delete"),
        blacklist: can(current.actor, "students.blacklist"),
        pay: can(current.actor, "payments.create"),
        refund: can(current.actor, "payments.refund"),
        groups: can(current.actor, "groups.update"),
        leads: can(current.actor, "leads.create"),
        sms: can(current.actor, "sms.send"),
        discounts: can(current.actor, "discounts.give"),
      }}
    />
  );
}
