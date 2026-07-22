import React, { useId, useMemo, useState } from "react";
import { Shield, Mail, Lock, Eye, EyeOff, Loader2, Check, X } from "lucide-react";
import { useAuth } from "./AuthContext";

const API_BASE = "http://127.0.0.1:8000/api";

const PASSWORD_RULES = [
    { id: "length", label: "8+ characters", test: (v) => v.length >= 8 },
    { id: "upper", label: "Uppercase letter", test: (v) => /[A-Z]/.test(v) },
    { id: "number", label: "Number", test: (v) => /\d/.test(v) },
    { id: "symbol", label: "Symbol", test: (v) => /[^A-Za-z0-9]/.test(v) },
];

export default function Login() {
    const { login } = useAuth();
    const [mode, setMode] = useState("login");
    const [identifier, setIdentifier] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    const identifierId = useId();
    const passwordId = useId();
    const hintId = useId();
    const errorId = useId();

    const isRegister = mode === "register";

    const passwordChecks = useMemo(
        () => PASSWORD_RULES.map((rule) => ({ ...rule, passed: rule.test(password) })),
        [password]
    );
    const passwordValid = passwordChecks.every((c) => c.passed);
    const canSubmit =
        identifier.trim().length > 0 && (!isRegister || (password.length > 0 && passwordValid)) && password.length > 0;

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError("");

        if (isRegister && !passwordValid) {
            setError("Password doesn't meet the requirements below.");
            return;
        }

        setLoading(true);
        const endpoint = isRegister ? "/auth/register" : "/auth/login";

        try {
            const res = await fetch(`${API_BASE}${endpoint}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ identifier: identifier.trim(), password }),
            });

            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                const detail = Array.isArray(data.detail)
                    ? data.detail.map((d) => d.msg).join(" ")
                    : data.detail;
                throw new Error(detail || "Something went wrong. Please try again.");
            }

            const data = await res.json();
            login(data.access_token);
        } catch (err) {
            setError(err.message || "Unable to reach the server. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="cg-screen">
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap');

                :root {
                    --cg-bg-0: #070A10;
                    --cg-bg-1: #0C121C;
                    --cg-bg-2: #101A28;
                    --cg-line: rgba(140, 190, 220, 0.12);
                    --cg-ink: #EAF1F7;
                    --cg-ink-dim: rgba(234, 241, 247, 0.68);
                    --cg-ink-faint: rgba(234, 241, 247, 0.42);
                    --cg-accent: #4CC9F0;
                    --cg-accent-strong: #7DE3FF;
                    --cg-danger: #FF7A6E;
                    --cg-danger-bg: rgba(255, 122, 110, 0.12);
                    --cg-danger-border: rgba(255, 122, 110, 0.35);
                    --cg-ok: #4CE0B3;
                    --cg-radius-lg: 18px;
                    --cg-radius-full: 999px;
                }

                * { box-sizing: border-box; }

                .cg-screen {
                    position: relative;
                    min-height: 100vh;
                    width: 100%;
                    overflow: hidden;
                    font-family: 'Inter', sans-serif;
                    background:
                        radial-gradient(circle at 18% 12%, rgba(76, 201, 240, 0.10), transparent 42%),
                        radial-gradient(circle at 82% 88%, rgba(76, 201, 240, 0.07), transparent 46%),
                        linear-gradient(180deg, var(--cg-bg-0) 0%, var(--cg-bg-1) 48%, var(--cg-bg-2) 100%);
                    color: var(--cg-ink);
                }

                .cg-grid {
                    position: absolute;
                    inset: 0;
                    background-image:
                        linear-gradient(var(--cg-line) 1px, transparent 1px),
                        linear-gradient(90deg, var(--cg-line) 1px, transparent 1px);
                    background-size: 56px 56px;
                    mask-image: radial-gradient(ellipse 80% 60% at 50% 30%, black 40%, transparent 85%);
                    pointer-events: none;
                }

                .cg-scan {
                    position: absolute;
                    left: 0;
                    right: 0;
                    height: 140px;
                    background: linear-gradient(180deg, transparent, rgba(76, 201, 240, 0.06), transparent);
                    animation: cg-scan-move 9s linear infinite;
                    pointer-events: none;
                }

                @keyframes cg-scan-move {
                    0% { transform: translateY(-160px); }
                    100% { transform: translateY(110vh); }
                }

                .cg-navbar {
                    position: relative;
                    z-index: 2;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: 24px clamp(20px, 5vw, 44px);
                }

                .cg-brand {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    color: var(--cg-ink);
                }

                .cg-brand-mark {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    width: 32px;
                    height: 32px;
                    border-radius: 9px;
                    background: rgba(76, 201, 240, 0.12);
                    border: 1px solid rgba(76, 201, 240, 0.3);
                    color: var(--cg-accent-strong);
                }

                .cg-brand-text {
                    font-family: 'Space Grotesk', sans-serif;
                    font-weight: 700;
                    font-size: 1.05rem;
                    letter-spacing: 0.01em;
                }

                .cg-tag {
                    display: flex;
                    align-items: center;
                    gap: 7px;
                    font-family: 'JetBrains Mono', monospace;
                    font-size: 0.7rem;
                    letter-spacing: 0.1em;
                    text-transform: uppercase;
                    color: var(--cg-ink-dim);
                    border: 1px solid rgba(234, 241, 247, 0.16);
                    padding: 7px 13px;
                    border-radius: var(--cg-radius-full);
                }

                .cg-tag-dot {
                    width: 6px;
                    height: 6px;
                    border-radius: 50%;
                    background: var(--cg-ok);
                    box-shadow: 0 0 8px var(--cg-ok);
                }

                .cg-center {
                    position: relative;
                    z-index: 2;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    min-height: calc(100vh - 80px);
                    padding: 24px 20px 48px;
                }

                .cg-panel {
                    width: 408px;
                    max-width: 100%;
                    background: rgba(12, 18, 28, 0.72);
                    backdrop-filter: blur(20px);
                    -webkit-backdrop-filter: blur(20px);
                    border: 1px solid rgba(234, 241, 247, 0.1);
                    border-radius: var(--cg-radius-lg);
                    padding: 36px 32px 30px;
                    box-shadow: 0 24px 70px rgba(0, 0, 0, 0.45);
                }

                .cg-title {
                    font-family: 'Space Grotesk', sans-serif;
                    font-weight: 700;
                    font-size: 1.6rem;
                    color: var(--cg-ink);
                    margin: 0 0 6px;
                }

                .cg-subtitle {
                    font-size: 0.86rem;
                    color: var(--cg-ink-dim);
                    margin: 0 0 26px;
                    line-height: 1.5;
                }

                .cg-form {
                    display: flex;
                    flex-direction: column;
                    gap: 16px;
                }

                .cg-field-group {
                    display: flex;
                    flex-direction: column;
                    gap: 7px;
                }

                .cg-label {
                    font-size: 0.78rem;
                    font-weight: 600;
                    color: var(--cg-ink-dim);
                    letter-spacing: 0.01em;
                }

                .cg-field {
                    position: relative;
                    display: flex;
                    align-items: center;
                }

                .cg-field svg.cg-icon {
                    position: absolute;
                    left: 16px;
                    color: var(--cg-ink-faint);
                    pointer-events: none;
                }

                .cg-field input {
                    width: 100%;
                    background: rgba(234, 241, 247, 0.05);
                    border: 1px solid rgba(234, 241, 247, 0.14);
                    border-radius: 12px;
                    padding: 13px 16px 13px 44px;
                    color: var(--cg-ink);
                    font-family: 'Inter', sans-serif;
                    font-size: 0.92rem;
                    outline: none;
                    transition: border-color 0.15s ease, background 0.15s ease, box-shadow 0.15s ease;
                }

                .cg-field input::placeholder {
                    color: var(--cg-ink-faint);
                }

                .cg-field input:hover {
                    border-color: rgba(234, 241, 247, 0.22);
                }

                .cg-field input:focus-visible {
                    border-color: var(--cg-accent);
                    background: rgba(234, 241, 247, 0.07);
                    box-shadow: 0 0 0 3px rgba(76, 201, 240, 0.18);
                }

                .cg-eye-btn {
                    position: absolute;
                    right: 14px;
                    background: transparent;
                    border: none;
                    color: var(--cg-ink-faint);
                    cursor: pointer;
                    display: flex;
                    padding: 6px;
                    border-radius: 8px;
                }
                .cg-eye-btn:hover { color: var(--cg-ink); background: rgba(234, 241, 247, 0.06); }
                .cg-eye-btn:focus-visible { outline: 2px solid var(--cg-accent); outline-offset: 2px; }

                .cg-checklist {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 6px 12px;
                    margin: 2px 0 0;
                    padding: 12px;
                    background: rgba(234, 241, 247, 0.03);
                    border: 1px solid rgba(234, 241, 247, 0.08);
                    border-radius: 10px;
                }

                .cg-check-item {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    font-family: 'JetBrains Mono', monospace;
                    font-size: 0.72rem;
                    color: var(--cg-ink-faint);
                    transition: color 0.15s ease;
                }

                .cg-check-item.passed { color: var(--cg-ok); }

                .cg-check-icon {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    width: 14px;
                    height: 14px;
                    border-radius: 50%;
                    border: 1px solid currentColor;
                    flex-shrink: 0;
                }

                .cg-error {
                    display: flex;
                    align-items: flex-start;
                    gap: 8px;
                    font-size: 0.82rem;
                    color: var(--cg-danger);
                    background: var(--cg-danger-bg);
                    border: 1px solid var(--cg-danger-border);
                    border-radius: 10px;
                    padding: 11px 14px;
                    margin: 0;
                    line-height: 1.4;
                }

                .cg-submit {
                    margin-top: 6px;
                    width: 100%;
                    padding: 14px;
                    border-radius: 12px;
                    border: none;
                    background: var(--cg-accent);
                    color: #071018;
                    font-family: 'Space Grotesk', sans-serif;
                    font-weight: 700;
                    font-size: 0.94rem;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 8px;
                    transition: transform 0.1s ease, background 0.15s ease, box-shadow 0.15s ease;
                }
                .cg-submit:hover:not(:disabled) { background: var(--cg-accent-strong); box-shadow: 0 8px 24px rgba(76, 201, 240, 0.25); }
                .cg-submit:active:not(:disabled) { transform: scale(0.985); }
                .cg-submit:focus-visible { outline: 2px solid var(--cg-ink); outline-offset: 3px; }
                .cg-submit:disabled { opacity: 0.45; cursor: not-allowed; box-shadow: none; }

                .cg-spin {
                    animation: cg-spin 0.8s linear infinite;
                }
                @keyframes cg-spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }

                .cg-switch {
                    text-align: center;
                    font-size: 0.83rem;
                    color: var(--cg-ink-dim);
                    margin: 20px 0 0;
                }

                .cg-switch button {
                    background: none;
                    border: none;
                    color: var(--cg-accent-strong);
                    font-weight: 600;
                    cursor: pointer;
                    padding: 2px;
                    font-size: 0.83rem;
                    border-radius: 4px;
                }
                .cg-switch button:hover { text-decoration: underline; }
                .cg-switch button:focus-visible { outline: 2px solid var(--cg-accent); outline-offset: 2px; }

                @media (prefers-reduced-motion: reduce) {
                    .cg-scan { animation: none; display: none; }
                    .cg-spin { animation-duration: 1.4s; }
                }

                @media (max-width: 420px) {
                    .cg-panel { padding: 28px 22px 24px; border-radius: 14px; }
                    .cg-checklist { grid-template-columns: 1fr; }
                }
            `}</style>

            <div className="cg-grid" aria-hidden="true" />
            <div className="cg-scan" aria-hidden="true" />

            <div className="cg-navbar">
                <div className="cg-brand">
                    <span className="cg-brand-mark">
                        <Shield size={17} strokeWidth={2.4} />
                    </span>
                    <span className="cg-brand-text">CyberGuard AI</span>
                </div>
                <span className="cg-tag">
                    <span className="cg-tag-dot" aria-hidden="true" />
                    Encrypted session
                </span>
            </div>

            <main className="cg-center">
                <div className="cg-panel">
                    <h1 className="cg-title">{isRegister ? "Create your account" : "Welcome back"}</h1>
                    <p className="cg-subtitle">
                        {isRegister
                            ? "Set up secure access to your CyberGuard AI workspace."
                            : "Sign in to continue to your CyberGuard AI workspace."}
                    </p>

                    <form className="cg-form" onSubmit={handleSubmit} noValidate>
                        <div className="cg-field-group">
                            <label className="cg-label" htmlFor={identifierId}>Email or phone number</label>
                            <div className="cg-field">
                                <Mail size={16} className="cg-icon" aria-hidden="true" />
                                <input
                                    id={identifierId}
                                    type="text"
                                    placeholder="you@company.com"
                                    value={identifier}
                                    onChange={(e) => setIdentifier(e.target.value)}
                                    autoComplete={isRegister ? "username" : "email"}
                                    required
                                />
                            </div>
                        </div>

                        <div className="cg-field-group">
                            <label className="cg-label" htmlFor={passwordId}>Password</label>
                            <div className="cg-field">
                                <Lock size={16} className="cg-icon" aria-hidden="true" />
                                <input
                                    id={passwordId}
                                    type={showPassword ? "text" : "password"}
                                    placeholder="••••••••"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    autoComplete={isRegister ? "new-password" : "current-password"}
                                    aria-describedby={isRegister ? hintId : undefined}
                                    required
                                    minLength={isRegister ? 8 : undefined}
                                    style={{ paddingRight: "44px" }}
                                />
                                <button
                                    type="button"
                                    className="cg-eye-btn"
                                    onClick={() => setShowPassword((s) => !s)}
                                    aria-label={showPassword ? "Hide password" : "Show password"}
                                >
                                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                </button>
                            </div>

                            {isRegister && (
                                <div className="cg-checklist" id={hintId}>
                                    {passwordChecks.map((rule) => (
                                        <span
                                            key={rule.id}
                                            className={`cg-check-item${rule.passed ? " passed" : ""}`}
                                        >
                                            <span className="cg-check-icon" aria-hidden="true">
                                                {rule.passed ? <Check size={9} strokeWidth={3} /> : <X size={9} strokeWidth={3} />}
                                            </span>
                                            {rule.label}
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>

                        {error && (
                            <p className="cg-error" role="alert" id={errorId}>
                                {error}
                            </p>
                        )}

                        <button type="submit" className="cg-submit" disabled={loading || !canSubmit}>
                            {loading && <Loader2 size={16} className="cg-spin" />}
                            {loading ? "Please wait…" : isRegister ? "Create account" : "Log in"}
                        </button>
                    </form>

                    <p className="cg-switch">
                        {isRegister ? "Already have an account? " : "Don't have an account? "}
                        <button
                            type="button"
                            onClick={() => {
                                setMode(isRegister ? "login" : "register");
                                setError("");
                            }}
                        >
                            {isRegister ? "Log in" : "Register"}
                        </button>
                    </p>
                </div>
            </main>
        </div>
    );
}
