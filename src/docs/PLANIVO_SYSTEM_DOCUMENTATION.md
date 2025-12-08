# Planivo - Workforce Management Platform
## Complete System Documentation

---

## 1. System Overview

Planivo is a comprehensive workforce management platform designed for hierarchical organizations. It provides end-to-end management of users, organizational structure, vacation planning, task management, scheduling, training events, and internal communications.

### Key Features
- **Role-Based Access Control**: 6-tier hierarchical user roles
- **Modular Architecture**: 10 independent feature modules
- **Real-Time Updates**: Live data synchronization across all dashboards
- **Multi-Level Approvals**: 3-level vacation approval workflow
- **Video Conferencing**: Integrated Jitsi Meet for 500+ participants
- **Automated Reminders**: Scheduled notifications and task creation

---

## 2. System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         PLANIVO PLATFORM                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
│  │   Frontend  │  │   Backend   │  │      Database           │ │
│  │   (React)   │◄─┤  (Supabase) │◄─┤    (PostgreSQL)         │ │
│  │   + Vite    │  │  Edge Func  │  │    + RLS Policies       │ │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘ │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                    CORE MODULES                              ││
│  ├──────────┬──────────┬──────────┬──────────┬────────────────┤│
│  │   User   │  Org     │ Vacation │  Task    │   Training     ││
│  │  Mgmt    │Structure │ Planning │  Mgmt    │   & Meetings   ││
│  ├──────────┼──────────┼──────────┼──────────┼────────────────┤│
│  │Scheduling│ Staff    │Messaging │  Notif   │   Core Auth    ││
│  │          │  Mgmt    │          │          │                ││
│  └──────────┴──────────┴──────────┴──────────┴────────────────┘│
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. User Roles & Hierarchy

### 3.1 Role Overview

| Level | Role | Scope | Primary Responsibilities |
|-------|------|-------|-------------------------|
| 1 | **Super Admin** | System-wide | Full system control, all modules |
| 2 | **General Admin** | Workspace | Workspace administration |
| 3 | **Workplace Supervisor** | Workspace | Operational oversight |
| 4 | **Facility Supervisor** | Facility | Facility operations, scheduling |
| 5 | **Department Head** | Department | Staff & vacation management |
| 6 | **Staff** | Individual | View-only, task completion |

### 3.2 Role Details

#### Super Admin
- **Scope**: Entire system across all organizations
- **Can Create**: All user roles
- **Key Capabilities**:
  - Manage organizations and workspaces
  - Configure system-wide settings
  - Create/manage categories and department templates
  - Configure vacation rules
  - Manage Jitsi server configuration
  - Access all modules with full permissions

#### General Admin
- **Scope**: Single workspace
- **Can Create**: Workplace Supervisor, Facility Supervisor, Department Head, Staff
- **Key Capabilities**:
  - Manage users within workspace
  - Assign categories/departments to workspace
  - Oversee vacation approvals
  - Create training events

#### Workplace Supervisor
- **Scope**: Single workspace
- **Can Create**: Facility Supervisor, Department Head, Staff
- **Key Capabilities**:
  - Level 3 vacation approvals (final)
  - Create workspace-wide tasks
  - View all workspace data
  - Create training events

#### Facility Supervisor
- **Scope**: Single facility
- **Can Create**: Department Head, Staff
- **Key Capabilities**:
  - Create and publish schedules
  - Level 2 vacation approvals
  - Create facility-level tasks
  - Assign departments to schedules

#### Department Head
- **Scope**: Single department
- **Can Create**: Staff only
- **Key Capabilities**:
  - Manage department staff
  - Assign specialties to staff
  - Level 1 vacation approvals
  - Assign staff to shifts
  - Create department tasks

#### Staff
- **Scope**: Individual only
- **Can Create**: None
- **Key Capabilities**:
  - View assigned tasks and complete them
  - Submit vacation requests
  - View own schedule
  - Register for training events
  - Send/receive messages

---

## 4. Module System

### 4.1 Module Architecture

