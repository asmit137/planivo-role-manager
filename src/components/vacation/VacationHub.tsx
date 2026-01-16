import { Tabs, TabsContent, TabsTrigger } from '@/components/ui/tabs';
import { Calendar, CheckSquare, AlertTriangle, List, Settings, CalendarDays } from 'lucide-react';
import VacationPlanner from './VacationPlanner';
import VacationPlansList from './VacationPlansList';
import VacationApprovalWorkflow from './VacationApprovalWorkflow';
import VacationConflictDashboard from './VacationConflictDashboard';
import VacationTypeManagement from './VacationTypeManagement';
import VacationCalendarView from './VacationCalendarView';
import VacationRulesManagement from './VacationRulesManagement';
import { ResponsiveTabsList } from '@/components/layout/ResponsiveTabsList';
import { useUserRole } from '@/hooks/useUserRole';
import { ErrorBoundary } from 'react-error-boundary';
import { ErrorState } from '@/components/layout/ErrorState';
import { LoadingState } from '@/components/layout/LoadingState';
import { LeaveBalanceView } from './LeaveBalanceView';
import { AdminBalanceManager } from './AdminBalanceManager';
import { useOrganization } from '@/contexts/OrganizationContext';

interface VacationHubProps {
  departmentId?: string;
}

const VacationHub = ({ departmentId }: VacationHubProps) => {
  const { data: roles, isLoading } = useUserRole();
  const isSuperAdmin = roles?.some(r => r.role === 'super_admin');
  const isStaff = roles?.some(r => r.role === 'staff');
  const isDepartmentHead = roles?.some(r => r.role === 'department_head');

  if (isLoading) {
    return <LoadingState message="Loading vacation planning..." />;
  }

  // Find approver role and determine level (supports 3-level approval workflow)
  const approverRole = roles?.find(r =>
    ['department_head', 'facility_supervisor', 'workplace_supervisor', 'workspace_supervisor'].includes(r.role)
  );

  const isApprover = !!approverRole || isSuperAdmin;

  const getApprovalInfo = () => {
    if (isSuperAdmin) {
      return {
        approvalLevel: 3 as const,
        scopeType: 'workspace' as const,
        scopeId: 'all'
      };
    }

    if (!approverRole) return null;

    if (approverRole.role === 'department_head') {
      return {
        approvalLevel: 1 as const,
        scopeType: 'department' as const,
        scopeId: approverRole.department_id!
      };
    } else if (approverRole.role === 'facility_supervisor') {
      return {
        approvalLevel: 2 as const,
        scopeType: 'facility' as const,
        scopeId: approverRole.facility_id!
      };
    } else if (approverRole.role === 'workplace_supervisor' || approverRole.role === 'workspace_supervisor') {
      return {
        approvalLevel: 3 as const,
        scopeType: 'workspace' as const,
        scopeId: approverRole.workspace_id!
      };
    }
    return null;
  };

  const approvalInfo = getApprovalInfo();

  return (
    <ErrorBoundary
      fallback={
        <ErrorState
          title="Vacation Planning Error"
          message="Failed to load vacation planning system"
          onRetry={() => window.location.reload()}
        />
      }
    >
      <div className="space-y-6">
        <Tabs defaultValue="calendar" className="space-y-4">
          <ResponsiveTabsList>
            <TabsTrigger value="calendar" className="min-h-[44px] px-3 text-sm">
              <CalendarDays className="h-4 w-4 mr-1.5 sm:mr-2" />
              <span>Calendar</span>
            </TabsTrigger>
            <TabsTrigger value="planner" className="min-h-[44px] px-3 text-sm">
              <Calendar className="h-4 w-4 mr-1.5 sm:mr-2" />
              <span>Plan Vacation</span>
            </TabsTrigger>
            <TabsTrigger value="plans" className="min-h-[44px] px-3 text-sm">
              <List className="h-4 w-4 mr-1.5 sm:mr-2" />
              <span>My Plans</span>
            </TabsTrigger>
            {isApprover && (
              <TabsTrigger value="team-plans" className="min-h-[44px] px-3 text-sm">
                <List className="h-4 w-4 mr-1.5 sm:mr-2" />
                <span>Team Vacations</span>
              </TabsTrigger>
            )}
            {isApprover && (
              <TabsTrigger value="approvals" className="min-h-[44px] px-3 text-sm">
                <CheckSquare className="h-4 w-4 mr-1.5 sm:mr-2" />
                <span>Approvals</span>
              </TabsTrigger>
            )}
            {isApprover && (
              <TabsTrigger value="conflicts" className="min-h-[44px] px-3 text-sm">
                <AlertTriangle className="h-4 w-4 mr-1.5 sm:mr-2" />
                <span>Conflicts</span>
              </TabsTrigger>
            )}
            {isSuperAdmin && (
              <>
                <TabsTrigger value="types" className="min-h-[44px] px-3 text-sm">
                  <Settings className="h-4 w-4 mr-1.5 sm:mr-2" />
                  <span>Types</span>
                </TabsTrigger>
                <TabsTrigger value="balances" className="min-h-[44px] px-3 text-sm">
                  <CheckSquare className="h-4 w-4 mr-1.5 sm:mr-2" />
                  <span>Balances</span>
                </TabsTrigger>
                <TabsTrigger value="rules" className="min-h-[44px] px-3 text-sm">
                  <Settings className="h-4 w-4 mr-1.5 sm:mr-2" />
                  <span>Rules</span>
                </TabsTrigger>
              </>
            )}
          </ResponsiveTabsList>

          <LeaveBalanceView />


          <TabsContent value="calendar">
            <ErrorBoundary fallback={<ErrorState title="Calendar Error" message="Failed to load calendar view" />}>
              <VacationCalendarView departmentId={departmentId} />
            </ErrorBoundary>
          </TabsContent>

          <TabsContent value="planner">
            <VacationPlanner departmentId={departmentId} staffOnly={isStaff} />
          </TabsContent>

          <TabsContent value="plans">
            <VacationPlansList staffView={true} />
          </TabsContent>


          {isApprover && approvalInfo && (
            <TabsContent value="approvals">
              <VacationApprovalWorkflow
                approvalLevel={approvalInfo.approvalLevel}
                scopeType={approvalInfo.scopeType}
                scopeId={approvalInfo.scopeId}
              />
            </TabsContent>
          )}

          <TabsContent value="team-plans">
            <VacationPlansList
              scopeType={approvalInfo.scopeType}
              scopeId={approvalInfo.scopeId}
              departmentId={departmentId}
              isSuperAdmin={isSuperAdmin}
            />
          </TabsContent>

          {isApprover && (
            <TabsContent value="conflicts">
              <VacationConflictDashboard />
            </TabsContent>
          )}

          {isSuperAdmin && (
            <>
              <TabsContent value="types">
                <VacationTypeManagement />
              </TabsContent>
              <TabsContent value="balances">
                <AdminBalanceManager />
              </TabsContent>
              <TabsContent value="rules">
                <VacationRulesManagement />
              </TabsContent>
            </>
          )}
        </Tabs>
      </div>
    </ErrorBoundary>
  );
};

export default VacationHub;
