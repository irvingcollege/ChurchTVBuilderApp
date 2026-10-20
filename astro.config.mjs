import { defineConfig } from "astro/config";
import netlify from "@astrojs/netlify";
export default defineConfig({
  output: "server",
  devToolbar: { enabled: false },
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
