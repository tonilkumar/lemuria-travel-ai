import { and, asc, eq, isNull } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { db } from '../../db/client.js';
import { roles as rolesTable, userRoles, users } from '../../db/schema/auth.js';
import { ok } from '../../lib/reply.js';

export async function userRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', app.authenticate);

  /**
   * Assignable team members. Deliberately returns only the fields the assign
   * dropdown needs, so a lead-assignment UI cannot become a directory leak.
   */
  app.get('/assignable', async () => {
    const rows = await db
      .select({
        id: users.id,
        fullName: users.fullName,
        designation: users.designation,
        avatarUrl: users.avatarUrl,
        roleKey: rolesTable.key,
      })
      .from(users)
      .leftJoin(userRoles, eq(userRoles.userId, users.id))
      .leftJoin(rolesTable, eq(rolesTable.id, userRoles.roleId))
      .where(and(eq(users.isActive, true), isNull(users.deletedAt)))
      .orderBy(asc(users.fullName));

    const byId = new Map<string, { id: string; fullName: string; designation: string | null; avatarUrl: string | null; roles: string[] }>();
    for (const r of rows) {
      const entry = byId.get(r.id) ?? {
        id: r.id,
        fullName: r.fullName,
        designation: r.designation,
        avatarUrl: r.avatarUrl,
        roles: [],
      };
      if (r.roleKey) entry.roles.push(r.roleKey);
      byId.set(r.id, entry);
    }
    return ok([...byId.values()]);
  });
}
