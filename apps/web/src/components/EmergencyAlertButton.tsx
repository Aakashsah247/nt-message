import {
  useEffect,
  useMemo,
  useState,
} from "react";

import { useAuth } from "../context/AuthContext";
import {
  listEmergencyAlertContacts,
  sendEmergencyAlert,
} from "../services/emergency-alert.service";
import type {
  EmergencyAlertContact,
  SendEmergencyAlertResponse,
} from "../types/emergency-alert";

function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Emergency alert could not be completed.";
}

function formatRole(role: string): string {
  return role
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatPreviewDate(value: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(value);
}

function buildPreviewMessage(
  senderName: string,
  receiverName: string,
): string {
  return [
    "[NT Message Emergency Alert]",
    "",
    `From: ${senderName}`,
    `To: ${receiverName}`,
    "",
    `${senderName} has marked this as urgent and needs your immediate attention.`,
    "",
    "Please open NT Message or contact your team as soon as possible.",
    "",
    `Time: ${formatPreviewDate(new Date())}`,
  ].join("\n");
}

function getProfileSourceLabel(contact: EmergencyAlertContact): string {
  return contact.profileSource === "SUPER_ADMIN_PROFILE"
    ? "Super Admin profile"
    : "Employee profile";
}

interface EmergencyAlertButtonProps {
  variant?: "default" | "sidebar";
}

export function EmergencyAlertButton({
  variant = "default",
}: EmergencyAlertButtonProps) {
  const {
    account,
    accessToken,
  } = useAuth();

  const [open, setOpen] =
    useState(false);

  const [contacts, setContacts] =
    useState<EmergencyAlertContact[]>([]);

  const [selectedAccountId, setSelectedAccountId] =
    useState("");

  const [contactsLoading, setContactsLoading] =
    useState(false);

  const [sending, setSending] =
    useState(false);

  const [error, setError] =
    useState("");

  const [result, setResult] =
    useState<SendEmergencyAlertResponse | null>(null);

  const selectedContact = useMemo(
    () =>
      contacts.find((contact) => contact.accountId === selectedAccountId) ??
      null,
    [
      contacts,
      selectedAccountId,
    ],
  );

  // Keep the emergency dialog focused on sending; identity data is read-only setup data.
  const previewMessage = selectedContact
    ? buildPreviewMessage(
        account?.displayName ?? "NT Message User",
        selectedContact.displayName,
      )
    : "";

  useEffect(() => {
    if (!open || !accessToken) {
      return;
    }

    let active = true;

    setContactsLoading(true);
    setError("");

    listEmergencyAlertContacts(accessToken)
      .then((response) => {
        if (!active) {
          return;
        }

        setContacts(response.data);
        setSelectedAccountId((current) => current || response.data[0]?.accountId || "");
      })
      .catch((loadError: unknown) => {
        if (active) {
          setContacts([]);
          setError(getErrorMessage(loadError));
        }
      })
      .finally(() => {
        if (active) {
          setContactsLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [
    accessToken,
    open,
  ]);



  function closePanel(): void {
    if (sending) {
      return;
    }

    setOpen(false);
    setError("");
  }

  async function handleSend(): Promise<void> {
    if (!accessToken || sending || !selectedAccountId) {
      return;
    }

    setSending(true);
    setError("");
    setResult(null);

    try {
      const response = await sendEmergencyAlert(
        accessToken,
        {
          recipientAccountId: selectedAccountId,
        },
      );

      setResult(response);
    } catch (sendError: unknown) {
      setError(getErrorMessage(sendError));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="emergency-alert-control">
      <button
        type="button"
        className={variant === "sidebar"
          ? "management-layout__emergency-button"
          : "emergency-alert-button"}
        onClick={() => {
          setOpen(true);
          setResult(null);
          setError("");
        }}
      >
        <span aria-hidden="true">
          !
        </span>

        {variant === "sidebar" ? (
          <span className="emergency-alert-label">
            Emergency
          </span>
        ) : (
          "Emergency"
        )}
      </button>

      {open && (
        <div
          className="emergency-alert-backdrop"
          role="presentation"
          onMouseDown={closePanel}
        >
          <section
            className="emergency-alert-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="emergency-alert-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header>
              <div>
                <span>Emergency SMS</span>
                <h2 id="emergency-alert-title">
                  Send fixed-format alert
                </h2>
              </div>

              <button
                type="button"
                onClick={closePanel}
                disabled={sending}
                aria-label="Close emergency alert panel"
              >
                ×
              </button>
            </header>


            <label className="emergency-alert-contact">
              <span>Emergency contact</span>
              <select
                value={selectedAccountId}
                onChange={(event) => {
                  setSelectedAccountId(event.target.value);
                  setResult(null);
                }}
                disabled={contactsLoading || sending}
              >
                {contacts.length === 0 && (
                  <option value="">
                    {contactsLoading ? "Loading contacts..." : "No contacts available"}
                  </option>
                )}

                {contacts.map((contact) => (
                  <option
                    key={contact.accountId}
                    value={contact.accountId}
                  >
                    {contact.displayName} · {formatRole(contact.role)}
                    {contact.phoneAvailable ? "" : " · No phone"}
                  </option>
                ))}
              </select>
            </label>

            {selectedContact && (
              <div className="emergency-alert-contact-card">
                <strong>{selectedContact.displayName}</strong>
                <span>
                  {formatRole(selectedContact.role)} · {getProfileSourceLabel(selectedContact)}
                  {selectedContact.department
                    ? ` · ${selectedContact.department}`
                    : selectedContact.division
                      ? ` · ${selectedContact.division}`
                      : ""}
                </span>
                <small>
                  {selectedContact.phoneStatusMessage}
                </small>
              </div>
            )}

            {previewMessage && (
              <section className="emergency-alert-preview">
                <span>Stored long format</span>
                <pre>{previewMessage}</pre>
              </section>
            )}

            {error && (
              <p
                className="emergency-alert-error"
                role="alert"
              >
                {error}
              </p>
            )}

            {result && (
              <div className="emergency-alert-result">
                <strong>Alert stored and processed</strong>
                <span>
                  Status: {result.recipient.status} · Provider:{" "}
                  {result.recipient.providerName}
                </span>
                <small>{result.architectureNote}</small>
              </div>
            )}

            <footer>
              <button
                type="button"
                className="emergency-alert-secondary"
                onClick={closePanel}
                disabled={sending}
              >
                Close
              </button>

              <button
                type="button"
                className="emergency-alert-primary"
                onClick={() => void handleSend()}
                disabled={
                  sending ||
                  contactsLoading ||
                  !accessToken ||
                  !selectedAccountId
                }
              >
                {sending ? "Sending..." : "Send alert"}
              </button>
            </footer>
          </section>
        </div>
      )}
    </div>
  );
}
