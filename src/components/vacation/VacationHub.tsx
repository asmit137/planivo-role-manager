import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Calendar, CheckSquare, AlertTriangle, List, Settings, CalendarDays } from 'lucide-react';
import VacationPlanner from './VacationPlanner';
import VacationPlansList from './VacationPlansList';
import VacationApprovalWorkflow from './VacationApprovalWorkflow';
import VacationConflictDashboard from './VacationConflictDashboard';
import VacationTypeManagement from './VacationTypeManagement';
import VacationCalendarView from './VacationCalendarView';
import VacationRulesManagement from './VacationRulesManagement';
import { useUserRole } from '@/hooks/useUserRole';
import { ErrorBoundary } from 'react-error-boundary';
import { ErrorState } from '@/components/layout/ErrorState';
import { LoadingState } from '@/components/layout/LoadingState';

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
    ['department_head', 'facility_supervisor', 'workplace_supervisor'].includes(r.role)
  );
  
  const isApprover = !!approverRole;

  const getApprovalInfo = () => {
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
    } else if (approverRole.role === 'workplace_supervisor') {
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
        <TabsList className="flex flex-wrap gap-1 h-auto">
          <TabsTrigger value="calendar">
            <CalendarDays className="h-4 w-4 mr-2" />
            Calendar
          </TabsTrigger>
          <TabsTrigger value="planner">
            <Calendar className="h-4 w-4 mr-2" />
            Plan Vacation
          </TabsTrigger>
          <TabsTrigger value="plans">
            <List className="h-4 w-4 mr-2" />
            My Plans
          </TabsTrigger>
          {isDepartmentHead && (
            <TabsTrigger value="department-plans">
              <List className="h-4 w-4 mr-2" />
              Department Plans
            </TabsTrigger>
          )}
          {isApprover && (
            <TabsTrigger value="approvals">
              <CheckSquare className="h-4 w-4 mr-2" />
              Approvals
            </TabsTrigger>
          )}
          {isApprover && (
            <TabsTrigger value="conflicts">
              <AlertTriangle className="h-4 w-4 mr-2" />
              Conflicts
            </TabsTrigger>
          )}
          {isSuperAdmin && (
            <>
              <TabsTrigger value="types">
                <Settings className="h-4 w-4 mr-2" />
                Vacation Types
              </TabsTrigger>
              <TabsTrigger value="rules">
                <Settings className="h-4 w-4 mr-2" />
                Rules
              </TabsTrigger>
            </>
          )}
        </TabsList>

        <TabsContent value="calendar">
          <VacationCalendarView departmentId={departmentId} />
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

        {isDepartmentHead && (
          <TabsContent value="department-plans">
            <VacationPlansList departmentId={departmentId || approvalInfo?.scopeId} />
          </TabsContent>
        )}

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
