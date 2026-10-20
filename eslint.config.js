import tseslint from "typescript-eslint";
export default [
  { ignores: ["dist/**", ".astro/**", ".netlify/**", "node_modules/**"] },
  ...tseslint.configs.recommended,
  { rules: { "@typescript-eslint/no-explicit-any": "off" } },
];
