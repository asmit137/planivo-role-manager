import { Tabs, TabsContent, TabsTrigger } from '@/components/ui/tabs';
import { Shield, Building2, UserCog } from 'lucide-react';
import ModuleManagement from './ModuleManagement';
import WorkspaceModuleManagement from './WorkspaceModuleManagement';
import CustomRoleManagement from './CustomRoleManagement';
import { ResponsiveTabsList } from '@/components/layout/ResponsiveTabsList';

const ModuleAccessHub = () => {
  return (
    <div className="space-y-4 md:space-y-6">
      <div>
        <h2 className="text-2xl md:text-3xl font-bold tracking-tight">Module Access Control</h2>
        <p className="text-sm md:text-base text-muted-foreground">
          Configure system-wide, workspace-level, and custom role module access
        </p>
      </div>

      <Tabs defaultValue="system" className="space-y-4">
        <ResponsiveTabsList>
          <TabsTrigger value="system" className="min-h-[44px] px-3 text-sm">
            <Shield className="h-4 w-4 mr-1.5 sm:mr-2 shrink-0" />
            <span className="hidden sm:inline">System Modules</span>
            <span className="sm:hidden">System</span>
          </TabsTrigger>
          <TabsTrigger value="custom-roles" className="min-h-[44px] px-3 text-sm">
            <UserCog className="h-4 w-4 mr-1.5 sm:mr-2 shrink-0" />
            <span className="hidden sm:inline">Custom Roles</span>
            <span className="sm:hidden">Roles</span>
          </TabsTrigger>
          <TabsTrigger value="workspaces" className="min-h-[44px] px-3 text-sm">
            <Building2 className="h-4 w-4 mr-1.5 sm:mr-2 shrink-0" />
            <span className="hidden sm:inline">Workspace Overrides</span>
            <span className="sm:hidden">Workspace</span>
          </TabsTrigger>
        </ResponsiveTabsList>

        <TabsContent value="system">
          <ModuleManagement />
        </TabsContent>

        <TabsContent value="custom-roles">
          <CustomRoleManagement />
        </TabsContent>

        <TabsContent value="workspaces">
          <WorkspaceModuleManagement />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default ModuleAccessHub;

