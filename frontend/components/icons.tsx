import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Icon({ size = 16, children, ...rest }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const IconQueue = (p: IconProps) => (
  <Icon {...p}>
    <path d="M2.5 3.5h11M2.5 8h11M2.5 12.5h7" />
  </Icon>
);
export const IconTransactions = (p: IconProps) => (
  <Icon {...p}>
    <path d="M2.5 2.5h11v11h-11zM2.5 6h11M2.5 9.5h11M6 6v7.5" />
  </Icon>
);
export const IconCases = (p: IconProps) => (
  <Icon {...p}>
    <path d="M2.5 4.5v9h11v-7h-6l-1.5-2z" />
  </Icon>
);
export const IconAudit = (p: IconProps) => (
  <Icon {...p}>
    <path d="M2.5 6h4v4h-4zM9.5 6h4v4h-4zM6.5 8h3" />
  </Icon>
);
export const IconEval = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 13.5V9M6.5 13.5V5.5M10 13.5V7.5M13.5 13.5v-11M2 13.5h12" />
  </Icon>
);
export const IconIngest = (p: IconProps) => (
  <Icon {...p}>
    <path d="M8 2.5v8M4.5 7 8 10.5 11.5 7M2.5 13.5h11" />
  </Icon>
);
export const IconSearch = (p: IconProps) => (
  <Icon {...p}>
    <path d="M7 2.5a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9zM10.5 10.5l3 3" />
  </Icon>
);
export const IconCommand = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 6h4v4H6zM6 6V4.5a1.5 1.5 0 1 0-1.5 1.5H6M10 6V4.5A1.5 1.5 0 1 1 11.5 6H10M6 10v1.5A1.5 1.5 0 1 1 4.5 10H6M10 10v1.5a1.5 1.5 0 1 0 1.5-1.5H10" />
  </Icon>
);
export const IconSidebar = (p: IconProps) => (
  <Icon {...p}>
    <path d="M2.5 2.5h11v11h-11zM6 2.5v11" />
  </Icon>
);
export const IconChevronRight = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 3.5 10.5 8 6 12.5" />
  </Icon>
);
export const IconChevronDown = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3.5 6 8 10.5 12.5 6" />
  </Icon>
);
export const IconClose = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 4l8 8M12 4l-8 8" />
  </Icon>
);
export const IconPlay = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4.5 3v10L12.5 8z" />
  </Icon>
);
export const IconPause = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5.5 3.5v9M10.5 3.5v9" />
  </Icon>
);
export const IconReplay = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 8a5 5 0 1 0 1.5-3.5M3 2.5v3h3" />
  </Icon>
);
export const IconShield = (p: IconProps) => (
  <Icon {...p}>
    <path d="M8 2 13 4v4c0 3-2.2 5-5 6-2.8-1-5-3-5-6V4z" />
  </Icon>
);
export const IconGate = (p: IconProps) => (
  <Icon {...p}>
    <path d="M2.5 2.5v11M13.5 2.5v11M2.5 5h11M6 5v8.5M10 5v8.5" />
  </Icon>
);
export const IconFile = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3.5 1.5h6l3 3v10h-9zM9.5 1.5v3h3M5.5 8h5M5.5 10.5h5" />
  </Icon>
);
export const IconCheck = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 8.5 6.5 12 13 4.5" />
  </Icon>
);
export const IconAlert = (p: IconProps) => (
  <Icon {...p}>
    <path d="M8 2 14.5 13.5h-13zM8 6.5v3.5M8 11.5v.5" />
  </Icon>
);
export const IconLock = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3.5 7h9v6.5h-9zM5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
  </Icon>
);
export const IconUnlock = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3.5 7h9v6.5h-9zM5.5 7V5a2.5 2.5 0 0 1 4.8-1" />
  </Icon>
);
export const IconCopy = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5.5 5.5h8v8h-8zM2.5 10.5v-8h8" />
  </Icon>
);
export const IconExternal = (p: IconProps) => (
  <Icon {...p}>
    <path d="M9 2.5h4.5V7M13.5 2.5 7.5 8.5M11.5 9.5v4h-9v-9h4" />
  </Icon>
);
export const IconFilter = (p: IconProps) => (
  <Icon {...p}>
    <path d="M2 3h12l-4.5 5.5V13l-3 1.5v-6z" />
  </Icon>
);
export const IconSort = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 2.5v11M2.5 11 5 13.5 7.5 11M11 13.5v-11M8.5 5 11 2.5 13.5 5" />
  </Icon>
);
export const IconPlus = (p: IconProps) => (
  <Icon {...p}>
    <path d="M8 3v10M3 8h10" />
  </Icon>
);
export const IconHash = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 2.5 5 13.5M11 2.5l-1 11M2.5 6h11M2 10.5h11" />
  </Icon>
);
export const IconReset = (p: IconProps) => (
  <Icon {...p}>
    <path d="M13 8A5 5 0 1 1 11.5 4.5M13 2.5v3h-3" />
  </Icon>
);
