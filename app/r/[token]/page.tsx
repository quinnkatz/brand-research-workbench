import { reportFromToken } from "@/lib/research-server";
import { ReportReader } from "@/components/research/report-reader";
export const dynamic = "force-dynamic";
export const metadata = { title: "Brand research · Client review", robots: { index: false, follow: false }, referrer: "no-referrer" };
export default async function SharedReport({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  try {
    const { row, snapshot } = await reportFromToken(token);
    return <ReportReader token={token} title={row.title} createdAt={row.created_at} expiresAt={row.expires_at} html={snapshot.html} findings={snapshot.records.filter((r: any) => r.kind === "review").map((r: any) => ({ id: r.id, claim: r.payload.claim }))}/>;
  } catch { return <main className="mx-auto max-w-xl p-10"><h1 className="text-2xl font-semibold">This report is unavailable</h1><p className="mt-4 text-muted-foreground">The link may have expired, been withdrawn, or could not be loaded. Ask the researcher for a current link.</p></main>; }
}
