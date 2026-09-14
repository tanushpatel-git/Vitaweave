"use client";

import {
  createContext,
  useContext,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { api, getStoredUser, setStoredUser, setToken, type AuthUser } from "./api";

interface AuthContextValue {
  user: AuthUser | null;
  login: (email: string, password: string) => Promise<void>;
  register: (payload: Parameters<typeof api.register>[0]) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(getStoredUser());
  const router = useRouter();

  const login = async (email: string, password: string) => {
    const res = await api.login(email, password);
    setToken(res.token);
    setStoredUser(res.user);
    setUser(res.user);

    if (res.user.role === "TOP_ADMIN") {
      router.push("/admin/dashboard");
    } else if (res.user.role === "HOSPITAL_ADMIN" || res.user.role === "STAFF") {
      router.push("/hospital/dashboard");
    } else if (res.user.role === "HOD" || res.user.role === "DOCTOR") {
      router.push("/doctor/dashboard");
    } else {
      router.push("/patient/dashboard");
    }
  };

  const register = async (payload: Parameters<typeof api.register>[0]) => {
    const res = await api.register(payload);
    setToken(res.token);
    setStoredUser(res.user);
    setUser(res.user);

    if (payload.role === "DOCTOR") {
      router.push("/doctor/dashboard");
    } else {
      router.push("/patient/dashboard");
    }
  };

  const logout = () => {
    setToken(null);
    setStoredUser(null);
    setUser(null);
    router.push("/");
  };

  return (
    <AuthContext.Provider value={{ user, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
