var _a, _b;
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
export default defineConfig({
    plugins: [react()],
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "src")
        }
    },
    server: {
        port: 3000,
        proxy: {
            "/api": {
                target: (_a = process.env.VITE_API_PROXY) !== null && _a !== void 0 ? _a : "http://localhost:4000",
                changeOrigin: true
            },
            "/uploads": {
                target: (_b = process.env.VITE_API_PROXY) !== null && _b !== void 0 ? _b : "http://localhost:4000",
                changeOrigin: true
            }
        }
    }
});
