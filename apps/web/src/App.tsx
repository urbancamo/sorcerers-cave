import { useState } from "react";
import GameScreen from "./game/GameScreen";

export default function App() {
  const [tutorial, setTutorial] = useState(false); // the tutorial is a local game: a separate GameScreen with no backend game
  return (
    <main className="scv-shell">
      <h1 className="scv-title">The Sorcerer's Cave</h1>
      {tutorial
        ? <GameScreen key="tutorial" local onLocalExit={() => setTutorial(false)} />
        : <GameScreen onStartTutorial={() => setTutorial(true)} />}
    </main>
  );
}
