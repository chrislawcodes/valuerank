import type { ReactNode } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';

/**
 * Table component with responsive card fallback for mobile
 *
 * On desktop (>= 640px): Renders a standard HTML table
 * On mobile (< 640px): Renders a card-based layout
 *
 * @example
 * <Table>
 *   <TableHeader>
 *     <TableRow>
 *       <TableHead>Name</TableHead>
 *       <TableHead>Status</TableHead>
 *     </TableRow>
 *   </TableHeader>
 *   <TableBody>
 *     <TableRow>
 *       <TableCell>Item 1</TableCell>
 *       <TableCell>Active</TableCell>
 *     </TableRow>
 *   </TableBody>
 * </Table>
 *
 * Or use the responsive variant for card fallback:
 *
 * <ResponsiveTable
 *   columns={['Name', 'Status', 'Date']}
 *   data={items}
 *   renderRow={(item) => [item.name, item.status, item.date]}
 *   keyExtractor={(item) => item.id}
 * />
 */

// ============================================================================
// Variants
// ============================================================================

export const tableVariants = cva('w-full text-sm', {
  variants: {
    variant: {
      default: 'border-collapse',
      bordered: 'border border-gray-200 rounded-lg overflow-hidden',
      striped: 'border-collapse',
    },
  },
  defaultVariants: {
    variant: 'default',
  },
});

export const tableHeadVariants = cva('text-left font-medium', {
  variants: {
    variant: {
      default: 'text-gray-700 bg-gray-50',
      bordered: 'text-gray-700 bg-gray-100',
    },
  },
  defaultVariants: {
    variant: 'default',
  },
});

export const tableCellVariants = cva('', {
  variants: {
    align: {
      left: 'text-left',
      center: 'text-center',
      right: 'text-right',
    },
    size: {
      sm: 'px-2 py-1.5',
      md: 'px-4 py-3',
      lg: 'px-6 py-4',
    },
  },
  defaultVariants: {
    align: 'left',
    size: 'md',
  },
});

// ============================================================================
// Table Components
// ============================================================================

type TableProps = React.HTMLAttributes<HTMLTableElement> &
  VariantProps<typeof tableVariants>;

export function Table({ className, variant, ...props }: TableProps) {
  return (
    <div className="w-full overflow-x-auto">
      <table className={cn(tableVariants({ variant }), className)} {...props} />
    </div>
  );
}

type TableHeaderProps = React.HTMLAttributes<HTMLTableSectionElement> &
  VariantProps<typeof tableHeadVariants>;

export function TableHeader({ className, variant, ...props }: TableHeaderProps) {
  return <thead className={cn(tableHeadVariants({ variant }), className)} {...props} />;
}

export function TableBody({
  className,
  ...props
}: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn('divide-y divide-gray-200', className)} {...props} />;
}

type TableRowProps = React.HTMLAttributes<HTMLTableRowElement> & {
  /** Highlight row on hover */
  hoverable?: boolean;
  /** Use alternating background colors */
  striped?: boolean;
};

export function TableRow({ className, hoverable, striped, ...props }: TableRowProps) {
  return (
    <tr
      className={cn(
        hoverable && 'hover:bg-gray-50 transition-colors',
        striped && 'even:bg-gray-50',
        className
      )}
      {...props}
    />
  );
}

type TableHeadProps = React.ThHTMLAttributes<HTMLTableCellElement> &
  VariantProps<typeof tableCellVariants>;

export function TableHead({
  className,
  align,
  size,
  ...props
}: TableHeadProps) {
  return (
    <th
      className={cn(
        tableCellVariants({ align, size }),
        'font-medium text-gray-700 border-b border-gray-200',
        className
      )}
      {...props}
    />
  );
}

type TableCellProps = React.TdHTMLAttributes<HTMLTableCellElement> &
  VariantProps<typeof tableCellVariants>;

export function TableCell({
  className,
  align,
  size,
  ...props
}: TableCellProps) {
  return (
    <td
      className={cn(tableCellVariants({ align, size }), 'text-gray-900', className)}
      {...props}
    />
  );
}

// ============================================================================
// Responsive Table (Card Fallback on Mobile)
// ============================================================================

