import React from "react";
import { createRoot } from "react-dom/client";
import { supabase } from "./supabase";
import InventoryApp from "./App";

function Main() {
  const [session, setSession] = React.useState(null);
  const [error, setError] = React.useState("");

  const handleLogin = async (username, password) => {
    const { data, error } = await supabase
      .from("users")
      .select("username, role")
      .eq("username", username)
      .eq("password", password)
      .single();

    if (error || !data) {
      setError("Invalid username or password.");
    } else {
      setSession({ username: data.username, role: data.role });
    }
  };

  if (!session) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-100">
        <div className="bg-white p-6 rounded shadow w-80">
          <h1 className="text-xl font-bold mb-4 text-center">Inventory Login</h1>
          <LoginForm onLogin={handleLogin} error={error} />
        </div>
      </div>
    );
  }

  return <InventoryApp session={session} />;
}

function LoginForm({ onLogin, error }) {
  const [username, setUsername] = React.useState("");
  const [password, setPassword] = React.useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    onLogin(username.trim(), password);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && <p className="text-red-600 text-sm">{error}</p>}
      <input
        type="text"
        placeholder="Username"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        className="border rounded w-full px-3 py-2"
        required
      />
      <input
        type="password"
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="border rounded w-full px-3 py-2"
        required
      />
      <button
        type="submit"
        className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700"
      >
        Login
      </button>
    </form>
  );
}

const container = document.getElementById("root");
const root = createRoot(container);
root.render(<Main />);
