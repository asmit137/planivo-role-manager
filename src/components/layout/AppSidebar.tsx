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
  Settings
} from 'lucide-react';
import { useModuleContext } from '@/contexts/ModuleContext';
import { useUserRole } from '@/hooks/useUserRole';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar';

// Module configuration with icons and labels
const moduleConfig = [
  { key: 'core', label: 'Dashboard', icon: LayoutDashboard, path: '/dashboard', alwaysShow: true },
  { key: 'user_management', label: 'Users', icon: Users, path: '/dashboard?tab=users' },
  { key: 'organization', label: 'Organization', icon: Building2, path: '/dashboard?tab=organization' },
  { key: 'staff_management', label: 'Staff', icon: UserCog, path: '/dashboard?tab=staff' },
  { key: 'vacation', label: 'Vacation', icon: Calendar, path: '/dashboard?tab=vacation' },
  { key: 'tasks', label: 'Tasks', icon: CheckSquare, path: '/dashboard?tab=tasks' },
  { key: 'messaging', label: 'Messages', icon: MessageSquare, path: '/dashboard?tab=messaging' },
  { key: 'notifications', label: 'Notifications', icon: Bell, path: '/dashboard?tab=notifications' },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const location = useLocation();
  const navigate = useNavigate();
  const { hasAccess } = useModuleContext();
  const { data: roles } = useUserRole();
  
  const collapsed = state === 'collapsed';

  // Get current active tab from URL
  const searchParams = new URLSearchParams(location.search);
  const currentTab = searchParams.get('tab') || 'overview';

  const getPrimaryRole = () => {
    if (!roles || roles.length === 0) return null;
    const roleHierarchy = ['super_admin', 'general_admin', 'workplace_supervisor', 'facility_supervisor', 'department_head', 'staff'];
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
    return primaryRole.split('_').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
  };

  // Filter modules based on permissions
  const visibleModules = moduleConfig.filter(module => 
    module.alwaysShow || hasAccess(module.key)
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
      <SidebarContent className="bg-sidebar">
        {/* Branding */}
        <div className={`px-4 py-6 border-b border-sidebar-border bg-sidebar ${collapsed ? 'text-center' : ''}`}>
          {!collapsed ? (
            <div>
              <h1 className="text-xl font-display font-bold text-sidebar-foreground">Planivo</h1>
              <p className="text-xs text-sidebar-foreground/60 mt-1">{getRoleLabel()}</p>
            </div>
          ) : (
            <div className="text-lg font-display font-bold text-sidebar-foreground">P</div>
          )}
        </div>

        {/* Main Navigation */}
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleModules.map((module) => (
                <SidebarMenuItem key={module.key}>
                  <SidebarMenuButton
                    onClick={() => handleNavigation(module.path)}
                    isActive={isActive(module.path)}
                    className="w-full"
                  >
                    <module.icon className={collapsed ? 'mx-auto' : 'mr-2'} size={18} />
                    {!collapsed && <span>{module.label}</span>}
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Module Access (Admin only) */}
        {primaryRole === 'super_admin' && (
          <SidebarGroup>
            <SidebarGroupLabel>System</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    onClick={() => handleNavigation('/dashboard?tab=modules')}
                    isActive={currentTab === 'modules'}
                    className="w-full"
                  >
                    <Settings className={collapsed ? 'mx-auto' : 'mr-2'} size={18} />
                    {!collapsed && <span>Module Access</span>}
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
    </Sidebar>
  );
}
