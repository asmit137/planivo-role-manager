import { ReactNode } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LoadingState } from '@/components/layout/LoadingState';
import { EmptyState } from '@/components/layout/EmptyState';
import { ErrorState } from '@/components/layout/ErrorState';
import { Search, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface Column<T> {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  sortable?: boolean;
}

interface DataTableProps<T> {
  data?: T[];
  columns: Column<T>[];
  isLoading?: boolean;
  error?: Error | null;
  onRetry?: () => void;
  onRowClick?: (row: T) => void;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  emptyState?: {
    title: string;
    description?: string;
    action?: {
      label: string;
      onClick: () => void;
    };
  };
  className?: string;
  maxHeight?: string | number;
  enableStickyHeader?: boolean;
}

export function DataTable<T>({
  data,
  columns,
  isLoading,
  error,
  onRetry,
  onRowClick,
  searchValue,
  onSearchChange,
  searchPlaceholder = 'Search...',
  emptyState,
  maxHeight,
  enableStickyHeader = false,
  className,
}: DataTableProps<T>) {
  // Loading state
  if (isLoading) {
    return <LoadingState />;
  }

  // Error state
  if (error) {
    return (
      <ErrorState
        message={error.message || 'Failed to load data'}
        onRetry={onRetry}
      />
    );
  }

  // Empty state
  if (!data || data.length === 0) {
    if (emptyState) {
      return (
        <EmptyState
          title={emptyState.title}
          description={emptyState.description}
          action={emptyState.action ? {
            label: emptyState.action.label,
            onClick: emptyState.action.onClick,
            icon: Plus,
          } : undefined}
        />
      );
    }
    return <EmptyState title="No data available" />;
  }

  return (
    <div className={cn('space-y-4', className)}>
      {/* Search bar */}
      {onSearchChange && (
        <div className="flex items-center gap-2">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={searchPlaceholder}
              value={searchValue}
              onChange={(e) => onSearchChange(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>
      )}

      {/* Table with horizontal scroll for mobile */}
      <div
        className="rounded-md border overflow-x-auto"
        style={maxHeight ? { maxHeight, overflowY: 'auto' } : undefined}
      >
        <Table>
          <TableHeader className={cn(enableStickyHeader && "sticky top-0 z-10 bg-card shadow-sm")}>
            <TableRow>
              {columns.map((column) => (
                <TableHead key={column.key} className="whitespace-nowrap">{column.header}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((row, index) => (
              <TableRow
                key={index}
                onClick={() => onRetry ? undefined : onRowClick?.(row)}
                className={cn(
                  onRowClick && "cursor-pointer hover:bg-muted/50 transition-colors"
                )}
              >
                {columns.map((column) => (
                  <TableCell key={column.key} className="whitespace-nowrap">
                    {column.cell(row)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
