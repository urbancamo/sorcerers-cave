import { useState } from "react";
import GameScreen from "./game/GameScreen";
import AdminApp from "./admin/AdminApp";

// The admin area lives at unpublished URLs; there is no router, so the path is checked once per load
// (the admin links navigate with a full page load, which also gives GameScreen a clean mount).
const isAdminPath = (p: string) => p === "/login" || p === "/admin" || p.startsWith("/admin/");

export default function App() {
  if (isAdminPath(window.location.pathname)) return <AdminApp />;
  const [tutorial, setTutorial] = useState<{ resume: boolean } | null>(null); // the tutorial is a local game: a separate GameScreen with no backend game
  return (
    <main className="scv-shell">
      <h1 className="scv-title">The Sorcerer's Cave</h1>
      {tutorial
        ? <GameScreen key="tutorial" local resume={tutorial.resume} onLocalExit={() => setTutorial(null)} />
        : <GameScreen onStartTutorial={(resume) => setTutorial({ resume })} />}
    </main>
  );
}
