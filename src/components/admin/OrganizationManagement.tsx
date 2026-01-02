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
    }) => {
      const validated = organizationSchema.parse({ name: params.name, description: params.description });

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

        if (ownerError) throw new Error(ownerError.message || 'Failed to create owner');
        if (ownerResult.error) throw new Error(ownerResult.error);

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
    }) => {
      const validated = organizationSchema.parse({ name: params.name, description: params.description });

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

        if (ownerError) throw new Error(ownerError.message || 'Failed to create owner');
        if (ownerResult.error) throw new Error(ownerResult.error);

        ownerId = ownerResult.user.id;
      }

      const updateData: any = {
        name: validated.name,
        description: validated.description || null,
        max_workspaces: params.maxWorkspaces,
        max_facilities: params.maxFacilities,
        max_users: params.maxUsers,
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
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex items-center gap-3">
        <Input
          type="number"
          min={1}
          value={state.value}
          onChange={(e) => onChange({ ...state, value: parseInt(e.target.value) || 1 })}
          disabled={state.unlimited}
          className="w-24"
        />
        <div className="flex items-center gap-2">
          <Checkbox
            id={`${label}-unlimited`}
            checked={state.unlimited}
            onCheckedChange={(checked) => onChange({ ...state, unlimited: !!checked })}
          />
          <Label htmlFor={`${label}-unlimited`} className="text-sm flex items-center gap-1 cursor-pointer">
            <Infinity className="h-4 w-4" /> Unlimited
          </Label>
        </div>
      </div>
    </div>
  );

  return (
    <Card className="border-2">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Organizations</CardTitle>
            <CardDescription>Manage top-level organizations with owners and resource limits</CardDescription>
          </div>
          <Dialog open={createOpen} onOpenChange={(open) => { setCreateOpen(open); if (!open) resetForm(); }}>
            <DialogTrigger asChild>
              <Button className="bg-gradient-primary">
                <Plus className="mr-2 h-4 w-4" />
                Create Organization
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Create New Organization</DialogTitle>
                <DialogDescription>
                  Create an organization with an owner who can manage workspaces, facilities, and users
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleCreate} className="space-y-4">
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
                  <div className="space-y-4">
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
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        ) : organizations && organizations.length > 0 ? (
          <div className="space-y-3">
            {organizations.map((org) => {
              const orgWorkspaces = getWorkspacesForOrg(org.id);
              const isExpanded = expandedOrgs.has(org.id);
              const owner = org.owner_id ? ownerProfiles?.[org.owner_id] : null;

              return (
                <Collapsible key={org.id} open={isExpanded} onOpenChange={() => toggleExpanded(org.id)}>
                  <div className="border-2 rounded-lg hover:border-primary/20 transition-colors">
                    <div className="flex items-center justify-between p-4">
                      <div className="flex items-center gap-3">
                        <CollapsibleTrigger asChild>
                          <Button variant="ghost" size="sm" className="p-0 h-auto">
                            {isExpanded ? (
                              <ChevronDown className="h-5 w-5 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="h-5 w-5 text-muted-foreground" />
                            )}
                          </Button>
                        </CollapsibleTrigger>
                        <div className="p-2 rounded-lg bg-primary/10">
                          <Building className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-semibold">{org.name}</h3>
                            <Badge variant="secondary" className="text-xs">
                              {orgWorkspaces.length} workspace{orgWorkspaces.length !== 1 ? 's' : ''}
                            </Badge>
                          </div>
                          {org.description && (
                            <p className="text-sm text-muted-foreground">{org.description}</p>
                          )}
                          {owner && (
                            <p className="text-xs text-muted-foreground mt-1">
                              <User className="h-3 w-3 inline mr-1" />
                              Owner: {owner.full_name} ({owner.email})
                            </p>
                          )}
                          <div className="flex flex-wrap gap-2 mt-2">
                            <Badge variant="outline" className="text-xs">
                              Workspaces: {formatLimit(org.max_workspaces)}
                            </Badge>
                            <Badge variant="outline" className="text-xs">
                              Facilities: {formatLimit(org.max_facilities)}
                            </Badge>
                            <Badge variant="outline" className="text-xs">
                              Users: {formatLimit(org.max_users)}
                            </Badge>
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openEditDialog(org)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
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
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>

                    <CollapsibleContent>
                      <div className="px-4 pb-4 pt-0 ml-8 border-t">
                        <h4 className="text-sm font-medium text-muted-foreground mt-3 mb-2">Workspaces</h4>
                        {orgWorkspaces.length > 0 ? (
                          <div className="space-y-2">
                            {orgWorkspaces.map((ws) => (
                              <div key={ws.id} className="flex items-center gap-2 p-2 bg-muted/50 rounded-md">
                                <Building className="h-4 w-4 text-muted-foreground" />
                                <span className="text-sm">{ws.name}</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground">No workspaces in this organization yet.</p>
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
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Organization</DialogTitle>
            <DialogDescription>
              Update organization details and resource limits
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleUpdate} className="space-y-4">
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
                        <SelectItem value="" disabled>No organization admins available</SelectItem>
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
              <div className="space-y-4">
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
