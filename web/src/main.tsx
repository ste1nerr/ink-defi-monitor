import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, Link, RouterProvider } from "react-router-dom";
import { Layout } from "./components/Layout";
import { Panel } from "./components/Panel";
import { EmptyState } from "./components/states";
import "./index.css";
import { usePageTitle } from "./lib/usePageTitle";
import { OverviewPage } from "./pages/OverviewPage";
import { EventsPage } from "./pages/EventsPage";
import { NadoPage } from "./pages/NadoPage";
import { TydroPage } from "./pages/TydroPage";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      retry: (failureCount, error) => failureCount < 2 && !(error instanceof Error && "status" in error && error.status === 404),
      refetchOnWindowFocus: false,
    },
  },
});

function NotFound() {
  usePageTitle("Not found");
  return (
    <Panel title="Not found">
      <EmptyState>
        This page does not exist.{" "}
        <Link to="/" className="text-accent hover:underline">
          Go to the overview
        </Link>
      </EmptyState>
    </Panel>
  );
}

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: "/", element: <OverviewPage /> },
      { path: "/protocols/tydro", element: <TydroPage /> },
      { path: "/protocols/nado", element: <NadoPage /> },
      { path: "/events", element: <EventsPage /> },
      { path: "*", element: <NotFound /> },
    ],
  },
]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
