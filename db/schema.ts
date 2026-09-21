import { sqliteTable, text, index } from "drizzle-orm/sqlite-core";
export const studies = sqliteTable("studies", {
  id: text("id").primaryKey(), ownerId: text("owner_id").notNull(),
  name: text("name").notNull(), brand: text("brand").notNull(),
  website: text("website").notNull().default(""), objective: text("objective").notNull().default(""),
  profile: text("profile").notNull().default("{}"),
  createdAt: text("created_at").notNull(),
}, t => [index("studies_owner").on(t.ownerId, t.createdAt)]);
export const records = sqliteTable("records", {
  id: text("id").primaryKey(), ownerId: text("owner_id").notNull(),
  studyId: text("study_id").notNull().references(() => studies.id),
  kind: text("kind").notNull(), payload: text("payload").notNull(),
  createdAt: text("created_at").notNull(), updatedAt: text("updated_at").notNull(),
}, t => [index("records_study_kind").on(t.ownerId, t.studyId, t.kind)]);
export const runs = sqliteTable("runs", {
  id: text("id").primaryKey(), ownerId: text("owner_id").notNull(),
  studyId: text("study_id").notNull().references(() => studies.id),
  provider: text("provider").notNull(), environment: text("environment").notNull(),
  model: text("model").notNull(), prompt: text("prompt").notNull(),
  status: text("status").notNull(), search: text("search").notNull(),
  settings: text("settings").notNull(), normalized: text("normalized"),
  evidenceKey: text("evidence_key"), evidenceHash: text("evidence_hash"),
  error: text("error"), createdAt: text("created_at").notNull(), finishedAt: text("finished_at"),
}, t => [index("runs_study_created").on(t.ownerId, t.studyId, t.createdAt)]);
export const attachments = sqliteTable("attachments", {
  id: text("id").primaryKey(), ownerId: text("owner_id").notNull(),
  runId: text("run_id").notNull().references(() => runs.id),
  name: text("name").notNull(), mime: text("mime").notNull(),
  objectKey: text("object_key").notNull(), sha256: text("sha256").notNull(), createdAt: text("created_at").notNull(),
}, t => [index("attachments_run").on(t.ownerId, t.runId)]);
export const collectionJobs = sqliteTable("collection_jobs", {
  id: text("id").primaryKey(), ownerId: text("owner_id").notNull(), studyId: text("study_id").notNull().references(() => studies.id),
  batchId: text("batch_id").notNull(), batchName: text("batch_name").notNull(), provider: text("provider").notNull(), model: text("model").notNull(),
  prompt: text("prompt").notNull(), questionId: text("question_id"), repeatIndex: text("repeat_index").notNull(),
  status: text("status").notNull().default("queued"), runId: text("run_id"), settings: text("settings").notNull(), error: text("error"),
  createdAt: text("created_at").notNull(), updatedAt: text("updated_at").notNull(),
}, t => [index("jobs_study_status").on(t.ownerId, t.studyId, t.status), index("jobs_batch").on(t.ownerId, t.batchId)]);
export const recordHistory = sqliteTable("record_history", {
  id: text("id").primaryKey(), recordId: text("record_id").notNull(), ownerId: text("owner_id").notNull(),
  studyId: text("study_id").notNull(), kind: text("kind").notNull(), payload: text("payload").notNull(), recordedAt: text("recorded_at").notNull(),
}, t => [index("history_record").on(t.ownerId, t.recordId, t.recordedAt)]);
export const reportSnapshots = sqliteTable("report_snapshots", {
  id: text("id").primaryKey(), ownerId: text("owner_id").notNull(), studyId: text("study_id").notNull().references(() => studies.id),
  title: text("title").notNull(), tokenHash: text("token_hash").notNull().unique(), objectKey: text("object_key").notNull(),
  createdAt: text("created_at").notNull(), expiresAt: text("expires_at").notNull(), revokedAt: text("revoked_at"),
}, t => [index("reports_study").on(t.ownerId, t.studyId, t.createdAt)]);
export const reportComments = sqliteTable("report_comments", {
  id: text("id").primaryKey(), reportId: text("report_id").notNull().references(() => reportSnapshots.id),
  author: text("author").notNull(), reviewId: text("review_id"), message: text("message").notNull(), createdAt: text("created_at").notNull(),
}, t => [index("comments_report").on(t.reportId, t.createdAt)]);
