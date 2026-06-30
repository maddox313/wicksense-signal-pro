import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const tailwindcss = require(
  require.resolve("@tailwindcss/postcss", {
    paths: [__dirname, path.join(__dirname, "../..")],
  })
);

/** @type {import('postcss-load-config').Config} */
export default {
  plugins: [tailwindcss],
};
