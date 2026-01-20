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
  const isSuperAdmin = roles?.some(r => r.role === 'super_admin' || r.role === 'general_admin');
  const isStrictSuperAdmin = roles?.some(r => r.role === 'super_admin');
  const isStaff = roles?.some(r => r.role === 'staff');
  const isDepartmentHead = roles?.some(r => r.role === 'department_head');

  if (isLoading) {
    return <LoadingState message="Loading vacation planning..." />;
  }

  // Find approver role and determine level (supports 3-level approval workflow)
  const approverRole = roles?.find(r =>
    ['department_head', 'facility_supervisor', 'workplace_supervisor', 'workspace_supervisor'].includes(r.role)
  );

  const isApprover = !!approverRole || isStrictSuperAdmin;

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
      <div className="space-y-4 sm:space-y-6">
        <Tabs defaultValue="calendar" className="space-y-4">
          <ResponsiveTabsList wrap>
            <TabsTrigger value="calendar" title="Calendar" className="min-h-[44px] px-2.5 sm:px-3 text-xs sm:text-sm">
              <CalendarDays className="h-5 w-5 sm:h-4 sm:w-4 sm:mr-2" />
              <span className="hidden sm:inline">Calendar</span>
            </TabsTrigger>
            <TabsTrigger value="planner" title="Plan Vacation" className="min-h-[44px] px-2.5 sm:px-3 text-xs sm:text-sm">
              <Calendar className="h-5 w-5 sm:h-4 sm:w-4 sm:mr-2" />
              <span className="hidden sm:inline">Plan Vacation</span>
            </TabsTrigger>
            <TabsTrigger value="plans" title="My Plans" className="min-h-[44px] px-2.5 sm:px-3 text-xs sm:text-sm">
              <List className="h-5 w-5 sm:h-4 sm:w-4 sm:mr-2" />
              <span className="hidden sm:inline">My Plans</span>
            </TabsTrigger>
            {(isApprover || isSuperAdmin) && (
              <TabsTrigger value="team-plans" title="Team Vacations" className="min-h-[44px] px-2.5 sm:px-3 text-xs sm:text-sm">
                <List className="h-5 w-5 sm:h-4 sm:w-4 sm:mr-2" />
                <span className="hidden sm:inline">Team Vacations</span>
              </TabsTrigger>
            )}
            {isApprover && (
              <TabsTrigger value="approvals" title="Approvals" className="min-h-[44px] px-2.5 sm:px-3 text-xs sm:text-sm">
                <CheckSquare className="h-5 w-5 sm:h-4 sm:w-4 sm:mr-2" />
                <span className="hidden sm:inline">Approvals</span>
              </TabsTrigger>
            )}
            {isApprover && (
              <TabsTrigger value="conflicts" title="Conflicts" className="min-h-[44px] px-2.5 sm:px-3 text-xs sm:text-sm">
                <AlertTriangle className="h-5 w-5 sm:h-4 sm:w-4 sm:mr-2" />
                <span className="hidden sm:inline">Conflicts</span>
              </TabsTrigger>
            )}
            {isStrictSuperAdmin && (
              <>
                <TabsTrigger value="types" title="Types" className="min-h-[44px] px-2.5 sm:px-3 text-xs sm:text-sm">
                  <Settings className="h-5 w-5 sm:h-4 sm:w-4 sm:mr-2" />
                  <span className="hidden sm:inline">Types</span>
                </TabsTrigger>
                <TabsTrigger value="balances" title="Balances" className="min-h-[44px] px-2.5 sm:px-3 text-xs sm:text-sm">
                  <CheckSquare className="h-5 w-5 sm:h-4 sm:w-4 sm:mr-2" />
                  <span className="hidden sm:inline">Balances</span>
                </TabsTrigger>
                <TabsTrigger value="rules" title="Rules" className="min-h-[44px] px-2.5 sm:px-3 text-xs sm:text-sm">
                  <Settings className="h-5 w-5 sm:h-4 sm:w-4 sm:mr-2" />
                  <span className="hidden sm:inline">Rules</span>
                </TabsTrigger>
              </>
            )}
          </ResponsiveTabsList>

          <TabsContent value="calendar">
            <ErrorBoundary fallback={<ErrorState title="Calendar Error" message="Failed to load calendar view" />}>
              <VacationCalendarView departmentId={departmentId} />
            </ErrorBoundary>
          </TabsContent>

          <TabsContent value="planner">
            <VacationPlanner departmentId={departmentId} staffOnly={isStaff} />
          </TabsContent>

          <TabsContent value="plans">
            <LeaveBalanceView />
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

          {(isApprover || isSuperAdmin) && approvalInfo && (
            <TabsContent value="team-plans">
              <VacationPlansList
                scopeType={approvalInfo.scopeType}
                scopeId={approvalInfo.scopeId}
                departmentId={departmentId}
                isSuperAdmin={isSuperAdmin}
              />
            </TabsContent>
          )}

          {isApprover && (
            <TabsContent value="conflicts">
              <VacationConflictDashboard />
            </TabsContent>
          )}

          {isStrictSuperAdmin && (
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
