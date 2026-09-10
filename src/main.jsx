import React from "react";
import { createRoot } from "react-dom/client";
import DailyPicker from "./app.jsx";
import { loadState, loadSync } from "./storage.js";

// Load saved state before first render so the app never flashes the starter set.
(async () => {
  const [initial, initialSync] = await Promise.all([loadState(), loadSync()]);
  createRoot(document.getElementById("root")).render(<DailyPicker initial={initial} initialSync={initialSync} />);
})();
