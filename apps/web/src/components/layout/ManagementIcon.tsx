import type { SVGProps } from "react";

export type ManagementIconName =
  | "analytics"
  | "dashboard"
  | "directory"
  | "management"
  | "messages"
  | "monitoring"
  | "organization"
  | "profile"
  | "requests";

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
