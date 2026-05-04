import tseslint from "typescript-eslint";

export default tseslint.config(
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      parserOptions: {
        project: "./tsconfig.json",
      },
    },
    rules: {
      // Prefer ?? over || for nullish coalescing
      "@typescript-eslint/prefer-nullish-coalescing": "error",
      // Disallow explicit `any`
      "@typescript-eslint/no-explicit-any": "error",
      // Require consistent type assertions
      "@typescript-eslint/consistent-type-assertions": ["error", { assertionStyle: "as" }],
      // Disallow non-null assertions — use proper null checks instead
      "@typescript-eslint/no-non-null-assertion": "error",
    },
  }
);
