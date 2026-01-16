import { useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  Building2,
  UserCog,
  Calendar,
  CheckSquare,
  MessageSquare,
  Bell,
  Settings,
  LogOut,
  ShieldCheck,
  CalendarClock,
  Code,
  GraduationCap,
  FileText,
  Shield,
  BarChart3,
  Cog,
  Mail,
  Activity,
  ChevronRight,
  Archive,
  Menu,
  Briefcase,
  MapPin
} from 'lucide-react';
import { useUserRole } from '@/hooks/useUserRole';
import { Button } from '@/components/ui/button';
import NotificationBell from '@/components/notifications/NotificationBell';
import MessageNotification from '@/components/messaging/MessageNotification';
import UserProfile from '@/components/UserProfile';
import { ThemeToggleSimple } from '@/components/ThemeToggle';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
  SidebarFooter,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar';
import { OrganizationSwitcher } from './OrganizationSwitcher';

interface AppSidebarProps {
  hasAccess: (moduleKey: string) => boolean;
  signOut: () => void;
}

// Module configuration with icons and labels
const moduleConfig = [
  { key: 'core', label: 'Dashboard', icon: LayoutDashboard, path: '/dashboard', alwaysShow: true },
  {
    key: 'organization',
    label: 'Organization',
    icon: Building2,
    subItems: [
      { key: 'workspaces', label: 'Workspaces', path: '/dashboard?tab=workspaces', icon: Briefcase },
      { key: 'facilities', label: 'Facilities', path: '/dashboard?tab=facilities', icon: MapPin },
    ]
  },
  { key: 'user_management', label: 'Users & Roles', icon: Users, path: '/dashboard?tab=users' },
  { key: 'vacation_planning', label: 'Vacation', icon: Calendar, path: '/dashboard?tab=vacation' },
  { key: 'scheduling', label: 'Scheduling', icon: CalendarClock, path: '/dashboard?tab=scheduling' },
  { key: 'task_management', label: 'Tasks', icon: CheckSquare, path: '/dashboard?tab=tasks' },
  { key: 'training', label: 'Meeting & Training', icon: GraduationCap, path: '/dashboard?tab=training' },
  { key: 'messaging', label: 'Messages', icon: MessageSquare, path: '/dashboard?tab=messaging' },
  { key: 'notifications', label: 'Notifications', icon: Bell, path: '/dashboard?tab=notifications' },
  { key: 'emails', label: 'Broadcasts', icon: Mail, path: '/dashboard?tab=emails' },
];

const systemModuleConfig = [
  { key: 'analytics', label: 'Analytics', icon: BarChart3, path: '/dashboard?tab=analytics' },
  { key: 'audit', label: 'Audit Logs', icon: FileText, path: '/dashboard?tab=audit' },
  { key: 'settings', label: 'Settings', icon: Cog, path: '/dashboard?tab=settings' },
  { key: 'modules', label: 'Module Access', icon: Settings, path: '/dashboard?tab=modules' },
];

const developerModuleConfig = [
  { key: 'activity', label: 'Live Activity', icon: Activity, path: '/dashboard?tab=activity' },
  { key: 'security', label: 'Security', icon: Shield, path: '/dashboard?tab=security' },
  { key: 'validator', label: 'System Validator', icon: ShieldCheck, path: '/dashboard?tab=validator' },
];

