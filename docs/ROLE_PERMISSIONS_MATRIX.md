# Role & Functionality Permissions Matrix

This document provides a granular breakdown of what each user role can do within the Planivo system.

## 1. Governance & Administrative Roles

### Super Admin
*The ultimate system authority. Managed via the global organization.*
- **Organizations**: Create, View, Edit, and Delete any Organization.
- **Workspaces**: Full control over all workspaces across the entire platform.
- **Users**: Create, Edit, or Delete any user in the system (via Edge Functions).
- **System Config**: Manage global module definitions and default role permissions.
- **Auditing**: View global logs, system health, and cross-organization reports.

### Organization Admin (Org Admin)
*Owner level authority for a specific organization.*
- **Org Management**: Edit organization details and settings.
- **Workspaces**: Create and manage all workspaces within their organization.
- **Departments**: Manage department templates for the organization.
- **User Management**: Add/Remove users to their specific organization.
- **Permissions**: Override module access for any user in their organization.

### General Admin
*Operational administrator for the organization.*
- **Users**: View all users in the organization; edit basic profile info.
- **Auditing**: View organization-wide logs and reports.
- **Configuration**: View all workspaces, facilities, and departments.

---

## 2. Supervisor & Management Roles

### Workspace Supervisor
*Authortiy scoped to a specific Workspace.*
- **Facilities**: Manage (View/Edit) all facilities within the assigned workspace.
- **Departments**: Manage department assignments and templates within their workspace.
- **User Assignment**: Assign existing users to facilities or specific roles within their workspace.
- **Reports**: View performance and vacation reports for the entire workspace.

### Facility Supervisor
*Authority scoped to a specific Facility.*
- **Departments**: Manage (Add/Edit) departments belonging to their facility.
- **Staffing**: Assign users to departments within the facility.
- **Vacations**: Oversight of all vacation schedules within the facility (view access to all).

### Department Head
*Managerial authority over a specific Department.*
- **Vacation Approvals**: Review, Approve, or Reject vacation requests for staff in their department.
- **Shift Scheduling**: Create and publish shift schedules for the department.
- **Task Management**: Assign tasks to staff and monitor completion.
- **Staff Records**: View training and performance data for department staff.

---

## 3. Staff & Contributor Roles

### Staff
*Standard user role for individual contributors.*
- **Vacations**: Submit own vacation requests (with splits); view own request status.
- **Messaging**: Participate in conversations; create individual or group chats.
- **Tasks**: View assigned tasks and mark them as complete.
- **Profile**: Update own contact info and change personal password.
- **Schedule**: View published department schedules and their own assigned shifts.

---

## 4. Module Permission Levels

Permissions are enforced at four levels (`can_view`, `can_edit`, `can_delete`, `can_admin`):

| Module | Staff | Dept Head | Supervisor | Admin / Super Admin |
| :--- | :--- | :--- | :--- | :--- |
| **Messaging** | View/Edit (Own) | View/Edit (Own) | View/Edit (Own) | Admin |
| **Vacations** | Create (Own) | View (Dept) / Edit | View (Facility) | Admin (Global) |
| **Shift Scheduling**| View | Edit (Dept) | View (Facility) | Admin (Global) |
| **User Hub** | None | View (Dept) | View (Facility) | Full Admin |
| **Organization Hub**| None | None | None | Full Admin |

> [!NOTE]
> Scoped permissions mean a **Facility Supervisor** can only see data for "Facility A". They will have **None** or **View only** access to "Facility B".

---

## 5. Security Enforcement

These capabilities are enforced using a dual-layer approach:
1. **Frontend (UI)**: Components are wrapped in `<ModuleGuard>` which checks permissions before rendering.
2. **Backend (Database)**: PostgreSQL **Row Level Security (RLS)** policies verify the user's role and scope on every single row-level operation.
