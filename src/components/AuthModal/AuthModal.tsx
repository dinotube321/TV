import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { login, signup } from "../../lib/auth";
import { useAuth } from "../../hooks/useAuth";
import { AppleTvLogo } from "../Icons";
import styles from "./AuthModal.module.css";

type Mode = "signin" | "signup";

type Props = {
  open: boolean;
  onClose: () => void;
  initialMode?: Mode;
};

export function AuthModal({ open, onClose, initialMode = "signin" }: Props) {
  const { setUser } = useAuth();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [userId, setUserId] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const userFieldRef = useRef<HTMLInputElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    setMode(initialMode);
    setError("");
    setPassword("");
    setConfirm("");
    const t = window.setTimeout(() => userFieldRef.current?.focus(), 50);
    return () => window.clearTimeout(t);
  }, [open, initialMode]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (mode === "signup" && password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      const user =
        mode === "signup"
          ? await signup(userId.trim(), password)
          : await login(userId.trim(), password);
      setUser(user);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.root} role="presentation">
      <button
        type="button"
        className={styles.backdrop}
        aria-label="Close"
        onClick={onClose}
      />
      <div
        className={styles.sheet}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <button
          type="button"
          className={styles.close}
          aria-label="Close"
          onClick={onClose}
        >
          <span aria-hidden>×</span>
        </button>

        <div className={styles.mark} aria-hidden>
          <AppleTvLogo size={40} />
        </div>

        <h2 id={titleId} className={styles.title}>
          {mode === "signin" ? "Sign In" : "Create Account"}
        </h2>
        <p className={styles.sub}>
          {mode === "signin"
            ? "Sign in with your Pulse user ID and password."
              : "Choose a user ID and password (8+ characters). No email required."}
        </p>

        <form className={styles.form} onSubmit={onSubmit}>
          <label className={styles.field}>
            <span className={styles.label}>User ID</span>
            <input
              ref={userFieldRef}
              className={styles.input}
              autoComplete="username"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              placeholder="your_id"
                  required
                  minLength={8}
                  maxLength={32}
                  pattern="[A-Za-z0-9_]{3,32}"
                  title="3–32 letters, numbers, or underscore"
                />
              </label>

              <label className={styles.field}>
                <span className={styles.label}>Password</span>
                <input
                  className={styles.input}
                  type="password"
                  autoComplete={
                    mode === "signin" ? "current-password" : "new-password"
                  }
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  minLength={8}
                />
              </label>

              {mode === "signup" ? (
                <label className={styles.field}>
                  <span className={styles.label}>Confirm Password</span>
                  <input
                    className={styles.input}
                    type="password"
                    autoComplete="new-password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder="••••••••"
                    required
                    minLength={8}
                  />
                </label>
              ) : null}

          {error ? <p className={styles.error}>{error}</p> : null}

          <button
            type="submit"
            className={styles.continue}
            disabled={loading}
          >
            {loading
              ? mode === "signin"
                ? "Signing In…"
                : "Creating…"
              : "Continue"}
          </button>
        </form>

        <p className={styles.footer}>
          {mode === "signin" ? (
            <>
              Don’t have an account?{" "}
              <button
                type="button"
                className={styles.link}
                onClick={() => {
                  setMode("signup");
                  setError("");
                }}
              >
                Create one
              </button>
            </>
          ) : (
            <>
              Already have an account?{" "}
              <button
                type="button"
                className={styles.link}
                onClick={() => {
                  setMode("signin");
                  setError("");
                }}
              >
                Sign In
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
