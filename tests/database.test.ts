import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import fixture from "../fixtures/sample-church.json";
const db = new PGlite();
const tenant = "ba06fb2d-7197-461e-b239-7f1766e7b115";
const staffId = "11111111-1111-4111-8111-111111111111";
const outsider = "22222222-2222-4222-8222-222222222222";
let sid: string;
async function identity(role: string, id = "") {
  await db.exec(
    `reset role;set role ${role}; select set_config('request.jwt.claim.sub','${id}',false)`,
  );
}
beforeAll(async () => {
  await db.exec(
    `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth,public to anon,authenticated,service_role;grant execute on function auth.uid() to anon,authenticated,service_role;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);`,
  );
  // PGlite provides core gen_random_uuid, not Supabase's optional pgcrypto extension.
  await db.exec(
    readFileSync(
      "supabase/migrations/202610200001_initial.sql",
      "utf8",
    ).replace("create extension if not exists pgcrypto;", ""),
  );
  await db.exec(
    `insert into auth.users values('${staffId}'),('${outsider}');insert into public.staff_users(user_id,role) values('${staffId}','admin')`,
  );
  await identity("service_role");
  const r = await db.query<{ id: string }>(
    "select public.submit_church($1,$2,$3) id",
    [tenant, JSON.stringify(fixture), "[]"],
  );
  sid = r.rows[0].id;
}, 30000);
afterAll(async () => {
  await db.close();
});
describe("Postgres migration and authorization integration", () => {
  it("creates atomic tenant, config, submission and initial history", async () => {
    const r = await db.query<{ count: number }>(
      `select count(*)::int as count from public.church_configs where church_id=$1`,
      [tenant],
    );
    expect(r.rows[0].count).toBe(1);
    expect(
      (await db.query("select * from public.submission_status_events")).rows,
    ).toHaveLength(1);
  });
  it("denies anonymous table reads and intake RPC", async () => {
    await identity("anon");
    await expect(db.query("select * from public.churches")).rejects.toThrow(
      /permission/,
    );
    await expect(
      db.query("select public.submit_church($1,$2,$3)", [
        tenant,
        JSON.stringify(fixture),
        "[]",
      ]),
    ).rejects.toThrow(/permission/);
  });
  it("hides every tenant and config from a non-allowlisted authenticated identity", async () => {
    await identity("authenticated", outsider);
    for (const table of [
      "churches",
      "church_configs",
      "assets",
      "submissions",
      "staff_users",
      "staff_notes",
      "build_jobs",
      "audit_log",
      "notifications",
      "submission_status_events",
      "publishing_records",
    ])
      expect(
        (await db.query(`select * from public.${table}`)).rows,
      ).toHaveLength(0);
    await expect(
      db.query("select public.change_status($1,$2,$3,$4)", [
        sid,
        "submitted",
        "approved",
        "bad",
      ]),
    ).rejects.toThrow(/Forbidden/);
  });
  it("cannot spoof the allowlist with a temporary table", async () => {
    await identity("authenticated", outsider);
    await db.exec(
      `create temporary table staff_users(user_id uuid); insert into pg_temp.staff_users values('${outsider}')`,
    );
    const result = await db.query<{ ok: boolean }>(
      "select public.is_staff() ok",
    );
    expect(result.rows[0].ok).toBe(false);
    await db.exec("drop table pg_temp.staff_users");
  });
  it("staff may read, but cannot bypass transitions with table writes", async () => {
    await identity("authenticated", staffId);
    expect((await db.query("select * from public.churches")).rows).toHaveLength(
      1,
    );
    await expect(
      db.query("update public.submissions set status='published'"),
    ).rejects.toThrow(/permission/);
    await expect(
      db.query("select public.change_status($1,$2,$3,$4)", [
        sid,
        "submitted",
        "published",
        "skip",
      ]),
    ).rejects.toThrow(/Invalid transition/);
  });
  it("records a valid transition with authenticated actor and rejects stale updates", async () => {
    await db.query("select public.change_status($1,$2,$3,$4)", [
      sid,
      "submitted",
      "approved",
      "Materials reviewed",
    ]);
    const rows = (
      await db.query<{ actor_id: string; to_status: string }>(
        "select * from public.submission_status_events where from_status is not null",
      )
    ).rows;
    expect(rows[0]).toMatchObject({ actor_id: staffId, to_status: "approved" });
    await expect(
      db.query("select public.change_status($1,$2,$3,$4)", [
        sid,
        "submitted",
        "needs_info",
        "stale",
      ]),
    ).rejects.toThrow(/Stale/);
  });
  it("keeps history and audit immutable even against privileged accidental updates", async () => {
    await identity("service_role");
    await expect(
      db.query("update public.submission_status_events set note='rewritten'"),
    ).rejects.toThrow(/Append-only/);
    await expect(db.query("delete from public.audit_log")).rejects.toThrow(
      /Append-only/,
    );
    await identity("authenticated", staffId);
  });
  it("records notes and notification requests with audit entries", async () => {
    await db.query("select public.add_note($1,$2)", [sid, "Staff-only note"]);
    await db.query("select public.request_materials($1,$2)", [
      sid,
      "Please send your logo",
    ]);
    expect(
      (await db.query("select * from public.staff_notes")).rows,
    ).toHaveLength(1);
    expect(
      (await db.query("select * from public.notifications")).rows[0],
    ).toMatchObject({ state: "pending", actor_id: staffId });
  });
  it("dry-run jobs fail honestly and cannot unlock QA", async () => {
    const cfg = (
      await db.query<{ id: string }>("select id from public.church_configs")
    ).rows[0];
    const job = (
      await db.query<{ id: string }>(
        "select public.queue_simulation($1,$2,$3) id",
        [tenant, cfg.id, "roku"],
      )
    ).rows[0];
    expect(
      (await db.query("select status from public.build_jobs")).rows[0],
    ).toMatchObject({ status: "queued" });
    await db.query("select public.finish_simulation($1)", [job.id]);
    expect(
      (await db.query("select * from public.build_jobs")).rows[0],
    ).toMatchObject({
      status: "failed",
      artifact_path: null,
      simulation: true,
    });
    await db.query("select public.change_status($1,$2,$3,$4)", [
      sid,
      "approved",
      "building",
      "Dry run",
    ]);
    await expect(
      db.query("select public.change_status($1,$2,$3,$4)", [
        sid,
        "building",
        "qa",
        "Pretend ready",
      ]),
    ).rejects.toThrow(/Actual compiled artifact required/);
  });
  it("rejects cross-tenant build config references", async () => {
    const cfg = (
      await db.query<{ id: string }>("select id from public.church_configs")
    ).rows[0];
    await expect(
      db.query("select public.queue_simulation($1,$2,$3)", [
        outsider,
        cfg.id,
        "roku",
      ]),
    ).rejects.toThrow(/mismatch/);
  });
  it("enforces a persistent global intake budget", async () => {
    await identity("service_role");
    for (let i = 0; i < 100; i++)
      expect(
        (
          await db.query<{ ok: boolean }>(
            "select public.consume_intake_budget() ok",
          )
        ).rows[0].ok,
      ).toBe(true);
    expect(
      (
        await db.query<{ ok: boolean }>(
          "select public.consume_intake_budget() ok",
        )
      ).rows[0].ok,
    ).toBe(false);
  });
  it("seed is repeatable and does not auto-authorize users", async () => {
    await identity("postgres");
    const seed = readFileSync("supabase/seed.sql", "utf8");
    await db.exec(seed);
    await db.exec(seed);
    expect(
      (await db.query("select * from public.staff_users")).rows,
    ).toHaveLength(1);
  });
});
