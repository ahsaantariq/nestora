import { randomUUID } from "node:crypto";
import { getSql } from "@/lib/db";

export async function writeAudit(actorId: string, action: string, target: string, detail: Record<string, unknown> = {}) {
  const sql = await getSql();
  await sql`
    insert into audit_log (id, actor_user_id, action, target, detail)
    values (${randomUUID()}, ${actorId}, ${action}, ${target}, ${JSON.stringify(detail)}::jsonb)
  `;
}
