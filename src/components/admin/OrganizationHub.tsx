import { Tabs, TabsContent, TabsTrigger } from '@/components/ui/tabs';
import { Building2, FolderTree, Building } from 'lucide-react';
import OrganizationManagement from './OrganizationManagement';
import WorkspaceManagement from './WorkspaceManagement';
import FacilityUserManagement from './FacilityUserManagement';
import CategoryDepartmentManagement from './CategoryDepartmentManagement';
import { ErrorBoundary } from 'react-error-boundary';
import { ErrorState } from '@/components/layout/ErrorState';
import { ResponsiveTabsList } from '@/components/layout/ResponsiveTabsList';

interface OrganizationHubProps {
  organizationId?: string;
  workspaceId?: string;
}

const OrganizationHub = ({ organizationId, workspaceId }: OrganizationHubProps = {}) => {
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
      <div className="space-y-4 md:space-y-6 px-1 sm:px-0 overflow-hidden py-1 sm:py-0">
        <Tabs defaultValue={organizationId ? "workspaces" : "organizations"} className="space-y-4 w-full">
          <ResponsiveTabsList>
            {!organizationId && (
              <TabsTrigger value="organizations" className="min-h-[44px] px-3 text-sm">
                <Building className="h-4 w-4 mr-1.5 sm:mr-2 shrink-0" />
                <span className="hidden sm:inline">Organizations</span>
                <span className="sm:hidden">Orgs</span>
              </TabsTrigger>
            )}
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

          {!organizationId && (
            <TabsContent value="organizations" className="py-6">
              <OrganizationManagement />
            </TabsContent>
          )}

          <TabsContent value="workspaces" className="py-6">
            <WorkspaceManagement
              organizationId={organizationId}
              workspaceId={workspaceId}
            />
          </TabsContent>

          <TabsContent value="facilities" className="py-6">
            <FacilityUserManagement />
          </TabsContent>

          <TabsContent value="categories" className="py-6">
            <CategoryDepartmentManagement
              organizationId={organizationId}
              workspaceId={workspaceId}
            />
          </TabsContent>
        </Tabs>
      </div>
    </ErrorBoundary>
  );
};

export default OrganizationHub;

