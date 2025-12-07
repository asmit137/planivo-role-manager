import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { 
  Download, 
  FolderOpen, 
  FileCode, 
  Database, 
  Server, 
  Globe,
  ChevronRight,
  ChevronDown,
  FileJson,
  FileText,
  Loader2
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
interface FolderStructure {
  name: string;
  type: 'folder' | 'file';
  children?: FolderStructure[];
  description?: string;
}

const projectStructure: FolderStructure[] = [
  {
    name: 'src',
    type: 'folder',
    description: 'Frontend source code',
    children: [
      {
        name: 'components',
        type: 'folder',
        description: 'React components',
        children: [
          { name: 'admin', type: 'folder', description: 'Admin management components' },
          { name: 'dashboards', type: 'folder', description: 'Role-based dashboard components' },
          { name: 'layout', type: 'folder', description: 'Shared layout components' },
          { name: 'messaging', type: 'folder', description: 'Messaging module components' },
          { name: 'notifications', type: 'folder', description: 'Notification components' },
          { name: 'scheduling', type: 'folder', description: 'Scheduling module components' },
          { name: 'shared', type: 'folder', description: 'Shared/reusable components' },
          { name: 'tasks', type: 'folder', description: 'Task management components' },
          { name: 'ui', type: 'folder', description: 'Shadcn UI components' },
          { name: 'users', type: 'folder', description: 'User management components' },
          { name: 'vacation', type: 'folder', description: 'Vacation planning components' },
        ]
      },
      {
        name: 'contexts',
        type: 'folder',
        description: 'React contexts',
        children: [
          { name: 'ModuleContext.tsx', type: 'file', description: 'Module access context' },
        ]
      },
      {
        name: 'hooks',
        type: 'folder',
        description: 'Custom React hooks',
        children: [
          { name: 'useModule.tsx', type: 'file', description: 'Module access hook' },
          { name: 'useNotifications.tsx', type: 'file', description: 'Notifications hook' },
          { name: 'useRealtimeSubscription.tsx', type: 'file', description: 'Realtime subscription hook' },
          { name: 'useUserRole.tsx', type: 'file', description: 'User role hook' },
        ]
      },
      {
        name: 'integrations',
        type: 'folder',
        description: 'External integrations',
        children: [
          { name: 'supabase', type: 'folder', description: 'Supabase client and types' },
        ]
      },
      {
        name: 'lib',
        type: 'folder',
        description: 'Utility libraries',
        children: [
          { name: 'auth.tsx', type: 'file', description: 'Authentication utilities' },
          { name: 'utils.ts', type: 'file', description: 'General utilities' },
        ]
      },
      {
        name: 'modules',
        type: 'folder',
        description: 'Feature modules',
        children: [
          { name: 'core', type: 'folder', description: 'Core module' },
          { name: 'messaging', type: 'folder', description: 'Messaging module' },
          { name: 'notifications', type: 'folder', description: 'Notifications module' },
          { name: 'organization', type: 'folder', description: 'Organization module' },
          { name: 'staff-management', type: 'folder', description: 'Staff management module' },
          { name: 'tasks', type: 'folder', description: 'Tasks module' },
          { name: 'user-management', type: 'folder', description: 'User management module' },
          { name: 'vacation', type: 'folder', description: 'Vacation module' },
        ]
      },
      {
        name: 'pages',
        type: 'folder',
        description: 'Page components',
        children: [
          { name: 'Auth.tsx', type: 'file', description: 'Authentication page' },
          { name: 'Bootstrap.tsx', type: 'file', description: 'Bootstrap/setup page' },
          { name: 'Dashboard.tsx', type: 'file', description: 'Main dashboard page' },
        ]
      },
      { name: 'App.tsx', type: 'file', description: 'Main application component' },
      { name: 'main.tsx', type: 'file', description: 'Application entry point' },
      { name: 'index.css', type: 'file', description: 'Global styles and design tokens' },
    ]
  },
  {
    name: 'supabase',
    type: 'folder',
    description: 'Backend code (Edge Functions)',
    children: [
      {
        name: 'functions',
        type: 'folder',
        description: 'Supabase Edge Functions',
        children: [
          { name: 'bootstrap-admin', type: 'folder', description: 'Admin bootstrap function' },
          { name: 'bulk-create-staff', type: 'folder', description: 'Bulk staff creation' },
          { name: 'bulk-upload-users', type: 'folder', description: 'Bulk user upload' },
          { name: 'create-notification', type: 'folder', description: 'Notification creation' },
          { name: 'create-user', type: 'folder', description: 'User creation function' },
          { name: 'scheduling-reminder', type: 'folder', description: 'Schedule reminder cron' },
          { name: 'validate-module-system', type: 'folder', description: 'Module validation' },
        ]
      },
      { name: 'config.toml', type: 'file', description: 'Supabase configuration' },
    ]
  },
  {
    name: 'public',
    type: 'folder',
    description: 'Static assets',
    children: [
      { name: 'robots.txt', type: 'file', description: 'SEO robots file' },
      { name: 'favicon.ico', type: 'file', description: 'Site favicon' },
    ]
  },
  { name: 'index.html', type: 'file', description: 'HTML entry point' },
  { name: 'tailwind.config.ts', type: 'file', description: 'Tailwind CSS configuration' },
  { name: 'vite.config.ts', type: 'file', description: 'Vite build configuration' },
  { name: 'package.json', type: 'file', description: 'Project dependencies' },
];

const getTableDescription = (table: string): string => {
  const descriptions: Record<string, string> = {
    profiles: 'User profile information',
    user_roles: 'User role assignments with scope',
    workspaces: 'Organization workspaces',
    facilities: 'Facilities within workspaces',
    departments: 'Departments and specialties',
    categories: 'Department categories',
    workspace_categories: 'Category assignments to workspaces',
    workspace_departments: 'Department templates assigned to workspaces',
    vacation_plans: 'Staff vacation requests',
    vacation_splits: 'Individual vacation date ranges',
    vacation_approvals: 'Multi-level approval records',
    vacation_types: 'Types of vacation leave',
    tasks: 'Task definitions',
    task_assignments: 'Task assignments to staff',
    schedules: 'Work schedules',
    shifts: 'Shift definitions within schedules',
    shift_assignments: 'Staff shift assignments',
    notifications: 'User notifications',
    conversations: 'Messaging conversations',
    conversation_participants: 'Conversation membership',
    messages: 'Chat messages',
    module_definitions: 'System module registry',
    role_module_access: 'Role-based module permissions',
    workspace_module_access: 'Workspace module overrides'
  };
  return descriptions[table] || table;
};

const generateStructureText = (items: FolderStructure[], level: number): string => {
  let result = '';
  const indent = '  '.repeat(level);
  for (const item of items) {
    const icon = item.type === 'folder' ? '📁' : '📄';
    result += `${indent}${icon} ${item.name}${item.description ? ` - ${item.description}` : ''}\n`;
    if (item.children) {
      result += generateStructureText(item.children, level + 1);
    }
  }
  return result;
};

const generateProjectDocumentation = (): string => {
  return `# Planivo - Staff Management System

## Overview
Planivo is a comprehensive staff management system built with React, TypeScript, and Supabase.

## Technology Stack

### Frontend
- React 18 with TypeScript
- Vite for build tooling
- Tailwind CSS for styling
- Shadcn/ui component library
- React Query for data fetching
- React Router for navigation

### Backend
- Supabase (PostgreSQL database)
- Edge Functions (Deno runtime)
- Row Level Security (RLS)
- Realtime subscriptions

## User Roles
1. **Super Admin** - System-wide access
2. **General Admin** - Workspace-level management
3. **Workplace Supervisor** - Workspace operations
4. **Facility Supervisor** - Facility operations
5. **Department Head** - Department management
6. **Staff** - Basic user access

## Modules
- Core (authentication, navigation)
- User Management
- Organization Structure
- Staff Management
- Vacation Planning
- Task Management
- Scheduling
- Messaging
- Notifications

## Database Tables
- profiles, user_roles
- workspaces, facilities, departments
- vacation_plans, vacation_splits, vacation_approvals
- tasks, task_assignments
- schedules, shifts, shift_assignments
- notifications, conversations, messages
- module_definitions, role_module_access

## Getting Started
1. Clone the repository
2. Install dependencies: npm install
3. Set up environment variables
4. Run development server: npm run dev

Generated: ${new Date().toISOString()}
`;
};

const FolderItem = ({ item, level = 0 }: { item: FolderStructure; level?: number }) => {
  const [isOpen, setIsOpen] = useState(level < 2);

  if (item.type === 'file') {
    return (
      <div 
        className="flex items-center gap-2 py-1.5 px-2 hover:bg-muted/50 rounded text-sm"
        style={{ marginLeft: `${level * 16}px` }}
      >
        <FileCode className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        <span className="font-mono text-xs">{item.name}</span>
        {item.description && (
          <span className="text-muted-foreground text-xs ml-2">— {item.description}</span>
        )}
      </div>
    );
  }

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <button 
          className="flex items-center gap-2 py-1.5 px-2 hover:bg-muted/50 rounded text-sm w-full text-left"
          style={{ marginLeft: `${level * 16}px` }}
        >
          {isOpen ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          )}
          <FolderOpen className="h-4 w-4 text-primary flex-shrink-0" />
          <span className="font-mono text-xs font-medium">{item.name}/</span>
          {item.description && (
            <span className="text-muted-foreground text-xs ml-2">— {item.description}</span>
          )}
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        {item.children?.map((child, index) => (
          <FolderItem key={index} item={child} level={level + 1} />
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
};

export const SourceCodeHub = () => {
  const [downloadingSchema, setDownloadingSchema] = useState(false);
  const [downloadingDocs, setDownloadingDocs] = useState(false);

  const downloadFile = (content: string, filename: string, type: string) => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownloadSchema = async () => {
    setDownloadingSchema(true);
    try {
      // Fetch all table information
      const tables = [
        'profiles', 'user_roles', 'workspaces', 'facilities', 'departments',
        'categories', 'workspace_categories', 'workspace_departments',
        'vacation_plans', 'vacation_splits', 'vacation_approvals', 'vacation_types',
        'tasks', 'task_assignments', 'schedules', 'shifts', 'shift_assignments',
        'notifications', 'conversations', 'conversation_participants', 'messages',
        'module_definitions', 'role_module_access', 'workspace_module_access'
      ];

      const schemaDoc = {
        exportDate: new Date().toISOString(),
        projectName: 'Planivo',
        tables: tables.map(table => ({
          name: table,
          description: getTableDescription(table)
        })),
        roles: ['super_admin', 'general_admin', 'workplace_supervisor', 'facility_supervisor', 'department_head', 'staff'],
        modules: ['core', 'user_management', 'organization', 'staff_management', 'vacation', 'tasks', 'messaging', 'notifications']
      };

      downloadFile(
        JSON.stringify(schemaDoc, null, 2),
        'planivo-database-schema.json',
        'application/json'
      );
      toast.success('Database schema downloaded');
    } catch (error) {
      toast.error('Failed to download schema');
    } finally {
      setDownloadingSchema(false);
    }
  };

  const handleDownloadDocs = () => {
    setDownloadingDocs(true);
    try {
      const docs = generateProjectDocumentation();
      downloadFile(docs, 'planivo-documentation.md', 'text/markdown');
      toast.success('Documentation downloaded');
    } catch (error) {
      toast.error('Failed to download documentation');
    } finally {
      setDownloadingDocs(false);
    }
  };

  const handleDownloadStructure = () => {
    const structure = generateStructureText(projectStructure, 0);
    downloadFile(structure, 'planivo-project-structure.txt', 'text/plain');
    toast.success('Project structure downloaded');
  };

  return (
    <div className="space-y-6">
      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <Globe className="h-5 w-5 text-primary" />
              Frontend
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-2">React + TypeScript + Vite</p>
            <div className="flex flex-wrap gap-1">
              <Badge variant="secondary">React 18</Badge>
              <Badge variant="secondary">TypeScript</Badge>
              <Badge variant="secondary">Tailwind CSS</Badge>
              <Badge variant="secondary">Shadcn/ui</Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <Server className="h-5 w-5 text-primary" />
              Backend
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-2">Supabase Edge Functions</p>
            <div className="flex flex-wrap gap-1">
              <Badge variant="secondary">Deno</Badge>
              <Badge variant="secondary">TypeScript</Badge>
              <Badge variant="secondary">REST API</Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <Database className="h-5 w-5 text-primary" />
              Database
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-2">PostgreSQL via Supabase</p>
            <div className="flex flex-wrap gap-1">
              <Badge variant="secondary">PostgreSQL</Badge>
              <Badge variant="secondary">RLS Policies</Badge>
              <Badge variant="secondary">Realtime</Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Direct Download Options */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Download className="h-5 w-5" />
            Direct Downloads
          </CardTitle>
          <CardDescription>
            Download project documentation, schema, and structure files
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Button 
              variant="default"
              onClick={handleDownloadSchema}
              disabled={downloadingSchema}
              className="gap-2 w-full"
            >
              {downloadingSchema ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FileJson className="h-4 w-4" />
              )}
              Download Schema (JSON)
            </Button>
            
            <Button 
              variant="default"
              onClick={handleDownloadDocs}
              disabled={downloadingDocs}
              className="gap-2 w-full"
            >
              {downloadingDocs ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FileText className="h-4 w-4" />
              )}
              Download Docs (MD)
            </Button>

            <Button 
              variant="default"
              onClick={handleDownloadStructure}
              className="gap-2 w-full"
            >
              <FolderOpen className="h-4 w-4" />
              Download Structure (TXT)
            </Button>
          </div>

          <div className="bg-muted/50 p-4 rounded-lg">
            <h4 className="font-medium mb-2">For Full Source Code:</h4>
            <p className="text-sm text-muted-foreground">
              Connect to GitHub via Project Settings → Integrations → GitHub to sync and download the complete codebase.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Project Structure */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FolderOpen className="h-5 w-5" />
            Project Structure
          </CardTitle>
          <CardDescription>
            Complete file and folder structure of the application
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[500px] border rounded-lg p-2">
            {projectStructure.map((item, index) => (
              <FolderItem key={index} item={item} />
            ))}
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Tech Stack Details */}
      <Card>
        <CardHeader>
          <CardTitle>Technology Stack</CardTitle>
          <CardDescription>Libraries and frameworks used in this project</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h4 className="font-medium mb-2">Frontend Dependencies</h4>
              <ul className="text-sm space-y-1 text-muted-foreground">
                <li>• React 18 with TypeScript</li>
                <li>• Vite for build tooling</li>
                <li>• Tailwind CSS for styling</li>
                <li>• Shadcn/ui component library</li>
                <li>• React Query for data fetching</li>
                <li>• React Router for navigation</li>
                <li>• React Hook Form for forms</li>
                <li>• Zod for validation</li>
                <li>• Recharts for charts</li>
                <li>• Lucide React for icons</li>
              </ul>
            </div>
            <div>
              <h4 className="font-medium mb-2">Backend & Infrastructure</h4>
              <ul className="text-sm space-y-1 text-muted-foreground">
                <li>• Supabase for backend services</li>
                <li>• PostgreSQL database</li>
                <li>• Row Level Security (RLS)</li>
                <li>• Edge Functions (Deno runtime)</li>
                <li>• Realtime subscriptions</li>
                <li>• Authentication system</li>
                <li>• File storage</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
