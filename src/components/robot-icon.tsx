import type { SVGProps } from "react";

export function RobotIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d="M12 5V3" />
      <circle cx="12" cy="2" r="1" />
      <rect x="4" y="5" width="16" height="15" rx="5" />
      <circle cx="9" cy="11" r="1" />
      <circle cx="15" cy="11" r="1" />
      <path d="M9.5 15.5c1.6 1.3 3.4 1.3 5 0" />
    </svg>
  );
}