import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { FolderPlus, Plus, Users, Trash2, Pencil, Loader2 } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { z } from 'zod';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const departmentSchema = z.object({
  name: z.string()
    .trim()
    .min(2, 'Name must be at least 2 characters')
    .max(100, 'Name must be less than 100 characters'),
  min_staffing: z.number()
    .int()
    .min(1, 'Minimum staffing must be at least 1')
    .max(100, 'Minimum staffing must be less than 100'),
});

const DepartmentManagement = () => {
  const [createDeptOpen, setCreateDeptOpen] = useState(false);
  const [addSubDeptOpen, setAddSubDeptOpen] = useState(false);
  const [editDeptOpen, setEditDeptOpen] = useState(false);
  const [departmentName, setDepartmentName] = useState('');
  const [subdepartmentName, setSubdepartmentName] = useState('');
  const [selectedFacility, setSelectedFacility] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedParentDept, setSelectedParentDept] = useState<any>(null);
  const [editingDept, setEditingDept] = useState<any>(null);
  const [minStaffing, setMinStaffing] = useState<number>(1);
  const [errors, setErrors] = useState<{ name?: string; min_staffing?: string }>({});
  const queryClient = useQueryClient();

  const { data: facilities } = useQuery({
    queryKey: ['facilities'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('facilities')
        .select('*, workspaces(name)')
        .order('name');

      if (error) throw error;
      return data;
    },
  });

  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .eq('is_active', true)
        .order('is_system_default', { ascending: false })
        .order('name');

      if (error) throw error;
      return data;
    },
  });

  const { data: departments, isLoading } = useQuery({
    queryKey: ['departments-simple'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('departments')
        .select('*, facilities(name, workspaces(name))')
        .is('parent_department_id', null)
        .order('name');

      if (error) throw error;

      const deptsWithSubs = await Promise.all(
        (data || []).map(async (dept) => {
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

      return deptsWithSubs;
    },
  });

  const createDepartmentMutation = useMutation({
    mutationFn: async (data: {
      name: string;
      facility_id: string;
      parent_department_id?: string;
      category?: string;
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
      queryClient.invalidateQueries({ queryKey: ['departments-simple'] });
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
      queryClient.invalidateQueries({ queryKey: ['departments-simple'] });
      toast.success('Department deleted successfully');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to delete department');
    },
  });

  const updateDepartmentMutation = useMutation({
    mutationFn: async (data: { id: string; name: string; min_staffing: number }) => {
      const validated = departmentSchema.parse({
        name: data.name,
        min_staffing: data.min_staffing,
      });

      const { error } = await supabase
        .from('departments')
        .update({
          name: validated.name,
          min_staffing: validated.min_staffing,
        })
        .eq('id', data.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['departments-simple'] });
      toast.success('Department updated successfully');
      setEditDeptOpen(false);
      setEditingDept(null);
      setErrors({});
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to update department');
    },
  });

  const handleCreateDepartment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!departmentName.trim() || !selectedFacility || !selectedCategory) {
      toast.error('Please fill all required fields');
      return;
    }

    createDepartmentMutation.mutate({
      name: departmentName,
      facility_id: selectedFacility,
      category: selectedCategory,
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

  const handleEditDepartment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDept) return;

    try {
      departmentSchema.parse({
        name: editingDept.name,
        min_staffing: editingDept.min_staffing,
      });
      setErrors({});

      updateDepartmentMutation.mutate({
        id: editingDept.id,
        name: editingDept.name,
        min_staffing: editingDept.min_staffing,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        const fieldErrors: { name?: string; min_staffing?: string } = {};
        error.errors.forEach((err) => {
          if (err.path[0]) {
            fieldErrors[err.path[0] as 'name' | 'min_staffing'] = err.message;
          }
        });
        setErrors(fieldErrors);
      }
    }
  };

  const openEditDialog = (dept: any) => {
    setEditingDept({ ...dept });
    setErrors({});
    setEditDeptOpen(true);
  };

  return (
    <Card className="border-2">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FolderPlus className="h-5 w-5" />
              Department Management
            </CardTitle>
            <CardDescription>
              Manage departments and subdepartments
            </CardDescription>
          </div>
          <Dialog open={createDeptOpen} onOpenChange={setCreateDeptOpen}>
            <DialogTrigger asChild>
              <Button className="bg-gradient-primary">
                <Plus className="mr-2 h-4 w-4" />
                Add Department
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Add Department</DialogTitle>
                <DialogDescription>
                  Create a new main department
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleCreateDepartment} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="category">Category *</Label>
                  <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select category..." />
                    </SelectTrigger>
                    <SelectContent className="bg-background z-50">
                      {categories?.map((category: any) => (
                        <SelectItem key={category.id} value={category.name}>
                          {category.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="facility">Facility *</Label>
                  <Select value={selectedFacility} onValueChange={setSelectedFacility}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select facility..." />
                    </SelectTrigger>
                    <SelectContent className="bg-background z-50">
                      {facilities?.map((facility: any) => (
                        <SelectItem key={facility.id} value={facility.id}>
                          {facility.name} {facility.workspaces?.name && `(${facility.workspaces.name})`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="dept-name">Department Name *</Label>
                  <Input
                    id="dept-name"
                    placeholder="e.g., Surgery, Emergency"
                    value={departmentName}
                    onChange={(e) => setDepartmentName(e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="min-staffing">Minimum Staff</Label>
                  <Input
                    id="min-staffing"
                    type="number"
                    min="1"
                    value={minStaffing}
                    onChange={(e) => setMinStaffing(parseInt(e.target.value) || 1)}
                  />
                </div>

                <Button type="submit" className="w-full" disabled={createDepartmentMutation.isPending}>
                  {createDepartmentMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Creating...
                    </>
                  ) : 'Add Department'}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">
            Loading departments...
          </div>
        ) : !departments || departments.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <FolderPlus className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No departments yet. Create one to get started.</p>
          </div>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Department</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Facility</TableHead>
                  <TableHead>Min Staff</TableHead>
                  <TableHead>Subdepartments</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {departments.map((dept: any) => (
                  <>
                    <TableRow key={dept.id} className="font-medium">
                      <TableCell>{dept.name}</TableCell>
                      <TableCell>
                        {dept.category ? (
                          <Badge variant="outline">{dept.category}</Badge>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {dept.facilities?.name}
                        {dept.facilities?.workspaces?.name && (
                          <span className="text-xs text-muted-foreground block">
                            ({dept.facilities.workspaces.name})
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">
                          <Users className="h-3 w-3 mr-1" />
                          {dept.min_staffing}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{dept.subdepartments?.length || 0}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelectedParentDept(dept);
                              setAddSubDeptOpen(true);
                            }}
                          >
                            <Plus className="h-3 w-3 mr-1" />
                            Add Sub
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openEditDialog(dept)}
                          >
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="destructive-ghost"
                            size="icon"
                            onClick={() => deleteDepartmentMutation.mutate(dept.id)}
                            disabled={deleteDepartmentMutation.isPending}
                          >
                            {deleteDepartmentMutation.isPending ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Trash2 className="h-3 w-3" />
                            )}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                    {dept.subdepartments?.map((sub: any) => (
                      <TableRow key={sub.id} className="bg-muted/30">
                        <TableCell className="pl-8">
                          <span className="text-muted-foreground">└─</span> {sub.name}
                        </TableCell>
                        <TableCell className="text-muted-foreground">—</TableCell>
                        <TableCell className="text-muted-foreground">—</TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="text-xs">
                            <Users className="h-3 w-3 mr-1" />
                            {sub.min_staffing}
                          </Badge>
                        </TableCell>
                        <TableCell>—</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openEditDialog(sub)}
                            >
                              <Pencil className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="destructive-ghost"
                              size="icon"
                              onClick={() => deleteDepartmentMutation.mutate(sub.id)}
                              disabled={deleteDepartmentMutation.isPending}
                            >
                              {deleteDepartmentMutation.isPending ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <Trash2 className="h-3 w-3" />
                              )}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

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
                  placeholder="e.g., General Surgery, ICU"
                  value={subdepartmentName}
                  onChange={(e) => setSubdepartmentName(e.target.value)}
                  required
                />
              </div>

              <Button type="submit" className="w-full" disabled={createDepartmentMutation.isPending}>
                {createDepartmentMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Adding...
                  </>
                ) : 'Add Subdepartment'}
              </Button>
            </form>
          </DialogContent>
        </Dialog>

        {/* Edit Department Dialog */}
        <Dialog open={editDeptOpen} onOpenChange={setEditDeptOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Edit Department</DialogTitle>
              <DialogDescription>
                Update department information
              </DialogDescription>
            </DialogHeader>
            {editingDept && (
              <form onSubmit={handleEditDepartment} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-dept-name">Department Name *</Label>
                  <Input
                    id="edit-dept-name"
                    value={editingDept.name}
                    onChange={(e) => {
                      setEditingDept({ ...editingDept, name: e.target.value });
                      if (errors.name) setErrors({ ...errors, name: undefined });
                    }}
                    required
                  />
                  {errors.name && (
                    <p className="text-xs text-destructive">{errors.name}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit-min-staffing">Minimum Staff *</Label>
                  <Input
                    id="edit-min-staffing"
                    type="number"
                    min="1"
                    max="100"
                    value={editingDept.min_staffing}
                    onChange={(e) => {
                      setEditingDept({ ...editingDept, min_staffing: parseInt(e.target.value) || 1 });
                      if (errors.min_staffing) setErrors({ ...errors, min_staffing: undefined });
                    }}
                    required
                  />
                  {errors.min_staffing && (
                    <p className="text-xs text-destructive">{errors.min_staffing}</p>
                  )}
                </div>

                <Button type="submit" className="w-full" disabled={updateDepartmentMutation.isPending}>
                  {updateDepartmentMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Updating...
                    </>
                  ) : 'Update Department'}
                </Button>
              </form>
            )}
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
};

export default DepartmentManagement;
