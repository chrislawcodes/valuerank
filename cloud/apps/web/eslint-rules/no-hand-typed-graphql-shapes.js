'use strict';

/**
 * Flags hand-typed object literal shapes in GraphQL operations files.
 * Shapes should be codegen-backed (TSTypeReference or TSIndexedAccessType),
 * not written by hand as TSTypeLiteral.
 *
 * Allowed:
 *   export type Foo = DomainsQuery['domains'][number]   // TSIndexedAccessType
 *   export type Foo = NonNullable<SomeQuery['field']>   // TSTypeReference
 *   export type Foo = Omit<Generated, 'key'> & { key: 'A' | 'B' | null } // mixed intersection
 *
 * Flagged:
 *   export type Foo = { id: string; name: string }      // pure TSTypeLiteral
 *   export type Foo = { domains: Domain[] }             // single-prop wrapper
 *   export type Foo = { a: string } & { b: number }    // all-literal intersection
 */

/** @type {import('eslint').Rule.RuleModule} */
module.exports = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Disallow hand-typed object literal shapes in GraphQL operations files. Use codegen-generated type aliases instead.',
      category: 'Best Practices',
    },
    schema: [],
    messages: {
      handTypedShape:
        'Hand-typed object literal shape detected. Derive this type from a codegen-generated type (e.g. SomeQuery[\'field\'][number]) instead of writing { ... } manually.',
    },
  },

  create(context) {
    return {
      TSTypeAliasDeclaration(node) {
        if (isHandTypedShape(node.typeAnnotation)) {
          context.report({
            node: node.typeAnnotation,
            messageId: 'handTypedShape',
          });
        }
      },
    };
  },
};

/**
 * Returns true if the type node is a hand-typed shape that should be flagged.
 *
 * Flags:
 *   - TSTypeLiteral with ≥ 1 member (object literal shape)
 *   - TSIntersectionType where every constituent is a TSTypeLiteral (all hand-typed)
 *
 * Allows (returns false):
 *   - TSTypeReference (e.g. NonNullable<X>, Omit<X, 'y'>)
 *   - TSIndexedAccessType (e.g. SomeQuery['field'])
 *   - TSIntersectionType that has at least one non-TSTypeLiteral branch
 *     (e.g. Omit<X, 'y'> & { y: narrowed } — legitimate utility-type narrowing)
 */
function isHandTypedShape(node) {
  if (!node) return false;

  if (node.type === 'TSTypeLiteral') {
    return node.members.length >= 1;
  }

  if (node.type === 'TSIntersectionType') {
    const allLiterals = node.types.every((t) => t.type === 'TSTypeLiteral');
    return allLiterals;
  }

  return false;
}
