import { useEffect } from "react";

import { useAvatarRegistry } from "../context/AvatarContext";

interface ProtectedAvatarProps {
  displayName: string;
  className: string;
  accountId?: string | null;
  employeeId?: string | null;
  officialEmail?: string | null;
  photoKey?: string | null;
  ariaLabel?: string;
}

function getInitials(displayName: string): string {
  const value = displayName
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  return value || "NT";
}

export function ProtectedAvatar({
  displayName,
  className,
  accountId,
  employeeId,
  officialEmail,
  photoKey,
  ariaLabel,
}: ProtectedAvatarProps) {
  const {
    accountUrls,
    employeeUrls,
    employeeIdsByEmail,
    accountRevision,
    employeeRevision,
    ensureAccountAvatar,
    ensureEmployeeAvatar,
    ensureEmployeeIdByEmail,
  } = useAvatarRegistry();

  const normalizedEmail = officialEmail?.trim().toLowerCase() ?? "";
  const resolvedEmployeeId = employeeId || (
    normalizedEmail
      ? employeeIdsByEmail[normalizedEmail] ?? null
      : null
  );

  useEffect(() => {
    if (!employeeId && normalizedEmail) {
      ensureEmployeeIdByEmail(normalizedEmail);
    }
  }, [employeeId, ensureEmployeeIdByEmail, normalizedEmail]);

  useEffect(() => {
    if (accountId) {
      ensureAccountAvatar(accountId, photoKey);
      return;
    }

    if (resolvedEmployeeId) {
      ensureEmployeeAvatar(resolvedEmployeeId, photoKey);
    }
  }, [
    accountId,
    accountRevision,
    employeeRevision,
    ensureAccountAvatar,
    ensureEmployeeAvatar,
    photoKey,
    resolvedEmployeeId,
  ]);

  const photoUrl = accountId
    ? accountUrls[accountId]
    : resolvedEmployeeId
      ? employeeUrls[resolvedEmployeeId]
      : null;

  return (
    <span
      className={`${className} protected-avatar`}
      aria-hidden={ariaLabel ? undefined : true}
      aria-label={ariaLabel}
    >
      {photoUrl ? (
        <img
          src={photoUrl}
          alt={ariaLabel ?? ""}
          draggable={false}
        />
      ) : (
        getInitials(displayName)
      )}
    </span>
  );
}
