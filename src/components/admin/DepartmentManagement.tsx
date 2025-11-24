import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Building2, FolderPlus, Plus, Users, Trash2 } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const DepartmentManagement = () => {
  const [open, setOpen] = useState(false);
  const [departmentName, setDepartmentName] = useState('');
  const [category, setCategory] = useState<string>('');
  const [selectedFacility, setSelectedFacility] = useState('');
  const [parentDepartment, setParentDepartment] = useState<string>('');
  const [minStaffing, setMinStaffing] = useState<number>(1);
  const queryClient = useQueryClient();

  const { data: organizationData } = useQuery({
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
      category: string;
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
      setCategory('');
      setSelectedFacility('');
      setParentDepartment('');
      setMinStaffing(1);
      setOpen(false);
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to create department');
    },
  });

  const deleteDepartmentMutation = useMutation({
    mutationFn: async (departmentId: string) => {
      // Check if department has subdepartments
      const { data: subdepts, error: checkError } = await supabase
        .from('departments')
        .select('id')
        .eq('parent_department_id', departmentId);

      if (checkError) throw checkError;
      
      if (subdepts && subdepts.length > 0) {
        throw new Error('Cannot delete department with subdepartments. Delete subdepartments first.');
      }

      // Check if department has users
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!departmentName.trim() || !selectedFacility) {
      toast.error('Please fill all required fields');
      return;
    }

    createDepartmentMutation.mutate({
      name: departmentName,
      category: category || '',
      facility_id: selectedFacility,
      parent_department_id: parentDepartment || undefined,
      min_staffing: minStaffing,
    });
  };

  const facilities = organizationData?.flatMap(w => w.facilities) || [];
  const selectedFacilityData = facilities.find(f => f.id === selectedFacility);
  const parentDepartments = selectedFacilityData?.departments.filter(d => !d.parent_department_id) || [];

  return (
    <div className="space-y-6">
      <Card className="border-2">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <FolderPlus className="h-5 w-5" />
                Department Management
              </CardTitle>
              <CardDescription>
                Create and manage departments with categories (medical, engineering, etc.)
              </CardDescription>
            </div>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button className="bg-gradient-primary">
                  <Plus className="mr-2 h-4 w-4" />
                  Create Department
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create New Department</DialogTitle>
                  <DialogDescription>
                    Add a department or subdepartment to a facility
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="facility">Facility *</Label>
                    <Select value={selectedFacility} onValueChange={(val) => {
                      setSelectedFacility(val);
                      setParentDepartment('');
                    }}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select facility" />
                      </SelectTrigger>
                      <SelectContent>
                        {organizationData?.flatMap(workspace =>
                          workspace.facilities.map(facility => (
                            <SelectItem key={facility.id} value={facility.id}>
                              {workspace.name} - {facility.name}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="dept-name">Department Name *</Label>
                    <Input
                      id="dept-name"
                      placeholder="e.g., Emergency Department"
                      value={departmentName}
                      onChange={(e) => setDepartmentName(e.target.value)}
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="category">Category</Label>
                    <Select value={category} onValueChange={setCategory}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select category (optional)" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="medical">Medical</SelectItem>
                        <SelectItem value="engineering">Engineering</SelectItem>
                        <SelectItem value="administration">Administration</SelectItem>
                        <SelectItem value="support">Support</SelectItem>
                        <SelectItem value="operations">Operations</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {selectedFacility && parentDepartments.length > 0 && (
                    <div className="space-y-2">
                      <Label htmlFor="parent">Parent Department (Optional)</Label>
                      <Select value={parentDepartment} onValueChange={setParentDepartment}>
                        <SelectTrigger>
                          <SelectValue placeholder="None (main department)" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="">None (Main Department)</SelectItem>
                          {parentDepartments.map(dept => (
                            <SelectItem key={dept.id} value={dept.id}>
                              {dept.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="min-staffing">Minimum Staffing</Label>
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

      <Card className="border-2">
        <CardHeader>
          <CardTitle>Department Hierarchy</CardTitle>
          <CardDescription>View and manage all departments organized by facility</CardDescription>
        </CardHeader>
        <CardContent>
          {!organizationData || organizationData.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Building2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No departments found</p>
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
                          <div key={facility.id} className="border rounded-lg p-3 bg-muted/30">
                            <div className="flex items-center gap-2 mb-3">
                              <Building2 className="h-4 w-4 text-muted-foreground" />
                              <span className="font-medium">{facility.name}</span>
                              <Badge variant="outline">{facility.departments?.length || 0} departments</Badge>
                            </div>
                            {facility.departments?.length > 0 && (
                              <div className="space-y-2 ml-6">
                                {facility.departments.map((dept: any) => (
                                  <div key={dept.id} className="space-y-2">
                                    <div className="p-2 rounded bg-background text-sm group">
                                      <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                          <span className="font-medium">{dept.name}</span>
                                          {dept.category && (
                                            <Badge variant="outline" className="text-xs capitalize">
                                              {dept.category}
                                            </Badge>
                                          )}
                                          <Badge variant="secondary" className="text-xs">
                                            Min: {dept.min_staffing} staff
                                          </Badge>
                                        </div>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          className="opacity-0 group-hover:opacity-100 transition-opacity"
                                          onClick={() => deleteDepartmentMutation.mutate(dept.id)}
                                          disabled={deleteDepartmentMutation.isPending}
                                        >
                                          <Trash2 className="h-4 w-4 text-destructive" />
                                        </Button>
                                      </div>
                                    </div>
                                    {dept.subdepartments && dept.subdepartments.length > 0 && (
                                      <div className="ml-4 space-y-1">
                                        {dept.subdepartments.map((subDept: any) => (
                                          <div key={subDept.id} className="p-2 rounded bg-muted/50 text-sm border-l-2 border-primary/30 group">
                                            <div className="flex items-center justify-between">
                                              <div className="flex items-center gap-2">
                                                <span className="text-sm">↳ {subDept.name}</span>
                                                {subDept.category && (
                                                  <Badge variant="outline" className="text-xs capitalize">
                                                    {subDept.category}
                                                  </Badge>
                                                )}
                                                <Badge variant="outline" className="text-xs">
                                                  Min: {subDept.min_staffing} staff
                                                </Badge>
                                              </div>
                                              <Button
                                                variant="ghost"
                                                size="sm"
                                                className="opacity-0 group-hover:opacity-100 transition-opacity"
                                                onClick={() => deleteDepartmentMutation.mutate(subDept.id)}
                                                disabled={deleteDepartmentMutation.isPending}
                                              >
                                                <Trash2 className="h-4 w-4 text-destructive" />
                                              </Button>
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
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
    </div>
  );
};

export default DepartmentManagement;