import { ReactNode } from 'react';
import { useAuth } from '@/lib/auth';
import { useModuleContext } from '@/contexts/ModuleContext';
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';
import { AppSidebar } from './AppSidebar';
import { MobileHeader } from './MobileHeader';

interface UnifiedLayoutProps {
  children: ReactNode;
}

const UnifiedLayout = ({ children }: UnifiedLayoutProps) => {
  const { signOut } = useAuth();
  const { hasAccess } = useModuleContext();

  return (
    <SidebarProvider>
      {/* Skip to main content link for accessibility */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-md focus:outline-none"
      >
        Skip to main content
      </a>
      <AppSidebar
        hasAccess={hasAccess}
        signOut={signOut}
      />

      <SidebarInset>
        {/* Mobile Header */}
        <MobileHeader />

        {/* Main Content Area */}
        <main id="main-content" className="flex-1 p-4 md:p-6 lg:p-8" tabIndex={-1}>
          {children}
        </main>


      </SidebarInset>
    </SidebarProvider>
  );
};

export default UnifiedLayout;
