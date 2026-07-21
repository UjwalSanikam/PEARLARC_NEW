import React, { useState } from "react";
import { Shield, Mail, Lock, Eye, EyeOff, Loader2 } from "lucide-react";
import { useAuth } from "./AuthContext";

const API_BASE = "http://127.0.0.1:8000/api";

export default function Login() {
    const { login } = useAuth();
    const [mode, setMode] = useState("login");
    const [identifier, setIdentifier] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError("");
        setLoading(true);

        const endpoint = mode === "login" ? "/auth/login" : "/auth/register";

        try {
            const res = await fetch(`${API_BASE}${endpoint}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ identifier, password }),
            });

            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                const detail = Array.isArray(data.detail)
                    ? data.detail.map((d) => d.msg).join(" ")
                    : data.detail;
                throw new Error(detail || "Something went wrong.");
            }

            const data = await res.json();
            login(data.access_token);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="cg2-screen">
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap');

                .cg2-screen {
                    position: relative;
                    min-height: 100vh;
                    width: 100%;
                    overflow: hidden;
                    font-family: 'Inter', sans-serif;
                    background: linear-gradient(180deg,
                        #1B1035 0%,
                        #3B1F4E 22%,
                        #7A3B54 42%,
                        #C9714F 58%,
                        #E8A15C 68%,
                        #0E1420 100%
                    );
                }

                .cg2-nodes {
                    position: absolute;
                    inset: 0;
                    background-image: radial-gradient(rgba(255,255,255,0.35) 1px, transparent 1.5px);
                    background-size: 46px 46px;
                    opacity: 0.15;
                    pointer-events: none;
                }

                .cg2-skyline {
                    position: absolute;
                    bottom: 0;
                    left: 0;
                    width: 100%;
                    height: 46%;
                    pointer-events: none;
                }

                .cg2-navbar {
                    position: relative;
                    z-index: 2;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: 22px 40px;
                }

                .cg2-brand {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    color: #F4F1EA;
                }

                .cg2-brand-text {
                    font-family: 'Space Grotesk', sans-serif;
                    font-weight: 700;
                    font-size: 1.05rem;
                    letter-spacing: 0.01em;
                }

                .cg2-tag {
                    font-family: 'JetBrains Mono', monospace;
                    font-size: 0.7rem;
                    letter-spacing: 0.14em;
                    text-transform: uppercase;
                    color: rgba(244, 241, 234, 0.75);
                    border: 1px solid rgba(244, 241, 234, 0.25);
                    padding: 6px 12px;
                    border-radius: 999px;
                }

                .cg2-center {
                    position: relative;
                    z-index: 2;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    min-height: calc(100vh - 78px);
                    padding: 20px;
                }

                .cg2-panel {
                    width: 400px;
                    max-width: 100%;
                    background: rgba(20, 22, 30, 0.42);
                    backdrop-filter: blur(18px);
                    -webkit-backdrop-filter: blur(18px);
                    border: 1px solid rgba(255, 255, 255, 0.14);
                    border-radius: 22px;
                    padding: 34px 30px 28px;
                    box-shadow: 0 20px 60px rgba(0,0,0,0.35);
                }

                .cg2-switch {
                    text-align: center;
                    font-size: 0.82rem;
                    color: rgba(244, 241, 234, 0.75);
                    margin-bottom: 18px;
                }

                .cg2-switch button {
                    background: none;
                    border: none;
                    color: #F4A261;
                    font-weight: 600;
                    text-decoration: underline;
                    cursor: pointer;
                    padding: 0;
                    font-size: 0.82rem;
                }

                .cg2-title {
                    font-family: 'Space Grotesk', sans-serif;
                    font-weight: 700;
                    font-size: 1.7rem;
                    color: #F4F1EA;
                    text-align: center;
                    margin: 0 0 24px;
                }

                .cg2-form {
                    display: flex;
                    flex-direction: column;
                    gap: 13px;
                }

                .cg2-field {
                    position: relative;
                    display: flex;
                    align-items: center;
                }

                .cg2-field svg.cg2-icon {
                    position: absolute;
                    left: 18px;
                    color: rgba(244, 241, 234, 0.55);
                    pointer-events: none;
                }

                .cg2-field input {
                    width: 100%;
                    background: rgba(255, 255, 255, 0.08);
                    border: 1px solid rgba(255, 255, 255, 0.16);
                    border-radius: 999px;
                    padding: 14px 16px 14px 46px;
                    color: #F4F1EA;
                    font-family: 'Inter', sans-serif;
                    font-size: 0.9rem;
                    outline: none;
                    box-sizing: border-box;
                    transition: border-color 0.15s ease, background 0.15s ease;
                }

                .cg2-field input::placeholder {
                    color: rgba(244, 241, 234, 0.45);
                }

                .cg2-field input:focus {
                    border-color: #F4A261;
                    background: rgba(255, 255, 255, 0.12);
                }

                .cg2-eye-btn {
                    position: absolute;
                    right: 18px;
                    background: transparent;
                    border: none;
                    color: rgba(244, 241, 234, 0.55);
                    cursor: pointer;
                    display: flex;
                }
                .cg2-eye-btn:hover { color: #F4F1EA; }

                .cg2-hint {
                    font-family: 'JetBrains Mono', monospace;
                    font-size: 0.7rem;
                    color: rgba(244, 241, 234, 0.55);
                    margin: -3px 0 0 18px;
                }

                .cg2-error {
                    font-size: 0.8rem;
                    color: #FFD6BA;
                    background: rgba(244, 100, 60, 0.18);
                    border: 1px solid rgba(244, 100, 60, 0.35);
                    border-radius: 12px;
                    padding: 9px 14px;
                    margin: 0;
                }

                .cg2-submit {
                    margin-top: 6px;
                    width: 100%;
                    padding: 14px;
                    border-radius: 999px;
                    border: none;
                    background: #F4F1EA;
                    color: #1B1035;
                    font-family: 'Space Grotesk', sans-serif;
                    font-weight: 700;
                    font-size: 0.95rem;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 8px;
                    transition: transform 0.1s ease, background 0.15s ease;
                }
                .cg2-submit:hover:not(:disabled) { background: #FFFFFF; }
                .cg2-submit:active:not(:disabled) { transform: scale(0.985); }
                .cg2-submit:disabled { opacity: 0.6; cursor: not-allowed; }
            `}</style>

            <div className="cg2-nodes" />

            <svg className="cg2-skyline" viewBox="0 0 1200 320" preserveAspectRatio="none">
                <defs>
                    <linearGradient id="cg2-fade" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#0E1420" stopOpacity="0.55" />
                        <stop offset="100%" stopColor="#0E1420" stopOpacity="0.98" />
                    </linearGradient>
                </defs>
                <path
                    fill="url(#cg2-fade)"
                    d="M0,320 L0,180 L60,180 L60,140 L90,140 L90,200 L140,200 L140,120 L160,120 L160,60 L180,60 L180,120 L210,120 L210,190 L260,190 L260,150 L300,150 L300,210 L340,210 L340,100 L360,100 L360,40 L380,40 L380,100 L400,100 L400,210 L460,210 L460,170 L500,170 L500,220 L560,220 L560,90 L580,90 L580,30 L600,30 L600,90 L620,90 L620,220 L680,220 L680,160 L720,160 L720,200 L780,200 L780,110 L800,110 L800,50 L820,50 L820,110 L840,110 L840,200 L900,200 L900,150 L950,150 L950,230 L1010,230 L1010,170 L1050,170 L1050,120 L1080,120 L1080,60 L1100,60 L1100,120 L1120,120 L1120,230 L1200,230 L1200,320 Z"
                />
                <g stroke="rgba(76,201,240,0.35)" strokeWidth="1">
                    <line x1="90" y1="140" x2="90" y2="200" />
                    <line x1="160" y1="60" x2="160" y2="120" />
                    <line x1="360" y1="40" x2="360" y2="100" />
                    <line x1="580" y1="30" x2="580" y2="90" />
                    <line x1="800" y1="50" x2="800" y2="110" />
                    <line x1="1080" y1="60" x2="1080" y2="120" />
                </g>
                <g fill="#F4A261" opacity="0.9">
                    <circle cx="160" cy="60" r="2.5" />
                    <circle cx="360" cy="40" r="2.5" />
                    <circle cx="580" cy="30" r="2.5" />
                    <circle cx="800" cy="50" r="2.5" />
                    <circle cx="1080" cy="60" r="2.5" />
                </g>
            </svg>

            <div className="cg2-navbar">
                <div className="cg2-brand">
                    <Shield size={22} />
                    <span className="cg2-brand-text">CyberGuard AI</span>
                </div>
                <span className="cg2-tag">Secure Access</span>
            </div>

            <div className="cg2-center">
                <div className="cg2-panel">
                    <p className="cg2-switch">
                        {mode === "login" ? "Don't have an account? " : "Already have an account? "}
                        <button
                            type="button"
                            onClick={() => setMode(mode === "login" ? "register" : "login")}
                        >
                            {mode === "login" ? "Register" : "Log In"}
                        </button>
                    </p>

                    <h1 className="cg2-title">
                        {mode === "login" ? "Log In" : "Sign Up"}
                    </h1>

                    <form className="cg2-form" onSubmit={handleSubmit}>
                        <div className="cg2-field">
                            <Mail size={16} className="cg2-icon" />
                            <input
                                type="text"
                                placeholder="Email or phone number"
                                value={identifier}
                                onChange={(e) => setIdentifier(e.target.value)}
                                required
                            />
                        </div>

                        <div className="cg2-field">
                            <Lock size={16} className="cg2-icon" />
                            <input
                                type={showPassword ? "text" : "password"}
                                placeholder="Password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                                minLength={8}
                                style={{ paddingRight: "44px" }}
                            />
                            <button
                                type="button"
                                className="cg2-eye-btn"
                                onClick={() => setShowPassword((s) => !s)}
                                aria-label={showPassword ? "Hide password" : "Show password"}
                            >
                                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                            </button>
                        </div>

                        {mode === "register" && (
                            <p className="cg2-hint">8+ characters · uppercase · number · symbol</p>
                        )}

                        {error && <p className="cg2-error">{error}</p>}

                        <button type="submit" className="cg2-submit" disabled={loading}>
                            {loading && <Loader2 size={16} className="spin" />}
                            {loading ? "Please wait..." : mode === "login" ? "Log In" : "Register"}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
}