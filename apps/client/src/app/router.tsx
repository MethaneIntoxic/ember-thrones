import { Navigate, createBrowserRouter, RouterProvider } from "react-router-dom";
import { resolveRuntimeCapabilities } from "../game/platform/runtimePolicy";
import { SlotView } from "./slotView";

const runtimeCapabilities = resolveRuntimeCapabilities();

const router = createBrowserRouter(
  [
    {
      path: "/",
      element: (
        <main className="route-shell">
          <SlotView />
        </main>
      )
    },
    {
      path: "*",
      element: <Navigate to="/" replace />
    }
  ],
  { basename: runtimeCapabilities.routePolicy.basename }
);

export function AppRouter(): JSX.Element {
  return <RouterProvider router={router} />;
}
