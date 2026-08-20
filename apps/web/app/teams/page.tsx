"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

export default function TeamsPage() {
  const [teams, setTeams] = useState<any[]>([]);
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");
  const [newMemberId, setNewMemberId] = useState("");
  const [newMemberRole, setNewMemberRole] = useState("member");
  const [lastInviteLink, setLastInviteLink] = useState("");

  const load = async () => {
    try {
      setLoading(true);
      setError("");
      setTeams(await api.listTeams());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const selectTeam = async (id: string) => {
    try {
      setError("");
      setSelected(await api.getTeam(id));
    } catch (e: any) {
      setError(e.message);
    }
  };

  const create = async () => {
    if (!name.trim()) return;
    try {
      setError("");
      const team = await api.createTeam(name.trim());
      setName("");
      await load();
      await selectTeam(team.id);
    } catch (e: any) {
      setError(e.message);
    }
  };

  const canManage = selected?.role === "owner" || selected?.role === "admin";

  const sendInvite = async () => {
    if (!inviteEmail.trim()) return;
    try {
      setError("");
      setMsg("");
      setLastInviteLink("");
      const inv = await api.createTeamInvite(selected.team.id, inviteEmail.trim(), inviteRole);
      setInviteEmail("");
      const origin = typeof window !== "undefined" ? window.location.origin : "";
      const link = inv?.token ? `${origin}/invites/${inv.token}` : "";
      setLastInviteLink(link);
      setMsg(
        link
          ? `Invite created — copy the link below and send to ${inviteEmail.trim()}`
          : `Invite created for ${inviteEmail.trim()}`
      );
      await selectTeam(selected.team.id);
    } catch (e: any) {
      setError(e.message);
    }
  };

  const addMember = async () => {
    if (!newMemberId.trim()) return;
    try {
      setError("");
      setMsg("");
      await api.addTeamMember(selected.team.id, newMemberId.trim(), newMemberRole);
      setNewMemberId("");
      setMsg("Member added");
      await selectTeam(selected.team.id);
    } catch (e: any) {
      setError(e.message);
    }
  };

  const setRole = async (userId: string, role: string) => {
    try {
      setError("");
      setMsg("");
      await api.updateTeamMember(selected.team.id, userId, role);
      await selectTeam(selected.team.id);
    } catch (e: any) {
      setError(e.message);
    }
  };

  const removeMember = async (userId: string) => {
    if (!confirm("Remove this member from the team?")) return;
    try {
      setError("");
      setMsg("");
      await api.removeTeamMember(selected.team.id, userId);
      await selectTeam(selected.team.id);
    } catch (e: any) {
      setError(e.message);
    }
  };

  const revokeInvite = async (inviteId: string) => {
    try {
      setError("");
      await api.revokeTeamInvite(selected.team.id, inviteId);
      await selectTeam(selected.team.id);
    } catch (e: any) {
      setError(e.message);
    }
  };

  return (
    <div>
      <div className="page-header">
        <h1>Teams</h1>
        <p>
          Group projects under a team, invite teammates by email, and share
          access across the organization.
        </p>
      </div>

      {error && <div className="alert-error">{error}</div>}
      {msg && <div className="alert-success">{msg}</div>}
      {lastInviteLink && (
        <div className="panel-box" style={{ marginBottom: 12 }}>
          <label>Invite link (share with teammate)</label>
          <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
            <input readOnly value={lastInviteLink} style={{ flex: 1, minWidth: 0 }} />
            <button
              className="btn btn-ghost"
              type="button"
              onClick={() => navigator.clipboard.writeText(lastInviteLink)}
            >
              Copy
            </button>
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-start" }}>
        <div className="panel-box" style={{ flex: "1 1 260px", minWidth: 260 }}>
          <div className="form-row" style={{ marginBottom: 0 }}>
            <div className="field" style={{ flex: 1 }}>
              <label>New team name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="QA Platform"
              />
            </div>
            <div className="field">
              <label>&nbsp;</label>
              <button className="btn" onClick={create}>
                Create
              </button>
            </div>
          </div>
          {loading ? (
            <div className="muted">Loading…</div>
          ) : teams.length === 0 ? (
            <div className="empty">No teams yet.</div>
          ) : (
            <ul style={{ listStyle: "none", padding: 0, margin: "12px 0 0" }}>
              {teams.map((t) => (
                <li key={t.team.id} style={{ marginBottom: 8 }}>
                  <button
                    className="btn btn-ghost"
                    style={{
                      width: "100%",
                      textAlign: "left",
                      justifyContent: "space-between",
                      ...(selected?.team?.id === t.team.id
                        ? { borderColor: "var(--accent)", color: "var(--accent)" }
                        : {}),
                    }}
                    onClick={() => selectTeam(t.team.id)}
                  >
                    <span>{t.team.name}</span>
                    <span className="muted">{t.role}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {selected && (
          <div className="panel-box" style={{ flex: "2 1 480px", minWidth: 400 }}>
            <h2 style={{ marginTop: 0 }}>{selected.team.name}</h2>
            <div className="muted" style={{ marginBottom: 12 }}>
              Your role: <strong>{selected.role}</strong>
            </div>

            <h3>Members</h3>
            <ul style={{ listStyle: "none", padding: 0, margin: "8px 0 16px" }}>
              {selected.members?.map((m: any) => (
                <li
                  key={m.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "6px 0",
                    borderBottom: "1px solid var(--border)",
                  }}
                >
                  <code style={{ flex: 1 }}>{m.userId}</code>
                  <select value={m.role} onChange={(e) => setRole(m.userId, e.target.value)} disabled={!canManage}>
                    {["member", "admin", "owner"].map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                  {canManage && (
                    <button className="btn btn-ghost btn-sm" style={{ color: "var(--danger)" }} onClick={() => removeMember(m.userId)}>
                      Remove
                    </button>
                  )}
                </li>
              ))}
            </ul>

            {canManage && (
              <>
                <h3>Invite by email</h3>
                <div className="form-row" style={{ marginBottom: 8 }}>
                  <div className="field" style={{ flex: 2 }}>
                    <input
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      placeholder="teammate@company.com"
                    />
                  </div>
                  <div className="field" style={{ flex: 1 }}>
                    <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value)}>
                      <option value="member">member</option>
                      <option value="admin">admin</option>
                    </select>
                  </div>
                  <div className="field">
                    <button className="btn" onClick={sendInvite}>
                      Invite
                    </button>
                  </div>
                </div>

                {selected.invites?.length > 0 && (
                  <div>
                    <h3>Pending invites</h3>
                    <ul style={{ listStyle: "none", padding: 0, margin: "8px 0 16px" }}>
                      {selected.invites.map((i: any) => (
                        <li
                          key={i.id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            padding: "6px 0",
                            borderBottom: "1px solid var(--border)",
                            flexWrap: "wrap",
                          }}
                        >
                          <code style={{ flex: 1 }}>{i.email}</code>
                          <span className="muted">{i.role}</span>
                          <span className="muted">{i.status}</span>
                          {i.token && (
                            <a className="muted" href={`/invites/${i.token}`} style={{ fontSize: "0.8rem" }}>
                              accept link
                            </a>
                          )}
                          {i.status === "pending" && (
                            <button className="btn btn-ghost btn-sm" style={{ color: "var(--danger)" }} onClick={() => revokeInvite(i.id)}>
                              Revoke
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <h3>Add member directly</h3>
                <div className="form-row" style={{ marginBottom: 0 }}>
                  <div className="field" style={{ flex: 2 }}>
                    <input
                      value={newMemberId}
                      onChange={(e) => setNewMemberId(e.target.value)}
                      placeholder="user id"
                    />
                  </div>
                  <div className="field" style={{ flex: 1 }}>
                    <select value={newMemberRole} onChange={(e) => setNewMemberRole(e.target.value)}>
                      <option value="member">member</option>
                      <option value="admin">admin</option>
                    </select>
                  </div>
                  <div className="field">
                    <button className="btn" onClick={addMember}>
                      Add
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
