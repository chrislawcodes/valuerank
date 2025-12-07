import { useQuery } from 'urql';
import {
  DEFINITION_QUERY,
  DEFINITION_ANCESTORS_QUERY,
  DEFINITION_DESCENDANTS_QUERY,
  type Definition,
  type DefinitionQueryVariables,
  type DefinitionQueryResult,
  type DefinitionAncestorsQueryVariables,
  type DefinitionAncestorsQueryResult,
  type DefinitionDescendantsQueryVariables,
  type DefinitionDescendantsQueryResult,
} from '../api/operations/definitions';

// Minimal definition data needed for tree
type TreeDefinition = {
  id: string;
  name: string;
  parentId: string | null;
  createdAt: string;
};

export type TreeNode = {
  id: string;
  name: string;
  parentId: string | null;
  createdAt: string;
  children: TreeNode[];
  depth: number;
};

type UseVersionTreeOptions = {
  definitionId: string;
  maxDepth?: number;
};

type UseVersionTreeResult = {
  ancestors: Definition[];
  descendants: Definition[];
  tree: TreeNode | null;
  currentNodeId: string;
  loading: boolean;
  error: Error | null;
};

// Build a tree structure from flat definitions
function buildTree(
  definitions: TreeDefinition[],
  rootId: string,
  startDepth: number = 0
): TreeNode | null {
  if (definitions.length === 0) return null;

  const nodeMap = new Map<string, TreeNode>();

  // Create nodes for all definitions
  for (const def of definitions) {
    nodeMap.set(def.id, {
      id: def.id,
      name: def.name,
      parentId: def.parentId,
      createdAt: def.createdAt,
      children: [],
      depth: 0,
    });
  }

  // Build parent-child relationships
  for (const node of nodeMap.values()) {
    if (node.parentId && nodeMap.has(node.parentId)) {
      const parent = nodeMap.get(node.parentId);
      if (parent) {
        parent.children.push(node);
      }
    }
  }

  // Find root node (the one with no parent in the set, or explicit rootId)
  let root = nodeMap.get(rootId);

  // If rootId not found, find the actual root (node whose parent is not in the map)
  if (!root) {
    for (const node of nodeMap.values()) {
      if (!node.parentId || !nodeMap.has(node.parentId)) {
        root = node;
        break;
      }
    }
  }

  if (!root) return null;

  // Calculate depths from root
  function setDepths(node: TreeNode, depth: number) {
    node.depth = depth;
    for (const child of node.children) {
      setDepths(child, depth + 1);
    }
  }
  setDepths(root, startDepth);

  // Sort children by createdAt
  function sortChildren(node: TreeNode) {
    node.children.sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
    for (const child of node.children) {
      sortChildren(child);
    }
  }
  sortChildren(root);

  return root;
}

export function useVersionTree(options: UseVersionTreeOptions): UseVersionTreeResult {
  const { definitionId, maxDepth = 10 } = options;

  // Fetch the current definition to include it in the tree
  const [currentResult] = useQuery<DefinitionQueryResult, DefinitionQueryVariables>({
    query: DEFINITION_QUERY,
    variables: { id: definitionId },
  });

  const [ancestorsResult] = useQuery<
    DefinitionAncestorsQueryResult,
    DefinitionAncestorsQueryVariables
  >({
    query: DEFINITION_ANCESTORS_QUERY,
    variables: { id: definitionId, maxDepth },
  });

  const [descendantsResult] = useQuery<
    DefinitionDescendantsQueryResult,
    DefinitionDescendantsQueryVariables
  >({
    query: DEFINITION_DESCENDANTS_QUERY,
    variables: { id: definitionId, maxDepth },
  });

  const currentDef = currentResult.data?.definition;
  const ancestors = ancestorsResult.data?.definitionAncestors ?? [];
  const descendants = descendantsResult.data?.definitionDescendants ?? [];

  // Build tree from ancestors, current, and descendants
  let tree: TreeNode | null = null;

  if (currentDef) {
    // Create tree definition for current node
    const currentTreeDef: TreeDefinition = {
      id: currentDef.id,
      name: currentDef.name,
      parentId: currentDef.parentId,
      createdAt: currentDef.createdAt,
    };

    // Combine all definitions: ancestors + current + descendants
    const allDefinitions: TreeDefinition[] = [
      ...ancestors,
      currentTreeDef,
      ...descendants,
    ];

    // Remove duplicates (in case current appears in ancestors or descendants)
    const uniqueDefinitions = Array.from(
      new Map(allDefinitions.map((d) => [d.id, d])).values()
    );

    // Find the root (oldest ancestor with no parent in our set)
    const rootAncestor = ancestors.find((a) => a.parentId === null);
    const rootId = rootAncestor?.id ?? currentDef.id;

    tree = buildTree(uniqueDefinitions, rootId);
  }

  const loading = currentResult.fetching || ancestorsResult.fetching || descendantsResult.fetching;
  const error =
    currentResult.error || ancestorsResult.error || descendantsResult.error
      ? new Error(
          currentResult.error?.message ||
          ancestorsResult.error?.message ||
          descendantsResult.error?.message ||
          'Failed to load version tree'
        )
      : null;

  return {
    ancestors,
    descendants,
    tree,
    currentNodeId: definitionId,
    loading,
    error,
  };
}
