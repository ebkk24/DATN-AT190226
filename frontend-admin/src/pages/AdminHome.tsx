import { useState } from "react";
import type { Role } from "../api";
import Audit from "./Audit";
import BatchMaker from "./BatchMaker";
import Checker from "./Checker";
import Maker from "./Maker";
import Overview from "./Overview";
import Records from "./Records";
import Users from "./Users";

type Tab = "overview" | "maker" | "batch" | "checker" | "records" | "users" | "audit";

const makerTabs: Array<{ id: Tab; label: string; icon: string }> = [
  { id: "overview", label: "Tổng quan", icon: "◫" },
  { id: "maker", label: "Lập phiếu", icon: "+" },
  { id: "batch", label: "Lập theo lô", icon: "≡" },
  { id: "audit", label: "Nhật ký", icon: "⌁" },
];

const checkerTabs: Array<{ id: Tab; label: string; icon: string }> = [
  { id: "overview", label: "Tổng quan", icon: "◫" },
  { id: "checker", label: "Phê duyệt", icon: "✓" },
  { id: "records", label: "Văn bằng", icon: "▣" },
  { id: "users", label: "Người dùng", icon: "♙" },
  { id: "audit", label: "Nhật ký", icon: "⌁" },
];

export default function AdminHome({
  role,
  username,
  onLogout,
}: {
  role: Role;
  username: string;
  onLogout: () => void;
}) {
  const [tab, setTab] = useState<Tab>("overview");
  const tabs = role === "checker" ? checkerTabs : makerTabs;

  return (
    <div className="admin-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-mark small-mark">KMA</div>
          <div><strong>Blockcerts</strong><span>Cổng quản trị</span></div>
        </div>
        <nav className="sidebar-nav" aria-label="Điều hướng chính">
          {tabs.map((item) => (
            <button
              key={item.id}
              className={tab === item.id ? "active" : ""}
              onClick={() => setTab(item.id)}
            >
              <span className="nav-icon">{item.icon}</span>{item.label}
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <span className={`role-chip ${role}`}>{role}</span>
          <strong>{username}</strong>
          <button className="button ghost" onClick={onLogout}>Đăng xuất</button>
        </div>
      </aside>
      <div className="admin-content">
        <header className="mobile-header">
          <div><strong>KMA Blockcerts</strong><span>{username} · {role}</span></div>
          <button className="button ghost" onClick={onLogout}>Đăng xuất</button>
        </header>
        <main>
          {tab === "overview" && <Overview role={role} />}
          {tab === "maker" && role === "maker" && <Maker />}
          {tab === "batch" && role === "maker" && <BatchMaker />}
          {tab === "checker" && role === "checker" && <Checker />}
          {tab === "records" && role === "checker" && <Records />}
          {tab === "users" && role === "checker" && <Users />}
          {tab === "audit" && <Audit />}
        </main>
      </div>
    </div>
  );
}
