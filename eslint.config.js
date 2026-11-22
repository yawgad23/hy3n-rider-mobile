// https://docs.expo.dev/guides/using-eslint/
import { defineConfig } from "eslint/config";
import expoConfig from "eslint-config-expo/flat.js";

export default defineConfig([
  expoConfig,
  {
    ignores: ["dist/*"],
  },
  {
    // SDK57 adds compiler-readiness diagnostics for existing source patterns.
    // React Compiler is explicitly disabled in this migration candidate; keep
    // these findings visible for a separate refactor, not blanket suppression.
    // Do not downgrade hook ordering or render-time state-update correctness.
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/set-state-in-render": "error",
      "react-hooks/immutability": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/static-components": "warn",
    },
  },
]);
