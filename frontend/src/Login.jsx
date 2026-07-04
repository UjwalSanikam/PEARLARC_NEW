import React, { useState } from "react";
import { Shield } from "lucide-react";
import { useAuth } from "./AuthContext";

const API_BASE = "http://127.0.0.1:8000/api";

export default function Login() {
    const { login } = useAuth();
    const [mode, setMode] = useState("login"); // "login" | "register"
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
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
                body: JSON.stringify({ email, password }),
            });

            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.detail || "Something went wrong.");
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
        <div className="login-screen">
            <div className="login-card">
                <div className="login-brand">
                    <Shield size={32} />
                    <h1>CyberGuard AI</h1>
                </div>

                <form onSubmit={handleSubmit}>
                    <input
                        type="email"
                        placeholder="Email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                    />
                    <input
                        type="password"
                        placeholder="Password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        minLength={8}
                    />

                    {error && <p className="login-error">{error}</p>}

                    <button type="submit" disabled={loading}>
                        {loading ? "Please wait..." : mode === "login" ? "Log In" : "Register"}
                    </button>
                </form>

                <p className="login-toggle">
                    {mode === "login" ? "Don't have an account?" : "Already have an account?"}{" "}
                    <button
                        type="button"
                        className="link-btn"
                        onClick={() => setMode(mode === "login" ? "register" : "login")}
                    >
                        {mode === "login" ? "Register" : "Log In"}
                    </button>
                </p>
            </div>
        </div>
    );
}