// Inner content component that uses sidebar context (must be rendered inside Sidebar)
function SidebarInnerContent({
  hasAccess,
  signOut,
  roleLabel,
  visibleModules,
  visibleSystemModules,
  visibleDeveloperModules,
  currentTab,
  handleNavigation,
  isActive
}: {
  hasAccess: (moduleKey: string) => boolean;
  signOut: () => void;
  roleLabel: string;
  visibleModules: typeof moduleConfig;
  visibleSystemModules: typeof systemModuleConfig;
  visibleDeveloperModules: typeof developerModuleConfig;
  currentTab: string;
  handleNavigation: (path: string) => void;
  isActive: (path: string) => boolean;
}) {
  const { state, isMobile, setOpenMobile } = useSidebar();
  const collapsed = state === 'collapsed';

  const handleSidebarNavigation = (path: string) => {
    handleNavigation(path);
    if (isMobile) {
      setOpenMobile(false);
    }
  };

  return (
    <>
      <SidebarHeader className="bg-sidebar border-b border-sidebar-border p-0">
        {/* Branding with Toggle */}
        <div className={`px-4 py-6 flex items-center justify-between ${collapsed ? 'flex-col gap-4' : ''}`}>
          {!collapsed ? (
            <>
              <div>
                <h1 className="text-xl font-display font-bold text-sidebar-foreground">Planivo</h1>
                <p className="text-xs text-sidebar-foreground/60 mt-1">{roleLabel}</p>
              </div>
              <SidebarTrigger />
            </>
          ) : (
            <>
              <div className="text-lg font-display font-bold text-sidebar-foreground">P</div>
              <SidebarTrigger />
            </>
          )}
        </div>

        {/* Organization Switcher */}
        <OrganizationSwitcher />
      </SidebarHeader>

      <SidebarContent className="bg-sidebar">

        {/* Main Navigation */}
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleModules.map((module: any) => {
                if (module.subItems) {
                  return (
                    <Collapsible key={module.key} className="group/collapsible" defaultOpen={true}>
                      <SidebarMenuItem>
                        <CollapsibleTrigger asChild>
                          <SidebarMenuButton tooltip={module.label}>
                            <module.icon className={collapsed ? 'mx-auto' : 'mr-2'} size={18} />
                            {!collapsed && (
                              <>
                                <span>{module.label}</span>
                                <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                              </>
                            )}
                          </SidebarMenuButton>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <SidebarMenuSub>
                            {module.subItems.map((sub: any) => (
                              <SidebarMenuSubItem key={sub.key}>
                                <SidebarMenuSubButton
                                  onClick={() => handleSidebarNavigation(sub.path)}
                                  isActive={isActive(sub.path)}
                                >
                                  {sub.icon && <sub.icon size={16} />}
                                  <span>{sub.label}</span>
                                </SidebarMenuSubButton>
                              </SidebarMenuSubItem>
                            ))}
                          </SidebarMenuSub>
                        </CollapsibleContent>
                      </SidebarMenuItem>
                    </Collapsible>
                  );
                }

                return (
                  <SidebarMenuItem key={module.key}>
                    <SidebarMenuButton
                      onClick={() => handleSidebarNavigation(module.path)}
                      isActive={isActive(module.path)}
                      className="w-full"
                    >
                      <module.icon className={collapsed ? 'mx-auto' : 'mr-2'} size={18} />
                      {!collapsed && <span>{module.label}</span>}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* System Tools */}
        {visibleSystemModules.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>System</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {visibleSystemModules.map((module) => (
                  <SidebarMenuItem key={module.key}>
                    <SidebarMenuButton
                      onClick={() => handleSidebarNavigation(module.path)}
                      isActive={isActive(module.path)}
                      className="w-full"
                    >
                      <module.icon className={collapsed ? 'mx-auto' : 'mr-2'} size={18} />
                      {!collapsed && <span>{module.label}</span>}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}

                {/* Inactive Tabs Dropdown (Developer Tools) */}
                {visibleDeveloperModules.length > 0 && (
                  <Collapsible className="group/collapsible">
                    <SidebarMenuItem>
                      <CollapsibleTrigger asChild>
                        <SidebarMenuButton tooltip="Developer Tools">
                          <Archive className={collapsed ? 'mx-auto' : 'mr-2'} size={18} />
                          {!collapsed && (
                            <>
                              <span>Developer Tools</span>
                              <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                            </>
                          )}
                        </SidebarMenuButton>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <SidebarMenuSub>
                          {visibleDeveloperModules.map((module) => (
                            <SidebarMenuSubItem key={module.key}>
                              <SidebarMenuSubButton
                                onClick={() => handleSidebarNavigation(module.path)}
                                isActive={isActive(module.path)}
                              >
                                <module.icon size={16} />
                                <span>{module.label}</span>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          ))}
                        </SidebarMenuSub>
                      </CollapsibleContent>
                    </SidebarMenuItem>
                  </Collapsible>
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      {/* Footer with User Actions */}
      <SidebarFooter className="border-t border-sidebar-border bg-sidebar p-3 md:p-4">
        {!collapsed ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2 justify-between">
              <ThemeToggleSimple />
              {hasAccess('notifications') && <NotificationBell />}
              {hasAccess('messaging') && <MessageNotification />}
              <UserProfile collapsed={false} />
            </div>
            <Button onClick={signOut} variant="outline" size="sm" className="w-full min-h-[44px]">
              <LogOut className="mr-2 h-4 w-4" />
              Sign Out
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-2 items-center">
            <ThemeToggleSimple />
            {hasAccess('notifications') && <NotificationBell />}
            {hasAccess('messaging') && <MessageNotification />}
            <UserProfile collapsed={true} />
            <Button onClick={signOut} variant="ghost" size="icon" className="w-full min-h-[44px] min-w-[44px]">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        )}
      </SidebarFooter>
    </>
  );
}

export function AppSidebar({ hasAccess, signOut }: AppSidebarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { data: roles } = useUserRole();

  // Get current active tab from URL
  const searchParams = new URLSearchParams(location.search);
  const currentTab = searchParams.get('tab') || 'overview';

  const isSuperAdmin = roles?.some(r => r.role === 'super_admin');

  const getPrimaryRole = () => {
    if (!roles || roles.length === 0) return null;
    const roleHierarchy = ['super_admin', 'organization_admin', 'general_admin', 'workplace_supervisor', 'workspace_supervisor', 'facility_supervisor', 'department_head', 'staff', 'intern', 'custom'];
    for (const role of roleHierarchy) {
      if (roles.some(r => r.role === role)) {
        return role;
      }
    }
    return 'staff';
  };

  const primaryRole = getPrimaryRole();

  // Format role label
  const getRoleLabel = () => {
    if (!primaryRole) return '';

    // If it's a custom role, try to find the actual name
    if (primaryRole === 'custom') {
      const customRole = roles?.find(r => r.role === 'custom' && r.custom_role?.name)?.custom_role;
      if (customRole) return customRole.name;
    }

    return primaryRole.split('_').map(word =>
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
  };

  // Filter modules based on permissions
  const visibleModules = moduleConfig.filter(module => {
    // Broadcasts only for Super Admin
    if (module.key === 'emails') {
      return isSuperAdmin;
    }

    // Hide Users tab for Workspace and Facility Supervisors
    if (module.key === 'user_management') {
      if (['workplace_supervisor', 'workspace_supervisor', 'facility_supervisor'].includes(primaryRole || '')) {
        return false;
      }
    }

    // General Admin gets all modules except 'modules' (Module Access)
    if (primaryRole === 'general_admin') {
      if (module.key === 'modules') return false;
      return true;
    }

    return module.alwaysShow || hasAccess(module.key);
  });

  const visibleSystemModules = systemModuleConfig.filter(module =>
    hasAccess(module.key)
  );

  const visibleDeveloperModules = developerModuleConfig.filter(module =>
    hasAccess(module.key)
  );

  const handleNavigation = (path: string) => {
    navigate(path);
  };

  const isActive = (modulePath: string) => {
    if (modulePath === '/dashboard') {
      return location.pathname === '/dashboard' && !searchParams.get('tab');
    }
    const pathTab = new URL(`http://dummy${modulePath}`).searchParams.get('tab');
    return pathTab === currentTab;
  };

  return (
    <Sidebar
      collapsible="icon"
      className="border-r border-sidebar-border bg-sidebar z-40"
    >
      <SidebarInnerContent
        hasAccess={hasAccess}
        signOut={signOut}
        roleLabel={getRoleLabel()}
        visibleModules={visibleModules}
        visibleSystemModules={visibleSystemModules}
        visibleDeveloperModules={visibleDeveloperModules}
        currentTab={currentTab}
        handleNavigation={handleNavigation}
        isActive={isActive}
      />
    </Sidebar>
  );
}
