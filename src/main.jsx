import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./index.css";
import App from "./App.jsx";
import RouteBoundary, { RouteLoading } from "./components/RouteBoundary.jsx";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <RouteBoundary>
        <React.Suspense fallback={<RouteLoading />}>
          <App />
        </React.Suspense>
      </RouteBoundary>
    </BrowserRouter>
  </React.StrictMode>,
);
