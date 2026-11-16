import { can } from "@/lib/auth/permissions";
import { getCurrentActor } from "@/lib/auth/session";
import { isDomainError } from "@/lib/errors";
import { buildReport, isReportKind, parsePeriodEnd, reportFileName, toCsv } from "@/lib/services/reports";

export const dynamic = "force-dynamic";

function plain(status: number, message: string): Response {
  return new Response(message, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}

export async function GET(request: Request): Promise<Response> {
  const actor = await getCurrentActor();
  if (!actor) return plain(401, "Sign in to download reports.");
  if (actor.mfa === "missing") return plain(403, "Set up two-step sign-in before downloading reports.");
  if (!can(actor, "report.generate")) return plain(403, "You do not have permission to download reports.");

  const url = new URL(request.url);
  const kind = url.searchParams.get("kind") ?? "";
  if (!isReportKind(kind)) return plain(400, "Choose a report type.");

  try {
    const report = await buildReport(actor, { kind, periodEnd: parsePeriodEnd(url.searchParams.get("periodEnd")) });
    return new Response(toCsv(report), {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${reportFileName(report)}"`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (isDomainError(error)) return plain(error.code === "NOT_FOUND" ? 404 : 400, error.message);
    throw error;
  }
}
