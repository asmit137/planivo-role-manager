# Security & RBAC System

Planivo Role Manager uses a robust security model combining PostgreSQL **Row Level Security (RLS)** with a flexible **Role-Based Access Control (RBAC)** system.

## Authentication

Authentication is handled by **Supabase Auth**.
- **Provider**: Email/Password.
- **Session Management**: JWT-based sessions stored in the client.
- **Admin Actions**: Tasks like creating users (bypassing public registration) are performed via authenticated Supabase Edge Functions using the `service_role` key.

## Identity & Profiles

Every authenticated user has a corresponding entry in the `profiles` table.
- The `profiles` table is linked to `auth.users` via the `id` field.
- **Self-Service**: Users can update their own profile and password.
- **Force Password Change**: Admins can set `force_password_change` to `true`, prompting a required update upon next login.

## Role-Based Access Control (RBAC)

The system uses a hierarchical role model with scoped authority.

### Application Roles (`app_role`)

| Role | Scope | Primary Responsibilities |
| :--- | :--- | :--- |
| **Super Admin** | System-wide | System configuration, cross-org management. |
| **Organization Admin** | Organization | Org-wide settings, workspace creation. |
| **General Admin** | Organization/Workspace | User management, auditing. |
| **Workspace Supervisor** | Workspace | Managing facilities and staff within a workspace. |
| **Facility Supervisor** | Facility | Managing departments and staff within a facility. |
| **Department Head** | Department | Staff assignments, vacation approvals. |
| **Staff** | Individual | Task management, vacation requests. |

### Role Scoping
Authority is tied to the scope defined in the `user_roles` table:
- A user can have multiple roles across different scopes (e.g., Facility Supervisor in Facility A and Staff in Facility B).
- The `useUserRole` hook fetches all active roles for the current user.

---

## Module Access Control

Access to specific UI features and API endpoints is managed via the **Module System**.

### 1. Permissions
Each module (e.g., `messaging`, `users`, `vacations`) has four permission levels:
- `can_view`: Visibility of the module.
- `can_edit`: Ability to modify data.
- `can_delete`: Ability to remove data.
- `can_admin`: Elevated administrative actions within the module.

### 2. Module Guard
The `ModuleGuard` component protects React components:
```tsx
<ModuleGuard moduleKey="users">
  <AdminUserTable />
</ModuleGuard>
```

### 3. Permission Resolution
Permissions are resolved using the `get_my_modules()` PostgreSQL function, which:
1. Checks the user's default module access based on their `app_role`.
2. Applies any user-specific overrides from `user_module_access`.
3. Returns a consolidated list of accessible modules.

## Row Level Security (RLS)

RLS is the final line of defense. Even if a user bypasses the UI, the database enforces access:
- **Profiles**: `auth.uid() = id` allows users to see/edit only themselves.
- **User Roles**: Users can only see roles within their own organization/workspace.
- **Messaging**: Users can only read messages in conversations where they are a participant.
- **Admin Functions**: Controlled via `SECURITY DEFINER` functions that check the user's role before performing actions.
