import { Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSidebar } from '@/components/ui/sidebar';

export const MobileHeader = () => {
  const { toggleSidebar } = useSidebar();

  return (
    <header className="md:hidden sticky top-0 z-40 flex h-14 items-center gap-4 border-b bg-background px-4">
      <Button 
        variant="ghost" 
        size="icon" 
        onClick={toggleSidebar}
        aria-label="Toggle menu"
      >
        <Menu className="h-5 w-5" />
      </Button>
      <div className="flex-1">
        <h1 className="text-lg font-semibold">Planivo</h1>
      </div>
    </header>
  );
};
