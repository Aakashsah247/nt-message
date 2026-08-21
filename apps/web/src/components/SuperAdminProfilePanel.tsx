import {
  useEffect,
  useRef,
  useState,
} from "react";

import { ProtectedAvatar } from "./ProtectedAvatar";
import { useAuth } from "../context/AuthContext";
import {
  getSuperAdminEmergencyProfile,
} from "../services/emergency-alert.service";
import type {
  SuperAdminEmergencyProfile,
  SuperAdminProfileStatus,
} from "../types/emergency-alert";

interface SuperAdminProfilePanelProps {
  accessToken: string;
}

type CopyField = "email" | "phone";

type OfficialProfileIconName =
  | "alert"
  | "check"
  | "copy"
  | "email"
  | "lock"
  | "phone"
  | "settings"
  | "shield";

interface OfficialProfileIconProps {
  name: OfficialProfileIconName;
}

function OfficialProfileIcon({
  name,
}: OfficialProfileIconProps) {
  const commonProps = {
    "aria-hidden": true,
    fill: "none",
    viewBox: "0 0 24 24",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  switch (name) {
    case "alert":
      return (
        <svg {...commonProps}>
          <path d="M12 3 2.8 19h18.4L12 3z" />
          <path d="M12 9v4" />
          <path d="M12 17h.01" />
        </svg>
      );

    case "check":
      return (
        <svg {...commonProps}>
          <path d="m5 12 4 4L19 6" />
        </svg>
      );

    case "copy":
      return (
        <svg {...commonProps}>
          <rect x="8" y="8" width="11" height="11" rx="2" />
          <path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" />
        </svg>
      );

    case "email":
      return (
        <svg {...commonProps}>
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="m4 7 8 6 8-6" />
        </svg>
      );

    case "lock":
      return (
        <svg {...commonProps}>
          <rect x="4" y="10" width="16" height="11" rx="2" />
          <path d="M8 10V7a4 4 0 0 1 8 0v3" />
        </svg>
      );

    case "phone":
      return (
        <svg {...commonProps}>
          <path d="M7 3h3l1.5 4-2 1.5a14 14 0 0 0 6 6l1.5-2 4 1.5v3a3 3 0 0 1-3 3C10.3 20 4 13.7 4 6a3 3 0 0 1 3-3z" />
        </svg>
      );

    case "settings":
      return (
        <svg {...commonProps}>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1A1.7 1.7 0 0 0 4.6 15 1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6 1.7 1.7 0 0 0 10 3V2.8h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1z" />
        </svg>
      );

    case "shield":
    default:
      return (
        <svg {...commonProps}>
          <path d="M12 3 5 6v5c0 4.6 2.8 8.1 7 10 4.2-1.9 7-5.4 7-10V6l-7-3z" />
          <path d="m9 12 2 2 4-4" />
        </svg>
      );
  }
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

function getStatusLabel(status: SuperAdminProfileStatus): string {
  switch (status) {
    case "READY":
      return "Ready for emergency use";
    case "NOT_CONFIGURED":
      return "Configuration required";
    case "INVALID_PHONE":
      return "Phone configuration invalid";
    case "DUPLICATE_EMAIL":
      return "Email identity conflict";
    case "DUPLICATE_PHONE":
      return "Phone identity conflict";
    default:
      return "Profile requires review";
  }
}

function getStatusTone(status: SuperAdminProfileStatus): string {
  if (status === "READY") {
    return "is-ready";
  }

  if (status === "NOT_CONFIGURED" || status === "INVALID_PHONE") {
    return "is-warning";
  }

  return "is-danger";
}

function formatUpdatedAt(profile: SuperAdminEmergencyProfile): string {
  if (!profile.updatedAt) {
    return profile.source === "SYSTEM_CONFIG"
      ? "Managed outside the application"
      : "Not recorded";
  }

  const parsedDate = new Date(profile.updatedAt);

  if (Number.isNaN(parsedDate.getTime())) {
    return "Not recorded";
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Kathmandu",
  }).format(parsedDate);
}

async function copyText(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const temporaryInput = document.createElement("textarea");
  temporaryInput.value = value;
  temporaryInput.setAttribute("readonly", "");
  temporaryInput.style.position = "fixed";
  temporaryInput.style.opacity = "0";
  document.body.appendChild(temporaryInput);
  temporaryInput.select();

  const copied = document.execCommand("copy");
  document.body.removeChild(temporaryInput);

  if (!copied) {
    throw new Error("Copy was not supported by this browser.");
  }
}

export function SuperAdminProfilePanel({
  accessToken,
}: SuperAdminProfilePanelProps) {
  const { account } = useAuth();
  const [profile, setProfile] =
    useState<SuperAdminEmergencyProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [copiedField, setCopiedField] = useState<CopyField | null>(null);
  const [copyError, setCopyError] = useState("");
  const copyTimerRef = useRef<number | null>(null);

  useEffect(() => {
    let active = true;

    setLoading(true);
    setError("");

    // This profile is display-only so the official emergency identity cannot
    // be altered from an authenticated browser session.
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
    refreshKey,
  ]);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
    };
  }, []);

  async function handleCopy(
    field: CopyField,
    value: string | null,
  ) {
    if (!value) {
      return;
    }

    try {
      await copyText(value);
      setCopyError("");
      setCopiedField(field);

      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }

      copyTimerRef.current = window.setTimeout(() => {
        setCopiedField(null);
      }, 2200);
    } catch (copyFailure: unknown) {
      setCopiedField(null);
      setCopyError(getErrorMessage(copyFailure));
    }
  }

  return (
    <section className="super-admin-profile-panel official-profile-workspace">
      <header className="official-profile-hero">
        <div className="official-profile-hero-copy">
          <span className="official-profile-eyebrow">
            Official Super Admin profile
          </span>
          <h2>Official identity and emergency contact</h2>
          <p>
            System-managed contact information used for authorized governance
            and emergency workflows.
          </p>
        </div>

        <div
          className={`official-profile-readiness-card ${
            profile ? getStatusTone(profile.profileStatus) : "is-loading"
          }`}
        >
          <OfficialProfileIcon
            name={profile?.profileStatus === "READY" ? "shield" : "alert"}
          />
          <div>
            <span>Profile status</span>
            <strong>
              {profile
                ? getStatusLabel(profile.profileStatus)
                : loading
                  ? "Checking configuration"
                  : "Status unavailable"}
            </strong>
          </div>
        </div>
      </header>

      {loading && !profile && (
        <div className="official-profile-state-card" aria-live="polite">
          <span className="official-profile-spinner" aria-hidden="true" />
          <div>
            <strong>Loading official profile</strong>
            <p>Verifying the configured identity and contact details.</p>
          </div>
        </div>
      )}

      {error && (
        <div className="official-profile-state-card is-error" role="alert">
          <OfficialProfileIcon name="alert" />
          <div>
            <strong>Official profile could not be loaded</strong>
            <p>{error}</p>
          </div>
          <button
            type="button"
            onClick={() => setRefreshKey((currentValue) => currentValue + 1)}
          >
            Try again
          </button>
        </div>
      )}

      {profile && (
        <>
          <div className="official-profile-main-grid">
            <article className="official-profile-card official-profile-identity-card">
              <div className="official-profile-card-heading">
                <div>
                  <span className="official-profile-section-eyebrow">
                    Official identity
                  </span>
                  <h3>Super Admin</h3>
                </div>

                <span className="official-profile-badge is-locked">
                  <OfficialProfileIcon name="lock" />
                  Read-only
                </span>
              </div>

              <div className="official-profile-identity">
                <ProtectedAvatar
                  accountId={account?.id}
                  displayName={profile.fullName}
                  className="official-profile-avatar"
                  ariaLabel={`${profile.fullName} profile`}
                />

                <div>
                  <strong>{profile.fullName}</strong>
                  <span>Super Admin</span>
                  <small>System-managed official profile</small>
                </div>
              </div>
            </article>

            <article className="official-profile-card official-profile-contact-card">
              <div className="official-profile-card-heading">
                <div>
                  <span className="official-profile-section-eyebrow">
                    Contact details
                  </span>
                  <h3>Official communication channels</h3>
                </div>
              </div>

              <div className="official-profile-contact-list">
                <div className="official-profile-contact-row">
                  <span className="official-profile-contact-icon">
                    <OfficialProfileIcon name="email" />
                  </span>

                  <div>
                    <span>Official email</span>
                    <strong>{profile.email ?? "Not configured"}</strong>
                  </div>

                  <button
                    type="button"
                    disabled={!profile.email}
                    onClick={() => handleCopy("email", profile.email)}
                    aria-label="Copy official email"
                  >
                    <OfficialProfileIcon
                      name={copiedField === "email" ? "check" : "copy"}
                    />
                    {copiedField === "email" ? "Copied" : "Copy"}
                  </button>
                </div>

                <div className="official-profile-contact-row">
                  <span className="official-profile-contact-icon">
                    <OfficialProfileIcon name="phone" />
                  </span>

                  <div>
                    <span>Emergency phone</span>
                    <strong>{profile.phoneNumber ?? "Not configured"}</strong>
                  </div>

                  <button
                    type="button"
                    disabled={!profile.phoneNumber}
                    onClick={() => handleCopy("phone", profile.phoneNumber)}
                    aria-label="Copy emergency phone number"
                  >
                    <OfficialProfileIcon
                      name={copiedField === "phone" ? "check" : "copy"}
                    />
                    {copiedField === "phone" ? "Copied" : "Copy"}
                  </button>
                </div>
              </div>

              {copyError && (
                <p className="official-profile-copy-status" role="alert">
                  {copyError}
                </p>
              )}
            </article>
          </div>

          <article className="official-profile-card official-profile-configuration-card">
            <div className="official-profile-card-heading">
              <div>
                <span className="official-profile-section-eyebrow">
                  Configuration
                </span>
                <h3>Profile control status</h3>
              </div>
            </div>

            <dl className="official-profile-configuration-list">
              <div>
                <dt>
                  <OfficialProfileIcon name="settings" />
                  Source
                </dt>
                <dd>{getSourceLabel(profile)}</dd>
              </div>
              <div>
                <dt>
                  <OfficialProfileIcon name="shield" />
                  Status
                </dt>
                <dd>{getStatusLabel(profile.profileStatus)}</dd>
              </div>
              <div>
                <dt>
                  <OfficialProfileIcon name="lock" />
                  Editing
                </dt>
                <dd>Secure configuration only</dd>
              </div>
              <div>
                <dt>
                  <OfficialProfileIcon name="check" />
                  Last updated
                </dt>
                <dd>{formatUpdatedAt(profile)}</dd>
              </div>
            </dl>
          </article>

          <aside className="official-profile-notice">
            <OfficialProfileIcon name="lock" />
            <p>
              This profile is used only for authorized governance and emergency
              workflows. Changes must be made through secure system configuration.
            </p>
          </aside>
        </>
      )}
    </section>
  );
}
