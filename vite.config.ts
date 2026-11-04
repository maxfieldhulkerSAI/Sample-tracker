import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig({
  // Relative asset URLs so the build works at https://<user>.github.io/<repo>/ and at /.
  base: "./",
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // Code shared with the Supabase edge functions (prompts, Stability and Gemini clients).
      "@shared": path.resolve(__dirname, "./supabase/functions/_shared"),
    },
  },
});
