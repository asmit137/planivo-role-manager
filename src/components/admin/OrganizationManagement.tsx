import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus, Building, Trash2, Edit, ChevronDown, ChevronRight, User, Infinity, UserPlus } from 'lucide-react';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { z } from 'zod';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useRealtimeSubscription } from '@/hooks/useRealtimeSubscription';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';

const organizationSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(100, 'Name too long'),
  description: z.string().max(500, 'Description too long').optional(),
});

interface LimitState {
  value: number;
  unlimited: boolean;
}

const OrganizationManagement = () => {
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedOrg, setSelectedOrg] = useState<any>(null);
  const [expandedOrgs, setExpandedOrgs] = useState<Set<string>>(new Set());
  const queryClient = useQueryClient();

  // Owner fields (for create)
  const [ownerEmail, setOwnerEmail] = useState('');
  const [ownerName, setOwnerName] = useState('');

  // Edit owner fields
  const [ownerMode, setOwnerMode] = useState<'keep' | 'select' | 'create'>('keep');
  const [editOwnerEmail, setEditOwnerEmail] = useState('');
  const [editOwnerName, setEditOwnerName] = useState('');
  const [selectedOwnerId, setSelectedOwnerId] = useState<string | null>(null);

  // Limit fields
  const [maxWorkspaces, setMaxWorkspaces] = useState<LimitState>({ value: 5, unlimited: true });
  const [maxFacilities, setMaxFacilities] = useState<LimitState>({ value: 10, unlimited: true });
  const [maxUsers, setMaxUsers] = useState<LimitState>({ value: 100, unlimited: true });
  const [vacationMode, setVacationMode] = useState<'planning' | 'full'>('full');

  // Real-time subscriptions
  useRealtimeSubscription({
    table: 'organizations',
    invalidateQueries: ['organizations'],
  });

  useRealtimeSubscription({
    table: 'workspaces',
    invalidateQueries: ['workspaces-by-org'],
  });

  const { data: organizations, isLoading } = useQuery({
    queryKey: ['organizations'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('organizations')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data;
    },
  });

  // Fetch owner profiles for organizations
  const { data: ownerProfiles } = useQuery({
    queryKey: ['organization-owners', organizations?.map(o => o.owner_id).filter(Boolean)],
    queryFn: async () => {
      const ownerIds = organizations?.map(o => o.owner_id).filter(Boolean) || [];
      if (ownerIds.length === 0) return {};

      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', ownerIds);

      if (error) throw error;

      // Return as a lookup object
      const lookup: Record<string, { full_name: string; email: string }> = {};
      data?.forEach(p => {
        lookup[p.id] = { full_name: p.full_name, email: p.email };
      });
      return lookup;
    },
    enabled: !!organizations && organizations.length > 0,
  });

  const { data: workspacesByOrg } = useQuery({
    queryKey: ['workspaces-by-org'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('workspaces')
        .select('*')
        .order('name');

      if (error) throw error;
      return data;
    },
  });

  // Fetch existing organization admins for selection
  const { data: existingOrgAdmins } = useQuery({
    queryKey: ['organization-admins'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', 'organization_admin');

      if (error) throw error;

      if (!data || data.length === 0) return [];

      const userIds = data.map(r => r.user_id);
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', userIds);

      if (profilesError) throw profilesError;
      return profiles || [];
    },
  });

  const createMutation = useMutation({
    mutationFn: async (params: {
      name: string;
      description?: string;
      ownerEmail?: string;
      ownerName?: string;
      maxWorkspaces?: number | null;
      maxFacilities?: number | null;
      maxUsers?: number | null;
      vacationMode?: 'planning' | 'full';
    }) => {
      const validated = organizationSchema.parse({ name: params.name, description: params.description });

      // Check for duplicate name
      const { data: existing } = await supabase
        .from('organizations')
        .select('id')
        .ilike('name', validated.name)
        .maybeSingle();

      if (existing) {
        throw new Error('An organization with this name already exists');
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      let ownerId: string | null = null;

      // Create owner user if email provided
      if (params.ownerEmail && params.ownerName) {
        const { data: ownerResult, error: ownerError } = await supabase.functions.invoke('create-user', {
          body: {
            email: params.ownerEmail,
            password: '123456',
            full_name: params.ownerName,
            role: 'organization_admin',
            force_password_change: true,
          },
        });

        if (ownerError) {
          // Robust error parsing from Edge Function
          if (ownerError.context && typeof ownerError.context.json === 'function') {
            try {
              const body = await ownerError.context.json();
              throw new Error(body.error || body.message || ownerError.message || 'Failed to create owner');
            } catch (e) {
              throw new Error(ownerError.message || 'Failed to create owner');
            }
          }
          throw new Error(ownerError.message || 'Failed to create owner');
        }

        if (ownerResult?.error) throw new Error(ownerResult.error);
        if (!ownerResult?.user?.id) throw new Error('User creation succeeded but no ID was returned');

        ownerId = ownerResult.user.id;
      }

      const { data, error } = await supabase
        .from('organizations')
        .insert([{
          name: validated.name,
          description: validated.description || null,
          created_by: user.id,
          owner_id: ownerId,
          max_workspaces: params.maxWorkspaces,
          max_facilities: params.maxFacilities,
          max_users: params.maxUsers,
          vacation_mode: params.vacationMode,
        }])
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organizations'] });
      toast.success('Organization created successfully');
      resetForm();
      setCreateOpen(false);
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to create organization');
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (params: {
      id: string;
      name: string;
      description?: string;
      maxWorkspaces?: number | null;
      maxFacilities?: number | null;
      maxUsers?: number | null;
      ownerMode: 'keep' | 'select' | 'create';
      selectedOwnerId?: string | null;
      newOwnerEmail?: string;
      newOwnerName?: string;
      vacationMode?: 'planning' | 'full';
    }) => {
      const validated = organizationSchema.parse({ name: params.name, description: params.description });

      // Check for duplicate name (excluding current org)
      const { data: existing } = await supabase
        .from('organizations')
        .select('id')
        .ilike('name', validated.name)
        .neq('id', params.id)
        .maybeSingle();

      if (existing) {
        throw new Error('An organization with this name already exists');
      }

      let ownerId: string | null | undefined = undefined; // undefined = no change

      if (params.ownerMode === 'select' && params.selectedOwnerId) {
        ownerId = params.selectedOwnerId;
      } else if (params.ownerMode === 'create' && params.newOwnerEmail && params.newOwnerName) {
        // Create new user via edge function
        const { data: ownerResult, error: ownerError } = await supabase.functions.invoke('create-user', {
          body: {
            email: params.newOwnerEmail,
            password: '123456',
            full_name: params.newOwnerName,
            role: 'organization_admin',
            force_password_change: true,
          },
        });

        if (ownerError) {
          if (ownerError.context && typeof ownerError.context.json === 'function') {
            try {
              const body = await ownerError.context.json();
              throw new Error(body.error || body.message || ownerError.message || 'Failed to create owner');
            } catch (e) {
              throw new Error(ownerError.message || 'Failed to create owner');
            }
          }
          throw new Error(ownerError.message || 'Failed to create owner');
        }

        if (ownerResult?.error) throw new Error(ownerResult.error);
        if (!ownerResult?.user?.id) throw new Error('User creation succeeded but no ID was returned');

        ownerId = ownerResult.user.id;
      }

      const updateData: any = {
        name: validated.name,
        description: validated.description || null,
        max_workspaces: params.maxWorkspaces,
        max_facilities: params.maxFacilities,
        max_users: params.maxUsers,
        vacation_mode: params.vacationMode,
      };

      // Only update owner_id if changed
      if (ownerId !== undefined) {
        updateData.owner_id = ownerId;
      }

      const { error } = await supabase
        .from('organizations')
        .update(updateData)
        .eq('id', params.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organizations'] });
      queryClient.invalidateQueries({ queryKey: ['organization-admins'] });
      toast.success('Organization updated successfully');
      resetForm();
      setEditOpen(false);
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to update organization');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('organizations')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organizations'] });
      toast.success('Organization deleted successfully');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to delete organization');
    },
  });

  const resetForm = () => {
    setName('');
    setDescription('');
    setOwnerEmail('');
    setOwnerName('');
    setEditOwnerEmail('');
    setEditOwnerName('');
    setOwnerMode('keep');
    setSelectedOwnerId(null);
    setMaxWorkspaces({ value: 5, unlimited: true });
    setMaxFacilities({ value: 10, unlimited: true });
    setMaxUsers({ value: 100, unlimited: true });
    setVacationMode('full');
    setSelectedOrg(null);
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate({
      name: name.trim(),
      description: description.trim(),
      ownerEmail: ownerEmail.trim() || undefined,
      ownerName: ownerName.trim() || undefined,
      maxWorkspaces: maxWorkspaces.unlimited ? null : maxWorkspaces.value,
      maxFacilities: maxFacilities.unlimited ? null : maxFacilities.value,
      maxUsers: maxUsers.unlimited ? null : maxUsers.value,
      vacationMode: vacationMode,
    });
  };

  const handleUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrg) return;

    // Validate create mode has required fields
    if (ownerMode === 'create' && (!editOwnerEmail.trim() || !editOwnerName.trim())) {
      toast.error('Please provide both name and email for the new owner');
      return;
    }

    updateMutation.mutate({
      id: selectedOrg.id,
      name: name.trim(),
      description: description.trim(),
      maxWorkspaces: maxWorkspaces.unlimited ? null : maxWorkspaces.value,
      maxFacilities: maxFacilities.unlimited ? null : maxFacilities.value,
      maxUsers: maxUsers.unlimited ? null : maxUsers.value,
      ownerMode,
      selectedOwnerId: selectedOwnerId,
      newOwnerEmail: editOwnerEmail.trim(),
      newOwnerName: editOwnerName.trim(),
      vacationMode,
    });
  };

  const openEditDialog = (org: any) => {
    setSelectedOrg(org);
    setName(org.name);
    setDescription(org.description || '');
    setMaxWorkspaces(org.max_workspaces === null
      ? { value: 5, unlimited: true }
      : { value: org.max_workspaces, unlimited: false });
    setMaxFacilities(org.max_facilities === null
      ? { value: 10, unlimited: true }
      : { value: org.max_facilities, unlimited: false });
    setMaxUsers(org.max_users === null
      ? { value: 100, unlimited: true }
      : { value: org.max_users, unlimited: false });
    setVacationMode(org.vacation_mode || 'full');
    // Set owner mode based on current owner
    setOwnerMode(org.owner_id ? 'keep' : 'create');
    setSelectedOwnerId(org.owner_id || null);
    setEditOwnerEmail('');
    setEditOwnerName('');
    setEditOpen(true);
  };

  const toggleExpanded = (orgId: string) => {
    const newExpanded = new Set(expandedOrgs);
    if (newExpanded.has(orgId)) {
      newExpanded.delete(orgId);
    } else {
      newExpanded.add(orgId);
    }
    setExpandedOrgs(newExpanded);
  };

  const getWorkspacesForOrg = (orgId: string) => {
    return workspacesByOrg?.filter(w => w.organization_id === orgId) || [];
  };

  const formatLimit = (value: number | null | undefined) => {
    return (value === null || value === undefined) ? '∞' : value.toString();
  };

  const LimitInput = ({
    label,
    state,
    onChange
  }: {
    label: string;
    state: LimitState;
    onChange: (state: LimitState) => void;
  }) => (
    <div className="space-y-3">
      <Label className="text-sm font-medium">{label}</Label>
      <div className="flex flex-wrap items-center gap-3">
        <Input
          type="number"
          min={1}
          value={state.value}
          onChange={(e) => onChange({ ...state, value: parseInt(e.target.value) || 1 })}
          disabled={state.unlimited}
          className="w-full xs:w-24 h-9"
        />
        <div className="flex items-center gap-2 bg-muted/30 px-3 py-1.5 rounded-md">
          <Checkbox
            id={`${label}-unlimited`}
            checked={state.unlimited}
            onCheckedChange={(checked) => onChange({ ...state, unlimited: !!checked })}
          />
          <Label htmlFor={`${label}-unlimited`} className="text-xs sm:text-sm flex items-center gap-1 cursor-pointer font-normal">
            <Infinity className="h-3.5 w-3.5" /> Unlimited
          </Label>
        </div>
      </div>
    </div>
  );

  return (
    <Card className="border-2 overflow-hidden w-full max-w-full box-border">
      <CardHeader className="p-4 pt-6 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <CardTitle>Organizations</CardTitle>
            <CardDescription>Manage top-level organizations with owners and resource limits</CardDescription>
          </div>
          <Dialog open={createOpen} onOpenChange={(open) => { setCreateOpen(open); if (!open) resetForm(); }}>
            <DialogTrigger asChild>
              <Button className="bg-gradient-primary w-full sm:w-auto h-11 sm:h-10 text-sm px-4">
                <Plus className="mr-2 h-4 w-4 shrink-0" />
                <span className="whitespace-nowrap">Create Organization</span>
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Create New Organization</DialogTitle>
                <DialogDescription>
                  Create an organization with an owner who can manage workspaces, facilities, and users
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleCreate} className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="org-name">Organization Name *</Label>
                  <Input
                    id="org-name"
                    placeholder="e.g., Healthcare Group International"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="org-description">Description (Optional)</Label>
                  <Textarea
                    id="org-description"
                    placeholder="Brief description of the organization..."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={2}
                  />
                </div>

                <div className="space-y-3">
                  <Label>Vacation Mode</Label>
                  <div className="flex gap-4">
                    <div
                      className={`flex items-center space-x-2 border p-2 rounded-md flex-1 cursor-pointer transition-colors ${vacationMode === 'full' ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'}`}
                      onClick={() => setVacationMode('full')}
                    >
                      <div className={`aspect-square h-4 w-4 rounded-full border border-primary flex items-center justify-center ${vacationMode === 'full' ? 'text-primary' : 'text-transparent'}`}>
                        {vacationMode === 'full' && <div className="h-2.5 w-2.5 rounded-full bg-current" />}
                      </div>
                      <div>
                        <span className="font-semibold text-sm">Full Mode</span>
                        <p className="text-xs text-muted-foreground">Balances are deducted. Limits enforced.</p>
                      </div>
                    </div>
                    <div
                      className={`flex items-center space-x-2 border p-2 rounded-md flex-1 cursor-pointer transition-colors ${vacationMode === 'planning' ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'}`}
                      onClick={() => setVacationMode('planning')}
                    >
                      <div className={`aspect-square h-4 w-4 rounded-full border border-primary flex items-center justify-center ${vacationMode === 'planning' ? 'text-primary' : 'text-transparent'}`}>
                        {vacationMode === 'planning' && <div className="h-2.5 w-2.5 rounded-full bg-current" />}
                      </div>
                      <div>
                        <span className="font-semibold text-sm">Planning Mode</span>
                        <p className="text-xs text-muted-foreground">No balance deducted. For scheduling only.</p>
                      </div>
                    </div>
                  </div>
                </div>

                <Separator />

                <div className="space-y-3">
                  <h4 className="font-medium flex items-center gap-2">
                    <User className="h-4 w-4" />
                    Organization Owner (Optional)
                  </h4>
                  <p className="text-sm text-muted-foreground">
                    Create an admin user who will manage this organization. Password will be "123456".
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="owner-name">Full Name</Label>
                      <Input
                        id="owner-name"
                        placeholder="John Smith"
                        value={ownerName}
                        onChange={(e) => setOwnerName(e.target.value)}
                        autoComplete="off"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="owner-email">Email</Label>
                      <Input
                        id="owner-email"
                        type="email"
                        placeholder="john@example.com"
                        value={ownerEmail}
                        onChange={(e) => setOwnerEmail(e.target.value)}
                        autoComplete="off"
                      />
                    </div>
                  </div>
                </div>

                <Separator />

                <div className="space-y-3">
                  <h4 className="font-medium">Resource Limits</h4>
                  <p className="text-sm text-muted-foreground">
                    Set maximum resources this organization can create
                  </p>
                  <div className="space-y-2">
                    <LimitInput
                      label="Max Workspaces"
                      state={maxWorkspaces}
                      onChange={setMaxWorkspaces}
                    />
                    <LimitInput
                      label="Max Facilities"
                      state={maxFacilities}
                      onChange={setMaxFacilities}
                    />
                    <LimitInput
                      label="Max Users"
                      state={maxUsers}
                      onChange={setMaxUsers}
                    />
                  </div>
                </div>

                <Button type="submit" className="w-full" disabled={createMutation.isPending}>
                  {createMutation.isPending ? 'Creating...' : 'Create Organization'}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent className="px-3 py-4 sm:p-6 overflow-x-hidden w-full flex flex-col min-w-0">
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        ) : organizations && organizations.length > 0 ? (
          <div className="space-y-3 overflow-hidden">
            {organizations.map((org) => {
              const orgWorkspaces = getWorkspacesForOrg(org.id);
              const isExpanded = expandedOrgs.has(org.id);
              const owner = org.owner_id ? ownerProfiles?.[org.owner_id] : null;

              return (
                <Collapsible key={org.id} open={isExpanded} onOpenChange={() => toggleExpanded(org.id)}>
                  <div className="border-2 rounded-lg hover:border-primary/20 transition-colors overflow-hidden w-full">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between px-2 py-6 sm:px-4 sm:py-6 gap-3 sm:gap-4 w-full min-w-0">
                      <div className="flex items-start gap-2 sm:gap-3 min-w-0 w-full flex-1">
                        <CollapsibleTrigger asChild>
                          <Button variant="ghost" size="sm" className="p-0 h-8 w-8 shrink-0 mt-1">
                            {isExpanded ? (
                              <ChevronDown className="h-5 w-5 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="h-5 w-5 text-muted-foreground" />
                            )}
                          </Button>
                        </CollapsibleTrigger>
                        <div className="p-1.5 sm:p-2 rounded-lg bg-primary/10 shrink-0 mt-0.5">
                          <Building className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
                        </div>
                        <div className="min-w-0 flex-1 overflow-hidden flex flex-col gap-1">
                          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 max-w-full min-w-0">
                            <h3 className="font-semibold text-sm sm:text-lg line-clamp-1 break-all flex-1 min-w-0">{org.name}</h3>
                            <Badge variant="secondary" className="text-[9px] sm:text-xs h-4 sm:h-auto whitespace-nowrap px-1 sm:px-2">
                              {orgWorkspaces.length} Ws
                            </Badge>
                          </div>
                          {org.description && (
                            <p className="text-xs sm:text-sm text-muted-foreground line-clamp-1 sm:line-clamp-2 mt-0.5">{org.description}</p>
                          )}
                          {owner && (
                            <p className="text-[10px] sm:text-xs text-muted-foreground mt-1 flex items-center gap-1 max-w-full overflow-hidden">
                              <User className="h-3 w-3 shrink-0" />
                              <span className="truncate break-all">Owner: {owner.full_name} ({owner.email})</span>
                            </p>
                          )}
                          <div className="flex flex-wrap gap-1 sm:gap-1.5 mt-2 max-w-full overflow-hidden">
                            <Badge variant="outline" className="text-[9px] sm:text-[10px] px-1 sm:px-1.5 h-4 sm:h-5 flex items-center gap-0.5 sm:gap-1 shrink-0">
                              WS: {formatLimit(org.max_workspaces)}
                            </Badge>
                            <Badge variant="outline" className="text-[9px] sm:text-[10px] px-1 sm:px-1.5 h-4 sm:h-5 flex items-center gap-0.5 sm:gap-1 shrink-0">
                              Fac: {formatLimit(org.max_facilities)}
                            </Badge>
                            <Badge variant="outline" className="text-[9px] sm:text-[10px] px-1 sm:px-1.5 h-4 sm:h-5 flex items-center gap-0.5 sm:gap-1 shrink-0">
                              Users: {formatLimit(org.max_users)}
                            </Badge>
                            <Badge variant={org.vacation_mode === 'planning' ? 'secondary' : 'default'} className="text-[9px] sm:text-[10px] px-1 sm:px-1.5 h-4 sm:h-5 shrink-0">
                              {org.vacation_mode === 'planning' ? 'Plan' : 'Full'}
                            </Badge>
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2 justify-end sm:justify-start pt-3 sm:pt-0 border-t sm:border-0 shrink-0">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openEditDialog(org)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="destructive-ghost"
                          size="sm"
                          onClick={() => {
                            if (orgWorkspaces.length > 0) {
                              toast.error('Cannot delete organization with workspaces. Remove workspaces first.');
                              return;
                            }
                            deleteMutation.mutate(org.id);
                          }}
                          disabled={deleteMutation.isPending}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    <CollapsibleContent>
                      <div className="px-4 pb-4 pt-0 sm:ml-8 border-t bg-muted/10">
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70 mt-4 mb-2 px-1">Active Workspaces</h4>
                        {orgWorkspaces.length > 0 ? (
                          <div className="grid grid-cols-1 xs:grid-cols-2 gap-2">
                            {orgWorkspaces.map((ws) => (
                              <div key={ws.id} className="flex items-center gap-2.5 p-2.5 bg-background border rounded-md shadow-sm">
                                <Building className="h-4 w-4 text-primary shrink-0" />
                                <span className="text-xs sm:text-sm font-medium truncate">{ws.name}</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="py-4 text-center border-2 border-dashed rounded-lg bg-background/50">
                            <p className="text-xs text-muted-foreground">No workspaces created yet.</p>
                          </div>
                        )}
                      </div>
                    </CollapsibleContent>
                  </div>
                </Collapsible>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-12">
            <Building className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground">No organizations yet. Create your first one!</p>
          </div>
        )}
      </CardContent>

      {/* Edit Organization Dialog */}
      <Dialog open={editOpen} onOpenChange={(open) => { setEditOpen(open); if (!open) resetForm(); }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Organization</DialogTitle>
            <DialogDescription>
              Update organization details and resource limits
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleUpdate} className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="edit-org-name">Organization Name *</Label>
              <Input
                id="edit-org-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-org-description">Description (Optional)</Label>
              <Textarea
                id="edit-org-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
              />
            </div>

            <div className="space-y-3">
              <Label>Vacation Mode</Label>
              <div className="flex gap-4">
                <div
                  className={`flex items-center space-x-2 border p-2 rounded-md flex-1 cursor-pointer transition-colors ${vacationMode === 'full' ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'}`}
                  onClick={() => setVacationMode('full')}
                >
                  <div className={`aspect-square h-4 w-4 rounded-full border border-primary flex items-center justify-center ${vacationMode === 'full' ? 'text-primary' : 'text-transparent'}`}>
                    {vacationMode === 'full' && <div className="h-2.5 w-2.5 rounded-full bg-current" />}
                  </div>
                  <div>
                    <span className="font-semibold text-sm">Full Mode</span>
                    <p className="text-xs text-muted-foreground">Balances are deducted. Limits enforced.</p>
                  </div>
                </div>
                <div
                  className={`flex items-center space-x-2 border p-2 rounded-md flex-1 cursor-pointer transition-colors ${vacationMode === 'planning' ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'}`}
                  onClick={() => setVacationMode('planning')}
                >
                  <div className={`aspect-square h-4 w-4 rounded-full border border-primary flex items-center justify-center ${vacationMode === 'planning' ? 'text-primary' : 'text-transparent'}`}>
                    {vacationMode === 'planning' && <div className="h-2.5 w-2.5 rounded-full bg-current" />}
                  </div>
                  <div>
                    <span className="font-semibold text-sm">Planning Mode</span>
                    <p className="text-xs text-muted-foreground">No balance deducted. For scheduling only.</p>
                  </div>
                </div>
              </div>
            </div>

            <Separator />

            <div className="space-y-3">
              <h4 className="font-medium flex items-center gap-2">
                <User className="h-4 w-4" />
                Organization Owner
              </h4>

              {selectedOrg?.owner_id && ownerProfiles?.[selectedOrg.owner_id] && (
                <p className="text-sm text-muted-foreground">
                  Current Owner: <span className="font-medium">{ownerProfiles[selectedOrg.owner_id].full_name}</span> ({ownerProfiles[selectedOrg.owner_id].email})
                </p>
              )}

              <RadioGroup
                value={ownerMode}
                onValueChange={(value) => setOwnerMode(value as 'keep' | 'select' | 'create')}
                className="space-y-2"
              >
                {selectedOrg?.owner_id && (
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="keep" id="owner-keep" />
                    <Label htmlFor="owner-keep" className="cursor-pointer">Keep Current Owner</Label>
                  </div>
                )}

                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="select" id="owner-select" />
                  <Label htmlFor="owner-select" className="cursor-pointer">Select Existing Admin</Label>
                </div>

                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="create" id="owner-create" />
                  <Label htmlFor="owner-create" className="cursor-pointer">Create New Owner</Label>
                </div>
              </RadioGroup>

              {ownerMode === 'select' && (
                <div className="space-y-2 pl-6">
                  <Label>Select Organization Admin</Label>
                  <Select
                    value={selectedOwnerId || ''}
                    onValueChange={(value) => setSelectedOwnerId(value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select an admin..." />
                    </SelectTrigger>
                    <SelectContent>
                      {existingOrgAdmins && existingOrgAdmins.length > 0 ? (
                        existingOrgAdmins.map((admin) => (
                          <SelectItem key={admin.id} value={admin.id}>
                            {admin.full_name} ({admin.email})
                          </SelectItem>
                        ))
                      ) : (
                        <SelectItem value="no-admins" disabled>No organization admins available</SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {ownerMode === 'create' && (
                <div className="space-y-3 pl-6">
                  <p className="text-sm text-muted-foreground">
                    Create a new admin user. Password will be "123456".
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="edit-owner-name">Full Name *</Label>
                      <Input
                        id="edit-owner-name"
                        placeholder="John Smith"
                        value={editOwnerName}
                        onChange={(e) => setEditOwnerName(e.target.value)}
                        autoComplete="off"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="edit-owner-email">Email *</Label>
                      <Input
                        id="edit-owner-email"
                        type="email"
                        placeholder="john@example.com"
                        value={editOwnerEmail}
                        onChange={(e) => setEditOwnerEmail(e.target.value)}
                        autoComplete="off"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            <Separator />

            <div className="space-y-3">
              <h4 className="font-medium">Resource Limits</h4>
              <div className="space-y-2">
                <LimitInput
                  label="Max Workspaces"
                  state={maxWorkspaces}
                  onChange={setMaxWorkspaces}
                />
                <LimitInput
                  label="Max Facilities"
                  state={maxFacilities}
                  onChange={setMaxFacilities}
                />
                <LimitInput
                  label="Max Users"
                  state={maxUsers}
                  onChange={setMaxUsers}
                />
              </div>
            </div>

            <Button type="submit" className="w-full" disabled={updateMutation.isPending}>
              {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export default OrganizationManagement;
