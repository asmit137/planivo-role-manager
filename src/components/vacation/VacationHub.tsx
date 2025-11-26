import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Calendar, CheckSquare, AlertTriangle, List, Settings } from 'lucide-react';
import VacationPlanner from './VacationPlanner';
import VacationPlansList from './VacationPlansList';
import VacationApprovalWorkflow from './VacationApprovalWorkflow';
import VacationConflictDashboard from './VacationConflictDashboard';
import VacationTypeManagement from './VacationTypeManagement';
import { useUserRole } from '@/hooks/useUserRole';

interface VacationHubProps {
  departmentId?: string;
}

const VacationHub = ({ departmentId }: VacationHubProps) => {
  const { data: roles } = useUserRole();
  const isSuperAdmin = roles?.some(r => r.role === 'super_admin');
  const isStaff = roles?.some(r => r.role === 'staff');
  const isDepartmentHead = roles?.some(r => r.role === 'department_head');
  
  // Find approver role and determine level
  const approverRole = roles?.find(r => 
    ['facility_supervisor', 'workplace_supervisor'].includes(r.role)
  );
  
  const isApprover = roles?.some(r => 
    ['department_head', 'facility_supervisor', 'workplace_supervisor'].includes(r.role)
  );

  const getApprovalInfo = () => {
    if (!approverRole) return null;
    
    if (approverRole.role === 'facility_supervisor') {
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
    <div className="space-y-6">
      <Tabs defaultValue="planner" className="space-y-4">
        <TabsList className="grid w-full grid-cols-6">
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
            <TabsTrigger value="types">
              <Settings className="h-4 w-4 mr-2" />
              Vacation Types
            </TabsTrigger>
          )}
        </TabsList>

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

        {isDepartmentHead && departmentId && (
          <TabsContent value="department-plans">
            <VacationPlansList departmentId={departmentId} />
          </TabsContent>
        )}

        {isApprover && (
          <TabsContent value="conflicts">
            <VacationConflictDashboard />
          </TabsContent>
        )}

        {isSuperAdmin && (
          <TabsContent value="types">
            <VacationTypeManagement />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
};

export default VacationHub;
