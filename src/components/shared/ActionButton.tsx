import { ReactNode } from 'react';
import { Button, ButtonProps } from '@/components/ui/button';
import { useModuleContext } from '@/contexts/ModuleContext';
import { LucideIcon } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface ActionButtonProps extends ButtonProps {
  moduleKey?: string;
  permission?: 'view' | 'edit' | 'delete' | 'admin';
  icon?: LucideIcon;
  children: ReactNode;
  tooltipText?: string;
}

/**
 * ActionButton with permission checking
 * Only renders if user has required module permission
 */
export function ActionButton({
  moduleKey,
  permission = 'view',
  icon: Icon,
  children,
  tooltipText,
  ...props
}: ActionButtonProps) {
  const { hasAccess, canEdit, canDelete, canAdmin } = useModuleContext();

  // Check permission if moduleKey is provided
  if (moduleKey) {
    let hasPermission = false;

    switch (permission) {
      case 'view':
        hasPermission = hasAccess(moduleKey);
        break;
      case 'edit':
        hasPermission = canEdit(moduleKey);
        break;
      case 'delete':
        hasPermission = canDelete(moduleKey);
        break;
      case 'admin':
        hasPermission = canAdmin(moduleKey);
        break;
    }

    if (!hasPermission) {
      return null;
    }
  }

  const button = (
    <Button {...props} aria-label={props['aria-label'] || (typeof children === 'string' ? children : undefined)}>
      {Icon && <Icon className="h-4 w-4 mr-2" aria-hidden="true" />}
      {children}
    </Button>
  );

  if (tooltipText) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>{button}</TooltipTrigger>
          <TooltipContent>
            <p>{tooltipText}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return button;
}
