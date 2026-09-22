-- Full-text evidence index. Original responses remain unchanged in R2.
CREATE VIRTUAL TABLE run_search USING fts5(prompt, answer, links, tokenize='unicode61');
--> statement-breakpoint
INSERT INTO run_search(rowid,prompt,answer,links)
SELECT r.rowid,r.prompt,coalesce((SELECT group_concat(json_extract(value,'$.text'),char(10)) FROM json_each(r.normalized,'$.segments')),''),coalesce((SELECT group_concat(json_extract(value,'$.url'),' ') FROM json_each(r.normalized,'$.sources')),'') FROM runs r;
--> statement-breakpoint
CREATE TRIGGER runs_search_insert AFTER INSERT ON runs BEGIN
INSERT INTO run_search(rowid,prompt,answer,links) VALUES (new.rowid,new.prompt,coalesce((SELECT group_concat(json_extract(value,'$.text'),char(10)) FROM json_each(new.normalized,'$.segments')),''),coalesce((SELECT group_concat(json_extract(value,'$.url'),' ') FROM json_each(new.normalized,'$.sources')),''));
END;
--> statement-breakpoint
CREATE TRIGGER runs_search_update AFTER UPDATE OF prompt,normalized ON runs BEGIN
DELETE FROM run_search WHERE rowid=old.rowid;
INSERT INTO run_search(rowid,prompt,answer,links) VALUES (new.rowid,new.prompt,coalesce((SELECT group_concat(json_extract(value,'$.text'),char(10)) FROM json_each(new.normalized,'$.segments')),''),coalesce((SELECT group_concat(json_extract(value,'$.url'),' ') FROM json_each(new.normalized,'$.sources')),''));
END;
--> statement-breakpoint
CREATE TRIGGER runs_search_delete AFTER DELETE ON runs BEGIN
DELETE FROM run_search WHERE rowid=old.rowid;
END;
