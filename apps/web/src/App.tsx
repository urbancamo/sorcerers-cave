import GameScreen from "./game/GameScreen";

export default function App() {
  return (
    <main className="grid min-h-screen place-items-center gap-6 bg-stone-950 text-stone-100">
      <h1 className="text-3xl font-bold tracking-wide">The Sorcerer's Cave</h1>
      <GameScreen />
    </main>
  );
}
