import { useState } from "react";
import { login } from "./api";
import Login from "./pages/Login";
import Holder from "./pages/Holder";

export default function App() {
  const [token, setToken] = useState(localStorage.getItem("token"));
  function doLogin(u: string, p: string) {
    return login(u, p).then((res) => {
      localStorage.setItem("token", res.token);
      localStorage.setItem("username", res.username);
      setToken(res.token);
    });
  }
  if (!token) return <Login onLogin={doLogin} />;
  return <Holder username={localStorage.getItem("username")!} onLogout={() => { localStorage.clear(); setToken(null); }} />;
}
