import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  fetchMe,
  getStoredUser,
  logout as clearSession,
  type AuthUser,
} from "../lib/auth";
import { mergeGuestWatchlistIntoUser } from "../lib/watchlist";

type AuthContextValue = {
  user: AuthUser | null;
  ready: boolean;
  setUser: (user: AuthUser | null) => void;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<AuthUser | null>(() => getStoredUser());
  const [ready, setReady] = useState(false);

  const setUser = useCallback((next: AuthUser | null) => {
    setUserState(next);
    if (next) mergeGuestWatchlistIntoUser(next.id);
  }, []);

  const logout = useCallback(() => {
    clearSession();
    setUserState(null);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchMe()
      .then((u) => {
        if (!cancelled) setUserState(u);
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });

    const onAuth = (e: Event) => {
      const detail = (e as CustomEvent<{ user: AuthUser | null }>).detail;
      setUserState(detail?.user ?? null);
      if (detail?.user) mergeGuestWatchlistIntoUser(detail.user.id);
    };
    window.addEventListener("pulse:auth", onAuth);
    return () => {
      cancelled = true;
      window.removeEventListener("pulse:auth", onAuth);
    };
  }, []);

  const value = useMemo(
    () => ({ user, ready, setUser, logout }),
    [user, ready, setUser, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
