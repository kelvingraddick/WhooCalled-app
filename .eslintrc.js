module.exports = {
  root: true,
  extends: '@react-native',
  ignorePatterns: ['functions/lib/**'],
  overrides: [
    {
      files: ['jest.setup.js', '__tests__/**/*.js', '__tests__/**/*.tsx'],
      env: {
        jest: true,
      },
    },
  ],
};