type ResponsiveTableColumn<T> = {
  /** Column header text */
  header: string;
  /** Accessor for the cell value */
  accessor: keyof T | ((item: T) => ReactNode);
  /** Cell alignment */
  align?: 'left' | 'center' | 'right';
  /** Whether to hide this column on mobile cards */
  hideOnMobile?: boolean;
  /** Custom className for this column */
  className?: string;
};

type ResponsiveTableProps<T> = {
  /** Column definitions */
  columns: ResponsiveTableColumn<T>[];
  /** Data rows */
  data: T[];
  /** Function to extract unique key from item */
  keyExtractor: (item: T, index: number) => string;
  /** Table variant */
  variant?: 'default' | 'bordered' | 'striped';
  /** Enable row hover effect */
  hoverable?: boolean;
  /** Show loading state */
  loading?: boolean;
  /** Empty state message */
  emptyMessage?: string;
  /** Optional click handler for rows */
  onRowClick?: (item: T) => void;
  /** Additional className */
  className?: string;
};

export function ResponsiveTable<T>({
  columns,
  data,
  keyExtractor,
  variant = 'default',
  hoverable = true,
  loading = false,
  emptyMessage = 'No data to display',
  onRowClick,
  className,
}: ResponsiveTableProps<T>) {
  const getCellValue = (item: T, accessor: ResponsiveTableColumn<T>['accessor']): ReactNode => {
    if (typeof accessor === 'function') {
      return accessor(item);
    }
    const value = item[accessor];
    if (value === null || value === undefined) return '-';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-500 text-sm">Loading...</div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-gray-500 text-sm">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className={className}>
      {/* Desktop: Standard table (hidden on mobile) */}
      <div className="hidden sm:block overflow-x-auto">
        <table className={tableVariants({ variant })}>
          <thead className={tableHeadVariants({ variant: variant === 'bordered' ? 'bordered' : 'default' })}>
            <tr>
              {columns.map((col) => (
                <th
                  key={String(col.header)}
                  className={cn(
                    tableCellVariants({ align: col.align, size: 'md' }),
                    'font-medium text-gray-700 border-b border-gray-200',
                    col.className
                  )}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {data.map((item, index) => (
              <tr
                key={keyExtractor(item, index)}
                className={cn(
                  hoverable && 'hover:bg-gray-50 transition-colors',
                  variant === 'striped' && 'even:bg-gray-50',
                  onRowClick && 'cursor-pointer'
                )}
                onClick={() => onRowClick?.(item)}
              >
                {columns.map((col) => (
                  <td
                    key={String(col.header)}
                    className={cn(
                      tableCellVariants({ align: col.align, size: 'md' }),
                      'text-gray-900',
                      col.className
                    )}
                  >
                    {getCellValue(item, col.accessor)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile: Card-based layout (hidden on desktop) */}
      <div className="sm:hidden space-y-3">
        {data.map((item, index) => (
          <div
            key={keyExtractor(item, index)}
            className={cn(
              'bg-white border border-gray-200 rounded-lg p-4 space-y-2',
              hoverable && 'hover:bg-gray-50 transition-colors',
              onRowClick && 'cursor-pointer active:bg-gray-100'
            )}
            onClick={() => onRowClick?.(item)}
            role={onRowClick ? 'button' : undefined}
            tabIndex={onRowClick ? 0 : undefined}
            onKeyDown={
              onRowClick
                ? (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onRowClick(item);
                    }
                  }
                : undefined
            }
          >
            {columns
              .filter((col) => !col.hideOnMobile)
              .map((col) => (
                <div
                  key={String(col.header)}
                  className="flex justify-between items-start gap-2"
                >
                  <span className="text-xs font-medium text-gray-500 flex-shrink-0">
                    {col.header}
                  </span>
                  <span
                    className={cn(
                      'text-sm text-gray-900 text-right',
                      col.align === 'center' && 'text-center',
                      col.align === 'left' && 'text-left'
                    )}
                  >
                    {getCellValue(item, col.accessor)}
                  </span>
                </div>
              ))}
          </div>
        ))}
      </div>
    </div>
  );
}