Each module operates independently with:
- **Lazy Loading**: Modules load on-demand
- **Error Boundaries**: Isolated error handling
- **Granular Permissions**: 4 permission levels per module
  - `can_view`: Read access
  - `can_edit`: Modify access
  - `can_delete`: Remove access
  - `can_admin`: Full administrative access

### 4.2 Module Permissions by Role

| Module | Super Admin | General Admin | Workplace Sup | Facility Sup | Dept Head | Staff |
|--------|-------------|---------------|---------------|--------------|-----------|-------|
| Core | Full | Full | Full | Full | Full | View |
| User Management | Full | Edit | View | View | Edit* | None |
| Organization | Full | Edit | View | View | None | None |
| Staff Management | Full | View | View | View | Full | None |
| Vacation Planning | Full | Full | Full | Edit | Edit | View |
| Task Management | Full | Full | Full | Full | Full | View |
| Scheduling | Full | View | View | Full | Edit | View |
| Training | Full | Full | Full | Full | View | View |
| Messaging | Full | Full | Full | Full | Full | Full |
| Notifications | Full | Full | Full | Full | Full | Full |

*Department Head can only edit staff in their department

---

## 5. Detailed Module Documentation

### 5.1 Core System Module

**Purpose**: Authentication, session management, user profiles

#### Features
- Email/password authentication
- Forced password change on first login (default: "123456")
- Session management
- User profile viewing/editing
- Password change functionality

#### User Interactions
```
User → Login Page → Auth Check → Force Password Change? → Dashboard
                                         ↓
                              Password Change Dialog
```

---

### 5.2 User Management Module

**Purpose**: Create, edit, and manage users across the organization

#### Features
- Single user creation with role assignment
- Bulk user upload via Excel template
- User status toggle (active/inactive)
- Role management (add/remove roles)
- Specialty assignment

#### Creation Hierarchy
| Creator Role | Can Create |
|--------------|------------|
| Super Admin | All roles |
| General Admin | Workplace Sup, Facility Sup, Dept Head, Staff |
| Workplace Supervisor | Facility Sup, Dept Head, Staff |
| Facility Supervisor | Dept Head, Staff |
| Department Head | Staff only |

#### Bulk Upload Template Fields
- Full Name (required)
- Email (required)
- Role (required)
- Workspace
- Facility
- Department
- Specialty

---

### 5.3 Organization Structure Module

**Purpose**: Manage hierarchical organizational units

#### Hierarchy
```
Organization
    └── Workspace (multiple)
            └── Facility (multiple)
                    └── Department (multiple)
                            └── Specialty (multiple)
```

#### Components

**Organizations**
- Top-level entity
- Contains multiple workspaces
- Managed by Super Admin only

**Workspaces**
- Operational unit within organization
- Contains facilities
- Has vacation rules configuration
- Assigns categories/department templates

**Facilities**
- Physical or logical location
- Contains departments
- Managed by General Admin or higher

**Departments**
- Functional unit within facility
- Staff are assigned to departments
- Has minimum staffing requirements

**Specialties** (formerly Subdepartments)
- Area of expertise within department
- Staff have specialty assignments
- Used for conflict detection in vacation planning

**Categories**
- Grouping mechanism for departments
- System-wide templates (e.g., Medical, Engineering, Dental)
- Workspaces select which categories to use

---

### 5.4 Staff Management Module

**Purpose**: Department-level staff oversight

#### Features
- View department staff list
- Assign/change staff specialties
- View staff schedules
- Monitor staff vacation status

#### Access Rules
- Department Heads see only their department's staff
- Specialty assignment is exclusive to Department Head
- Staff cannot self-select specialties

---

### 5.5 Vacation Planning Module

**Purpose**: Request, approve, and track employee vacations

#### Vacation Types
- Annual Leave
- Sick Leave
- Personal Leave
- Maternity/Paternity Leave
- Unpaid Leave
- Custom types (configurable)

#### 3-Level Approval Workflow

```
Staff Submits Request
        ↓
┌───────────────────┐
│ Level 1: Dept Head│ → Reject → Notify Staff
└────────┬──────────┘
         ↓ Approve
┌───────────────────────┐
│ Level 2: Facility Sup │ → Reject → Notify Staff
└────────┬──────────────┘
         ↓ Approve
┌─────────────────────────┐
│ Level 3: Workplace Sup  │ → Reject → Notify Staff
└────────┬────────────────┘
         ↓ Approve
    FULLY APPROVED
```

