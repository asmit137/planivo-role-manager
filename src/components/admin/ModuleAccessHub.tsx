import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Settings, Shield, Building2 } from 'lucide-react';
import ModuleManagement from './ModuleManagement';
import WorkspaceModuleManagement from './WorkspaceModuleManagement';

const ModuleAccessHub = () => {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Module Access Control</h2>
        <p className="text-muted-foreground">
          Configure system-wide and workspace-level module access
        </p>
      </div>

      <Tabs defaultValue="system" className="space-y-4">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="system">
            <Shield className="h-4 w-4 mr-2" />
            System Modules
          </TabsTrigger>
          <TabsTrigger value="workspaces">
            <Building2 className="h-4 w-4 mr-2" />
            Workspace Overrides
          </TabsTrigger>
        </TabsList>

        <TabsContent value="system">
          <ModuleManagement />
        </TabsContent>

        <TabsContent value="workspaces">
          <WorkspaceModuleManagement />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default ModuleAccessHub;
