import React from 'react';
import { TabsList } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

interface ResponsiveTabsListProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * A mobile-friendly TabsList wrapper with horizontal scrolling
 * and proper touch targets for mobile devices.
 */
export const ResponsiveTabsList = ({ children, className }: ResponsiveTabsListProps) => {
  return (
    <div className="w-full overflow-x-auto -mx-1 px-1 sm:mx-0 sm:px-0 scrollbar-hide">
      <TabsList
        className={cn(
          "inline-flex h-auto min-w-full w-fit justify-start gap-1 p-1 bg-muted/20",
          "flex-nowrap", // Ensure no wrapping on mobile/tablet
          "lg:flex-wrap lg:justify-center lg:w-full", // Reset for desktop (large screens)
          className
        )}
      >
        {children}
      </TabsList>
    </div>
  );
};

export default ResponsiveTabsList;
