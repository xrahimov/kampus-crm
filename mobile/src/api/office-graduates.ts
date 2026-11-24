import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";

import { reportQuery, type ReportPeriod, type YesNo } from "./office-reports";

/*
 * Reports, Graduates (A-239): who finished a group in a month, what came of
 * it (IELTS, CEFR, university, work) and the certificates. The calls the
 * site's page makes.
 */

export const CEFR_LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;
export type CefrLevel = (typeof CEFR_LEVELS)[number];

export interface GraduateResult {
  ieltsScore: number | null;
  cefrLevel: string | null;
  university: boolean | null;
  employed: boolean | null;
  note: string | null;
}

export interface GraduateRow {
  membershipId: string;
  studentId: string;
  fullName: string;
  groupName: string;
  branchName: string;
  courseName: string;
  teacherName: string | null;
  /** The day the student finished, as an ISO day. */
  graduatedAt: string;
  /** The last exam of the group as "score/max". */
  examResult: string | null;
  result: GraduateResult | null;
  certificate: { id: string; number: string; code: string; revokedAt: string | null } | null;
}

export interface GraduatesReport {
  year: number;
  month: number;
  kpis: {
    count: number;
    bestTeacher: { name: string; count: number } | null;
    avgIelts: number | null;
    commonCefr: string | null;
    universityPercent: number | null;
    employedPercent: number | null;
  };
  rows: GraduateRow[];
  options: {
    groups: Array<{ id: string; name: string }>;
    teachers: Array<{ id: string; fullName: string }>;
    courses: Array<{ id: string; name: string }>;
  };
}

export interface GraduatesFilters extends ReportPeriod {
  groupId: string | null;
  teacherId: string | null;
  courseId: string | null;
  /** With a recorded result, without one, or everyone. */
  result: YesNo | null;
}

export interface GraduateResultInput {
  ieltsScore: number | null;
  cefrLevel: CefrLevel | null;
  university: boolean;
  employed: boolean;
  note: string | null;
}

export interface CertificateInput {
  title: string;
  level: string | null;
  issuedAt: string;
}

const KEY = ["reports", "graduates"] as const;

export function useGraduatesReport(filters: GraduatesFilters) {
  return useQuery({
    queryKey: [...KEY, filters] as const,
    queryFn: ({ signal }) =>
      api<GraduatesReport>(`/reports/graduates${reportQuery({ ...filters })}`, { signal }),
    placeholderData: (previous) => previous,
  });
}

/** "Record result": what came of a graduate's studies. */
export function useSaveGraduateResult(membershipId: string | null) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: GraduateResultInput) =>
      api<GraduateResult>(`/memberships/${membershipId}/graduate`, { method: "PUT", body: input }),
    onSuccess: () => client.invalidateQueries({ queryKey: KEY }),
  });
}

/** Issues the certificate of a graduate. */
export function useIssueCertificate(membershipId: string | null) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: CertificateInput) =>
      api<unknown>(`/memberships/${membershipId}/certificate`, { method: "POST", body: input }),
    onSuccess: () => client.invalidateQueries({ queryKey: KEY }),
  });
}

/** Marks a certificate as withdrawn: its public page then says so. */
export function useRevokeCertificate() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (certificateId: string) =>
      api<unknown>(`/certificates/${certificateId}/revoke`, { method: "POST" }),
    onSuccess: () => client.invalidateQueries({ queryKey: KEY }),
  });
}
