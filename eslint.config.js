import js from '@eslint/js'
import globals from 'globals'

// Lints the JavaScript/JSX in the storefront: the fetch helper, React islands,
// and config. .astro components are markup-first and are not linted here (Astro
// ships its own type/diagnostic checks via `astro build`); keep real logic in
// .js/.jsx modules so it stays covered.
export default [
  {
    ignores: ['node_modules/', 'dist/', '.astro/'],
  },
  js.configs.recommended,
  {
    files: ['**/*.{js,mjs,jsx}'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
]
