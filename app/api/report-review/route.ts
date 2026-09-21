import { z } from "zod";
import { AppError, db, failure, idSchema, jsonBody, reply } from "@/lib/server";
import { reportFromToken } from "@/lib/research-server";
export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  try {
    if (req.headers.get("origin") !== new URL(req.url).origin || req.headers.get("sec-fetch-site") === "cross-site") throw new AppError("Open the report to submit a review.", 403);
    const v = z.object({ token: z.string().regex(/^[a-f0-9]{64}$/), author: z.string().trim().min(1).max(120), message: z.string().trim().min(5).max(5000), reviewId: idSchema.nullable() }).parse(await jsonBody(req));
    const { row, snapshot } = await reportFromToken(v.token);
    if (v.reviewId && !snapshot.records.some((r: any) => r.id === v.reviewId && r.kind === "review")) throw new AppError("Choose a finding from this report.");
    const recent = await db().prepare("SELECT count(*) AS n FROM report_comments WHERE report_id = ? AND created_at > ?").bind(row.id, new Date(Date.now() - 60000).toISOString()).first<any>();
    if (Number(recent?.n) >= 5) throw new AppError("Several comments were just received. Wait a minute before adding another.", 429);
    const total = await db().prepare("SELECT count(*) AS n FROM report_comments WHERE report_id = ?").bind(row.id).first<any>();
    if (Number(total?.n) >= 200) throw new AppError("This report has reached its review limit. Ask the researcher for a new report.", 429);
    await db().prepare("INSERT INTO report_comments (id, report_id, author, review_id, message, created_at) VALUES (?, ?, ?, ?, ?, ?)").bind(crypto.randomUUID(), row.id, v.author, v.reviewId, v.message, new Date().toISOString()).run();
    return reply({ saved: true }, 201);
  } catch (e) { return failure(e); }
}
