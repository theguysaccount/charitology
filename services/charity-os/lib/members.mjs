import { ROLES } from "./modules.mjs";
import { requireAdmin } from "./access.mjs";
import { id, hash, clean, email, fail, json } from "./security.mjs";
import { audit } from "./database.mjs";
import { enqueue } from "./jobs.mjs";
const okay = (value) => json({ ok: true, ...value });
function role(value) {
  if (!ROLES.includes(value)) fail(422, "role", "Choose a supported role.");
  return value;
}
export async function memberRoutes({
  c,
  org,
  user,
  session,
  member,
  tail,
  method,
  input,
  settings,
}) {
  if (tail === "members" && method === "GET") {
    const members = (
      await c.query(
        'SELECT m.user_id AS "userId",u.email,u.name,m.role,m.revision,m.program_ids AS "programIds" FROM os_members m JOIN "user" u ON u.id=m.user_id WHERE m.org_id=$1 ORDER BY m.created_at',
        [org],
      )
    ).rows;
    const invitations = ["owner", "admin"].includes(member.role)
      ? (
          await c.query(
            'SELECT id,email,role,expires_at AS "expiresAt",accepted_at AS "acceptedAt",revoked_at AS "revokedAt" FROM os_invites WHERE org_id=$1 ORDER BY created_at DESC',
            [org],
          )
        ).rows
      : [];
    return okay({
      members,
      invitations: invitations.map((r) => ({
        ...r,
        status: r.revokedAt
          ? "revoked"
          : r.acceptedAt
            ? "accepted"
            : +new Date(r.expiresAt) < Date.now()
              ? "expired"
              : "pending",
      })),
    });
  }
  if (tail === "invitations" && method === "POST") {
    requireAdmin(member);
    const assigned = role(input.role);
    if (assigned === "owner" && member.role !== "owner")
      fail(403, "owner", "Only an owner can invite another owner.");
    const address = email(input.email),
      inviteId = id(),
      token = `${org}.${inviteId}.${id()}`;
    const orgName = (
      await c.query("SELECT name FROM os_orgs WHERE id=$1", [org])
    ).rows[0].name;
    await c.query(
      "INSERT INTO os_invites(org_id,id,email,role,program_ids,token_hash,created_by,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,now()+interval '7 days')",
      [org, inviteId, address, assigned, JSON.stringify([]), hash(token), user],
    );
    const link = new URL("/invite", settings.origin);
    link.searchParams.set("token", token);
    await enqueue(
      c,
      org,
      "invitation",
      `invitation:${inviteId}`,
      {
        purpose: "invitation",
        to: address,
        url: link.toString(),
        organizationName: orgName,
      },
      new Date(),
    );
    await audit(c, org, user, "invitation.created", null, {
      id: inviteId,
      role: assigned,
    });
    return okay({
      invitation: {
        id: inviteId,
        email: address,
        role: assigned,
        status: "pending-delivery",
      },
    });
  }
  const inv = tail.match(/^invitations\/([A-Za-z0-9_-]+)$/);
  if (inv && method === "DELETE") {
    requireAdmin(member);
    await c.query(
      "UPDATE os_invites SET revoked_at=now() WHERE org_id=$1 AND id=$2 AND accepted_at IS NULL",
      [org, inv[1]],
    );
    await audit(c, org, user, "invitation.revoked", null, { id: inv[1] });
    return okay({ revoked: true });
  }
  const target = tail.match(/^members\/([A-Za-z0-9_-]+)$/);
  if (target && ["PATCH", "DELETE"].includes(method)) {
    requireAdmin(member);
    const row = (
      await c.query(
        "SELECT * FROM os_members WHERE org_id=$1 AND user_id=$2 FOR UPDATE",
        [org, target[1]],
      )
    ).rows[0];
    if (!row) fail(404, "member", "Member not found.");
    if (row.role === "owner" && member.role !== "owner")
      fail(403, "owner", "Only an owner can change owner access.");
    const assigned = method === "PATCH" ? role(input.role) : null;
    if (assigned === "owner" && member.role !== "owner")
      fail(403, "owner", "Only an owner can assign ownership.");
    if (row.role === "owner" && assigned !== "owner") {
      const count = Number(
        (
          await c.query(
            "SELECT count(*) FROM os_members WHERE org_id=$1 AND role='owner'",
            [org],
          )
        ).rows[0].count,
      );
      if (count <= 1)
        fail(
          409,
          "last_owner",
          "Assign another owner before removing the last owner.",
        );
    }
    if (method === "PATCH") {
      if (input.revision !== row.revision)
        fail(409, "revision", "Membership changed. Refresh before saving.");
      const programIds = input.programIds || [];
      if (
        !Array.isArray(programIds) ||
        programIds.length > 100 ||
        programIds.some((x) => typeof x !== "string")
      )
        fail(422, "scope", "Choose valid program scopes.");
      for (const pid of programIds) {
        if (
          !(
            await c.query(
              "SELECT id FROM os_records WHERE org_id=$1 AND id=$2 AND module_id='programs' AND deleted_at IS NULL",
              [org, pid],
            )
          ).rowCount
        )
          fail(422, "scope", "A program scope does not exist.");
      }
      if (["owner", "admin"].includes(assigned) && programIds.length)
        fail(422, "scope", "Administrators require organization-wide access.");
      await c.query(
        "UPDATE os_members SET role=$3,program_ids=$4,revision=revision+1 WHERE org_id=$1 AND user_id=$2",
        [org, row.user_id, assigned, JSON.stringify(programIds)],
      );
    } else
      await c.query("DELETE FROM os_members WHERE org_id=$1 AND user_id=$2", [
        org,
        row.user_id,
      ]);
    await audit(
      c,
      org,
      user,
      method === "PATCH" ? "membership.changed" : "membership.revoked",
      null,
      { userId: row.user_id, previousRole: row.role, role: assigned },
    );
    return okay({ updated: true });
  }
  return null;
}
export async function acceptInvite({ db, session, input }) {
  const token = clean(input.token, 350),
    parts = token.split(".");
  if (parts.length !== 3 || parts.some((x) => !/^[a-f0-9]{32}$/.test(x)))
    fail(422, "invitation", "This invitation is invalid.");
  const [org, inviteId] = parts;
  return db.tx(
    session.user.id,
    org,
    async (c) => {
      const invite = (
        await c.query(
          "SELECT * FROM os_invites WHERE org_id=$1 AND id=$2 AND token_hash=$3 FOR UPDATE",
          [org, inviteId, hash(token)],
        )
      ).rows[0];
      if (
        !invite ||
        invite.accepted_at ||
        invite.revoked_at ||
        +invite.expires_at < Date.now()
      )
        fail(
          409,
          "invitation",
          "This invitation expired, was revoked or has already been accepted.",
        );
      if (invite.email !== session.user.email.toLowerCase())
        fail(
          403,
          "invitation_email",
          "Sign in with the email address that received this invitation.",
        );
      await c.query(
        "INSERT INTO os_members(org_id,user_id,role,program_ids) VALUES($1,$2,$3,$4) ON CONFLICT(org_id,user_id) DO NOTHING",
        [org, session.user.id, invite.role, JSON.stringify(invite.program_ids)],
      );
      await c.query(
        "UPDATE os_invites SET accepted_at=now() WHERE org_id=$1 AND id=$2",
        [org, inviteId],
      );
      await audit(c, org, session.user.id, "invitation.accepted", null, {
        id: inviteId,
      });
      return { accepted: true, orgId: org };
    },
    { lock: true },
  );
}
