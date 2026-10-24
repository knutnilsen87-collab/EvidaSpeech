import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./design/base.css";
import "./ui/ui.css";
import "./app.css";

const root = document.getElementById("root");
if (!root) throw new Error("Fant ikke #root");
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>
);
