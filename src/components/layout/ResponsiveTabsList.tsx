import React from 'react';
import { TabsList } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

interface ResponsiveTabsListProps {
  children: React.ReactNode;
  className?: string;
  wrap?: boolean;
}

/**
 * A mobile-friendly TabsList wrapper with horizontal scrolling (default)
 * or wrapping (if wrap=true) and proper touch targets for mobile devices.
 */
export const ResponsiveTabsList = ({ children, className, wrap = false }: ResponsiveTabsListProps) => {
  return (
    <div className={cn(
      "w-full relative max-w-full overflow-hidden",
      !wrap && "overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 scrollbar-hide"
    )}>
      <TabsList
        className={cn(
          "inline-flex h-auto min-w-full w-fit justify-start gap-1 p-1 bg-muted/20 backdrop-blur-sm",
          wrap ? "flex-wrap justify-center" : "flex-nowrap",
          "lg:flex-wrap lg:justify-center lg:w-full max-w-full",
          className
        )}
      >
        {children}
      </TabsList>
    </div>
  );
};

export default ResponsiveTabsList;