#### Status Values
| Status | Description |
|--------|-------------|
| `draft` | Initial creation, not submitted |
| `department_pending` | Awaiting Department Head approval |
| `facility_pending` | Awaiting Facility Supervisor approval |
| `workspace_pending` | Awaiting Workplace Supervisor approval |
| `approved` | Fully approved at all levels |
| `rejected` | Rejected at any level |

#### Conflict Detection
- **Specialty Conflicts**: Detects when multiple staff in same specialty request overlapping dates
- **Acknowledgment Required**: Approvers must acknowledge conflicts with reason
- **Cascading Acknowledgment**: Each approval level sees previous acknowledgments
- **Per-Segment Approval**: Individual date segments can be approved/rejected

#### Vacation Rules (Workspace-Level)
- `max_vacation_splits`: Maximum segments per plan
- `min_vacation_notice_days`: Required advance notice (default: 14)
- `max_concurrent_vacations`: Per department limit (default: 3)
- `vacation_year_start_month`: Calendar vs fiscal year

#### Calendar View
- Visual calendar display of approved vacations
- Filter by status: Approved Only, Pending Only, All
- Role-based visibility
- Quick filters: Next 30/60/90 days

---

### 5.6 Task Management Module

**Purpose**: Create, assign, and track tasks

#### Task Scope Types
| Scope | Created By | Visible To |
|-------|------------|------------|
| Workspace | Workplace Supervisor | All workspace staff |
| Facility | Facility Supervisor | All facility staff |
| Department | Department Head | Department staff |

#### Task Properties
- Title, Description
- Due Date
- Priority (Low, Medium, High, Urgent)
- Status (Active, In Progress, Completed, Cancelled)
- Assignees (multiple staff)

#### Automated Scheduling Reminders
- Cron job runs daily at 8 AM
- 10 days before month-end:
  - Creates tasks for all Department Heads
  - Title: "[Month Name] Schedule"
  - Due date: Last day of current month
  - Notifications sent automatically

---

### 5.7 Scheduling Module

**Purpose**: Staff scheduling and shift management

#### Workflow

```
┌─────────────────────┐
│ Facility Supervisor │
│   Creates Schedule  │
│   Defines Shifts    │
│   Assigns Depts     │
│   Publishes         │
└──────────┬──────────┘
           ↓
┌─────────────────────┐
│   Department Head   │
│   Assigns Staff     │
│   to Published      │
│   Shifts            │
└──────────┬──────────┘
           ↓
┌─────────────────────┐
│       Staff         │
│   Views Assigned    │
│   Shifts (Read-only)│
└─────────────────────┘
```

#### Schedule Properties
- Name
- Date Range (start/end)
- Department(s) - multi-select
- Status (Draft, Published)
- Shift Count (1, 2, or 3)

#### Shift Configuration
- Shift Name (e.g., "Morning", "Evening", "Night")
- Start Time
- End Time
- Required Staff Count
- Display Color

#### Role Capabilities
| Role | Capabilities |
|------|--------------|
| Facility Supervisor | Create, edit, publish schedules; Define shifts |
| Department Head | Assign staff to shifts; View department schedules |
| Staff | View assigned shifts only (read-only) |

---

### 5.8 Meeting & Training Module

**Purpose**: Training events and video meetings with Jitsi integration

#### Event Types
- Training
- Workshop
- Seminar
- Webinar
- Meeting
- Conference

#### Location Types
| Type | Description |
|------|-------------|
| Physical | In-person at specified address |
| Online | Video conference via Jitsi |
| Hybrid | Both physical and online options |

#### Jitsi Meet Integration

**Capabilities**:
- Up to 500+ participants (with clustering)
- All participants can unmute/ask questions
- Moderator controls (mute all, kick, lobby)
- Screen sharing
- Recording (via Jibri)
- Persistent chat (Supabase Realtime)

**Configuration** (Super Admin):
- Jitsi Server URL
- App ID (for JWT auth)
- App Secret

