import { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth';
import { LogOut } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import NotificationBell from '@/components/notifications/NotificationBell';
import MessagingPanel from '@/components/messaging/MessagingPanel';
import UserProfile from '@/components/UserProfile';

interface DashboardLayoutProps {
  children: ReactNode;
  title: string;
  roleLabel: string;
  roleColor?: string;
}

const DashboardLayout = ({ children, title, roleLabel, roleColor = 'bg-primary' }: DashboardLayoutProps) => {
  const { signOut } = useAuth();

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card shadow-soft sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div>
                <h1 className="text-2xl font-display font-bold">Planivo</h1>
                <Badge className={`${roleColor}/10 text-${roleColor} border-${roleColor}/20 text-xs mt-1`} variant="outline">
                  {roleLabel}
                </Badge>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <NotificationBell />
              <MessagingPanel />
              <UserProfile />
              <Button onClick={signOut} variant="outline" size="sm">
                <LogOut className="mr-2 h-4 w-4" />
                Sign Out
              </Button>
            </div>
          </div>
        </div>
      </header>
      
      <main className="container mx-auto px-4 py-8 flex-1">
        <h2 className="text-3xl font-display font-bold mb-6">{title}</h2>
        {children}
      </main>

      <footer className="border-t border-border bg-card py-4">
        <div className="container mx-auto px-4 text-center">
          <p className="text-sm text-muted-foreground">
            Powered By <span className="font-semibold text-foreground">INMATION.AI</span>
          </p>
        </div>
      </footer>
    </div>
  );
};

export default DashboardLayout;
