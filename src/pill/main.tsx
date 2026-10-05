import React from "react";
import ReactDOM from "react-dom/client";
import "../gladia-tokens.css";
import "../index.css";
import "./pill.css";
import { Pill } from "./Pill";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Pill />
  </React.StrictMode>,
);
