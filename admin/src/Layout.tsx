import { NavLink, Outlet } from 'react-router-dom';

export function Layout() {
  return (
    <div className="layout">
      <nav className="sidebar">
        <h2>Auto Board</h2>
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
        <Outlet />
      </main>
    </div>
  );
}
