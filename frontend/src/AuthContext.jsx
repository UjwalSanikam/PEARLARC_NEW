import React, { createContext, useContext, useState, useCallback, useEffect } from "react";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    const [token, setToken] = useState(() => localStorage.getItem("cyberguard_token"));
    const [isChecking, setIsChecking] = useState(true);

    const login = useCallback((newToken) => {
        localStorage.setItem("cyberguard_token", newToken);
        setToken(newToken);
    }, []);

    const logout = useCallback(() => {
        localStorage.removeItem("cyberguard_token");
        setToken(null);
    }, []);

    useEffect(() => {
        const verifyToken = async () => {
            if (!token) {
                setIsChecking(false);
                return;
            }
            try {
                const res = await fetch("http://127.0.0.1:8000/api/chats", {
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (!res.ok) {
                    localStorage.removeItem("cyberguard_token");
                    setToken(null);
                }
            } catch {
                // network/backend unreachable — leave token as-is
            } finally {
                setIsChecking(false);
            }
        };
        verifyToken();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <AuthContext.Provider value={{ token, login, logout, isAuthenticated: !!token, isChecking }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    return useContext(AuthContext);
}