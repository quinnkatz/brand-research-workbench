import { sqliteTable, text, index, integer, uniqueIndex } from "drizzle-orm/sqlite-core";
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

// A study is the tenant boundary. Evidence continues to belong to its original owner.
export const studyMembers = sqliteTable("study_members", {
  id: text("id").primaryKey(), studyId: text("study_id").notNull().references(() => studies.id),
  userId: text("user_id").notNull(), email: text("email").notNull(), role: text("role").notNull(),
  createdAt: text("created_at").notNull(),
}, t => [uniqueIndex("members_study_user").on(t.studyId, t.userId), index("members_user").on(t.userId)]);
export const studyInvites = sqliteTable("study_invites", {
  id: text("id").primaryKey(), studyId: text("study_id").notNull().references(() => studies.id),
  email: text("email").notNull(), role: text("role").notNull(), tokenHash: text("token_hash").notNull().unique(),
  createdAt: text("created_at").notNull(), expiresAt: text("expires_at").notNull(), acceptedAt: text("accepted_at"), revokedAt: text("revoked_at"),
}, t => [index("invites_study").on(t.studyId)]);
export const connections = sqliteTable("connections", {
  id: text("id").primaryKey(), ownerId: text("owner_id").notNull(), provider: text("provider").notNull(),
  label: text("label").notNull(), model: text("model").notNull(), ciphertext: text("ciphertext").notNull(), iv: text("iv").notNull(),
  metadata: text("metadata").notNull().default("{}"), createdAt: text("created_at").notNull(), updatedAt: text("updated_at").notNull(),
}, t => [index("connections_owner").on(t.ownerId)]);
export const studyConnections = sqliteTable("study_connections", {
  id: text("id").primaryKey(), studyId: text("study_id").notNull().references(() => studies.id),
  connectionId: text("connection_id").notNull().references(() => connections.id),
  requestLimit: integer("request_limit").notNull().default(100), usedRequests: integer("used_requests").notNull().default(0),
  createdAt: text("created_at").notNull(),
}, t => [uniqueIndex("study_connection_grant").on(t.studyId, t.connectionId)]);
export const executionTickets = sqliteTable("execution_tickets", {
  id: text("id").primaryKey(), jobId: text("job_id").notNull(), ownerId: text("owner_id").notNull(),
  connectionId: text("connection_id").notNull(), tokenHash: text("token_hash").notNull(), messageId: text("message_id"),
  status: text("status").notNull(), error: text("error"), createdAt: text("created_at").notNull(), expiresAt: text("expires_at").notNull(),
}, t => [uniqueIndex("tickets_job").on(t.jobId), index("tickets_owner").on(t.ownerId)]);
export const monitors = sqliteTable("monitors", {
  id: text("id").primaryKey(), ownerId: text("owner_id").notNull(), studyId: text("study_id").notNull().references(() => studies.id),
  name: text("name").notNull(), config: text("config").notNull(), status: text("status").notNull(),
  tokenHash: text("token_hash").notNull(), scheduleId: text("schedule_id"), lastTick: text("last_tick"),
  createdAt: text("created_at").notNull(), updatedAt: text("updated_at").notNull(),
}, t => [index("monitors_study").on(t.ownerId, t.studyId)]);
export const monitorTicks = sqliteTable("monitor_ticks", {
  id: text("id").primaryKey(), monitorId: text("monitor_id").notNull().references(() => monitors.id),
  batchId: text("batch_id").notNull(), createdAt: text("created_at").notNull(),
});
export const activity = sqliteTable("activity", {
  id: text("id").primaryKey(), studyId: text("study_id").notNull().references(() => studies.id),
  actorId: text("actor_id").notNull(), event: text("event").notNull(), targetId: text("target_id"),
  detail: text("detail").notNull().default("{}"), createdAt: text("created_at").notNull(),
}, t => [index("activity_study").on(t.studyId, t.createdAt)]);
export const drafts = sqliteTable("drafts", {
  id: text("id").primaryKey(), studyId: text("study_id").notNull().references(() => studies.id), userId: text("user_id").notNull(),
  name: text("name").notNull(), payload: text("payload").notNull(), version: integer("version").notNull().default(1), updatedAt: text("updated_at").notNull(),
}, t => [uniqueIndex("draft_scope").on(t.studyId, t.userId, t.name)]);
export const requestReservations = sqliteTable("request_reservations", {
  id: text("id").primaryKey(), grantId: text("grant_id").notNull(), createdAt: text("created_at").notNull(),
}, t => [index("reservations_grant").on(t.grantId)]);

export const notificationOutbox = sqliteTable("notification_outbox", {
  id:text("id").primaryKey(), ownerId:text("owner_id").notNull(), studyId:text("study_id").notNull().references(()=>studies.id),
  monitorId:text("monitor_id").notNull(), connectionId:text("connection_id").notNull(), kind:text("kind").notNull(), targetId:text("target_id").notNull(),
  payload:text("payload").notNull(), status:text("status").notNull().default("queued"), response:text("response"), error:text("error"),
  firstAttempt:text("first_attempt"), lastAttempt:text("last_attempt"), createdAt:text("created_at").notNull(),
},t=>[index("notifications_study_status").on(t.ownerId,t.studyId,t.status)]);
