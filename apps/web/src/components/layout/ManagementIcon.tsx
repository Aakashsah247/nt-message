import type { SVGProps } from "react";

export type ManagementIconName =
  | "analytics"
  | "dashboard"
  | "directory"
  | "duty"
  | "management"
  | "messages"
  | "monitoring"
  | "organization"
  | "profile"
  | "reports"
  | "requests"
  | "security"
  | "settings"
  | "teams"
  | "work";

interface ManagementIconProps extends SVGProps<SVGSVGElement> {
  name: ManagementIconName;
}

export function ManagementIcon({
  name,
  ...props
}: ManagementIconProps) {
  const commonProps: SVGProps<SVGSVGElement> = {
    "aria-hidden": true,
    fill: "none",
    viewBox: "0 0 24 24",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    ...props,
  };

  switch (name) {
    case "analytics":
      return (
        <svg {...commonProps}>
          <path d="M4 20V10" />
          <path d="M10 20V4" />
          <path d="M16 20v-7" />
          <path d="M22 20H2" />
        </svg>
      );

    case "directory":
      return (
        <svg {...commonProps}>
          <circle cx="9" cy="8" r="3" />
          <path d="M3.5 19c.5-3.2 2.4-5 5.5-5s5 1.8 5.5 5" />
          <path d="M16 5.5h5" />
          <path d="M16 10h5" />
          <path d="M17 14.5h4" />
        </svg>
      );

    case "duty":
      return (
        <svg {...commonProps}>
          <rect x="4" y="5" width="16" height="15" rx="2" />
          <path d="M8 3v4" />
          <path d="M16 3v4" />
          <path d="M4 10h16" />
          <path d="m9 15 2 2 4-4" />
        </svg>
      );

    case "management":
      return (
        <svg {...commonProps}>
          <path d="M4 21V9l8-5 8 5v12" />
          <path d="M9 21v-6h6v6" />
          <path d="M8 10h.01" />
          <path d="M12 10h.01" />
          <path d="M16 10h.01" />
        </svg>
      );

    case "messages":
      return (
        <svg {...commonProps}>
          <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
          <path d="M8 9h8" />
          <path d="M8 13h5" />
        </svg>
      );

    case "monitoring":
      return (
        <svg {...commonProps}>
          <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6z" />
          <circle cx="12" cy="12" r="2.5" />
        </svg>
      );

    case "organization":
      return (
        <svg {...commonProps}>
          <rect x="9" y="3" width="6" height="4" rx="1" />
          <rect x="3" y="17" width="6" height="4" rx="1" />
          <rect x="15" y="17" width="6" height="4" rx="1" />
          <path d="M12 7v5" />
          <path d="M6 17v-3h12v3" />
        </svg>
      );

    case "profile":
      return (
        <svg {...commonProps}>
          <circle cx="12" cy="8" r="4" />
          <path d="M4.5 21c.8-4.2 3.3-6.5 7.5-6.5s6.7 2.3 7.5 6.5" />
        </svg>
      );

    case "reports":
      return (
        <svg {...commonProps}>
          <path d="M5 20V9" />
          <path d="M10 20V4" />
          <path d="M15 20v-7" />
          <path d="M20 20V7" />
          <path d="M3 20h19" />
        </svg>
      );

    case "security":
      return (
        <svg {...commonProps}>
          <path d="M12 3 5 6v5c0 4.7 2.7 8 7 10 4.3-2 7-5.3 7-10V6z" />
          <path d="M9.5 12.2 11.2 14l3.7-4" />
        </svg>
      );

    case "settings":
      return (
        <svg {...commonProps}>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.86 2.86-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21H9.6v-.1a1.7 1.7 0 0 0-1.4-1.66 1.7 1.7 0 0 0-1.56.5l-.08.06-2.84-2.86.06-.06A1.7 1.7 0 0 0 4.2 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H2.4V9.6h.1A1.7 1.7 0 0 0 4.16 8.2a1.7 1.7 0 0 0-.5-1.56L3.6 6.56 6.46 3.7l.08.06a1.7 1.7 0 0 0 1.88.34 1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V2.3h4v.1a1.7 1.7 0 0 0 1.4 1.66 1.7 1.7 0 0 0 1.56-.5l.08-.06 2.84 2.86-.06.08a1.7 1.7 0 0 0-.34 1.88 1.7 1.7 0 0 0 .6 1 1.7 1.7 0 0 0 1.1.4h.1v4h-.1A1.7 1.7 0 0 0 19.4 15Z" />
        </svg>
      );

    case "requests":
      return (
        <svg {...commonProps}>
          <rect x="5" y="3" width="14" height="18" rx="2" />
          <path d="M9 3.5h6" />
          <path d="M8.5 9h7" />
          <path d="M8.5 13h7" />
          <path d="M8.5 17h4" />
        </svg>
      );

    case "teams":
      return (
        <svg {...commonProps}>
          <circle cx="8" cy="8" r="3" />
          <circle cx="17" cy="9" r="2.5" />
          <path d="M2.8 20c.5-4 2.3-6 5.2-6s4.8 2 5.2 6" />
          <path d="M14 15c1-.9 2.1-1.3 3.4-1.3 2.4 0 3.9 1.6 4.3 4.8" />
        </svg>
      );

    case "work":
      return (
        <svg {...commonProps}>
          <rect x="3" y="7" width="18" height="13" rx="2" />
          <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          <path d="M3 12h18" />
          <path d="M10 12v2h4v-2" />
        </svg>
      );

    case "dashboard":
    default:
      return (
        <svg {...commonProps}>
          <rect x="3" y="3" width="7" height="7" rx="1.5" />
          <rect x="14" y="3" width="7" height="7" rx="1.5" />
          <rect x="3" y="14" width="7" height="7" rx="1.5" />
          <rect x="14" y="14" width="7" height="7" rx="1.5" />
        </svg>
      );
  }
}
