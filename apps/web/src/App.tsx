import { useState } from "react";
import GameScreen from "./game/GameScreen";

export default function App() {
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
