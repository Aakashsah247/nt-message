import { useLocation, useNavigate } from "react-router";

import { useTranslation } from "react-i18next";

interface EmergencyAlertButtonProps {
  variant?: "default" | "sidebar";
}

export function EmergencyAlertButton({
  variant = "default",
}: EmergencyAlertButtonProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation(["common"]);
  const active = location.pathname === "/emergency-sms";

  return (
    <div className="emergency-alert-control">
      <button
        type="button"
        className={
          variant === "sidebar"
            ? `management-layout__emergency-button${
                active ? " management-layout__emergency-button--active" : ""
              }`
            : "emergency-alert-button"
        }
        onClick={() => navigate("/emergency-sms")}
        aria-current={active ? "page" : undefined}
      >
        <span aria-hidden="true">!</span>
        {variant === "sidebar" ? (
          <span className="emergency-alert-label">
            {t("emergency.button", { ns: "common" })}
          </span>
        ) : (
          t("emergency.button", { ns: "common" })
        )}
      </button>
    </div>
  );
}
