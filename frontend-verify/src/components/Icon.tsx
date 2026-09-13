export type IconName = "search" | "upload" | "shield" | "file" | "chain" | "check" | "clock" | "reset";

const paths: Record<IconName, React.ReactNode> = {
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
  upload: <><path d="M12 16V4m0 0L8 8m4-4 4 4" /><path d="M5 20h14" /></>,
  shield: <><path d="M12 3 5 6v5c0 4.4 2.8 8.4 7 10 4.2-1.6 7-5.6 7-10V6l-7-3Z" /><path d="m9 12 2 2 4-5" /></>,
  file: <><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v5h5M9 13h6M9 17h5" /></>,
  chain: <><path d="M10 13a4.5 4.5 0 0 0 6.4.1l2-2a4.5 4.5 0 0 0-6.4-6.4l-1.1 1.1" /><path d="M14 11a4.5 4.5 0 0 0-6.4-.1l-2 2a4.5 4.5 0 0 0 6.4 6.4l1.1-1.1" /></>,
  check: <><path d="m5 12 4 4L19 6" /><circle cx="12" cy="12" r="9" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  reset: <><path d="M20 11a8 8 0 1 0-2.3 5.7" /><path d="M20 5v6h-6" /></>,
};

export default function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return <svg aria-hidden="true" className="icon" fill="none" height={size} viewBox="0 0 24 24" width={size} xmlns="http://www.w3.org/2000/svg"><g stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8">{paths[name]}</g></svg>;
}
