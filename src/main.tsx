import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
    <footer className="w-100">
      {" "}
      <img src="favicon.svg" alt="Logo showing C" />
    </footer>
  </StrictMode>,
);
