import "./styles/app.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Toaster } from "sonner";
import { ProveedorDeConfirmacion } from "@/components/dialogos";
import { ProveedorDeSesion } from "@/features/auth/sesion";
import { ErrorDeApi } from "@/lib/api";
import { router } from "./router";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Los datos se consideran frescos medio minuto: volver a una pantalla no
      // vuelve a pedirlos, y lo que se cambia invalida lo suyo.
      staleTime: 30_000,
      refetchOnWindowFocus: true,
      // Reintenta fallas de red o del servidor (una función arrancando en
      // frío), pero no un 4xx: ese no se arregla solo.
      retry: (intentos, error) =>
        !(error instanceof ErrorDeApi && error.status >= 400 && error.status < 500) && intentos < 2,
    },
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ProveedorDeConfirmacion>
        <ProveedorDeSesion>
          <RouterProvider router={router} />
        </ProveedorDeSesion>
      </ProveedorDeConfirmacion>
      <Toaster position="bottom-right" richColors closeButton toastOptions={{ duration: 4500 }} />
    </QueryClientProvider>
  </StrictMode>,
);
