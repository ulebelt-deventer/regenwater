import tseslint from 'typescript-eslint';
import solid from 'eslint-plugin-solid/configs/typescript';

export default tseslint.config(
  { ignores: ['dist/**'] },
  ...tseslint.configs.recommended,
  { files: ['src/**/*.tsx'], ...solid },
  // Documents inject only our own markup (logo, CSS, annotatiesSvg, which escapes user text).
  { files: ['src/server/documenten/**'], rules: { 'solid/no-innerhtml': 'off' } },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
);
