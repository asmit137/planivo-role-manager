import { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth';
import { LogOut } from 'lucide-react';
import NotificationBell from '@/components/notifications/NotificationBell';
import MessagingPanel from '@/components/messaging/MessagingPanel';
import UserProfile from '@/components/UserProfile';
import { useModuleContext } from '@/contexts/ModuleContext';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar } from './AppSidebar';

interface UnifiedLayoutProps {
  children: ReactNode;
}

const UnifiedLayout = ({ children }: UnifiedLayoutProps) => {
  const { signOut } = useAuth();
  const { hasAccess } = useModuleContext();

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        
        <div className="flex-1 flex flex-col min-h-screen">
          {/* Global Header */}
          <header className="sticky top-0 z-40 border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/60 shadow-soft">
            <div className="flex h-14 items-center justify-between px-4">
              <div className="flex items-center gap-2">
                <SidebarTrigger />
              </div>
              
              <div className="flex items-center gap-2">
                {hasAccess('notifications') && <NotificationBell />}
                {hasAccess('messaging') && <MessagingPanel />}
                <UserProfile />
                <Button onClick={signOut} variant="outline" size="sm">
                  <LogOut className="mr-2 h-4 w-4" />
                  <span className="hidden sm:inline">Sign Out</span>
                </Button>
              </div>
            </div>
          </header>

          {/* Main Content Area */}
          <main className="flex-1 p-4 md:p-6 lg:p-8">
            {children}
          </main>

          {/* Footer */}
          <footer className="border-t border-border bg-card py-4 mt-auto">
            <div className="px-4 text-center">
              <p className="text-sm text-muted-foreground">
                Powered By <span className="font-semibold text-foreground">INMATION.AI</span>
              </p>
            </div>
          </footer>
        </div>
      </div>
    </SidebarProvider>
  );
};

export default UnifiedLayout;
