import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { SlotView } from "./slotView";

const basename = import.meta.env.BASE_URL.replace(/\/$/, "") || "/";

const router = createBrowserRouter(
  [
    {
      path: "/",
      element: (
        <main className="route-shell">
          <SlotView />
        </main>
      )
    }
  ],
  { basename }
);

export function AppRouter(): JSX.Element {
  return <RouterProvider router={router} />;
}
