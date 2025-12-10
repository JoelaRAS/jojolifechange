import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";

export type User = {
  id: string;
  email: string;
  name: string;
};

type AuthContextValue = {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const storedToken = window.localStorage.getItem("lifeos-token");
    const storedUser = window.localStorage.getItem("lifeos-user");
    if (storedToken && storedUser) {
      try {
        const parsedUser = JSON.parse(storedUser);
        setToken(storedToken);
        setUser(parsedUser);
      } catch (error) {
        console.warn("[LifeOS] Unable to parse stored user; clearing session.", error);
        window.localStorage.removeItem("lifeos-token");
        window.localStorage.removeItem("lifeos-user");
      }
    }
    setLoading(false);
  }, []);

  const login = async (email: string, password: string) => {
    const { data } = await api.post("/auth/login", { email, password });
    setToken(data.token);
    setUser(data.user);
    window.localStorage.setItem("lifeos-token", data.token);
    window.localStorage.setItem("lifeos-user", JSON.stringify(data.user));
  };

  const register = async (name: string, email: string, password: string) => {
    const { data } = await api.post("/auth/register", { name, email, password });
    setToken(data.token);
    setUser(data.user);
    window.localStorage.setItem("lifeos-token", data.token);
    window.localStorage.setItem("lifeos-user", JSON.stringify(data.user));
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    window.localStorage.removeItem("lifeos-token");
    window.localStorage.removeItem("lifeos-user");
  };

  const value = useMemo(
    () => ({
      user,
      token,
      loading,
      login,
      register,
      logout
    }),
    [user, token, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
};
