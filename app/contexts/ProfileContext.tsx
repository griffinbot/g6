import { createContext, useContext, type ReactNode } from "react";
import { useProfile } from "../hooks/useProfile";
import { useSession } from "../hooks/useSession";
import type { UserPreferences } from "../../shared/contracts";
import { DEFAULT_GO_NO_GO_THRESHOLDS } from "../../shared/contracts";

interface ProfileContextValue {
  preferences: UserPreferences;
  savePreferences: (prefs: UserPreferences) => Promise<void>;
}

const ProfileContext = createContext<ProfileContextValue | null>(null);

export function ProfileProvider({ children }: { children: ReactNode }) {
  const { data: session } = useSession();
  const isAuthenticated = session?.authenticated ?? false;
  const { profile, savePreferences } = useProfile(isAuthenticated);

  const preferences: UserPreferences = {
    ...profile.preferences,
    goNoGoThresholds: profile.preferences.goNoGoThresholds ?? DEFAULT_GO_NO_GO_THRESHOLDS,
  };

  return (
    <ProfileContext.Provider value={{ preferences, savePreferences }}>
      {children}
    </ProfileContext.Provider>
  );
}

export function useProfileContext(): ProfileContextValue {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error("useProfileContext must be used inside ProfileProvider");
  return ctx;
}
