# Feature Modules Guide

This document provides a functional overview of the core modules within the Planivo Role Manager application.

## 1. Organization & Workspace Management

The system is designed for multi-tenant scalability.

- **Organization Hub**: Central dashboard for high-level admins to manage the organization's identity, subscription, and global settings.
- **Workspace Management**: Workspaces act as regional or functional divisions. Admins can create and manage multiple workspaces per organization.
- **Facility & Department Setup**: Each workspace can contain physical facilities, which in turn host functional departments.
- **Template System**: Departments can be defined as templates, allowing for rapid deployment across multiple facilities.

## 2. Unified User & Role Management

A centralized system for managing identities and authority levels.

- **Unified User Creation**: Integrated form for creating users across any organization or workspace.
- **Idempotent Provisioning**: The system handles existing Auth users gracefully, updating profiles and appending roles without creating duplicates.
- **Role Assignment**: Multiple roles can be assigned to a single user, each with its own scope (Workspace, Facility, or Department).
- **Custom Roles**: Beyond the standard hierarchy, admins can create custom roles with tailored module access permissions.

## 3. Messaging System

Real-time secure communication between staff and management.

- **Individual & Group Chats**: Support for 1-to-1 and multi-participant conversations.
- **Real-time Updates**: Powered by Supabase Realtime, messages appear instantly without page refreshes.
- **Scope-Aware Participants**: The system suggests participants based on the user's workspace and facility scope.
- **Delivery Tracking**: "Read" status tracking for group and individual messages.

## 4. Vacation Planning System

Intelligent vacation coordination with conflict detection.

- **Multi-Split Requests**: Users can submit a single vacation request composed of up to 6 distinct date ranges (splits).
- **Conflict Highlighting**: The system automatically detects and warns about overlapping vacation requests within the same department.
- **Hierarchical Approval**: Requests follow an approval chain (Department Head -> Supervisor) based on the organization's configuration.
- **Quota Management**: Enforcement of maximum concurrent vacations and minimum notice periods.

## 5. Tasks & Scheduling

- **Task Assignments**: Creation and tracking of tasks with priority levels and due dates.
- **Shift Scheduling**: Management of department shifts, staff assignments, and staffing requirements.
- **Live Calendars**: Visual representation of staffing levels and vacation schedules.
