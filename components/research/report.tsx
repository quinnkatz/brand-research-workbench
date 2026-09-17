"use client";
import { useMemo } from "react";
import { Download, FileCheck2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buildClientReport, reportStats } from "@/lib/report";
import type { ResearchRecord, Run, Study } from "@/lib/research";
import { Note } from "./ui";

export function ReportPage({ study, runs, records, demo }: { study?: Study; runs: Run[]; records: ResearchRecord[]; demo: boolean }) {
  const html = useMemo(() => study ? buildClientReport(study, runs, records, demo) : "", [study, runs, records, demo]);
  if (!study) return <div className="rounded-xl border bg-white p-10 text-center"><FileCheck2 className="mx-auto mb-4 text-slate-400"/><p>Create a study to prepare a client report.</p></div>;
  const stats = reportStats(runs, records);
  function downloadReport() {
    const url = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = `${study!.brand.replace(/[^a-z0-9]+/gi, "-").slice(0, 80)}-brand-investigation.html`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <div className="space-y-5"><div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border bg-white p-5"><div><h2 className="font-semibold">Client evidence report</h2><p className="mt-1 text-sm text-muted-foreground">{stats.reviews} assessments · {stats.actions} recommended actions · {stats.reviewed} of {stats.responses} responses reviewed</p></div><Button onClick={downloadReport} disabled={!runs.length}><Download size={16}/>Download report</Button></div><Note>The report includes the study’s answers, review explanations, hypotheses, source excerpts, and collection conditions. Inspect it below before sending. It opens as a standalone webpage; original files and attachments are supplied separately.</Note>{(!stats.reviews || stats.withoutReference > 0) && <Note warning>{!stats.reviews ? "No claims have been reviewed yet. The report is an evidence inventory until you add assessments and useful actions." : `${stats.withoutReference} review(s) have no linked reference excerpt. Their evidence limitations remain visible in the report.`}</Note>}<iframe title="Client evidence report preview" className="h-[1100px] w-full rounded-xl border bg-white" sandbox="allow-popups allow-popups-to-escape-sandbox" referrerPolicy="no-referrer" srcDoc={html}/></div>;
}
