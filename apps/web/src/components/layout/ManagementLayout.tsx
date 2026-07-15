import {
  useEffect,
  useMemo,
  useState,
} from "react";
import type { ReactNode } from "react";
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
  if (pathname !== item.path) {
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

    document.addEventListener("keydown", closeOnEscape);

    return () => {
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [mobileOpen]);

  if (!account) {
    return null;
  }

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
        aria-label="Close navigation"
        onClick={() => setMobileOpen(false)}
      />

      <aside
        className={mobileOpen
          ? "management-layout__sidebar management-layout__sidebar--open"
          : "management-layout__sidebar"}
        aria-label="Management navigation"
      >
        <div className="management-layout__brand-row">
          <Link
            className="management-layout__brand"
            to={account.role === "EMPLOYEE"
              ? "/employee"
              : getRoleHomePath(account.role)}
            aria-label="NT Message dashboard"
          >
            <span className="management-layout__logo">
              <img src="/nt-logo.png" alt="" />
            </span>

            <span className="management-layout__brand-copy">
              <strong>NT Message</strong>
              <small>Nepal Telecom</small>
            </span>
          </Link>

          <button
            type="button"
            className="management-layout__collapse"
            aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
            aria-expanded={!collapsed}
            title={collapsed ? "Expand navigation" : "Collapse navigation"}
            onClick={() => setCollapsed((current) => !current)}
          >
            <span aria-hidden="true">‹</span>
          </button>
        </div>

        <nav className="management-layout__navigation">
          {navigation.map((section) => (
            <section
              key={section.label}
              className="management-layout__navigation-section"
            >
              <span className="management-layout__section-label">
                {section.label}
              </span>

              <div className="management-layout__navigation-list">
                {section.items.map((item) => {
                  const active = isItemActive(
                    item,
                    location.pathname,
                    adminView,
                  );

                  return (
                    <Link
                      key={`${item.path}:${item.view ?? item.label}`}
                      className={active
                        ? "management-layout__navigation-link management-layout__navigation-link--active"
                        : "management-layout__navigation-link"}
                      to={getItemHref(item)}
                      aria-current={active ? "page" : undefined}
                      title={collapsed ? item.label : undefined}
                    >
                      <ManagementIcon name={item.icon} />
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            </section>
          ))}

          <section className="management-layout__navigation-section">
            <span className="management-layout__section-label">
              Priority
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
            <small>Signed as</small>
            <strong>{account.displayName}</strong>
            <span>{account.positionLabel || formatRole(account.role)}</span>
          </span>

          <button
            type="button"
            className="management-layout__logout"
            onClick={() => void handleLogout()}
            disabled={loggingOut}
            title={collapsed ? "Sign out" : undefined}
          >
            <span aria-hidden="true">↗</span>
            <span>{loggingOut ? "Signing out..." : "Sign out"}</span>
          </button>
        </div>
      </aside>

      <div className="management-layout__workspace">
        <header className="management-layout__topbar">
          <button
            type="button"
            className="management-layout__mobile-menu"
            aria-label="Open navigation"
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen(true)}
          >
            <span />
            <span />
            <span />
          </button>

          <div className="management-layout__page-heading">
            <span>{formatRole(account.role)} workspace</span>
            <strong>{activeItem?.label ?? "Dashboard"}</strong>
          </div>

          <div className="management-layout__status">
            <span aria-hidden="true" />
            Secure session
          </div>
        </header>

        <div className="management-layout__content">
          {children}
        </div>
      </div>
    </div>
  );
}
