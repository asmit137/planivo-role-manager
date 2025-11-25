import { useModuleContext } from '@/contexts/ModuleContext';

export const useModule = (moduleKey: string) => {
  const { modules, isLoading, hasAccess, canEdit, canDelete, canAdmin } = useModuleContext();

  const module = modules.find((m) => m.module_key === moduleKey);

  return {
    hasAccess: hasAccess(moduleKey),
    canEdit: canEdit(moduleKey),
    canDelete: canDelete(moduleKey),
    canAdmin: canAdmin(moduleKey),
    isLoading,
    module,
  };
};
