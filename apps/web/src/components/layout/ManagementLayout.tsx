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
import {
  getOrganizationNavigationContext,
  getOrganizationOffices,
} from "../../services/organization-v3.service";
import { getWorkTypeActions } from "../../services/work-type-v3.service";
import type { OrganizationNavigationMode } from "../../types/organization-v3";
import type { WorkTypeNavigationMode } from "../../types/work-type-v3";
import { getAccountHomePath } from "../../utils/get-account-home-path";
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

function getAccountClassTranslationKey(accountClass: string): string {
  return accountClass === "SUPER_ADMIN"
    ? "accountClasses.superAdmin"
    : "accountClasses.officeUser";
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
    (item.path === "/work" &&
      (pathname === "/work/create" || pathname.startsWith("/work/"))) ||
    (item.path === "/work-oversight" &&
      pathname.startsWith("/work/")) ||
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
    accessToken,
    logout,
  } = useAuth();
  const { t } = useTranslation("workspace");
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const accountId = account?.id ?? null;
  const accountClass = account?.accountClass ?? null;
  const currentRouteKey = `${location.pathname}${location.search}`;
  const [mobileOpenRoute, setMobileOpenRoute] = useState<string | null>(null);
  const mobileOpen = mobileOpenRoute === currentRouteKey;
  const [loggingOut, setLoggingOut] = useState(false);
  const [organizationNavigationResult, setOrganizationNavigationResult] =
    useState<{ accountId: string; mode: OrganizationNavigationMode } | null>(null);
  const [workTypeNavigationResult, setWorkTypeNavigationResult] =
    useState<{ accountId: string; mode: WorkTypeNavigationMode } | null>(null);
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
  const organizationFallbackMode: OrganizationNavigationMode =
    accountClass === "SUPER_ADMIN" ? "VIEW" : "NONE";
  const workTypeFallbackMode: WorkTypeNavigationMode =
    accountClass === "SUPER_ADMIN" ? "VIEW" : "NONE";
  const organizationNavigationMode: OrganizationNavigationMode =
    accountId && accountClass
      ? accessToken && organizationNavigationResult?.accountId === accountId
        ? organizationNavigationResult.mode
        : organizationFallbackMode
      : "NONE";
  const workTypeNavigationMode: WorkTypeNavigationMode =
    accountId && accountClass
      ? accessToken && workTypeNavigationResult?.accountId === accountId
        ? workTypeNavigationResult.mode
        : workTypeFallbackMode
      : "NONE";
  const navigation = useMemo(
    () => accountClass
      ? getManagementNavigation(
          accountClass,
          organizationNavigationMode,
          workTypeNavigationMode,
        )
      : [],
    [accountClass, organizationNavigationMode, workTypeNavigationMode],
  );
  const activeItem = navigation
    .flatMap((section) => section.items)
    .find((item) => isItemActive(item, location.pathname, adminView));

  useEffect(() => {
    let active = true;

    if (!accountId || !accountClass || !accessToken) {
      return () => {
        active = false;
      };
    }

    getOrganizationNavigationContext(accessToken)
      .then((context) => {
        if (active) {
          setOrganizationNavigationResult({
            accountId,
            mode: context.mode,
          });
        }
      })
      .catch(() => {
        if (active) {
          setOrganizationNavigationResult({
            accountId,
            mode: organizationFallbackMode,
          });
        }
      });

    return () => {
      active = false;
    };
  }, [accessToken, accountId, accountClass, organizationFallbackMode]);

  useEffect(() => {
    let active = true;

    if (!accountId || !accountClass || !accessToken) {
      return () => {
        active = false;
      };
    }

    getOrganizationOffices(accessToken)
      .then(async (response) => {
        const contexts = await Promise.allSettled(
          response.data.map((office) =>
            getWorkTypeActions(accessToken, office.id),
          ),
        );

        if (!active) {
          return;
        }

        let mode: WorkTypeNavigationMode = workTypeFallbackMode;
        for (const result of contexts) {
          if (result.status !== "fulfilled") {
            continue;
          }
          const actions = result.value.availableActions;
          if (actions.publish) {
            mode = "PUBLISH";
            break;
          }
          if (actions.draft) {
            mode = "DRAFT";
          } else if (actions.view && mode === "NONE") {
            mode = "VIEW";
          }
        }
        setWorkTypeNavigationResult({
          accountId,
          mode,
        });
      })
      .catch(() => {
        if (active) {
          setWorkTypeNavigationResult({
            accountId,
            mode: workTypeFallbackMode,
          });
        }
      });

    return () => {
      active = false;
    };
  }, [accessToken, accountId, accountClass, workTypeFallbackMode]);

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
        setMobileOpenRoute(null);
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

  const authorityLabel = t(getAccountClassTranslationKey(account.accountClass), {
    defaultValue: account.accountClass === "SUPER_ADMIN" ? "Super Admin" : "Office User",
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
        onClick={() => setMobileOpenRoute(null)}
      />

      <aside
        className={mobileOpen
          ? "management-layout__sidebar management-layout__sidebar--open"
          : "management-layout__sidebar"}
        aria-label={t("navigation.primaryAria", { role: authorityLabel })}
      >
        <div className="management-layout__brand-row">
          <Link
            className="management-layout__brand"
            to={getAccountHomePath(account.accountClass)}
            aria-label={t("brand.dashboardAria")}
            onClick={() => setMobileOpenRoute(null)}
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
                      onClick={() => setMobileOpenRoute(null)}
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
            <span>{account.positionLabel || authorityLabel}</span>
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
            onClick={() => setMobileOpenRoute(currentRouteKey)}
          >
            <span />
            <span />
            <span />
          </button>

          <div className="management-layout__page-heading">
            <span>{t("topbar.workspace", { role: authorityLabel })}</span>
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
