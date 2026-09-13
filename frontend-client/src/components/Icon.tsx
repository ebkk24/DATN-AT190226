export type IconName =
  | "certificate"
  | "download"
  | "logout"
  | "shield"
  | "user"
  | "chain"
  | "refresh";

const paths: Record<IconName, React.ReactNode> = {
  certificate: <><rect x="3" y="4" width="18" height="14" rx="2" /><path d="M7 8h10M7 12h6" /><path d="m15 18 2 3 2-3" /></>,
  download: <><path d="M12 3v12m0 0 4-4m-4 4-4-4" /><path d="M5 19h14" /></>,
  logout: <><path d="M10 5H5v14h5M14 8l4 4-4 4m4-4H9" /></>,
  shield: <><path d="M12 3 5 6v5c0 4.4 2.8 8.4 7 10 4.2-1.6 7-5.6 7-10V6l-7-3Z" /><path d="m9 12 2 2 4-5" /></>,
  user: <><circle cx="12" cy="8" r="3.5" /><path d="M5 20a7 7 0 0 1 14 0" /></>,
  chain: <><path d="M10 13a4.5 4.5 0 0 0 6.4.1l2-2a4.5 4.5 0 0 0-6.4-6.4l-1.1 1.1" /><path d="M14 11a4.5 4.5 0 0 0-6.4-.1l-2 2a4.5 4.5 0 0 0 6.4 6.4l1.1-1.1" /></>,
  refresh: <><path d="M20 11a8 8 0 1 0-2.3 5.7" /><path d="M20 5v6h-6" /></>,
};

export default function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return <svg aria-hidden="true" className="icon" fill="none" height={size} viewBox="0 0 24 24" width={size} xmlns="http://www.w3.org/2000/svg"><g stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8">{paths[name]}</g></svg>;
}
