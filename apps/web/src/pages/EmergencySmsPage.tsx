import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";

import { useAuth } from "../context/AuthContext";
import {
  listEmergencyAlertContacts,
  sendEmergencyAlert,
} from "../services/emergency-alert.service";
import type {
  EmergencyAlertContact,
  EmergencySmsLanguage,
  EmergencySmsMessageMode,
  SendEmergencyAlertResponse,
} from "../types/emergency-alert";

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function buildQuickPreview(
  language: EmergencySmsLanguage,
  senderName: string,
): string {
  if (language === "NE") {
    return `आपतकालीन SMS: ${senderName} लाई तपाईंको तुरुन्त ध्यान आवश्यक छ। कृपया सकेसम्म छिटो ${senderName} लाई सम्पर्क गर्नुहोस्।`;
  }

  return `Emergency SMS: ${senderName} needs your immediate attention. Please contact ${senderName} as soon as possible.`;
}

function getInitials(displayName: string): string {
  const initials = displayName
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join("")
    .toUpperCase();

  return initials || "NT";
}

function matchesRecipientSearch(
  contact: EmergencyAlertContact,
  query: string,
): boolean {
  if (!query) return true;

  return [
    contact.displayName,
    contact.authorityLabel,
    contact.designation,
    contact.officeName,
    contact.orgUnitName,
    contact.orgUnitType,
    contact.teamName,
    contact.phoneDisplay,
  ].some((value) => value?.toLowerCase().includes(query));
}

