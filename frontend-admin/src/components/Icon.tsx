export type IconName =
  | "overview"
  | "add"
  | "batch"
  | "approve"
  | "certificate"
  | "users"
  | "audit";

const paths: Record<IconName, React.ReactNode> = {
  overview: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </>
  ),
  add: (
    <>
      <path d="M12 5v14M5 12h14" />
      <circle cx="12" cy="12" r="9" />
    </>
  ),
  batch: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M8 9h8M8 13h8M8 17h5" />
    </>
  ),
  approve: (
    <>
      <path d="m5 12 4 4L19 6" />
      <path d="M20 12a8 8 0 1 1-5.3-7.5" />
    </>
  ),
  certificate: (
    <>
      <rect x="3" y="4" width="18" height="14" rx="2" />
      <path d="M7 8h10M7 12h6" />
      <path d="m15 18 2 3 2-3" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3" />
      <path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
      <path d="M16 4.5a3 3 0 0 1 0 6M17 14a5 5 0 0 1 3.5 5" />
    </>
  ),
  audit: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2M8 3.5 6 2M16 3.5l2 2" />
    </>
  ),
};

export default function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg
      aria-hidden="true"
      className="icon"
      fill="none"
      height={size}
      viewBox="0 0 24 24"
      width={size}
      xmlns="http://www.w3.org/2000/svg"
    >
      <g stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8">
        {paths[name]}
      </g>
    </svg>
  );
}
