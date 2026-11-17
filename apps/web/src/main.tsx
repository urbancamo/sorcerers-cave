import React from "react";
import ReactDOM from "react-dom/client";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import App from "./App";
import { FullscreenCorner } from "./game/shell/FullscreenCorner";
import { convex } from "./convex";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ConvexAuthProvider client={convex}>
      <App />
      <FullscreenCorner />
    </ConvexAuthProvider>
  </React.StrictMode>,
);
