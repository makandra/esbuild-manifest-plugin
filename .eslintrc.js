module.exports = {
  extends: [
    'standard',
  ],
  ignorePatterns: [],
  rules: {
    'comma-dangle': ['error', 'always-multiline'],
    'padded-blocks': 'off',
    'space-before-function-paren': [
      'error', {
        anonymous: 'never',
        named: 'never',
        asyncArrow: 'always',
      },
    ],
  },
}
