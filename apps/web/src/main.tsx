import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";

import App from "./App";
import { AuthProvider } from "./context/AuthContext";
import { AvatarProvider } from "./context/AvatarContext";
import "./index.css";
import "./styles/management-layout.css";

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
