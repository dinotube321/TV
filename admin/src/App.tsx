import type { ReactNode } from "react";
import {
  Navigate,
  NavLink,
  Outlet,
  Route,
  Routes,
  useNavigate,
} from "react-router-dom";
import { getToken, setToken } from "./api";
import { LoginPage } from "./pages/LoginPage";
import { DashboardPage } from "./pages/DashboardPage";
import { ImportPage } from "./pages/ImportPage";
import { LibraryPage } from "./pages/LibraryPage";
import { HomepagePage } from "./pages/HomepagePage";
import { CategoriesPage } from "./pages/CategoriesPage";
import { SearchPage } from "./pages/SearchPage";
import { SettingsPage } from "./pages/SettingsPage";
import { UsersPage } from "./pages/UsersPage";
import { RequestsPage } from "./pages/RequestsPage";

function RequireAuth({ children }: { children: ReactNode }) {
  if (!getToken()) return <Navigate to="/login" replace />;
  return children;
}

function NavItem({ to, end, children }: { to: string; end?: boolean; children: string }) {
  return (
    <NavLink to={to} end={end} className={({ isActive }) => (isActive ? "active" : undefined)}>
      {children}
    </NavLink>
  );
}

function Shell() {
  const navigate = useNavigate();

  return (
    <div className="adminShell">
      <aside className="adminNav">
        <div className="adminBrand">
          Pulse <span>Admin</span>
        </div>

        <div className="adminNavScroll">
          <div className="navGroup">
            <NavItem to="/" end>
              Overview
            </NavItem>
          </div>

          <div className="navGroup">
            <p className="navGroupLabel">Content</p>
            <NavItem to="/library">Library</NavItem>
            <NavItem to="/import">Import</NavItem>
          </div>

          <div className="navGroup">
            <p className="navGroupLabel">Site</p>
            <NavItem to="/homepage">Homepage</NavItem>
            <NavItem to="/categories">Categories</NavItem>
          </div>

          <div className="navGroup">
            <p className="navGroupLabel">System</p>
            <NavItem to="/requests">Requests</NavItem>
            <NavItem to="/users">Users</NavItem>
            <NavItem to="/search">Search</NavItem>
            <NavItem to="/settings">Settings</NavItem>
          </div>
        </div>

        <div className="adminNavFooter">
          <button
            type="button"
            className="btn btnGhost"
            onClick={() => {
              setToken(null);
              navigate("/login", { replace: true });
            }}
          >
            Sign out
          </button>
        </div>
      </aside>
      <main className="adminMain">
        <Outlet />
      </main>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <Shell />
          </RequireAuth>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="import" element={<ImportPage />} />
        <Route path="library" element={<LibraryPage />} />
        <Route path="homepage" element={<HomepagePage />} />
        <Route path="categories" element={<CategoriesPage />} />
        <Route path="search" element={<SearchPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="users" element={<UsersPage />} />
        <Route path="requests" element={<RequestsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
