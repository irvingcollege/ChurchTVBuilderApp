import { defineConfig } from "astro/config";
import netlify from "@astrojs/netlify";
export default defineConfig({
  output: "server",
  devToolbar: { enabled: false },
  // The CSP permits same-origin script files, so small scripts must stay external.
  vite: { build: { assetsInlineLimit: 0 } },
  adapter: netlify({
    imageCDN: false,
    devFeatures: {
      images: false,
      environmentVariables: false,
      edgeFunctions: false,
    },
  }),
  server: { host: true },
});
