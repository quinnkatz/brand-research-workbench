import { sqliteTable, text, index } from "drizzle-orm/sqlite-core";
export const studies = sqliteTable("studies", {
  id: text("id").primaryKey(), ownerId: text("owner_id").notNull(),
  name: text("name").notNull(), brand: text("brand").notNull(),
  website: text("website").notNull().default(""), objective: text("objective").notNull().default(""),
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
