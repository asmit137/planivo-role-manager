import { supabase } from '@/integrations/supabase/client';

/**
 * Send notification when vacation plan status changes
 */
export const sendVacationStatusNotification = async (
  vacationPlanId: string,
  newStatus: string,
  staffId: string,
  approverName?: string
) => {
  try {
    // Get vacation plan details
    const { data: plan } = await supabase
      .from('vacation_plans')
      .select('*, vacation_types(name), vacation_splits(*)')
      .eq('id', vacationPlanId)
      .single();

    if (!plan) return;

    const vacationType = plan.vacation_types?.name || 'Vacation';
    const totalDays = plan.total_days;

    let title = '';
    let message = '';
    let notifyUserId = staffId;

    // Notification based on status
    if (newStatus === 'approved') {
      title = '✅ Vacation Approved';
      message = `Your ${vacationType} request for ${totalDays} days has been fully approved${approverName ? ` by ${approverName}` : ''}.`;
      notifyUserId = staffId;
    } else if (newStatus === 'rejected') {
      title = '❌ Vacation Rejected';
      message = `Your ${vacationType} request for ${totalDays} days has been rejected${approverName ? ` by ${approverName}` : ''}.`;
      notifyUserId = staffId;
    } else if (newStatus === 'department_pending') {
      title = '📋 New Vacation Request';
      message = `${vacationType} request for ${totalDays} days needs your approval.`;
      // Get Department Head
      const { data: deptHead } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', 'department_head')
        .eq('department_id', plan.department_id)
        .maybeSingle();
      if (deptHead) notifyUserId = deptHead.user_id;
    } else if (newStatus === 'facility_pending') {
      title = '📋 Vacation Needs Level 2 Approval';
      message = `${vacationType} request for ${totalDays} days needs facility supervisor approval.`;
      // Get Facility Supervisor
      const { data: dept } = await supabase
        .from('departments')
        .select('facility_id')
        .eq('id', plan.department_id)
        .single();
      if (dept?.facility_id) {
        const { data: facilitySuper } = await supabase
          .from('user_roles')
          .select('user_id')
          .eq('role', 'facility_supervisor')
          .eq('facility_id', dept.facility_id)
          .maybeSingle();
        if (facilitySuper) notifyUserId = facilitySuper.user_id;
      }
    } else if (newStatus === 'workspace_pending') {
      title = '📋 Vacation Needs Final Approval';
      message = `${vacationType} request for ${totalDays} days needs workplace supervisor approval.`;
      // Get Workplace Supervisor
      const { data: dept } = await supabase
        .from('departments')
        .select('facility_id, facilities(workspace_id)')
        .eq('id', plan.department_id)
        .single();
      if (dept?.facilities?.workspace_id) {
        const { data: workplaceSuper } = await supabase
          .from('user_roles')
          .select('user_id')
          .eq('role', 'workplace_supervisor')
          .eq('workspace_id', dept.facilities.workspace_id)
          .maybeSingle();
        if (workplaceSuper) notifyUserId = workplaceSuper.user_id;
      }
    }

    // Create notification
    if (title && message && notifyUserId) {
      await supabase.functions.invoke('create-notification', {
        body: {
          user_id: notifyUserId,
          title,
          message,
          type: 'vacation',
          related_id: vacationPlanId,
        },
      });
    }
  } catch (error) {
    console.error('Error sending vacation notification:', error);
  }
};
