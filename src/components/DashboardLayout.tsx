import { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth';
import { LogOut, Calendar } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

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
              <Calendar className="h-8 w-8 text-primary" />
              <div>
                <h1 className="text-2xl font-display font-bold">Planivo</h1>
                <Badge className={`${roleColor}/10 text-${roleColor} border-${roleColor}/20 text-xs mt-1`} variant="outline">
                  {roleLabel}
                </Badge>
              </div>
            </div>
            <Button onClick={signOut} variant="outline" size="sm">
              <LogOut className="mr-2 h-4 w-4" />
              Sign Out
            </Button>
          </div>
        </div>
      </header>
      
      <main className="container mx-auto px-4 py-8">
        <h2 className="text-3xl font-display font-bold mb-6">{title}</h2>
        {children}
      </main>
    </div>
  );
};

export default DashboardLayout;
