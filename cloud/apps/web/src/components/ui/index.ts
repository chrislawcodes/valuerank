// Atomic UI Components - Barrel Export
// Import components from here: import { Button, Card, Badge } from '@/components/ui'

// Core components with CVA variants
export { Button, buttonVariants } from './Button';
export type { ButtonProps } from './Button';

export { Card, CardHeader, CardContent, CardFooter, cardVariants } from './Card';
export type { CardProps } from './Card';

export { Badge, badgeVariants, getStatusVariant } from './Badge';
export type { BadgeProps } from './Badge';

export { Modal, modalVariants } from './Modal';
export type { ModalProps } from './Modal';

export { Select, selectTriggerVariants } from './Select';
export type { SelectProps, SelectOption } from './Select';

export { Avatar, avatarVariants } from './Avatar';
export type { AvatarProps } from './Avatar';

export { Tooltip, tooltipVariants } from './Tooltip';
export type { TooltipProps } from './Tooltip';

export { Input, inputVariants } from './Input';
export type { InputProps } from './Input';

export { Tabs, TabPanel, tabVariants, tabIconVariants } from './Tabs';
export type { Tab, TabsProps, TabPanelProps } from './Tabs';

export {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  ResponsiveTable,
  tableVariants,
  tableHeadVariants,
  tableCellVariants,
} from './Table';

export { CollapsibleFilters } from './CollapsibleFilters';

// Existing components (not yet converted to CVA)
export { Loading } from './Loading';
export { ErrorMessage } from './ErrorMessage';
export { EmptyState } from './EmptyState';
export { JsonEditor } from './JsonEditor';
