import { useState } from "react";
import { getRole, getUsername, login, logout, type Role } from "./api";
import Login from "./pages/Login";
import AdminHome from "./pages/AdminHome";

export default function App() {
  const [token, setToken] = useState<string | null>(() => {
    const storedToken = localStorage.getItem("token");
    const role = getRole();
    if (storedToken && role === "student") {
      logout();
      return null;
    }
    return storedToken;
  });

  async function doLogin(username: string, password: string) {
    const response = await login(username, password);
    if (response.role === "student") {
      throw new Error("Tài khoản sinh viên vui lòng đăng nhập tại Cổng Holder");
    }
    localStorage.setItem("token", response.token);
    localStorage.setItem("role", response.role);
    localStorage.setItem("username", response.username);
    setToken(response.token);
  }

  function doLogout() {
    logout();
    setToken(null);
  }

  const role = getRole() as Role | null;
  const username = getUsername();
  if (!token || !role || !username) return <Login onLogin={doLogin} />;
  return (
    <AdminHome
      role={role}
      username={username}
      onLogout={doLogout}
    />
  );
}
