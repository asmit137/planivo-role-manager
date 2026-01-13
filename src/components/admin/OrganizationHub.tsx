import { Tabs, TabsContent, TabsTrigger } from '@/components/ui/tabs';
import { Building2, FolderTree, Building } from 'lucide-react';
import OrganizationManagement from './OrganizationManagement';
import WorkspaceManagement from './WorkspaceManagement';
import FacilityUserManagement from './FacilityUserManagement';
import CategoryDepartmentManagement from './CategoryDepartmentManagement';
import { ErrorBoundary } from 'react-error-boundary';
import { ErrorState } from '@/components/layout/ErrorState';
import { ResponsiveTabsList } from '@/components/layout/ResponsiveTabsList';

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
      <div className="space-y-4 md:space-y-6">
        <Tabs defaultValue="organizations" className="space-y-4">
          <ResponsiveTabsList>
            <TabsTrigger value="organizations" className="min-h-[44px] px-3 text-sm">
              <Building className="h-4 w-4 mr-1.5 sm:mr-2 shrink-0" />
              <span className="hidden sm:inline">Organizations</span>
              <span className="sm:hidden">Orgs</span>
            </TabsTrigger>
            <TabsTrigger value="workspaces" className="min-h-[44px] px-3 text-sm">
              <Building2 className="h-4 w-4 mr-1.5 sm:mr-2 shrink-0" />
              <span className="hidden sm:inline">Workspaces</span>
              <span className="sm:hidden">Work</span>
            </TabsTrigger>
            <TabsTrigger value="facilities" className="min-h-[44px] px-3 text-sm">
              <Building2 className="h-4 w-4 mr-1.5 sm:mr-2 shrink-0" />
              <span className="hidden sm:inline">Facilities</span>
              <span className="sm:hidden">Fac</span>
            </TabsTrigger>
            <TabsTrigger value="categories" className="min-h-[44px] px-3 text-sm">
              <FolderTree className="h-4 w-4 mr-1.5 sm:mr-2 shrink-0" />
              <span className="hidden sm:inline">Categories & Depts</span>
              <span className="sm:hidden">Cat</span>
            </TabsTrigger>
          </ResponsiveTabsList>

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

