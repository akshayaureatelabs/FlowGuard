import type { TeamRole } from "@flowguard/shared";

/** Roles allowed to manage a team (invite/member management, project assignment). */
export const TEAM_ADMIN_ROLES: TeamRole[] = ["owner", "admin"];

export function canEditTeam(role?: TeamRole | null): boolean {
  return !!role && TEAM_ADMIN_ROLES.includes(role);
}

export type ProjectAccessInput = {
  project: { ownerId?: string; teamId?: string } | null;
  /** AUTH_DISABLED short-circuits all access. */
  isAuthDisabled: boolean;
  authUserId: string;
  /** Requester's role in project.teamId, or null when project has no team. */
  teamMembership?: TeamRole | null;
};

/** Pure access decision used by the API layer. */
export function canAccessProject({
  project,
  isAuthDisabled,
  authUserId,
  teamMembership,
}: ProjectAccessInput): boolean {
  if (!project) return false;
  if (isAuthDisabled || authUserId === "local") return true;
  if (project.teamId) return teamMembership != null;
  return !project.ownerId || project.ownerId === authUserId;
}

/** Only the project owner or team admins may reassign/own a project's team. */
export function canAssignTeam(
  role?: TeamRole | null,
  isProjectOwner = false
): boolean {
  return isProjectOwner || canEditTeam(role);
}

/** A member may not remove the sole owner; only the owner may demote the owner. */
export function canMutateMemberRole(
  actorRole: TeamRole,
  targetRole: TeamRole,
  isSelf: boolean
): boolean {
  if (!canEditTeam(actorRole)) return false;
  if (targetRole === "owner" && actorRole !== "owner") return false;
  if (isSelf && targetRole === "owner" && actorRole === "owner") return false;
  return true;
}