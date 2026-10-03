import { Avatar } from "@/components/ui/avatar";
import type { StudentRowDto } from "@/server/services/students/students.service";

/** EXP §6 "BEYJIK": a printable card with the student's name, groups and QR (A-24). */
export function BadgeCard({
  student,
  organizationName,
  qr,
  labels,
}: {
  student: StudentRowDto;
  organizationName: string;
  qr: string;
  labels: { phone: string; groups: string };
}) {
  const groups = student.groups.filter((g) => g.status !== "ARCHIVED" && g.status !== "GRADUATED");
  return (
    <article
      className="flex w-[86mm] break-inside-avoid flex-col items-center gap-2 rounded-lg border bg-white p-4 text-center text-black"
      data-testid="badge"
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-neutral-600">
        {organizationName}
      </p>
      <Avatar src={student.photoUrl} name={student.fullName} className="size-20 text-2xl" />
      <h2 className="text-base font-bold">{student.fullName}</h2>
      {student.phone && (
        <p className="text-xs text-neutral-600">
          {labels.phone}: {student.phone}
        </p>
      )}
      {groups.length > 0 && (
        <p className="text-xs">
          <span className="text-neutral-600">{labels.groups}:</span>{" "}
          {groups.map((g) => g.groupName).join(", ")}
        </p>
      )}
      <div className="size-20 [&_svg]:size-full" dangerouslySetInnerHTML={{ __html: qr }} />
    </article>
  );
}