export function EmergencySmsPage() {
  const { t } = useTranslation(["common"]);
  const navigate = useNavigate();
  const { account, accessToken } = useAuth();

  const [contacts, setContacts] = useState<EmergencyAlertContact[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [recipientQuery, setRecipientQuery] = useState("");
  const [language, setLanguage] = useState<EmergencySmsLanguage>("EN");
  const [messageMode, setMessageMode] =
    useState<EmergencySmsMessageMode>("QUICK");
  const [customMessage, setCustomMessage] = useState("");
  const [contactsLoading, setContactsLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<SendEmergencyAlertResponse | null>(null);
  const recipientPickerRef = useRef<HTMLDetailsElement>(null);

  const selectedContact = useMemo(
    () =>
      contacts.find((contact) => contact.accountId === selectedAccountId) ??
      null,
    [contacts, selectedAccountId],
  );

  const previewMessage =
    messageMode === "CUSTOM"
      ? customMessage.trim()
      : buildQuickPreview(language, account?.displayName ?? "NT Message User");

  const normalizedRecipientQuery = recipientQuery.trim().toLowerCase();
  const supportContacts = contacts.filter(
    (contact) =>
      contact.recipientKind === "SYSTEM_SUPPORT" &&
      matchesRecipientSearch(contact, normalizedRecipientQuery),
  );
  const officeContacts = contacts.filter(
    (contact) =>
      contact.recipientKind === "OFFICE_USER" &&
      matchesRecipientSearch(contact, normalizedRecipientQuery),
  );
  const hasFilteredContacts =
    supportContacts.length > 0 || officeContacts.length > 0;

  function getRecipientContext(contact: EmergencyAlertContact): string {
    if (contact.recipientKind === "SYSTEM_SUPPORT") {
      return t("emergency.dialog.systemSupport", { ns: "common" });
    }

    return [contact.orgUnitName, contact.officeName]
      .filter(Boolean)
      .join(" · ");
  }

  useEffect(() => {
    if (!accessToken) {
      queueMicrotask(() => {
        setContactsLoading(false);
      });
      return;
    }

    let active = true;

    queueMicrotask(() => {
      if (!active) {
        return;
      }

      setContactsLoading(true);
      setError("");
    });

    void listEmergencyAlertContacts(accessToken)
      .then((response) => {
        if (!active) return;

        setContacts(response.data);
        setSelectedAccountId((current) =>
          current &&
          response.data.some(
            (item) => item.accountId === current && item.phoneAvailable,
          )
            ? current
            : (response.data.find((item) => item.phoneAvailable)?.accountId ??
              ""),
        );
      })
      .catch((loadError: unknown) => {
        if (!active) return;
        setContacts([]);
        setSelectedAccountId("");
        setError(
          getErrorMessage(
            loadError,
            t("emergency.errorFallback", { ns: "common" }),
          ),
        );
      })
      .finally(() => {
        if (active) setContactsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [accessToken, t]);

  function selectRecipient(contact: EmergencyAlertContact): void {
    if (!contact.phoneAvailable) return;

    setSelectedAccountId(contact.accountId);
    setRecipientQuery("");
    setResult(null);
    recipientPickerRef.current?.removeAttribute("open");
  }

  async function handleSend(): Promise<void> {
    if (
      !accessToken ||
      sending ||
      !selectedContact?.phoneAvailable ||
      !previewMessage
    ) {
      return;
    }

    setSending(true);
    setError("");
    setResult(null);

    try {
      const response = await sendEmergencyAlert(accessToken, {
        recipientAccountId: selectedContact.accountId,
        language,
        messageMode,
        ...(messageMode === "CUSTOM"
          ? { customMessage: customMessage.trim() }
          : {}),
      });
      setResult(response);
    } catch (sendError: unknown) {
      setError(
        getErrorMessage(
          sendError,
          t("emergency.errorFallback", { ns: "common" }),
        ),
      );
    } finally {
      setSending(false);
    }
  }

  function renderRecipientOption(contact: EmergencyAlertContact) {
    const context = getRecipientContext(contact);

    return (
      <button
        key={contact.accountId}
        type="button"
        className={`emergency-alert-recipient-option${
          selectedAccountId === contact.accountId ? " is-selected" : ""
        }`}
        disabled={!contact.phoneAvailable}
        role="option"
        aria-selected={selectedAccountId === contact.accountId}
        onClick={() => selectRecipient(contact)}
      >
        <span className="emergency-alert-recipient-avatar" aria-hidden="true">
          {getInitials(contact.displayName)}
        </span>
        <span className="emergency-alert-recipient-copy">
          <strong>{contact.displayName}</strong>
          <span>
            {contact.authorityLabel}
            {context ? ` · ${context}` : ""}
          </span>
        </span>
        <span
          className={`emergency-alert-recipient-phone${
            contact.phoneAvailable ? " is-ready" : " is-unavailable"
          }`}
        >
          {contact.phoneDisplay ??
            t("emergency.dialog.noPhone", { ns: "common" })}
        </span>
      </button>
    );
  }

  return (
    <main className="emergency-sms-page">
      <section
        className="emergency-alert-panel emergency-alert-panel--page"
        aria-labelledby="emergency-sms-page-title"
      >
        <header>
          <div>
            <span>{t("emergency.dialog.eyebrow", { ns: "common" })}</span>
            <h1 id="emergency-sms-page-title">
              {t("emergency.dialog.title", { ns: "common" })}
            </h1>
            <p>{t("emergency.dialog.subtitle", { ns: "common" })}</p>
          </div>
        </header>

        <div className="emergency-alert-body">
          <div className="emergency-sms-page__notice">
            <strong>Direct SMS</strong>
            <span>
              Use this only when a contact needs immediate attention outside the
              normal NT Message conversation flow.
            </span>
          </div>

          <div className="emergency-alert-contact">
            <div className="emergency-alert-field-heading">
              <span>{t("emergency.dialog.contact", { ns: "common" })}</span>
              <small>
                {t("emergency.dialog.contactHint", { ns: "common" })}
              </small>
            </div>

            <details
              ref={recipientPickerRef}
              className="emergency-alert-recipient-picker"
            >
              <summary
                aria-disabled={contactsLoading || sending}
                onClick={(event) => {
                  if (contactsLoading || sending || contacts.length === 0) {
                    event.preventDefault();
                  }
                }}
              >
                {contactsLoading ? (
                  <span className="emergency-alert-recipient-placeholder">
                    {t("emergency.dialog.loadingContacts", { ns: "common" })}
                  </span>
                ) : selectedContact ? (
                  <>
                    <span
                      className="emergency-alert-recipient-avatar"
                      aria-hidden="true"
                    >
                      {getInitials(selectedContact.displayName)}
                    </span>
                    <span className="emergency-alert-recipient-copy">
                      <strong>{selectedContact.displayName}</strong>
                      <span>
                        {[
                          selectedContact.authorityLabel,
                          getRecipientContext(selectedContact),
                          selectedContact.phoneDisplay,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                    <span
                      className="emergency-alert-recipient-chevron"
                      aria-hidden="true"
                    >
                      ⌄
                    </span>
                  </>
                ) : (
                  <span className="emergency-alert-recipient-placeholder">
                    {t("emergency.dialog.noContacts", { ns: "common" })}
                  </span>
                )}
              </summary>

              {!contactsLoading && contacts.length > 0 && (
                <div className="emergency-alert-recipient-menu">
                  <label className="emergency-alert-recipient-search">
                    <span className="sr-only">
                      {t("emergency.dialog.searchContacts", { ns: "common" })}
                    </span>
                    <input
                      type="search"
                      value={recipientQuery}
                      onChange={(event) =>
                        setRecipientQuery(event.target.value)
                      }
                      placeholder={t("emergency.dialog.searchContacts", {
                        ns: "common",
                      })}
                      autoComplete="off"
                    />
                  </label>

                  <div
                    className="emergency-alert-recipient-list"
                    role="listbox"
                    aria-label={t("emergency.dialog.contact", {
                      ns: "common",
                    })}
                  >
                    {supportContacts.length > 0 && (
                      <div className="emergency-alert-recipient-group">
                        <span className="emergency-alert-recipient-group-label">
                          {t("emergency.dialog.systemSupport", {
                            ns: "common",
                          })}
                        </span>
                        {supportContacts.map(renderRecipientOption)}
                      </div>
                    )}

                    {officeContacts.length > 0 && (
                      <div className="emergency-alert-recipient-group">
                        <span className="emergency-alert-recipient-group-label">
                          {t("emergency.dialog.officeContacts", {
                            ns: "common",
                          })}
                        </span>
                        {officeContacts.map(renderRecipientOption)}
                      </div>
                    )}

                    {!hasFilteredContacts && (
                      <p className="emergency-alert-recipient-empty">
                        {t("emergency.dialog.noMatchingContacts", {
                          ns: "common",
                        })}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </details>
          </div>

          <div className="emergency-alert-choice-row">
            <fieldset>
              <legend>
                {t("emergency.dialog.language", { ns: "common" })}
              </legend>
              <div className="emergency-alert-segmented">
                <button
                  type="button"
                  className={language === "EN" ? "active" : ""}
                  onClick={() => {
                    setLanguage("EN");
                    setResult(null);
                  }}
                >
                  English
                </button>
                <button
                  type="button"
                  className={language === "NE" ? "active" : ""}
                  onClick={() => {
                    setLanguage("NE");
                    setResult(null);
                  }}
                >
                  नेपाली
                </button>
              </div>
            </fieldset>

            <fieldset>
              <legend>
                {t("emergency.dialog.messageType", { ns: "common" })}
              </legend>
              <div className="emergency-alert-segmented">
                <button
                  type="button"
                  className={messageMode === "QUICK" ? "active" : ""}
                  onClick={() => {
                    setMessageMode("QUICK");
                    setResult(null);
                  }}
                >
                  {t("emergency.dialog.quick", { ns: "common" })}
                </button>
                <button
                  type="button"
                  className={messageMode === "CUSTOM" ? "active" : ""}
                  onClick={() => {
                    setMessageMode("CUSTOM");
                    setResult(null);
                  }}
                >
                  {t("emergency.dialog.custom", { ns: "common" })}
                </button>
              </div>
            </fieldset>
          </div>

          {messageMode === "CUSTOM" && (
            <label className="emergency-alert-field">
              <span>
                {t("emergency.dialog.customMessage", { ns: "common" })}
              </span>
              <textarea
                value={customMessage}
                maxLength={500}
                rows={5}
                onChange={(event) => {
                  setCustomMessage(event.target.value);
                  setResult(null);
                }}
                placeholder={
                  language === "NE"
                    ? "आफ्नो SMS यहाँ लेख्नुहोस्..."
                    : "Write your SMS here..."
                }
              />
              <small>{customMessage.length}/500</small>
            </label>
          )}

          {previewMessage && (
            <section className="emergency-alert-preview">
              <div>
                <span>
                  {t("emergency.dialog.previewLabel", { ns: "common" })}
                </span>
                <small>{previewMessage.length}/500</small>
              </div>
              <p>{previewMessage}</p>
            </section>
          )}

          {error && (
            <p className="emergency-alert-error" role="alert">
              {error}
            </p>
          )}

          {result && (
            <div className="emergency-alert-result" role="status">
              <strong>
                {t("emergency.dialog.resultTitle", { ns: "common" })}
              </strong>
              <span>
                {t("emergency.dialog.status", {
                  ns: "common",
                  status: result.recipient.status,
                })}
              </span>
            </div>
          )}
        </div>

        <footer className="emergency-sms-page__actions">
          <button
            type="button"
            className="emergency-alert-secondary"
            onClick={() => navigate("/")}
            disabled={sending}
          >
            {t("actions.close", { ns: "common" })}
          </button>
          <button
            type="button"
            className="emergency-alert-primary"
            onClick={() => void handleSend()}
            disabled={
              sending ||
              contactsLoading ||
              !selectedContact?.phoneAvailable ||
              !previewMessage
            }
          >
            {sending
              ? t("emergency.dialog.sending", { ns: "common" })
              : t("emergency.dialog.send", { ns: "common" })}
          </button>
        </footer>
      </section>
    </main>
  );
}
