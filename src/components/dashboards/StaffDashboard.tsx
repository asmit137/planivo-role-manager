import { PageHeader } from '@/components/layout';
import StaffTaskView from '@/components/tasks/StaffTaskView';
import { VacationHub } from '@/modules/vacation';
import { NotificationHub } from '@/modules/notifications';
import { MessagingHub } from '@/modules/messaging';
import { ModuleGuard } from '@/components/ModuleGuard';
import { useModuleContext } from '@/contexts/ModuleContext';
import { useLocation } from 'react-router-dom';

const StaffDashboard = () => {
  const { hasAccess } = useModuleContext();
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const activeTab = searchParams.get('tab') || (hasAccess('task_management') ? 'tasks' : 'vacation');

  return (
    <>
      {activeTab === 'tasks' && (
        <PageHeader 
          title="My Tasks" 
          description="View and complete your assigned tasks"
        />
      )}
      {activeTab === 'vacation' && (
        <PageHeader 
          title="My Vacation" 
          description="Plan and manage your vacation requests"
        />
      )}
      {activeTab === 'messaging' && (
        <PageHeader 
          title="Messaging" 
          description="Chat with your colleagues"
        />
      )}
      {activeTab === 'notifications' && (
        <PageHeader 
          title="Notifications" 
          description="View your personal notifications"
        />
      )}
      
      <div className="space-y-4">
        {activeTab === 'tasks' && hasAccess('task_management') && (
          <ModuleGuard moduleKey="task_management">
            <StaffTaskView />
          </ModuleGuard>
        )}

        {activeTab === 'vacation' && hasAccess('vacation_planning') && (
          <ModuleGuard moduleKey="vacation_planning">
            <VacationHub />
          </ModuleGuard>
        )}

        {activeTab === 'messaging' && hasAccess('messaging') && (
          <ModuleGuard moduleKey="messaging">
            <MessagingHub />
          </ModuleGuard>
        )}

        {activeTab === 'notifications' && hasAccess('notifications') && (
          <ModuleGuard moduleKey="notifications">
            <NotificationHub />
          </ModuleGuard>
        )}
      </div>
    </>
  );
};

export default StaffDashboard;
