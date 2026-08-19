import { describe, it, expect, beforeEach } from "vitest";
import { store } from "../src/store.js";
import {
  canAccessProject,
  canEditTeam,
  canAssignTeam,
  canMutateMemberRole,
  TEAM_ADMIN_ROLES,
} from "../src/teams-access.js";

function project(over: Partial<{ ownerId: string; teamId: string }> = {}) {
  return { ownerId: "owner-1", teamId: undefined, ...over };
}

beforeEach(() => {
  // Fresh in-memory store per test run (module-level singleton is fine since
  // each test creates its own entities).
});

describe("teams-access (pure role logic)", () => {
  it("canEditTeam only for owner/admin", () => {
    expect(canEditTeam("owner")).toBe(true);
    expect(canEditTeam("admin")).toBe(true);
    expect(canEditTeam("member")).toBe(false);
    expect(canEditTeam(undefined)).toBe(false);
    expect(canEditTeam(null)).toBe(false);
    expect(TEAM_ADMIN_ROLES).toEqual(["owner", "admin"]);
  });

  it("canAccessProject: owner-only when no team", () => {
    expect(
      canAccessProject({
        project: project(),
        isAuthDisabled: false,
        authUserId: "owner-1",
      })
    ).toBe(true);
    expect(
      canAccessProject({
        project: project(),
        isAuthDisabled: false,
        authUserId: "other",
      })
    ).toBe(false);
  });

  it("canAccessProject: legacy projects without owner are open", () => {
    expect(
      canAccessProject({
        project: { ownerId: undefined, teamId: undefined },
        isAuthDisabled: false,
        authUserId: "anyone",
      })
    ).toBe(true);
  });

  it("canAccessProject: team membership grants access regardless of ownership", () => {
    const p = project({ teamId: "team-1" });
    expect(
      canAccessProject({
        project: p,
        isAuthDisabled: false,
        authUserId: "other",
        teamMembership: "member",
      })
    ).toBe(true);
    expect(
      canAccessProject({
        project: p,
        isAuthDisabled: false,
        authUserId: "other",
        teamMembership: null,
      })
    ).toBe(false);
  });

  it("canAccessProject: auth-disabled local mode opens everything", () => {
    expect(
      canAccessProject({
        project: project({ teamId: "team-1" }),
        isAuthDisabled: true,
        authUserId: "local",
      })
    ).toBe(true);
    expect(
      canAccessProject({
        project: project(),
        isAuthDisabled: false,
        authUserId: "local",
      })
    ).toBe(true);
  });

  it("canAssignTeam: project owner or team admin may assign", () => {
    expect(canAssignTeam("member", true)).toBe(true);
    expect(canAssignTeam("admin", false)).toBe(true);
    expect(canAssignTeam("owner", false)).toBe(true);
    expect(canAssignTeam("member", false)).toBe(false);
    expect(canAssignTeam(undefined, false)).toBe(false);
  });

  it("canMutateMemberRole: only owner may promote/demote owners", () => {
    expect(canMutateMemberRole("owner", "member", false)).toBe(true);
    expect(canMutateMemberRole("admin", "member", false)).toBe(true);
    expect(canMutateMemberRole("member", "member", false)).toBe(false);
    expect(canMutateMemberRole("admin", "owner", false)).toBe(false);
    // owner cannot demote/promote themselves out of ownership
    expect(canMutateMemberRole("owner", "owner", true)).toBe(false);
  });
});

describe("memory store teams", () => {
  it("createTeam adds owner membership", async () => {
    const team = store.createTeam("QA", "user-a");
    expect(team.createdBy).toBe("user-a");
    const members = store.listTeamMembers(team.id);
    expect(members).toHaveLength(1);
    expect(members[0].role).toBe("owner");
    expect(members[0].userId).toBe("user-a");
    expect(await store.isTeamMember(team.id, "user-a")).toBe(true);
  });

  it("addMember + role update + remove", async () => {
    const team = store.createTeam("QA", "user-a");
    store.addTeamMember(team.id, "user-b", "member");
    expect(await store.isTeamMember(team.id, "user-b")).toBe(true);
    const updated = store.updateTeamMember(team.id, "user-b", "admin");
    expect(updated?.role).toBe("admin");
    expect(store.removeTeamMember(team.id, "user-b")).toBe(true);
    expect(await store.isTeamMember(team.id, "user-b")).toBe(false);
  });

  it("invite accept flow adds membership and marks accepted", async () => {
    const team = store.createTeam("QA", "user-a");
    const invite = store.createInvite(team.id, "bob@example.com", "member", "user-a");
    expect(invite.status).toBe("pending");
    expect(invite.token).toHaveLength(24);
    const member = store.acceptInvite(invite.token, "user-b");
    expect(member?.teamId).toBe(team.id);
    expect(member?.role).toBe("member");
    const after = store.getInviteByToken(invite.token);
    expect(after?.status).toBe("accepted");
    expect(await store.isTeamMember(team.id, "user-b")).toBe(true);
  });

  it("expired invites are rejected", async () => {
    const team = store.createTeam("QA", "user-a");
    const invite = store.createInvite(team.id, "bob@example.com", "member", "user-a");
    invite.expiresAt = new Date(Date.now() - 1000).toISOString();
    expect(store.acceptInvite(invite.token, "user-b")).toBeUndefined();
    expect(await store.isTeamMember(team.id, "user-b")).toBe(false);
  });

  it("revoked invites are rejected", async () => {
    const team = store.createTeam("QA", "user-a");
    const invite = store.createInvite(team.id, "bob@example.com", "member", "user-a");
    expect(store.revokeInvite(team.id, invite.id)).toBe(true);
    expect(store.acceptInvite(invite.token, "user-b")).toBeUndefined();
  });

  it("listTeamsForUser returns only teams the user belongs to", () => {
    const suffix = Math.random().toString(36).slice(2, 8);
    const me = `user-a-${suffix}`;
    const other = `user-b-${suffix}`;
    const t1 = store.createTeam("Team One", me);
    store.createTeam("Team Two", other);
    const mine = store.listTeamsForUser(me);
    expect(mine).toHaveLength(1);
    expect(mine[0].team.id).toBe(t1.id);
    expect(mine[0].role).toBe("owner");
  });

  it("projects can be assigned to a team", () => {
    const team = store.createTeam("QA", "user-a");
    const p = store.createProject("Web", "user-a");
    const updated = store.updateProject(p.id, { teamId: team.id });
    expect(updated?.teamId).toBe(team.id);
    const cleared = store.updateProject(p.id, { teamId: null });
    expect(cleared?.teamId).toBeUndefined();
  });
});
