import { useQuery } from 'urql';
import {
  DEFINITION_ANCESTORS_QUERY,
  DEFINITION_DESCENDANTS_QUERY,
  type Definition,
  type DefinitionAncestorsQueryVariables,
  type DefinitionAncestorsQueryResult,
  type DefinitionDescendantsQueryVariables,
  type DefinitionDescendantsQueryResult,
} from '../api/operations/definitions';

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
  definitions: Definition[],
  rootId: string,
  startDepth: number = 0
): TreeNode | null {
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
      nodeMap.get(node.parentId)!.children.push(node);
    }
  }

  // Find root node
  const root = nodeMap.get(rootId);
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

  const ancestors = ancestorsResult.data?.definitionAncestors ?? [];
  const descendants = descendantsResult.data?.definitionDescendants ?? [];

  // Build tree from ancestors and descendants
  let tree: TreeNode | null = null;

  if (ancestors.length > 0 || descendants.length > 0) {
    // Find root ancestor
    const rootAncestor = ancestors.find((a) => a.parentId === null) ?? ancestors[0];

    if (rootAncestor) {
      // Combine all definitions into one tree
      const allDefinitions = [...ancestors, ...descendants];
      tree = buildTree(allDefinitions, rootAncestor.id);
    } else if (descendants.length > 0) {
      // Current definition is the root
      tree = buildTree(descendants, definitionId);
    }
  }

  const loading = ancestorsResult.fetching || descendantsResult.fetching;
  const error =
    ancestorsResult.error || descendantsResult.error
      ? new Error(
          ancestorsResult.error?.message || descendantsResult.error?.message || 'Failed to load version tree'
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
