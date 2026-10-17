import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, type ReactNode } from "react";
import { api } from "@/lib/api-client";

export type AuthUser = { id: string; email: string; display_name?: string | null; created_at?: string | null; preview?: boolean };
export const meKey = ["auth", "me"] as const;
export const initialsOf = (name: string) =>
  name.split(/[\s._-]+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "?";
export const displayNameOf = (u: AuthUser | null) => u?.display_name?.trim() || u?.email.split("@")[0] || "";

export function AuthProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export function useAuth() {
  const qc = useQueryClient();
  const me = useQuery({
    queryKey: meKey,
    queryFn: () => api<{ user: AuthUser | null }>("/api/auth/me"),
    staleTime: 60_000,
    retry: false,
  });

  const setUser = useCallback(
    (user: AuthUser | null) => {
      qc.clear();
      qc.setQueryData(meKey, { user });
    },
    [qc],
  );

  const signIn = useCallback(
    async (email: string, password: string, mode: "signin" | "signup" = "signin") => {
      const { user } = await api<{ user: AuthUser }>(mode === "signin" ? "/api/auth/login" : "/api/auth/signup", {
        method: "POST",
        body: { email, password },
      });
      setUser(user);
    },
    [setUser],
  );

  const signOut = useCallback(async () => {
    await api("/api/auth/logout", { method: "POST" }).catch(() => {});
    setUser(null);
  }, [setUser]);

  return {
    user: me.data?.user ?? null,
    loading: me.isPending,
    error: me.error,
    retry: me.refetch,
    signIn,
    signOut,
  };
}
