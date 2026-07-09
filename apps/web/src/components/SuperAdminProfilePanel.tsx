import { useEffect, useState } from "react";

import {
  getSuperAdminEmergencyProfile,
} from "../services/emergency-alert.service";
import type { SuperAdminEmergencyProfile } from "../types/emergency-alert";

interface SuperAdminProfilePanelProps {
  accessToken: string;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Unable to load Super Admin official profile.";
}

function getSourceLabel(profile: SuperAdminEmergencyProfile): string {
  if (profile.source === "SYSTEM_CONFIG") {
    return "System configuration";
  }

  if (profile.source === "DATABASE_SETUP") {
    return "Database setup record";
  }

  return "Account fallback";
}

function getStatusClass(profile: SuperAdminEmergencyProfile): string {
  return profile.profileStatus === "READY"
    ? "super-admin-profile-success"
    : "super-admin-profile-error";
}

export function SuperAdminProfilePanel({
  accessToken,
}: SuperAdminProfilePanelProps) {
  const [profile, setProfile] =
    useState<SuperAdminEmergencyProfile | null>(null);

  const [loading, setLoading] =
    useState(false);

  const [error, setError] =
    useState("");

  useEffect(() => {
    let active = true;

    setLoading(true);
    setError("");

    // Official identity is display-only so nobody can impersonate another account.
    getSuperAdminEmergencyProfile(accessToken)
      .then((response) => {
        if (active) {
          setProfile(response.data);
        }
      })
      .catch((loadError: unknown) => {
        if (active) {
          setProfile(null);
          setError(getErrorMessage(loadError));
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [
    accessToken,
  ]);

  return (
    <section className="super-admin-profile-panel">
      <header>
        <div>
          <span className="admin-eyebrow">
            Super Admin Profile
          </span>

          <h1>
            Official contact profile
          </h1>

          <p>
            Super Admin identity is fixed from system setup and cannot be
            changed from the dashboard.
          </p>
        </div>
      </header>

      <div className="super-admin-profile-card">
        <div className="super-admin-profile-copy">
          <span>
            Read-only emergency identity
          </span>

          <p>
            These details are used only when another user selects Super Admin as
            the emergency recipient. Phone and email must stay unique for future
            SMS OTP login.
          </p>
        </div>

        {loading && (
          <p className="super-admin-profile-muted">
            Loading official Super Admin profile...
          </p>
        )}

        {error && (
          <p className="super-admin-profile-error">
            {error}
          </p>
        )}

        {profile && (
          <>
            <div className="super-admin-profile-readonly-grid">
              <div className="super-admin-profile-readonly-item">
                <span>Name</span>
                <strong>{profile.fullName}</strong>
              </div>

              <div className="super-admin-profile-readonly-item">
                <span>Email ID</span>
                <strong>{profile.email ?? "Not configured"}</strong>
              </div>

              <div className="super-admin-profile-readonly-item">
                <span>Phone number</span>
                <strong>{profile.phoneNumber ?? "Not configured"}</strong>
              </div>

              <div className="super-admin-profile-readonly-item">
                <span>Source</span>
                <strong>{getSourceLabel(profile)}</strong>
              </div>
            </div>

            <p className={getStatusClass(profile)}>
              {profile.statusMessage}
            </p>
          </>
        )}
      </div>
    </section>
  );
}
