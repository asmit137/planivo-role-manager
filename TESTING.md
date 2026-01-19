# Planivo Role Manager - Role-Based Testing Guide

This document provides a consolidated checklist for testing the application across all user roles. It is designed to ensure that each role has the correct access permissions, dashboard visibility, and functional capabilities.

## 1. Common Workflows (All Roles)

These scenarios apply to every user type in the system.

### Authentication
- [ ] **Login**: Verify successful login redirects to the correct Dashboard.
- [ ] **Logout**: Verify logging out redirects to the login page and clears session.
- [ ] **Password Reset**: Verify "Forgot Password" flow works correctly.
- [ ] **Profile**: Verify the user can update their own optional profile details (if applicable).

### Notifications & Communication
- [ ] **View Notifications**: Click the notification bell. Verify recent alerts (vacation status, etc.) are visible.
- [ ] **Mark as Read**: Verify notifications can be dismissed or marked as read.

---

## 2. Role-Specific Test Scenarios

### 2.1 🛡️ Super Admin
**Scope**: Entire System Control.
**Dashboard**: `SuperAdminDashboard`

- [ ] **Dashboard Load**: Verify complete system overview statistics are visible.
- [ ] **Organization Management**:
    - [ ] Create a new Organization.
    - [ ] Edit/Delete an existing Organization.
- [ ] **Module Access**: Verify access to "Module Access" settings (Exclusive feature).
- [ ] **Developer Tools**: Verify access to "Developer Tools" (Exclusive feature).
- [ ] **User Management**: Ability to see and manage users spanning across different organizations.

### 2.2 🏢 Organization Admin
**Scope**: Single Organization (All Workspaces/Facilities/Departments within it).
**Dashboard**: `OrganizationAdminDashboard`

- [ ] **Dashboard Load**: Verify stats specific to their Organization.
- [ ] **Structure Management**:
    - [ ] **Workspaces**: Create, Edit, Delete workspaces.
    - [ ] **Facilities**: Create Facilities linked to workspaces.
    - [ ] **Departments**: Create Departments linked to facilities.
- [ ] **Staff Management**:
    - [ ] Invite new staff members to the organization.
    - [ ] Assign roles (e.g., make a user a Department Head).
- [ ] **Policies**: Edit organization-wide policies (e.g., Vacation allowance rules).
- [ ] **Restricted Areas**: Verify **NO** access to "Module Access" or global system settings.

### 2.3 🛠️ General Admin
**Scope**: Broad Admin capabilities, similar to Super Admin but scoped/restricted.
**Dashboard**: `GeneralAdminDashboard`

- [ ] **Dashboard Load**: Verify admin-level stats for the assigned scope.
- [ ] **Workspace Management**: Verify ability to view and manage workspaces (as per recent refinements).
- [ ] **Feature Parity Check**:
    - [ ] Verify access to User Management.
    - [ ] Verify access to Organization settings.
- [ ] **Restrictions**:
    - [ ] Confirm **NO** access to "Module Access".
    - [ ] Confirm **NO** access to "Developer Tools".

### 2.4 🏗️ Workplace Supervisor
**Scope**: Specific Workplace (and all contained Facilities/Departments).
**Dashboard**: `WorkplaceSupervisorDashboard`

- [ ] **Dashboard Load**: Verify stats are filtered to *only* their assigned Workplace.
- [ ] **Facility Oversight**: View list of facilities within the workspace.
- [ ] **Approvals (Tier 3)**:
    - [ ] Receive/View vacation requests that have escalated or require high-level approval.
    - [ ] Approve/Reject requests.

### 2.5 🏭 Facility Supervisor
**Scope**: Specific Facility (and all contained Departments).
**Dashboard**: `FacilitySupervisorDashboard`

- [ ] **Dashboard Load**: Verify stats are filtered to *only* their assigned Facility.
- [ ] **Department Oversight**: View list of departments within the facility.
- [ ] **Approvals (Tier 2)**:
    - [ ] Receive/View vacation requests from departments in their facility.
    - [ ] Approve/Reject requests.

### 2.6 👥 Department Head
**Scope**: Specific Department.
**Dashboard**: `DepartmentHeadDashboard`

- [ ] **Dashboard Load**: Verify stats are filtered to *only* their Department.
- [ ] **Staff Management**:
    - [ ] specific list of staff members in the department.
    - [ ] Manage shifts or schedules for these staff members.
- [ ] **Vacation Approvals (Tier 1)**:
    - [ ] **Receive Notification**: When a staff member requests vacation.
    - [ ] **Review**: Open request details.
    - [ ] **Action**: Approve (forwards to next level if needed) or Reject (notifies staff).

### 2.7 👤 Staff
**Scope**: Personal Data & Assigned Shift Tasks.
**Dashboard**: `StaffDashboard`

- [ ] **Dashboard Load**: View personal schedule, upcoming shifts, and vacation balance.
- [ ] **Vacation Request**:
    - [ ] Create a new vacation request. Select type and dates.
    - [ ] Verify functionality of "Split Dates" if applicable.
    - [ ] Submit and verify status becomes "Pending".
- [ ] **Schedule View**:
    - [ ] View personal calendar.
    - [ ] Check responsiveness on mobile view (375px width).
- [ ] **Messages**:
    - [ ] Receive generic notifications.
    - [ ] Receive DM from Manager upon plan creation/approval.

---

## 3. Integration Testing Flows

These flows involve interaction between multiple roles.

### Flow A: The Approval Chain
1.  **Staff** submits a vacation request.
2.  **Department Head** sees it and Approves.
3.  (If configured) **Facility Supervisor** sees it and Approves.
4.  **Staff** receives "Approved" notification.

### Flow B: Manager-Led Planning
1.  **Department Head** creates a vacation plan *for* a Staff member.
2.  **System** auto-approves the plan.
3.  **Staff** receives a Chat Message (DM) from the Department Head with details.

### Flow C: Organization Setup
1.  **Organization Admin** creates a "Main Workspace".
2.  **Organization Admin** creates "North Facility" inside "Main Workspace".
3.  **Organization Admin** creates "HR Department" inside "North Facility".
4.  **Organization Admin** assigns User A as "Department Head" of "HR Department".
5.  **User A** logs in and sees the `DepartmentHeadDashboard`.

---
**Note**: When testing, use Incognito windows or multiple browsers to simulate different users logged in simultaneously.
