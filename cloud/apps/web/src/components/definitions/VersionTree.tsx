import { GitBranch, Calendar } from 'lucide-react';
import { useVersionTree, type TreeNode } from '../../hooks/useVersionTree';
import { Loading } from '../ui/Loading';

type VersionTreeProps = {
  definitionId: string;
  onNodeClick?: (nodeId: string) => void;
  className?: string;
};

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

type TreeNodeComponentProps = {
  node: TreeNode;
  currentNodeId: string;
  onNodeClick?: (nodeId: string) => void;
  isLast?: boolean;
  prefix?: string;
};

function TreeNodeComponent({
  node,
  currentNodeId,
  onNodeClick,
  isLast = true,
  prefix = '',
}: TreeNodeComponentProps) {
  const isCurrent = node.id === currentNodeId;
  const hasChildren = node.children.length > 0;

  return (
    <div className="font-mono text-sm">
      {/* Node line */}
      <div className="flex items-start">
        {/* Tree structure prefix */}
        <span className="text-gray-400 whitespace-pre select-none">
          {prefix}
          {node.depth > 0 && (isLast ? '└─ ' : '├─ ')}
        </span>

        {/* Node button */}
        <button
          type="button"
          onClick={() => onNodeClick?.(node.id)}
          className={`group flex items-center gap-2 px-2 py-1 rounded hover:bg-gray-100 transition-colors text-left ${
            isCurrent
              ? 'bg-teal-50 text-teal-700 font-medium'
              : 'text-gray-700 hover:text-gray-900'
          }`}
          title={`${node.name}\nCreated: ${formatDate(node.createdAt)}`}
        >
          <GitBranch
            className={`w-4 h-4 flex-shrink-0 ${
              isCurrent ? 'text-teal-600' : 'text-gray-400'
            }`}
          />
          <span className="truncate max-w-[200px]">{node.name}</span>
          {isCurrent && (
            <span className="text-xs bg-teal-600 text-white px-1.5 py-0.5 rounded-full">
              current
            </span>
          )}
        </button>

        {/* Tooltip on hover */}
        <div className="hidden group-hover:block absolute z-50 ml-2 p-2 bg-gray-900 text-white text-xs rounded shadow-lg whitespace-nowrap">
          <div className="font-medium">{node.name}</div>
          <div className="flex items-center gap-1 text-gray-300 mt-1">
            <Calendar className="w-3 h-3" />
            {formatDate(node.createdAt)}
          </div>
        </div>
      </div>

      {/* Children */}
      {hasChildren && (
        <div>
          {node.children.map((child, index) => (
            <TreeNodeComponent
              key={child.id}
              node={child}
              currentNodeId={currentNodeId}
              onNodeClick={onNodeClick}
              isLast={index === node.children.length - 1}
              prefix={`${prefix}${node.depth > 0 ? (isLast ? '   ' : '│  ') : ''}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function VersionTree({
  definitionId,
  onNodeClick,
  className = '',
}: VersionTreeProps) {
  const { tree, ancestors, descendants, currentNodeId, loading, error } =
    useVersionTree({ definitionId });

  if (loading) {
    return (
      <div className={`p-4 ${className}`}>
        <Loading size="sm" text="Loading version tree..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className={`p-4 text-red-600 text-sm ${className}`}>
        Failed to load version tree
      </div>
    );
  }

  // No tree data at all
  if (!tree) {
    // Show a message if we have no tree
    return (
      <div className={`p-4 ${className}`}>
        <div className="text-sm text-gray-500 flex items-center gap-2">
          <GitBranch className="w-4 h-4" />
          <span>This is a root definition with no forks</span>
        </div>
      </div>
    );
  }

  // Check if this is an isolated node (no ancestors or descendants)
  const isIsolated = ancestors.length === 0 && descendants.length === 0;

  return (
    <div className={`p-4 ${className}`}>
      <h3 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
        <GitBranch className="w-4 h-4" />
        Version Tree
        {isIsolated && (
          <span className="text-xs text-gray-400 font-normal">(no forks yet)</span>
        )}
      </h3>

      <div className="overflow-x-auto">
        <TreeNodeComponent
          node={tree}
          currentNodeId={currentNodeId}
          onNodeClick={onNodeClick}
        />
      </div>
    </div>
  );
}
