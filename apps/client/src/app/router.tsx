import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { SlotView } from "./slotView";

const router = createBrowserRouter([
  {
    path: "/",
    element: (
      <main className="route-shell">
        <SlotView />
      </main>
    )
  }
]);

export function AppRouter(): JSX.Element {
  return <RouterProvider router={router} />;
}
