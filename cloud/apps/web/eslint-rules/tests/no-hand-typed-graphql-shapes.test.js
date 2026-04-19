'use strict';

const { RuleTester } = require('eslint');
const rule = require('../no-hand-typed-graphql-shapes');

const ruleTester = new RuleTester({
  parser: require.resolve('@typescript-eslint/parser'),
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
});

ruleTester.run('no-hand-typed-graphql-shapes', rule, {
  valid: [
    // TSTypeReference — codegen alias
    {
      code: "export type Foo = SomeGeneratedQuery;",
    },
    // TSIndexedAccessType — indexed codegen alias
    {
      code: "export type Foo = SomeQuery['domains'][number];",
    },
    // NonNullable wrapping an indexed access
    {
      code: "export type Foo = NonNullable<SomeQuery['field']>;",
    },
    // Mixed intersection: Omit<X> & literal — utility-type narrowing (allowed)
    {
      code: "export type Foo = Omit<Generated, 'key'> & { key: 'A' | 'B' | null };",
    },
    // Primitive type (no TSTypeLiteral)
    {
      code: "export type Foo = string | null;",
    },
  ],

  invalid: [
    // Pure object literal shape
    {
      code: "export type Foo = { bar: string };",
      errors: [{ messageId: 'handTypedShape' }],
    },
    // Single-property wrapper (the exact pattern we're removing)
    {
      code: "export type DomainsQueryResult = { domains: Domain[] };",
      errors: [{ messageId: 'handTypedShape' }],
    },
    // Multi-property hand-typed shape
    {
      code: "export type Domain = { id: string; name: string; createdAt: string };",
      errors: [{ messageId: 'handTypedShape' }],
    },
    // All-literal intersection (extend-and-reshape)
    {
      code: "export type Foo = { a: string } & { b: number };",
      errors: [{ messageId: 'handTypedShape' }],
    },
  ],
});

console.log('All tests passed for no-hand-typed-graphql-shapes');
