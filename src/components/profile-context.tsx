import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { ensureProfile } from "@/lib/nestora/functions";
import type { Profile } from "@/lib/nestora/data.server";

type State = {
  profile: Profile | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
};

const Ctx = createContext<State>({
  profile: null,
  loading: false,
  error: null,
  reload: () => {},
});

export function ProfileProvider({ children }: { children: ReactNode }) {
  const { user, isPending } = useCurrentUserState();
  const userId = user?.id;
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (isPending) return;
    if (!userId) {
      setProfile(null);
      setLoading(false);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    ensureProfile()
      .then((next) => {
        if (!cancelled) {
          setProfile(next);
          setError(null);
        }
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "Could not load your account.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, isPending, tick]);

  return (
    <Ctx.Provider value={{ profile, loading: isPending || loading, error, reload: () => setTick((value) => value + 1) }}>
      {children}
    </Ctx.Provider>
  );
}

export function useProfile() {
  return useContext(Ctx);
}
