import { Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSidebar } from '@/components/ui/sidebar';
import NotificationBell from '@/components/notifications/NotificationBell';
import UserProfile from '@/components/UserProfile';
import { useModuleContext } from '@/contexts/ModuleContext';

export const MobileHeader = () => {
  const { toggleSidebar } = useSidebar();
  const { hasAccess } = useModuleContext();

  return (
    <header className="md:hidden sticky top-0 z-40 flex h-14 items-center gap-2 border-b bg-background px-3 safe-area-inset-top">
      <Button
        variant="ghost"
        size="icon"
        onClick={toggleSidebar}
        aria-label="Toggle menu"
        className="h-11 w-11 min-h-[44px] min-w-[44px] shrink-0"
      >
        <Menu className="h-5 w-5" />
      </Button>
      <div className="flex-1 min-w-0">
        <h1 className="text-lg font-semibold truncate">Planivo</h1>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {hasAccess('notifications') && <NotificationBell />}
        <UserProfile />
      </div>
    </header>
  );
};
