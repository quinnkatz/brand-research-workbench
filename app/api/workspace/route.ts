import { z } from "zod";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { AppError, audit, db, failure, hash, idSchema, jsonBody, owner, ownStudy, reply } from "@/lib/server";
import { connectionFor, openSecret, seal, vaultReady } from "@/lib/vault";
export const dynamic = "force-dynamic";
const label = z.string().trim().min(1).max(200);
const providers = z.enum(["openai", "anthropic", "gemini", "perplexity_api", "xai", "qstash", "resend"]);
const tokenValue = () => crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", "");

export async function GET(req: Request) {
  try {
    const actor = await owner(req), p = new URL(req.url).searchParams, action = p.get("action");
    if (action === "connections") {
      const own = await db().prepare("SELECT id,provider,label,model,metadata,created_at,updated_at FROM connections WHERE owner_id = ? ORDER BY created_at").bind(actor).all<any>();
      let grants: any[] = [];
      if (p.get("studyId")) {
        const studyId = idSchema.parse(p.get("studyId")); await ownStudy(studyId, actor);
        grants = (await db().prepare("SELECT c.id,c.provider,c.label,c.model,g.request_limit,g.used_requests FROM study_connections g JOIN connections c ON c.id = g.connection_id WHERE g.study_id = ?").bind(studyId).all()).results;
      }
      return reply({ vaultReady: vaultReady(), connections: own.results.map(r => ({ ...r, metadata: JSON.parse(r.metadata) })), grants });
    }
    const studyId = idSchema.parse(p.get("studyId")), study = await ownStudy(studyId, actor);
    if (action === "team") {
      const members = await db().prepare("SELECT id,email,role,created_at FROM study_members WHERE study_id = ? ORDER BY created_at").bind(studyId).all();
      const invites = study.access_role === "owner" ? (await db().prepare("SELECT id,email,role,created_at,expires_at,accepted_at,revoked_at FROM study_invites WHERE study_id = ? ORDER BY created_at DESC LIMIT 100").bind(studyId).all()).results : [];
      return reply({ role: study.access_role, members: members.results, invites });
    }
    if (action === "activity") {
      const rows = await db().prepare("SELECT id,event,target_id,detail,created_at FROM activity WHERE study_id = ? ORDER BY created_at DESC LIMIT 200").bind(studyId).all<any>();
      return reply({ events: rows.results.map(r => ({ ...r, detail: JSON.parse(r.detail) })) });
    }
    if (action === "draft") {
      const name = label.parse(p.get("name"));
      const row = await db().prepare("SELECT id,payload,version,updated_at FROM drafts WHERE study_id = ? AND user_id = ? AND name = ?").bind(studyId, actor, name).first<any>();
      return reply({ draft: row ? { ...row, payload: JSON.parse(row.payload) } : null });
    }
    throw new AppError("Unknown workspace operation.", 404);
  } catch (e) { return failure(e); }
}
export async function POST(req: Request) {
  try {
    const actor = await owner(req, true), body = await jsonBody(req), now = new Date().toISOString();
    if (body.action === "connection") {
      const v = z.object({ id: idSchema.optional(), provider: providers, label, model: z.string().trim().max(200).default(""), key: z.string().trim().min(10).max(4096).optional(), metadata: z.object({ callbackOrigin: z.string().url().optional() }).default({}) }).parse(body);
      const id = v.id || crypto.randomUUID();
      const previous = v.id ? await connectionFor(actor, id, v.provider) : null;
      if (!v.key && !previous) throw new AppError("Enter a provider credential.");
      if (v.metadata.callbackOrigin && new URL(v.metadata.callbackOrigin).origin !== new URL(req.url).origin) throw new AppError("The callback origin must be this application’s origin.");
      const sealed = v.key ? await seal(v.key, `${actor}:${id}:${v.provider}`) : previous;
      if (previous) await db().prepare("UPDATE connections SET label=?,model=?,ciphertext=?,iv=?,metadata=?,updated_at=? WHERE id=? AND owner_id=?").bind(v.label, v.model, sealed.ciphertext, sealed.iv, JSON.stringify(v.metadata), now, id, actor).run();
      else await db().prepare("INSERT INTO connections (id,owner_id,provider,label,model,ciphertext,iv,metadata,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)").bind(id, actor, v.provider, v.label, v.model, sealed.ciphertext, sealed.iv, JSON.stringify(v.metadata), now, now).run();
      return reply({ id }, previous ? 200 : 201);
    }
    if (body.action === "disconnect") {
      const id = idSchema.parse(body.id); await connectionFor(actor, id);
      const active = await db().prepare("SELECT id FROM monitors WHERE owner_id = ? AND status IN ('active','activating','activation_unknown') AND (json_extract(config,'$.connectionId') = ? OR json_extract(config,'$.queueConnectionId') = ?) LIMIT 1").bind(actor,id,id).first();
      const delivery=await db().prepare("SELECT id FROM monitors WHERE owner_id=? AND json_extract(config,'$.delivery.enabled')=1 AND json_extract(config,'$.delivery.connectionId')=? LIMIT 1").bind(actor,id).first();
      if(delivery)throw new AppError("Disable email delivery using this connection before removing it.",409);
      if (active) throw new AppError("Pause monitors using this connection before removing it.", 409);
      await db().batch([db().prepare("DELETE FROM study_connections WHERE connection_id = ?").bind(id), db().prepare("DELETE FROM connections WHERE id = ? AND owner_id = ?").bind(id, actor)]);
      return reply({ id });
    }
    if (body.action === "accept_invite") {
      const token = z.string().regex(/^[a-f0-9]{64}$/).parse(body.token), user = (await getChatGPTUser())!;
      const invite = await db().prepare("SELECT * FROM study_invites WHERE token_hash = ? AND expires_at > ? AND revoked_at IS NULL AND accepted_at IS NULL").bind(await hash(token), now).first<any>();
      if (!invite) throw new AppError("This invitation is expired, used, or withdrawn.", 404);
      if (invite.email.toLowerCase() !== user.email.toLowerCase()) throw new AppError("Sign in with the email address named on this invitation.", 403);
      // The transaction both consumes the invite and grants the intended role.
      const rows = await db().batch([
        db().prepare("INSERT INTO study_members (id,study_id,user_id,email,role,created_at) SELECT ?,study_id,?,email,role,? FROM study_invites WHERE id=? AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > ? ON CONFLICT(study_id,user_id) DO UPDATE SET role=excluded.role,email=excluded.email").bind(crypto.randomUUID(),actor,now,invite.id,now),
        db().prepare("UPDATE study_invites SET accepted_at=? WHERE id=? AND accepted_at IS NULL AND revoked_at IS NULL").bind(now,invite.id),
      ]);
      if (!rows[1].meta.changes) throw new AppError("This invitation was already used.",409);
      await audit(invite.study_id, actor, "member_joined", null, { role: invite.role }); return reply({ studyId: invite.study_id });
    }
    const studyId = idSchema.parse(body.studyId);
    const ownerActions = ["invite", "revoke_invite", "member", "grant_connection"];
    await ownStudy(studyId, actor, ownerActions.includes(body.action) ? "owner" : body.action === "draft" ? "read" : "write");
    if (body.action === "invite") {
      const v = z.object({ email: z.string().trim().email().max(254), role: z.enum(["editor", "viewer"]) }).parse(body);
      const id = crypto.randomUUID(), token = tokenValue(), expiresAt = new Date(Date.now() + 7 * 86400000).toISOString();
      await db().prepare("INSERT INTO study_invites (id,study_id,email,role,token_hash,created_at,expires_at) VALUES (?,?,?,?,?,?,?)").bind(id,studyId,v.email.toLowerCase(),v.role,await hash(token),now,expiresAt).run();
      await audit(studyId,actor,"invite_created",id,{role:v.role});
      return reply({ id, path: `/join/${token}`, expiresAt },201);
    }
    if (body.action === "revoke_invite") {
      const id = idSchema.parse(body.id); await db().prepare("UPDATE study_invites SET revoked_at=? WHERE id=? AND study_id=?").bind(now,id,studyId).run();
      await audit(studyId,actor,"invite_revoked",id); return reply({ id });
    }
    if (body.action === "member") {
      const v = z.object({ id:idSchema, role:z.enum(["editor","viewer","remove"]) }).parse(body);
      const member=await db().prepare("SELECT email FROM study_members WHERE id=? AND study_id=?").bind(v.id,studyId).first<any>();
      if(!member)throw new AppError("Member not found.",404);
      await db().prepare("UPDATE study_invites SET revoked_at=? WHERE study_id=? AND email=? AND accepted_at IS NULL AND revoked_at IS NULL").bind(now,studyId,member.email).run();
      if (v.role === "remove") await db().prepare("DELETE FROM study_members WHERE id=? AND study_id=?").bind(v.id,studyId).run();
      else await db().prepare("UPDATE study_members SET role=? WHERE id=? AND study_id=?").bind(v.role,v.id,studyId).run();
      await audit(studyId,actor,"member_access_changed",v.id,{role:v.role}); return reply({ id:v.id });
    }
    if (body.action === "grant_connection") {
      const v = z.object({ connectionId:idSchema, requestLimit:z.number().int().min(0).max(100000) }).parse(body);
      const row = await connectionFor(actor,v.connectionId);
      if (["qstash","resend"].includes(row.provider)) throw new AppError("The queue connection is managed by the owner and cannot be granted as a provider.");
      await db().prepare("INSERT INTO study_connections (id,study_id,connection_id,request_limit,used_requests,created_at) VALUES (?,?,?,?,0,?) ON CONFLICT(study_id,connection_id) DO UPDATE SET request_limit=excluded.request_limit").bind(crypto.randomUUID(),studyId,v.connectionId,v.requestLimit,now).run();
      await audit(studyId,actor,"request_allowance_changed",v.connectionId,{requestLimit:v.requestLimit}); return reply({ granted:true });
    }
    if (body.action === "draft") {
      const v = z.object({ name:label, payload:z.record(z.unknown()), version:z.number().int().min(0) }).parse(body);
      const text = JSON.stringify(v.payload); if(text.length>100000) throw new AppError("The draft is too large.");
      const old = await db().prepare("SELECT id,version FROM drafts WHERE study_id=? AND user_id=? AND name=?").bind(studyId,actor,v.name).first<any>();
      if(old && old.version !== v.version || !old && v.version !== 0) throw new AppError("A newer draft exists. Reload it before saving.",409);
      const id = old?.id || crypto.randomUUID();
      if(old) { const result=await db().prepare("UPDATE drafts SET payload=?,version=version+1,updated_at=? WHERE id=? AND version=?").bind(text,now,id,v.version).run(); if(!result.meta.changes) throw new AppError("A newer draft exists. Reload it before saving.",409); }
      else { const result=await db().prepare("INSERT OR IGNORE INTO drafts (id,study_id,user_id,name,payload,version,updated_at) VALUES (?,?,?,?,?,1,?)").bind(id,studyId,actor,v.name,text,now).run(); if(!result.meta.changes) throw new AppError("A newer draft exists. Reload it before saving.",409); }
      return reply({id,version:v.version+1,updatedAt:now});
    }
    throw new AppError("Unknown workspace operation.",404);
  } catch(e) { return failure(e); }
}
