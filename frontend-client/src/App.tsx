import { useState } from "react";
import { login, logout } from "./api";
import Holder from "./pages/Holder";
import Login from "./pages/Login";

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem("token"));

  async function doLogin(username: string, password: string) {
    const result = await login(username, password);
    localStorage.setItem("token", result.token);
    localStorage.setItem("username", result.username);
    setToken(result.token);
  }

  function doLogout() {
    logout();
    setToken(null);
  }

  if (!token) return <Login onLogin={doLogin} />;
  return <Holder username={localStorage.getItem("username") || "Sinh viên"} onLogout={doLogout} />;
}
