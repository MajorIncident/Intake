module.exports = {
  root: true,
  env: {
    browser: true,
    node: true,
    es2022: true,
  },
  extends: ['eslint:recommended', 'plugin:jsdoc/recommended'],
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
  plugins: ['jsdoc'],
  rules: {
    'jsdoc/require-jsdoc': [
      'error',
      {
        contexts: [
          'Program',
          'ExportNamedDeclaration > FunctionDeclaration',
          'ExportNamedDeclaration > ClassDeclaration',
          'ExportNamedDeclaration > VariableDeclaration > VariableDeclarator > ArrowFunctionExpression',
          'ExportNamedDeclaration > VariableDeclaration > VariableDeclarator > FunctionExpression',
          'ExportDefaultDeclaration > FunctionDeclaration',
          'ExportDefaultDeclaration > ClassDeclaration',
          'ExportDefaultDeclaration > ArrowFunctionExpression',
          'ExportDefaultDeclaration > FunctionExpression',
          'MethodDefinition',
        ],
        exemptEmptyConstructors: true,
        exemptEmptyFunctions: false,
        require: {
          MethodDefinition: true,
        },
      },
    ],
  },
};
