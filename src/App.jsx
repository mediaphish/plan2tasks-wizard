// ---------- UsersView (NO per-row Invite) ----------
function UsersView({ plannerEmail, onManage, onToast }) {
  const [users, setUsers] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [q, setQ] = React.useState("");
  const [inviteUser, setInviteUser] = React.useState(""); // for top-right Invite

  React.useEffect(() => {
    loadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plannerEmail]);

  async function loadUsers() {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ plannerEmail });
      let r = await fetch(`/api/users?` + qs.toString());
      if (r.status === 404) r = await fetch(`/api/users/list?` + qs.toString());
      const j = await r.json().catch(() => ({}));
      const arr = Array.isArray(j) ? j : (j.users || []);
      setUsers(arr);
    } catch (e) {
      onToast?.("error", "Failed to load users");
    } finally {
      setLoading(false);
    }
  }

  const filtered = users.filter(u => {
    if (!q) return true;
    const hay = `${u.email || ""} ${u.name || ""} ${u.group || ""} ${u.status || ""}`.toLowerCase();
    return hay.includes(q.toLowerCase());
  });

  return (
    <div className="space-y-4">
      {/* Header: title, search, and TOP-RIGHT Invite User */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-semibold">Users</h2>

        <div className="flex w-full items-center gap-2 sm:w-auto">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search users (name, email, group, status)"
            className="flex-1 rounded-xl border border-gray-300 px-3 py-2 text-sm sm:w-64"
          />
          <button
            onClick={() => setInviteUser("__new__")}
            className="rounded-xl bg-cyan-600 px-3 py-2 text-xs sm:text-sm font-semibold text-white hover:bg-cyan-700 whitespace-nowrap"
            title="Invite a new user"
          >
            Invite User
          </button>
        </div>
      </div>

      {/* Users table */}
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-left">
            <tr className="text-gray-600">
              <th className="px-3 py-2 font-medium">Name</th>
              <th className="px-3 py-2 font-medium">Email</th>
              <th className="px-3 py-2 font-medium">Groups</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="px-3 py-6 text-center text-gray-500">Loading…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={5} className="px-3 py-6 text-center text-gray-500">No users yet.</td></tr>
            ) : (
              filtered.map((u) => (
                <tr key={u.email} className="border-t">
                  <td className="px-3 py-2">{u.name || "—"}</td>
                  <td className="px-3 py-2">{u.email}</td>
                  <td className="px-3 py-2">
                    {Array.isArray(u.groups) ? u.groups.join(", ") : (u.group || "—")}
                  </td>
                  <td className="px-3 py-2">
                    {u.status === "connected" ? (
                      <span className="rounded-full bg-green-50 px-2 py-1 text-[11px] font-medium text-green-700 border border-green-200">
                        Connected
                      </span>
                    ) : (
                      <span className="rounded-full bg-yellow-50 px-2 py-1 text-[11px] font-medium text-yellow-800 border border-yellow-200">
                        Not connected
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-end">
                      <button
                        onClick={() => onManage(u.email)}
                        className="rounded-xl bg-cyan-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-cyan-700"
                        title="Go to Manage User"
                      >
                        Manage User
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Invite Modal (top-right only) */}
      {inviteUser ? (
        <InviteModal
          plannerEmail={plannerEmail}
          userEmail={inviteUser === "__new__" ? "" : inviteUser}
          onClose={() => setInviteUser("")}
          onToast={onToast}
        />
      ) : null}
    </div>
  );
}
// ---------- end UsersView ----------
