import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";

import "./i18n";
import App from "./App";
import { AuthProvider } from "./context/AuthContext";
import { AvatarProvider } from "./context/AvatarContext";
import "./index.css";
import "./styles/management-layout.css";
// Messaging owns a large, page-scoped visual system. Keep it after legacy/global
// styles so obsolete rules in index.css cannot silently override the workspace.
import "./styles/messaging-workspace.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <AvatarProvider>
          <App />
        </AvatarProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
