import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    console.log('Starting scheduling reminder task...')

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Get current date info
    const today = new Date()
    const currentYear = today.getFullYear()
    const currentMonth = today.getMonth()
    
    // Calculate next month's first day
    const nextMonth = new Date(currentYear, currentMonth + 1, 1)
    
    // Calculate 10 days before next month
    const reminderDate = new Date(nextMonth)
    reminderDate.setDate(reminderDate.getDate() - 10)
    
    // Check if today is the reminder date (10 days before next month)
    const isReminderDay = 
      today.getDate() === reminderDate.getDate() &&
      today.getMonth() === reminderDate.getMonth() &&
      today.getFullYear() === reminderDate.getFullYear()

    console.log(`Today: ${today.toISOString()}`)
    console.log(`Reminder date: ${reminderDate.toISOString()}`)
    console.log(`Is reminder day: ${isReminderDay}`)

    if (!isReminderDay) {
      console.log('Not a reminder day, skipping task creation')
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Not a reminder day',
          reminderDate: reminderDate.toISOString()
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get all department heads with their departments
    const { data: departmentHeads, error: dhError } = await supabase
      .from('user_roles')
      .select(`
        user_id,
        department_id,
        facility_id,
        workspace_id,
        departments:department_id (name)
      `)
      .eq('role', 'department_head')
      .not('department_id', 'is', null)

    if (dhError) {
      console.error('Error fetching department heads:', dhError)
      throw dhError
    }

    console.log(`Found ${departmentHeads?.length || 0} department heads`)

    if (!departmentHeads || departmentHeads.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'No department heads found',
          tasksCreated: 0
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get the next month name
    const nextMonthName = nextMonth.toLocaleString('default', { month: 'long', year: 'numeric' })
    
    // Create tasks for each department head
    const tasksToCreate = []
    const notificationsToCreate = []
    
    // Calculate due date (last day before next month starts)
    const dueDate = new Date(nextMonth)
    dueDate.setDate(dueDate.getDate() - 1)

    for (const dh of departmentHeads) {
      // Check if a similar task already exists for this month
      const { data: existingTask } = await supabase
        .from('tasks')
        .select('id')
        .eq('department_id', dh.department_id)
        .ilike('title', `%${nextMonthName}%`)
        .ilike('title', '%schedule%')
        .single()

      if (existingTask) {
        console.log(`Task already exists for department ${dh.department_id}, skipping`)
        continue
      }

      const departmentName = (dh.departments as any)?.name || 'Your department'

      // Create the task
      tasksToCreate.push({
        title: `Complete ${nextMonthName} Schedule - ${departmentName}`,
        description: `Please complete the staff scheduling for ${nextMonthName}. Assign staff to all shifts and ensure adequate coverage for the department.`,
        scope_type: 'department',
        department_id: dh.department_id,
        facility_id: dh.facility_id,
        workspace_id: dh.workspace_id,
        due_date: dueDate.toISOString().split('T')[0],
        priority: 'high',
        status: 'active',
        created_by: dh.user_id, // System-created but assigned to dept head
      })

      // Create notification for the department head
      notificationsToCreate.push({
        user_id: dh.user_id,
        title: 'Scheduling Reminder',
        message: `Reminder: Please complete the staff schedule for ${nextMonthName} for ${departmentName}. Due by ${dueDate.toLocaleDateString()}.`,
        type: 'scheduling_reminder',
        related_id: dh.department_id,
      })
    }

    // Insert tasks
    let tasksCreated = 0
    if (tasksToCreate.length > 0) {
      const { data: createdTasks, error: taskError } = await supabase
        .from('tasks')
        .insert(tasksToCreate)
        .select()

      if (taskError) {
        console.error('Error creating tasks:', taskError)
        throw taskError
      }
      
      tasksCreated = createdTasks?.length || 0
      console.log(`Created ${tasksCreated} scheduling tasks`)

      // Create task assignments for department heads
      const assignments = []
      for (let i = 0; i < createdTasks.length; i++) {
        assignments.push({
          task_id: createdTasks[i].id,
          assigned_to: tasksToCreate[i].created_by,
          assigned_by: tasksToCreate[i].created_by,
          status: 'pending',
        })
      }

      if (assignments.length > 0) {
        const { error: assignError } = await supabase
          .from('task_assignments')
          .insert(assignments)

        if (assignError) {
          console.error('Error creating task assignments:', assignError)
        }
      }
    }

    // Insert notifications
    let notificationsCreated = 0
    if (notificationsToCreate.length > 0) {
      const { data: createdNotifications, error: notifError } = await supabase
        .from('notifications')
        .insert(notificationsToCreate)
        .select()

      if (notifError) {
        console.error('Error creating notifications:', notifError)
      } else {
        notificationsCreated = createdNotifications?.length || 0
        console.log(`Created ${notificationsCreated} notifications`)
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Created ${tasksCreated} scheduling tasks and ${notificationsCreated} notifications`,
        tasksCreated,
        notificationsCreated,
        nextMonth: nextMonthName,
        dueDate: dueDate.toISOString().split('T')[0],
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error('Error in scheduling-reminder:', errorMessage)
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: errorMessage 
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})
