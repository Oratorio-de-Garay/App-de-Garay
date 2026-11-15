import { defineConfig } from "vitest/config";

// Tests unitarios: no necesitan base ni red. Los de integración (que sí usan
// la base local) viven en *.integration.test.ts y tienen su propio proyecto.
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "shared",
          include: ["packages/shared/src/**/*.test.ts"],
          environment: "node",
        },
      },
    ],
  },
});
