import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Building2, FolderTree, Building } from 'lucide-react';
import WorkspaceManagement from './WorkspaceManagement';
import FacilityUserManagement from './FacilityUserManagement';
import CategoryDepartmentManagement from './CategoryDepartmentManagement';

const OrganizationHub = () => {
  return (
    <div className="space-y-6">
      <Tabs defaultValue="workspaces" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="workspaces">
            <Building2 className="h-4 w-4 mr-2" />
            Workspaces
          </TabsTrigger>
          <TabsTrigger value="facilities">
            <Building className="h-4 w-4 mr-2" />
            Facilities
          </TabsTrigger>
          <TabsTrigger value="categories">
            <FolderTree className="h-4 w-4 mr-2" />
            Categories & Departments
          </TabsTrigger>
        </TabsList>

        <TabsContent value="workspaces">
          <WorkspaceManagement />
        </TabsContent>

        <TabsContent value="facilities">
          <FacilityUserManagement />
        </TabsContent>

        <TabsContent value="categories">
          <CategoryDepartmentManagement />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default OrganizationHub;
