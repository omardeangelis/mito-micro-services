import js from "@eslint/js"
import prettier from "eslint-plugin-prettier/recommended"
import reactHooks from "eslint-plugin-react-hooks"
import globals from "globals"
import tseslint from "typescript-eslint"

// No Next.js and no tRPC in the React app (roadmap, fase 3)
const appImports = [
  {
    group: ["next", "next/*", "next-auth", "next-auth/*"],
    message: "No Next.js in apps/web",
  },
  {
    group: ["@trpc/*"],
    message: "apps/web calls HttpApi, not tRPC",
  },
  // The server code stays out of the browser (2.2.0 of
  // brain/chore/fase-2-httpapi.md): the app reaches it through HttpApi
  {
    group: ["@mito/server", "@mito/server/*", "@mito/env", "@mito/env/*"],
    message: "Server code: apps/web calls HttpApi",
  },
]

// The tables of @mito/db too, outside the tests: a ported test may still
// build its filter columns from them, as the test of the Next.js app does
const dbImports = {
  group: ["@mito/db", "@mito/db/*"],
  message: "Server code: apps/web calls HttpApi",
}

// The pages call the backend through the hooks of src/api, which own the
// client, the runtime and the keys (H12 of brain/chore/fase-2-httpapi.md)
const transportImports = {
  group: ["@/api/runtime", "effect/http", "effect/http-api"],
  message: "Call the backend through the hooks of src/api",
}

// The toasts are Sonner's (spec toast-sonner, D12): the Toast of Radix and
// the modules that wrapped it don't come back
const toastImports = {
  paths: [
    {
      name: "radix-ui",
      importNames: ["Toast"],
      message: 'The toasts are sonner\'s: import { toast } from "sonner"',
    },
    {
      // The package of the Next.js app, hoisted to the root
      name: "@radix-ui/react-toast",
      message: 'The toasts are sonner\'s: import { toast } from "sonner"',
    },
  ],
  patterns: [
    {
      group: [
        "**/ui/toast",
        "**/ui/toaster",
        "**/ui/use-toast",
        "./toast",
        "./toaster",
        "./use-toast",
        "../toast",
        "../toaster",
        "../use-toast",
        "@radix-ui/react-toast/*",
      ],
      message: 'The toasts are sonner\'s: import { toast } from "sonner"',
    },
  ],
}

// The rules of the root .eslintrc.cjs that apply to a React app, without
// eslint-config-next (1.a.1 of brain/chore/migrazione-frontend-react.md)
export default tseslint.config(
  { ignores: ["dist"] },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  prettier,
  {
    // The two rules of the root, not the React Compiler ones of
    // `recommended`: the copied components keep their code (R6)
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
  {
    languageOptions: {
      globals: globals.browser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/array-type": "off",
      "@typescript-eslint/consistent-type-definitions": "off",
      "@typescript-eslint/consistent-type-imports": [
        "warn",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          args: "all",
          argsIgnorePattern: "^_",
          caughtErrors: "all",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],
      "@typescript-eslint/require-await": "off",
      "@typescript-eslint/no-misused-promises": [
        "error",
        { checksVoidReturn: { attributes: false } },
      ],
      "no-restricted-imports": [
        "error",
        {
          paths: toastImports.paths,
          patterns: [
            ...appImports,
            dbImports,
            transportImports,
            ...toastImports.patterns,
          ],
        },
      ],
      // The color of a product is its tone (spec design-system-web, D5). The
      // name is banned wherever it appears, so an alias, a namespace, a
      // dynamic or a relative import are caught as well
      "no-restricted-syntax": [
        "error",
        {
          // The name, and the string of a computed access (`map["…"]`)
          selector:
            ":matches(Identifier[name='getLabelColorByProductType'], Literal[value='getLabelColorByProductType'])",
          message: "Color a product with productTone of @/lib/tones",
        },
      ],
    },
  },
  {
    files: ["src/api/**", "src/test/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: toastImports.paths,
          patterns: [...appImports, dbImports, ...toastImports.patterns],
        },
      ],
    },
  },
  {
    files: ["**/_test/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: toastImports.paths,
          patterns: [...appImports, ...toastImports.patterns],
        },
      ],
    },
  }
)
