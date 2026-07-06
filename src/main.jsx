import "./storage-shim.js";
import "./index.css";
import React from "react";
import { createRoot } from "react-dom/client";
import CMUOpportunityHub from "../cmu-cs-opportunity-hub.jsx";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <CMUOpportunityHub />
  </React.StrictMode>
);
