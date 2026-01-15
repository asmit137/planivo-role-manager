import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';

/**
 * Send notification when vacation plan status changes
 */
export const sendVacationStatusNotification = async (
  vacationPlanId: string,
  newStatus: string,
  staffId: string,
  approverName?: string,
  comment?: string
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

    // Calculate date range
    let dateRange = '';
    if (plan.vacation_splits && plan.vacation_splits.length > 0) {
      const sortedSplits = plan.vacation_splits.sort((a: any, b: any) =>
        new Date(a.start_date).getTime() - new Date(b.start_date).getTime()
      );

      const startD = new Date(sortedSplits[0].start_date);
      const endD = new Date(sortedSplits[sortedSplits.length - 1].end_date);

      if (!isNaN(startD.getTime()) && !isNaN(endD.getTime())) {
        const startDate = format(startD, 'MMM d, yyyy');
        const endDate = format(endD, 'MMM d, yyyy');
        dateRange = ` (${startDate} - ${endDate})`;
      }
    }

    // Notification based on status
    if (newStatus === 'approved') {
      let title = '✅ Vacation Approved';
      let message = `Your ${vacationType} request for ${totalDays} days${dateRange} has been fully approved${approverName ? ` by ${approverName}` : ''}.`;
      if (comment) message += ` Note: ${comment}`;

      await supabase.functions.invoke('create-notification', {
        body: {
          user_id: staffId,
          title,
          message,
          type: 'vacation',
          related_id: vacationPlanId,
        },
      });
    } else if (newStatus === 'rejected') {
      let title = '❌ Vacation Rejected';
      let message = `Your ${vacationType} request for ${totalDays} days${dateRange} has been rejected${approverName ? ` by ${approverName}` : ''}.`;
      if (comment) message += ` Reason: ${comment}`;

      await supabase.functions.invoke('create-notification', {
        body: {
          user_id: staffId,
          title,
          message,
          type: 'vacation',
          related_id: vacationPlanId,
        },
      });
    } else if (newStatus === 'pending_approval' || newStatus === 'department_pending' || newStatus === 'facility_pending' || newStatus === 'workspace_pending') {
      let title = '📋 New Vacation Request';
      let message = `${vacationType} request for ${totalDays} days needs your approval.`;

      // Get all relevant supervisors for parallel notification
      const { data: dept } = await supabase
        .from('departments')
        .select('id, facility_id, facilities(workspace_id)')
        .eq('id', plan.department_id)
        .single();

      if (dept) {
        const approversToNotify: string[] = [];

        // 1. Department Head
        const { data: deptHead } = await supabase
          .from('user_roles')
          .select('user_id')
          .eq('role', 'department_head')
          .eq('department_id', dept.id)
          .maybeSingle();
        if (deptHead) approversToNotify.push(deptHead.user_id);

        // 2. Facility Supervisor
        if (dept.facility_id) {
          const { data: facilitySuper } = await supabase
            .from('user_roles')
            .select('user_id')
            .eq('role', 'facility_supervisor')
            .eq('facility_id', dept.facility_id)
            .maybeSingle();
          if (facilitySuper) approversToNotify.push(facilitySuper.user_id);
        }

        // 3. Workspace Supervisor
        if (dept.facilities?.workspace_id) {
          const { data: workplaceSuper } = await supabase
            .from('user_roles')
            .select('user_id')
            .eq('role', 'workplace_supervisor')
            .eq('workspace_id', dept.facilities.workspace_id)
            .maybeSingle();
          if (workplaceSuper) approversToNotify.push(workplaceSuper.user_id);
        }

        // Notify each unique supervisor
        const uniqueApprovers = [...new Set(approversToNotify)];
        for (const approverId of uniqueApprovers) {
          await supabase.functions.invoke('create-notification', {
            body: {
              user_id: approverId,
              title,
              message,
              type: 'vacation',
              related_id: vacationPlanId,
            },
          });
        }
      }
    }
  } catch (error) {
    console.error('Error sending vacation notification:', error);
  }
};
