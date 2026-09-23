import js from '@eslint/js';
import globals from 'globals';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  { ignores: ['dist', 'node_modules', 'public', 'rust', 'src/wasm'] },
  js.configs.recommended,
  {
    files: ['*.config.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.node },
    },
  },
  {
    files: ['**/*.{js,jsx}'],
    ignores: ['*.config.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser, ...globals.es2022 },
    },
    settings: { react: { version: 'detect' } },
    plugins: {
      react,
      'react-hooks': reactHooks,
    },
    rules: {
      ...react.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
      'no-unused-vars': ['warn', { varsIgnorePattern: '^React$', argsIgnorePattern: '^_' }],
    },
  },
  {
    /**
     * Solid islands. Same reason the JSX transform is partitioned in
     * vite.config.js: `eslint-plugin-react` reads Solid markup as React markup
     * and reaches the opposite verdict on the same two properties.
     *
     *  - `class` is correct in Solid and wrong in Preact; `className` is the
     *    reverse. Auto-fixing `no-unknown-property` here would silently turn
     *    every island's styling into an unknown attribute on the DOM node.
     *  - `innerHTML` is a Solid property binding (it writes `el.innerHTML`);
     *    React wants `dangerouslySetInnerHTML`.
     *
     * `react-hooks` is off too: Solid's `createMemo`/`createSignal`/`createEffect`
     * are not hooks and do not follow hook calling rules — they are ordinary
     * functions that may run inside `<Show>` callbacks and derived props.
     */
    files: ['src/islands/**/*.jsx'],
    rules: {
      'react/no-unknown-property': 'off',
      'react/no-danger': 'off',
      'react-hooks/rules-of-hooks': 'off',
      'react-hooks/exhaustive-deps': 'off',
    },
  },
];