#### Event Lifecycle

```
Admin Creates Event (Draft)
        ↓
Admin Publishes Event
        ↓
Users Register for Event
        ↓
System Sends Reminder (1 day before)
        ↓
Event Goes Live → Users Join Meeting
        ↓
Attendance Tracked Automatically
        ↓
Event Completes → Attendance Report Available
```

#### Attendance Tracking
- Automatic join/leave timestamp logging
- Duration calculation
- Status: Present (>80%), Partial (50-80%), Absent (<50%)
- IP address logging (optional)
- Export to Excel

#### Event Creator Permissions
| Role | Can Create Events |
|------|-------------------|
| Super Admin | Yes |
| General Admin | Yes |
| Workplace Supervisor | Yes |
| Facility Supervisor | Yes |
| Department Head | No (View only) |
| Staff | No (View only) |

---

### 5.9 Messaging Module

**Purpose**: Internal communication between users

#### Features
- Direct messages (1-to-1)
- Group conversations
- Real-time message delivery (Supabase Realtime)
- Message history
- Read receipts (last_read_at)
- Workspace-scoped conversations

#### Conversation Rules
- Users can only message within their workspace
- Conversation creators can add participants
- All participants see message history

---

### 5.10 Notifications Module

**Purpose**: System-generated alerts and reminders

#### Notification Types

| Type | Trigger | Recipients |
|------|---------|------------|
| `vacation_submitted` | Staff submits vacation | Approvers |
| `vacation_approved` | Approval at any level | Staff |
| `vacation_rejected` | Rejection at any level | Staff |
| `task_assigned` | Task assignment | Assignee |
| `task_due_soon` | 1 day before due date | Assignee |
| `training_registered` | Event registration | Registrant |
| `training_reminder` | 1 day before event | Registrants |
| `schedule_published` | Schedule published | Department staff |
| `schedule_reminder` | 10 days before month-end | Department Heads |

#### Notification Properties
- Title
- Message
- Type
- Related ID (links to source entity)
- Is Read (boolean)
- Created At

---

## 6. Cross-Module Interactions

### 6.1 Vacation + Notifications
```
Vacation Status Change → Create Notification → Notify Relevant Users
```

### 6.2 Scheduling + Tasks
```
10 Days Before Month-End → Create Task for Dept Heads → Send Notification
```

### 6.3 Training + Attendance
```
User Joins Meeting → Log Attendance → Calculate Duration on Leave
```

### 6.4 User Management + All Modules
```
User Created → Profile Created → Roles Assigned → Module Access Granted
```

---

## 7. Database Schema Overview

### 7.1 Core Tables

| Table | Purpose |
|-------|---------|
| `profiles` | User profile information |
| `user_roles` | Role assignments with scope |
| `organizations` | Top-level entities |
| `workspaces` | Operational units |
| `facilities` | Physical/logical locations |
| `departments` | Functional units |
| `categories` | Department groupings |

### 7.2 Feature Tables

| Table | Module |
|-------|--------|
| `vacation_plans` | Vacation Planning |
| `vacation_splits` | Vacation date segments |
| `vacation_approvals` | Approval records |
| `vacation_types` | Leave type definitions |
| `tasks` | Task Management |
| `task_assignments` | Task-to-user assignments |
| `schedules` | Scheduling |
| `shifts` | Shift definitions |
| `shift_assignments` | Shift-to-staff assignments |
| `training_events` | Meeting & Training |
| `training_registrations` | Event registrations |
| `training_attendance` | Attendance records |
| `training_meeting_chat` | Meeting chat messages |
| `conversations` | Messaging |
| `messages` | Message content |
| `notifications` | System notifications |

### 7.3 Configuration Tables

| Table | Purpose |
|-------|---------|
| `module_definitions` | Module metadata |
| `role_module_access` | Role-to-module permissions |
| `workspace_module_access` | Workspace-level overrides |
| `jitsi_server_config` | Jitsi configuration |
| `workspace_categories` | Category assignments |
| `workspace_departments` | Department assignments |

---

## 8. Security Model

