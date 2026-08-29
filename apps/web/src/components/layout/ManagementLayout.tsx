import {
  useEffect,
  useMemo,
  useState,
} from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  Link,
  useLocation,
  useNavigate,
  useSearchParams,
} from "react-router";

import { EmergencyAlertButton } from "../EmergencyAlertButton";
import { ProtectedAvatar } from "../ProtectedAvatar";
import { useAuth } from "../../context/AuthContext";
import { getRoleHomePath } from "../../utils/get-role-home-path";
import { ManagementIcon } from "./ManagementIcon";
import {
  getDefaultAdminView,
  getManagementNavigation,
  type ManagementNavigationItem,
} from "./management-navigation";

interface ManagementLayoutProps {
  children: ReactNode;
}

const SIDEBAR_STORAGE_PREFIX = "nt-message:management-sidebar";

function formatRole(role: string): string {
  return role
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getRoleTranslationKey(role: string): string {
  switch (role) {
    case "SUPER_ADMIN":
      return "roles.superAdmin";
    case "SENIOR_MANAGEMENT":
      return "roles.seniorManagement";
    case "TEAM_MANAGER":
      return "roles.teamManager";
    case "EMPLOYEE":
    default:
      return "roles.employee";
  }
}

function getItemHref(item: ManagementNavigationItem): string {
  if (!item.view) {
    return item.path;
  }

  const params = new URLSearchParams({
    view: item.view,
  });

  return `${item.path}?${params.toString()}`;
}

function isItemActive(
  item: ManagementNavigationItem,
  pathname: string,
  adminView: string,
): boolean {
  const pathMatches =
    pathname === item.path ||
    (item.path === "/work-management" &&
      pathname.startsWith("/work-management/")) ||
    (item.path === "/settings" && pathname.startsWith("/settings/"));

  if (!pathMatches) {
    return false;
  }

  // The base Super Admin route represents the dashboard only when no
  // governance sub-view is selected through the query string.
  if (item.path === "/super-admin" && !item.view) {
    return adminView === "dashboard";
  }

  return item.view ? item.view === adminView : true;
}

export function ManagementLayout({
  children,
}: ManagementLayoutProps) {
  const {
    account,
    logout,
  } = useAuth();
  const { t } = useTranslation("workspace");
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const storageKey = account
    ? `${SIDEBAR_STORAGE_PREFIX}:${account.id}`
    : SIDEBAR_STORAGE_PREFIX;
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }

    return window.localStorage.getItem(storageKey) === "collapsed";
  });

  const adminView = getDefaultAdminView(searchParams.get("view"));
  const navigation = useMemo(
    () => account ? getManagementNavigation(account.role) : [],
    [account],
  );
  const activeItem = navigation
    .flatMap((section) => section.items)
    .find((item) => isItemActive(item, location.pathname, adminView));

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname, location.search]);

  useEffect(() => {
    window.localStorage.setItem(
      storageKey,
      collapsed ? "collapsed" : "expanded",
    );
  }, [collapsed, storageKey]);

  useEffect(() => {
    if (!mobileOpen) {
      return;
    }

    function closeOnEscape(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        setMobileOpen(false);
      }
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", closeOnEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [mobileOpen]);

  if (!account) {
    return null;
  }

  const roleLabel = t(getRoleTranslationKey(account.role), {
    defaultValue: formatRole(account.role),
  });

  async function handleLogout(): Promise<void> {
    setLoggingOut(true);

    try {
      await logout();
      navigate("/login", { replace: true });
    } finally {
      setLoggingOut(false);
    }
  }

  return (
    <div
      className={collapsed
        ? "management-layout management-layout--collapsed"
        : "management-layout"}
      data-motion-root
    >
      <button
        type="button"
        className={mobileOpen
          ? "management-layout__backdrop management-layout__backdrop--visible"
          : "management-layout__backdrop"}
        aria-label={t("navigation.close")}
        onClick={() => setMobileOpen(false)}
      />

      <aside
        className={mobileOpen
          ? "management-layout__sidebar management-layout__sidebar--open"
          : "management-layout__sidebar"}
        aria-label={t("navigation.primaryAria", { role: roleLabel })}
      >
        <div className="management-layout__brand-row">
          <Link
            className="management-layout__brand"
            to={account.role === "EMPLOYEE"
              ? "/employee"
              : getRoleHomePath(account.role)}
            aria-label={t("brand.dashboardAria")}
          >
            <span className="management-layout__logo">
              <img src="/nt-logo.png" alt="" />
            </span>

            <span className="management-layout__brand-copy">
              <strong>NT Message</strong>
              <small>{t("brand.organization")}</small>
            </span>
          </Link>

          <button
            type="button"
            className="management-layout__collapse"
            aria-label={collapsed ? t("navigation.expand") : t("navigation.collapse")}
            aria-expanded={!collapsed}
            title={collapsed ? t("navigation.expand") : t("navigation.collapse")}
            onClick={() => setCollapsed((current) => !current)}
          >
            <span aria-hidden="true">‹</span>
          </button>
        </div>

        <nav className="management-layout__navigation">
          {navigation.map((section) => (
            <section
              key={section.id}
              className="management-layout__navigation-section"
              data-navigation-section={section.id}
              aria-labelledby={`management-navigation-${section.id}`}
            >
              <span
                id={`management-navigation-${section.id}`}
                className="management-layout__section-label"
              >
                {t(section.labelKey, { defaultValue: section.label })}
              </span>

              <div className="management-layout__navigation-list">
                {section.items.map((item) => {
                  const active = isItemActive(
                    item,
                    location.pathname,
                    adminView,
                  );
                  const itemLabel = t(item.labelKey, {
                    defaultValue: item.label,
                  });

                  return (
                    <Link
                      key={`${item.path}:${item.view ?? item.label}`}
                      className={active
                        ? "management-layout__navigation-link management-layout__navigation-link--active"
                        : "management-layout__navigation-link"}
                      to={getItemHref(item)}
                      aria-current={active ? "page" : undefined}
                      aria-label={itemLabel}
                      title={collapsed ? itemLabel : undefined}
                    >
                      <ManagementIcon name={item.icon} />
                      <span>{itemLabel}</span>
                    </Link>
                  );
                })}
              </div>
            </section>
          ))}

          <section className="management-layout__navigation-section">
            <span className="management-layout__section-label">
              {t("navigation.sections.emergency")}
            </span>

            <EmergencyAlertButton variant="sidebar" />
          </section>
        </nav>

        <div className="management-layout__account">
          <ProtectedAvatar
            accountId={account.id}
            displayName={account.displayName}
            className="management-layout__avatar"
          />

          <span className="management-layout__account-copy">
            <small>{t("account.signedAs")}</small>
            <strong>{account.displayName}</strong>
            <span>{account.positionLabel || formatRole(account.role)}</span>
          </span>

          <button
            type="button"
            className="management-layout__logout"
            onClick={() => void handleLogout()}
            disabled={loggingOut}
            title={collapsed ? t("account.signOut") : undefined}
          >
            <span aria-hidden="true">↗</span>
            <span>{loggingOut ? t("account.signingOut") : t("account.signOut")}</span>
          </button>
        </div>
      </aside>

      <div className="management-layout__workspace">
        <header className="management-layout__topbar">
          <button
            type="button"
            className="management-layout__mobile-menu"
            aria-label={t("navigation.open")}
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen(true)}
          >
            <span />
            <span />
            <span />
          </button>

          <div className="management-layout__page-heading">
            <span>{t("topbar.workspace", { role: roleLabel })}</span>
            <strong>{activeItem
              ? t(activeItem.labelKey, { defaultValue: activeItem.label })
              : t("navigation.items.dashboard")}</strong>
          </div>

          <div className="management-layout__status">
            <span aria-hidden="true" />
            {t("topbar.secureSession")}
          </div>
        </header>

        <div className="management-layout__content">
          {children}
        </div>
      </div>
    </div>
  );
}
