import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Building2, FolderTree, Building } from 'lucide-react';
import OrganizationManagement from './OrganizationManagement';
import WorkspaceManagement from './WorkspaceManagement';
import FacilityUserManagement from './FacilityUserManagement';
import CategoryDepartmentManagement from './CategoryDepartmentManagement';
import { ErrorBoundary } from 'react-error-boundary';
import { ErrorState } from '@/components/layout/ErrorState';

const OrganizationHub = () => {
  return (
    <ErrorBoundary
      fallback={
        <ErrorState
          title="Organization Hub Error"
          message="Failed to load organization management"
          onRetry={() => window.location.reload()}
        />
      }
    >
      <div className="space-y-6">
      <Tabs defaultValue="organizations" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="organizations">
            <Building className="h-4 w-4 mr-2" />
            Organizations
          </TabsTrigger>
          <TabsTrigger value="workspaces">
            <Building2 className="h-4 w-4 mr-2" />
            Workspaces
          </TabsTrigger>
          <TabsTrigger value="facilities">
            <Building2 className="h-4 w-4 mr-2" />
            Facilities
          </TabsTrigger>
          <TabsTrigger value="categories">
            <FolderTree className="h-4 w-4 mr-2" />
            Categories & Depts
          </TabsTrigger>
        </TabsList>

        <TabsContent value="organizations">
          <OrganizationManagement />
        </TabsContent>

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
    </ErrorBoundary>
  );
};

export default OrganizationHub;