### 8.1 Authentication
- Email/password authentication
- Forced password change on first login
- Default password: "123456"
- Session management via Supabase Auth

### 8.2 Authorization
- Row-Level Security (RLS) on all tables
- Role-based access control
- Scope-based data isolation
- Module-level permissions

### 8.3 RLS Policy Patterns

**User's Own Data**:
```sql
USING (auth.uid() = user_id)
```

**Hierarchical Access**:
```sql
USING (
  has_role(auth.uid(), 'super_admin') OR
  (workspace_id IN (SELECT get_user_workspaces(auth.uid())))
)
```

**Multi-Level Approval**:
```sql
USING (
  (status = 'department_pending' AND has_role_in_department(...)) OR
  (status = 'facility_pending' AND has_role_in_facility(...)) OR
  ...
)
```

---

## 9. Real-Time Updates

### 9.1 Supabase Realtime Integration

All dashboards subscribe to relevant tables for live updates:

| Dashboard | Subscribed Tables |
|-----------|-------------------|
| Super Admin | workspaces, profiles, organizations, user_roles |
| Department Head | vacation_plans, tasks, schedules, notifications |
| Staff | task_assignments, shift_assignments, notifications |
| All | notifications, messages |

### 9.2 Implementation Pattern
```typescript
useRealtimeSubscription('table_name', ['*'], () => {
  queryClient.invalidateQueries({ queryKey: ['query-key'] });
});
```

---

## 10. API Reference

### 10.1 Edge Functions

| Function | Purpose |
|----------|---------|
| `bootstrap-admin` | Create initial Super Admin |
| `create-user` | Create new user with role |
| `bulk-create-staff` | Bulk user import |
| `bulk-upload-users` | Excel template processing |
| `create-notification` | Generate system notification |
| `scheduling-reminder` | Automated schedule reminders |
| `validate-module-system` | Module configuration validation |

### 10.2 Database Functions

| Function | Purpose |
|----------|---------|
| `has_role(user_id, role)` | Check if user has role |
| `has_role_in_workspace(user_id, role, workspace_id)` | Workspace-scoped role check |
| `get_user_modules(user_id)` | Get user's accessible modules |
| `has_module_access(user_id, module_key)` | Check module access |
| `get_user_workspaces(user_id)` | Get user's workspaces |
| `check_vacation_conflicts(plan_id, dept_id)` | Detect vacation conflicts |
| `can_view_task(user_id, task_id)` | Task visibility check |

---

## 11. Deployment & Configuration

### 11.1 Environment Variables
- `VITE_SUPABASE_URL`: Supabase project URL
- `VITE_SUPABASE_PUBLISHABLE_KEY`: Supabase anon key
- `VITE_SUPABASE_PROJECT_ID`: Project identifier

### 11.2 Initial Setup
1. Run database migrations
2. Access `/bootstrap` route
3. Create Super Admin account
4. Configure Jitsi server (optional)
5. Create organization structure
6. Add users

### 11.3 Jitsi Server Requirements (for 500+ participants)

| Component | Specs |
|-----------|-------|
| Jitsi Meet (Web) | 2 vCPU, 4GB RAM |
| Prosody | 2 vCPU, 4GB RAM |
| Jicofo | 2 vCPU, 4GB RAM |
| JVB Nodes (3-5) | 8 vCPU, 16GB RAM each |
| Jibri (recording) | 4 vCPU, 8GB RAM |
| Load Balancer | 2 vCPU, 2GB RAM |

---

## 12. Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2024-12 | Initial release with all core modules |
| 1.1.0 | 2024-12 | Added Jitsi Meet integration |
| 1.2.0 | 2024-12 | Added vacation conflict detection |
| 1.3.0 | 2024-12 | Added scheduling module |

---

## 13. Support & Maintenance

### Common Issues

**Login Issues**
- Verify email is correct
- Check if account is active
- Reset password if needed

**Vacation Not Appearing**
- Check if submitted (not draft)
- Verify department assignment
- Check RLS policies

**Schedule Not Visible**
- Confirm schedule is published
- Verify department assignment
- Check user role permissions

---

*Planivo - Powered by INMATION.AI*
