import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Building2, FolderPlus, Plus, Users, Trash2, ChevronDown } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Skeleton } from '@/components/ui/skeleton';

const DepartmentManagement = () => {
  const [createDeptOpen, setCreateDeptOpen] = useState(false);
  const [addSubDeptOpen, setAddSubDeptOpen] = useState(false);
  const [departmentName, setDepartmentName] = useState('');
  const [subdepartmentName, setSubdepartmentName] = useState('');
  const [selectedFacility, setSelectedFacility] = useState('');
  const [selectedParentDept, setSelectedParentDept] = useState<any>(null);
  const [minStaffing, setMinStaffing] = useState<number>(1);
  const queryClient = useQueryClient();

  const { data: organizationData, isLoading, isError, error } = useQuery({
    queryKey: ['departments-hierarchy'],
    queryFn: async () => {
      const { data: workspaces, error: wsError } = await supabase
        .from('workspaces')
        .select('*')
        .order('name');
      
      if (wsError) throw wsError;

      const hierarchyData = await Promise.all(
        workspaces.map(async (workspace) => {
          const { data: facilities, error: facilityError } = await supabase
            .from('facilities')
            .select('*')
            .eq('workspace_id', workspace.id)
            .order('name');
          
          if (facilityError) throw facilityError;

          const facilitiesWithDepts = await Promise.all(
            facilities.map(async (facility) => {
              const { data: departments, error: deptError } = await supabase
                .from('departments')
                .select('*')
                .eq('facility_id', facility.id)
                .is('parent_department_id', null)
                .order('name');
              
              if (deptError) throw deptError;

              const deptsWithSubs = await Promise.all(
                departments.map(async (dept) => {
                  const { data: subdepartments, error: subError } = await supabase
                    .from('departments')
                    .select('*')
                    .eq('parent_department_id', dept.id)
                    .order('name');
                  
                  if (subError) throw subError;

                  return {
                    ...dept,
                    subdepartments: subdepartments || [],
                  };
                })
              );

              return {
                ...facility,
                departments: deptsWithSubs,
              };
            })
          );

          return {
            ...workspace,
            facilities: facilitiesWithDepts,
          };
        })
      );

      return hierarchyData;
    },
  });

  const createDepartmentMutation = useMutation({
    mutationFn: async (data: {
      name: string;
      facility_id: string;
      parent_department_id?: string;
      min_staffing: number;
    }) => {
      const { data: department, error } = await supabase
        .from('departments')
        .insert(data)
        .select()
        .single();

      if (error) throw error;
      return department;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['departments-hierarchy'] });
      queryClient.invalidateQueries({ queryKey: ['organization-hierarchy'] });
      toast.success('Department created successfully');
      setDepartmentName('');
      setSubdepartmentName('');
      setSelectedFacility('');
      setMinStaffing(1);
      setCreateDeptOpen(false);
      setAddSubDeptOpen(false);
      setSelectedParentDept(null);
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to create department');
    },
  });

  const deleteDepartmentMutation = useMutation({
    mutationFn: async (departmentId: string) => {
      const { data: subdepts, error: checkError } = await supabase
        .from('departments')
        .select('id')
        .eq('parent_department_id', departmentId);

      if (checkError) throw checkError;
      
      if (subdepts && subdepts.length > 0) {
        throw new Error('Cannot delete department with subdepartments. Delete subdepartments first.');
      }

      const { data: users, error: userError } = await supabase
        .from('user_roles')
        .select('id')
        .eq('department_id', departmentId);

      if (userError) throw userError;
      
      if (users && users.length > 0) {
        throw new Error('Cannot delete department with assigned users. Reassign users first.');
      }

      const { error } = await supabase
        .from('departments')
        .delete()
        .eq('id', departmentId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['departments-hierarchy'] });
      queryClient.invalidateQueries({ queryKey: ['organization-hierarchy'] });
      toast.success('Department deleted successfully');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to delete department');
    },
  });

  const handleCreateDepartment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!departmentName.trim() || !selectedFacility) {
      toast.error('Please fill all required fields');
      return;
    }

    createDepartmentMutation.mutate({
      name: departmentName,
      facility_id: selectedFacility,
      min_staffing: minStaffing,
    });
  };

  const handleAddSubdepartment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!subdepartmentName.trim() || !selectedParentDept) {
      toast.error('Please enter subdepartment name');
      return;
    }

    createDepartmentMutation.mutate({
      name: subdepartmentName,
      facility_id: selectedParentDept.facility_id,
      parent_department_id: selectedParentDept.id,
      min_staffing: 1,
    });
  };

  const facilities = organizationData?.flatMap(w => w.facilities) || [];

  return (
    <div className="space-y-6">
      {/* Create Department Card */}
      <Card className="border-2">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <FolderPlus className="h-5 w-5" />
                Department Management
              </CardTitle>
              <CardDescription>
                Create departments and add subdepartments
              </CardDescription>
            </div>
            <Dialog open={createDeptOpen} onOpenChange={setCreateDeptOpen}>
              <DialogTrigger asChild>
                <Button className="bg-gradient-primary">
                  <Plus className="mr-2 h-4 w-4" />
                  Create Department
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Create Main Department</DialogTitle>
                  <DialogDescription>
                    Create a new department in a facility
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleCreateDepartment} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="facility">Select Facility *</Label>
                    <Select value={selectedFacility} onValueChange={setSelectedFacility}>
                      <SelectTrigger>
                        <SelectValue placeholder="Choose a facility..." />
                      </SelectTrigger>
                      <SelectContent>
                        {facilities.map((facility: any) => (
                          <SelectItem key={facility.id} value={facility.id}>
                            {facility.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="dept-name">Department Name *</Label>
                    <Input
                      id="dept-name"
                      placeholder="e.g., Surgery, Emergency, Cardiology"
                      value={departmentName}
                      onChange={(e) => setDepartmentName(e.target.value)}
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="min-staffing">Minimum Staff Required</Label>
                    <Input
                      id="min-staffing"
                      type="number"
                      min="1"
                      value={minStaffing}
                      onChange={(e) => setMinStaffing(parseInt(e.target.value) || 1)}
                    />
                  </div>

                  <Button type="submit" className="w-full" disabled={createDepartmentMutation.isPending}>
                    {createDepartmentMutation.isPending ? 'Creating...' : 'Create Department'}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
      </Card>

      {/* Departments List */}
      <Card className="border-2">
        <CardHeader>
          <CardTitle>Department Hierarchy</CardTitle>
          <CardDescription>View and manage departments and subdepartments</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-24 w-full" />
              ))}
            </div>
          ) : isError ? (
            <div className="text-center py-8 text-destructive">
              <p>Error loading departments: {error?.message}</p>
            </div>
          ) : !organizationData || organizationData.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Building2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No workspaces found. Create a workspace first.</p>
            </div>
          ) : (
            <Accordion type="single" collapsible className="space-y-2">
              {organizationData.map((workspace: any) => (
                <AccordionItem key={workspace.id} value={workspace.id} className="border rounded-lg">
                  <AccordionTrigger className="px-4 hover:no-underline">
                    <div className="flex items-center gap-2">
                      <Building2 className="h-5 w-5 text-primary" />
                      <span className="font-semibold">{workspace.name}</span>
                      <Badge variant="secondary">{workspace.facilities?.length || 0} facilities</Badge>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="px-4 pb-4">
                    {workspace.facilities?.length > 0 ? (
                      <div className="space-y-3 mt-2">
                        {workspace.facilities.map((facility: any) => (
                          <div key={facility.id} className="border rounded-lg p-4 bg-muted/30">
                            <div className="flex items-center justify-between mb-4">
                              <div className="flex items-center gap-2">
                                <Building2 className="h-4 w-4 text-muted-foreground" />
                                <span className="font-medium">{facility.name}</span>
                                <Badge variant="outline">{facility.departments?.length || 0} departments</Badge>
                              </div>
                            </div>
                            
                            {facility.departments?.length > 0 ? (
                              <div className="space-y-2">
                                {facility.departments.map((dept: any) => (
                                  <div key={dept.id} className="border rounded-lg p-3 bg-background">
                                    <div className="flex items-center justify-between mb-2">
                                      <div className="flex items-center gap-2">
                                        <span className="font-medium text-lg">{dept.name}</span>
                                        <Badge variant="secondary" className="text-xs">
                                          <Users className="h-3 w-3 mr-1" />
                                          Min: {dept.min_staffing}
                                        </Badge>
                                        <Badge variant="outline" className="text-xs">
                                          {dept.subdepartments?.length || 0} subdepartments
                                        </Badge>
                                      </div>
                                      <div className="flex items-center gap-1">
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          onClick={() => {
                                            setSelectedParentDept(dept);
                                            setAddSubDeptOpen(true);
                                          }}
                                        >
                                          <Plus className="h-3 w-3 mr-1" />
                                          Add Subdepartment
                                        </Button>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={() => deleteDepartmentMutation.mutate(dept.id)}
                                          disabled={deleteDepartmentMutation.isPending}
                                        >
                                          <Trash2 className="h-4 w-4 text-destructive" />
                                        </Button>
                                      </div>
                                    </div>

                                    {dept.subdepartments && dept.subdepartments.length > 0 && (
                                      <div className="ml-4 mt-2 space-y-1 border-l-2 border-primary/20 pl-3">
                                        {dept.subdepartments.map((subDept: any) => (
                                          <div key={subDept.id} className="flex items-center justify-between p-2 rounded bg-muted/50 hover:bg-muted group">
                                            <div className="flex items-center gap-2">
                                              <ChevronDown className="h-3 w-3 text-muted-foreground" />
                                              <span className="text-sm">{subDept.name}</span>
                                              <Badge variant="outline" className="text-xs">
                                                <Users className="h-3 w-3 mr-1" />
                                                {subDept.min_staffing}
                                              </Badge>
                                            </div>
                                            <Button
                                              variant="ghost"
                                              size="sm"
                                              className="opacity-0 group-hover:opacity-100 transition-opacity"
                                              onClick={() => deleteDepartmentMutation.mutate(subDept.id)}
                                              disabled={deleteDepartmentMutation.isPending}
                                            >
                                              <Trash2 className="h-3 w-3 text-destructive" />
                                            </Button>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="text-sm text-muted-foreground text-center py-4">
                                No departments yet. Click "Create Department" above to add one.
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground py-2">No facilities in this workspace</p>
                    )}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          )}
        </CardContent>
      </Card>

      {/* Add Subdepartment Dialog */}
      <Dialog open={addSubDeptOpen} onOpenChange={setAddSubDeptOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Subdepartment</DialogTitle>
            <DialogDescription>
              Add a subdepartment to <span className="font-semibold">{selectedParentDept?.name}</span>
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAddSubdepartment} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="subdept-name">Subdepartment Name *</Label>
              <Input
                id="subdept-name"
                placeholder="e.g., General Surgery, Neurosurgery, ICU"
                value={subdepartmentName}
                onChange={(e) => setSubdepartmentName(e.target.value)}
                required
              />
              <p className="text-xs text-muted-foreground">
                This will be added under {selectedParentDept?.name}
              </p>
            </div>

            <Button type="submit" className="w-full" disabled={createDepartmentMutation.isPending}>
              {createDepartmentMutation.isPending ? 'Adding...' : 'Add Subdepartment'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default DepartmentManagement;