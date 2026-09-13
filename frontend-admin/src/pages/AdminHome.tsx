import { useState } from "react";
import type { Role } from "../api";
import Icon, { type IconName } from "../components/Icon";
import Audit from "./Audit";
import BatchMaker from "./BatchMaker";
import Checker from "./Checker";
import Maker from "./Maker";
import Overview from "./Overview";
import Records from "./Records";
import Users from "./Users";

type Tab = "overview" | "maker" | "batch" | "checker" | "records" | "users" | "audit";
type NavItem = { id: Tab; label: string; icon: IconName };

const makerTabs: NavItem[] = [
  { id: "overview", label: "Tổng quan", icon: "overview" },
  { id: "maker", label: "Lập phiếu", icon: "add" },
  { id: "batch", label: "Lập theo lô", icon: "batch" },
  { id: "audit", label: "Nhật ký", icon: "audit" },
];

const checkerTabs: NavItem[] = [
  { id: "overview", label: "Tổng quan", icon: "overview" },
  { id: "checker", label: "Phê duyệt", icon: "approve" },
  { id: "records", label: "Văn bằng", icon: "certificate" },
  { id: "users", label: "Người dùng", icon: "users" },
  { id: "audit", label: "Nhật ký", icon: "audit" },
];

const roleLabels: Record<Role, string> = {
  maker: "Maker",
  checker: "Checker",
  student: "Sinh viên",
};

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
          <div className="brand-mark small-mark" aria-hidden="true">KMA</div>
          <div>
            <strong>Blockcerts</strong>
            <span>Cổng quản trị</span>
          </div>
        </div>
        <p className="nav-caption">KHÔNG GIAN LÀM VIỆC</p>
        <nav className="sidebar-nav" aria-label="Điều hướng chính">
          {tabs.map((item) => (
            <button
              key={item.id}
              aria-current={tab === item.id ? "page" : undefined}
              className={tab === item.id ? "active" : ""}
              onClick={() => setTab(item.id)}
              type="button"
            >
              <span className="nav-icon"><Icon name={item.icon} /></span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="account-row">
            <span className="account-avatar" aria-hidden="true">{username.charAt(0).toUpperCase()}</span>
            <div>
              <strong>{username}</strong>
              <span>{roleLabels[role]}</span>
            </div>
          </div>
          <button className="button sidebar-logout" onClick={onLogout} type="button">
            Đăng xuất
          </button>
        </div>
      </aside>
      <div className="admin-content">
        <header className="mobile-header">
          <div className="mobile-brand">
            <div className="brand-mark mobile-mark" aria-hidden="true">KMA</div>
            <div><strong>KMA Blockcerts</strong><span>{username} · {roleLabels[role]}</span></div>
          </div>
          <button className="button ghost small-button" onClick={onLogout} type="button">Đăng xuất</button>
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
