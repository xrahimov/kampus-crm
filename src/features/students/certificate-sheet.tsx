import type { CertificateDto } from "@/server/services/students/certificates.service";

/**
 * The printed certificate (round 2 G2, A-140): one landscape A4 sheet with the
 * centre's logo, the graduate's name, the course and level, the dates, the
 * number and a QR code to the public check. Server-rendered; dates and labels
 * arrive already formatted so the sheet itself needs no client code.
 */
export function CertificateSheet({
  certificate,
  qr,
  dates,
  labels,
}: {
  certificate: CertificateDto;
  qr: string;
  dates: { issuedAt: string; from: string; to: string | null };
  labels: {
    heading: string;
    confirms: string;
    completed: string;
    level: string;
    period: string;
    issuedOn: string;
    number: string;
    teacher: string;
    director: string;
    verify: string;
    revoked: string;
  };
}) {
  const c = certificate;
  return (
    <article
      className="certificate relative mx-auto flex aspect-[297/210] w-full max-w-[297mm] flex-col justify-between overflow-hidden rounded-xl border-[6px] border-double border-[#1e3a8a] bg-white p-[8mm] text-black shadow-sm print:rounded-none print:shadow-none"
      data-testid="certificate-sheet"
    >
      <header className="flex items-start justify-between gap-6">
        <div className="flex items-center gap-4">
          {c.organization.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={c.organization.logoUrl} alt="" className="max-h-16 max-w-32" />
          ) : null}
          <div>
            <p className="text-lg font-semibold tracking-wide text-[#1e3a8a]">
              {c.organization.name}
            </p>
            <p className="text-xs text-neutral-500">{c.branch}</p>
          </div>
        </div>
        <p className="text-right text-xs text-neutral-500">
          {labels.number}: <span className="font-mono font-medium text-black">{c.number}</span>
        </p>
      </header>

      <div className="flex-1 space-y-3 py-4 text-center">
        <h1 className="text-4xl font-bold uppercase tracking-[0.3em] text-[#1e3a8a]">
          {labels.heading}
        </h1>
        <p className="text-sm text-neutral-600">{labels.confirms}</p>
        <p className="text-3xl font-semibold" data-testid="certificate-student">
          {c.student.fullName}
        </p>
        <p className="text-sm text-neutral-600">{labels.completed}</p>
        <p className="text-2xl font-medium" data-testid="certificate-title">
          {c.title}
        </p>
        {c.level && (
          <p className="text-base">
            {labels.level}: <span className="font-semibold">{c.level}</span>
          </p>
        )}
        <p className="text-sm text-neutral-600">
          {labels.period}: {dates.from}
          {dates.to ? ` – ${dates.to}` : ""}
          {c.group ? ` · ${c.group}` : ""}
        </p>
        {c.revokedAt && (
          <p className="text-sm font-semibold uppercase text-red-700">{labels.revoked}</p>
        )}
      </div>

      <footer className="flex items-end justify-between gap-6 text-xs text-neutral-600">
        <div className="space-y-6">
          <p>
            {labels.issuedOn}: <span className="font-medium text-black">{dates.issuedAt}</span>
          </p>
          <div className="flex gap-10">
            <div className="min-w-40 border-t border-neutral-400 pt-1">
              {labels.teacher}
              {c.teacher ? `: ${c.teacher}` : ""}
            </div>
            <div className="min-w-40 border-t border-neutral-400 pt-1">{labels.director}</div>
          </div>
        </div>
        <div className="flex flex-col items-center gap-1">
          <div className="size-20 [&_svg]:size-full" dangerouslySetInnerHTML={{ __html: qr }} />
          <p className="max-w-48 text-center text-[10px] leading-tight">{labels.verify}</p>
          <p className="font-mono text-[10px] break-all">{c.url}</p>
        </div>
      </footer>
    </article>
  );
}
