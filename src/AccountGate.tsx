import { useEffect, useState } from "react";
import CharacterPicker from "./CharacterPicker";
import type { CharacterId } from "../shared/avatars";
import { useAccess } from "./Access";
export type Player = {
  id: string;
  name: string;
  outfit: string;
  avatar?: CharacterId;
  points: number;
  email: string;
};
export async function accountApi<T>(route: string, body: unknown): Promise<T> {
  const response = await fetch("/api/auth/" + route, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Please try again.");
  return result;
}
export function AccountGate({
  loading,
  outfit,
  avatar = "amani",
  onAvatar,
  onOutfit,
  onAuthenticated,
}: {
  loading: boolean;
  outfit: string;
  avatar?: CharacterId;
  onAvatar?: (value: CharacterId) => void;
  onOutfit: (outfit: string) => void;
  onAuthenticated: (player: Player) => void;
}) {
  const { t } = useAccess();
  const [mode, setMode] = useState<"signup" | "password" | "email-code">(
    "signup",
  );
  const [name, setName] = useState(""),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [code, setCode] = useState("");
  const [challenge, setChallenge] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [cooldown, setCooldown] = useState(0);
  useEffect(() => {
    if (!cooldown) return;
    const timer = setTimeout(() => setCooldown(cooldown - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);
  function switchMode(next: typeof mode) {
    setMode(next);
    setChallenge("");
    setCode("");
    setPassword("");
    setError("");
  }
  async function sendCode() {
    const result = await accountApi<{
      challengeId: string;
    }>(
      mode === "signup" ? "signup" : "code",
      mode === "signup" ? { name, email, password, outfit, avatar } : { email },
    );
    setChallenge(result.challengeId);
    setCode("");
    setCooldown(60);
  }
  async function run(work: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="modal welcome account-gate"
      aria-label={t("Create your explorer")}
    >
      <span className="eyebrow">YOUR AMAMIHE ACCOUNT</span>
      <h2>
        {challenge
          ? t("Check your email.")
          : mode === "signup"
            ? t("Create your explorer.")
            : t("Welcome back.")}
      </h2>
      <p>
        {challenge
          ? `Enter the six-digit code sent to ${email}. It expires in 10 minutes. Check spam too.`
          : mode === "signup"
            ? t(
                "Verify your email to save your identity and progress across devices.",
              )
            : t("Sign in to continue your learning journey.")}
      </p>
      {loading ? (
        <p>{t("Restoring your journey\u2026")}</p>
      ) : (
        <>
          <div className="account-tabs">
            <button
              type="button"
              aria-pressed={mode === "signup"}
              disabled={busy}
              onClick={() => switchMode("signup")}
            >
              {t("Create account")}
            </button>
            <button
              type="button"
              aria-pressed={mode !== "signup"}
              disabled={busy}
              onClick={() => switchMode("password")}
            >
              {t("Sign in")}
            </button>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                if (challenge) {
                  const result = await accountApi<{
                    player: Player;
                  }>("verify", { challengeId: challenge, code });
                  setPassword("");
                  onAuthenticated(result.player);
                } else if (mode === "password") {
                  const result = await accountApi<{
                    player: Player;
                  }>("login", {
                    email,
                    password,
                  });
                  setPassword("");
                  onAuthenticated(result.player);
                } else await sendCode();
              });
            }}
          >
            {challenge ? (
              <>
                <label>
                  {t("Verification code")}
                  <input
                    aria-label={t("Verification code")}
                    value={code}
                    onChange={(e) =>
                      setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                    }
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    required
                    autoFocus
                  />
                </label>
                <button className="primary" disabled={busy}>
                  {busy
                    ? t("Verifying\u2026")
                    : mode === "signup"
                      ? t("Verify email & enter")
                      : t("Verify code & sign in")}
                </button>
                <button
                  type="button"
                  className="account-link"
                  disabled={busy || cooldown > 0}
                  onClick={() => void run(sendCode)}
                >
                  {cooldown ? `Resend code in ${cooldown}s` : t("Resend code")}
                </button>
                <button
                  type="button"
                  className="account-link"
                  disabled={busy}
                  onClick={() => {
                    setChallenge("");
                    setCode("");
                  }}
                >
                  {t("Change email or details")}
                </button>
              </>
            ) : (
              <>
                {mode === "signup" && (
                  <label>
                    {t("Your explorer name")}
                    <input
                      aria-label={t("Your explorer name")}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      minLength={2}
                      maxLength={24}
                      autoComplete="name"
                      required
                    />
                  </label>
                )}
                <label>
                  {t("Email address")}
                  <input
                    aria-label={t("Email address")}
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    maxLength={254}
                    required
                  />
                </label>
                {mode !== "email-code" && (
                  <label>
                    {t("Password")}
                    <input
                      aria-label={t("Password")}
                      type="password"
                      autoComplete={
                        mode === "signup" ? "new-password" : "current-password"
                      }
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      minLength={mode === "signup" ? 12 : 1}
                      maxLength={128}
                      required
                    />
                    {mode === "signup" && (
                      <small>{t("At least 12 characters.")}</small>
                    )}
                  </label>
                )}
                {mode === "signup" && (
                  <>
                    {onAvatar && (
                      <CharacterPicker
                        value={avatar}
                        onChange={onAvatar}
                        disabled={busy}
                      />
                    )}
                    <label>
                      {t("Starter outfit")}
                      <span className="free-label">{t("FREE")}</span>
                    </label>
                    <div className="outfits">
                      {["terracotta", "teal", "gold"].map((color) => (
                        <button
                          key={color}
                          aria-label={color + " outfit"}
                          aria-pressed={outfit === color}
                          className={
                            "outfit " +
                            color +
                            (outfit === color ? " selected" : "")
                          }
                          type="button"
                          onClick={() => onOutfit(color)}
                        >
                          <img
                            src={"/assets/outfit-" + color + ".png"}
                            alt=""
                          />
                          <span className="outfit-name">{color}</span>
                        </button>
                      ))}
                    </div>
                  </>
                )}
                <button className="primary" disabled={busy}>
                  {busy
                    ? t("Please wait\u2026")
                    : mode === "signup"
                      ? t("Send verification code")
                      : mode === "password"
                        ? t("Sign in & enter")
                        : t("Send login code")}
                </button>
                {mode !== "signup" && (
                  <button
                    type="button"
                    className="account-link"
                    disabled={busy}
                    onClick={() =>
                      switchMode(
                        mode === "password" ? "email-code" : "password",
                      )
                    }
                  >
                    {mode === "password"
                      ? t("Forgot password? Use an email code")
                      : t("Use my password instead")}
                  </button>
                )}
              </>
            )}
            {error && (
              <p className="account-error" role="alert">
                {error}
              </p>
            )}
          </form>
        </>
      )}
    </section>
  );
}
export function AccountControls({
  player,
  onLogout,
}: {
  player: Player;
  onLogout: () => void;
}) {
  const { t } = useAccess();
  const [open, setOpen] = useState(false),
    [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  async function run(work: () => Promise<void>) {
    setBusy(true);
    setMessage("");
    try {
      await work();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <button
        className="account-menu-button"
        aria-label={t("Account settings")}
        onClick={() => setOpen(true)}
      >
        ⚙
      </button>
      {open && (
        <div className="modal-backdrop account-settings">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="account-title"
          >
            <button
              className="close"
              aria-label="Close account settings"
              onClick={() => setOpen(false)}
            >
              ×
            </button>
            <h2 id="account-title">{t("Your account")}</h2>
            <p>{player.name}</p>
            <p className="account-email">{player.email}</p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void run(async () => {
                  await accountApi("password", { password });
                  setPassword("");
                  setMessage(
                    "Password updated. Other devices have been signed out.",
                  );
                });
              }}
            >
              <label>
                {t("New password")}
                <input
                  aria-label={t("New password")}
                  type="password"
                  autoComplete="new-password"
                  minLength={12}
                  maxLength={128}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
              <button className="primary" disabled={busy}>
                {t("Update password")}
              </button>
            </form>
            <button
              className="account-link"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await accountApi("logout", {});
                  onLogout();
                })
              }
            >
              {t("Sign out")}
            </button>
            {message && <p role="status">{message}</p>}
          </section>
        </div>
      )}
    </>
  );
}
