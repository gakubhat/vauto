import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';

export function Layout() {
  const [q, setQ] = useState('');
  const navigate = useNavigate();

  function find(e: React.FormEvent) {
    e.preventDefault();
    const phone = q.trim();
    if (phone) navigate(`/recover/${encodeURIComponent(phone)}`);
  }

  return (
    <div className="layout">
      <nav className="sidebar">
        <h2>VAuto</h2>
        <NavLink to="/">Dashboard</NavLink>
        <NavLink to="/drivers">Drivers</NavLink>
        <NavLink to="/riders">Riders</NavLink>
        <NavLink to="/trips">Trips</NavLink>
        <NavLink to="/help">Help</NavLink>
        <NavLink to="/sessions">Sessions</NavLink>
        <NavLink to="/analytics">Analytics</NavLink>
        <NavLink to="/settings">Settings</NavLink>
        <button
          className="logout"
          onClick={() => {
            sessionStorage.removeItem('token');
            window.location.reload();
          }}
        >
          Logout
        </button>
      </nav>
      <main className="content">
        {/* The office usually arrives holding a phone number from a call. */}
        <div className="topbar">
          <form onSubmit={find}>
            <input
              placeholder="Find a person by phone…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label="Find a person by phone"
            />
            <button type="submit">Find</button>
          </form>
        </div>
        <Outlet />
      </main>
    </div>
  );
}
