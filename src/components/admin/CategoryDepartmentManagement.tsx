import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { FolderTree, Plus, Pencil, Trash2, ChevronRight, ChevronDown, X, Layout } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { useRealtimeSubscription } from '@/hooks/useRealtimeSubscription';

interface CategoryDepartmentManagementProps {
  organizationId?: string;
  workspaceId?: string;
}

const CategoryDepartmentManagement = ({ organizationId, workspaceId }: CategoryDepartmentManagementProps = {}) => {
  const [createCategoryOpen, setCreateCategoryOpen] = useState(false);
  const [editCategoryOpen, setEditCategoryOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<any>(null);
  const [categoryName, setCategoryName] = useState('');
  const [categoryDescription, setCategoryDescription] = useState('');

  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [createDepartmentOpen, setCreateDepartmentOpen] = useState(false);
  const [selectedCategoryForDept, setSelectedCategoryForDept] = useState<any>(null);
  const [departmentName, setDepartmentName] = useState('');

  const [addSubdepartmentsOpen, setAddSubdepartmentsOpen] = useState(false);
  const [selectedDepartmentForSubs, setSelectedDepartmentForSubs] = useState<any>(null);
  const [subdepartmentNames, setSubdepartmentNames] = useState<string[]>(['']);

  const [editDepartmentOpen, setEditDepartmentOpen] = useState(false);
  const [editingDepartment, setEditingDepartment] = useState<any>(null);

  const queryClient = useQueryClient();

  // Real-time subscriptions for live updates
  useRealtimeSubscription({
    table: 'categories',
    invalidateQueries: ['categories'],
  });

  useRealtimeSubscription({
    table: 'departments',
    invalidateQueries: ['template-departments'],
  });

  const { data: categories, isLoading: categoriesLoading } = useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .order('is_system_default', { ascending: false })
        .order('name');

      if (error) throw error;
      return data;
    },
  });

  const { data: departments } = useQuery({
    queryKey: ['departments-with-subs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('departments')
        .select('*')
        .is('is_template', true)
        .order('name');

      if (error) throw error;
      return data;
    },
  });

  const getDepartmentsByCategory = (categoryName: string) => {
    return departments?.filter(d => d.category === categoryName && !d.parent_department_id) || [];
  };

  const getSubdepartments = (parentId: string) => {
    return departments?.filter(d => d.parent_department_id === parentId) || [];
  };

  const createCategoryMutation = useMutation({
    mutationFn: async (data: { name: string; description: string }) => {
      // Check for duplicate
      const { data: existing } = await supabase
        .from('categories')
        .select('id')
        .ilike('name', data.name)
        .maybeSingle();

      if (existing) {
        throw new Error('Category with this name already exists');
      }

      const { error } = await supabase
        .from('categories')
        .insert({
          name: data.name,
          description: data.description,
          is_system_default: false,
        });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      toast.success('Category created');
      setCategoryName('');
      setCategoryDescription('');
      setCreateCategoryOpen(false);
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to create category');
    },
  });

  const updateCategoryMutation = useMutation({
    mutationFn: async (data: { id: string; name: string; description: string; is_active: boolean }) => {
      // Check for duplicate (excluding current)
      const { data: existing } = await supabase
        .from('categories')
        .select('id')
        .ilike('name', data.name)
        .neq('id', data.id)
        .maybeSingle();

      if (existing) {
        throw new Error('Category with this name already exists');
      }

      const { error } = await supabase
        .from('categories')
        .update({
          name: data.name,
          description: data.description,
          is_active: data.is_active,
        })
        .eq('id', data.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      toast.success('Category updated');
      setEditCategoryOpen(false);
      setEditingCategory(null);
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to update category');
    },
  });

  const deleteCategoryMutation = useMutation({
    mutationFn: async (categoryId: string) => {
      const categoryName = categories?.find(c => c.id === categoryId)?.name;

      const { data: depts, error: checkError } = await supabase
        .from('departments')
        .select('id')
        .eq('category', categoryName)
        .limit(1);

      if (checkError) throw checkError;

      if (depts && depts.length > 0) {
        throw new Error('Cannot delete category with departments');
      }

      const { error } = await supabase
        .from('categories')
        .delete()
        .eq('id', categoryId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      toast.success('Category deleted');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to delete category');
    },
  });

  const createDepartmentMutation = useMutation({
    mutationFn: async (data: { name: string; category: string }) => {
      // Check for duplicate in this category
      const { data: existing } = await supabase
        .from('departments')
        .select('id')
        .eq('category', data.category)
        .ilike('name', data.name)
        .is('parent_department_id', null)
        .maybeSingle();

      if (existing) {
        throw new Error('Department with this name already exists in this category');
      }

      const { error } = await supabase
        .from('departments')
        .insert({
          name: data.name,
          category: data.category,
          is_template: true,
        });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['departments-with-subs'] });
      toast.success('Department created');
      setDepartmentName('');
      setCreateDepartmentOpen(false);
      setSelectedCategoryForDept(null);
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to create department');
    },
  });

  const createSubdepartmentsMutation = useMutation({
    mutationFn: async (data: { names: string[]; parentDeptId: string; category: string }) => {
      const validNames = data.names.filter(n => n.trim());

      if (validNames.length === 0) {
        throw new Error('Please enter at least one subdepartment name');
      }

      // Check for duplicates within the parent department
      const { data: existing } = await supabase
        .from('departments')
        .select('name')
        .eq('parent_department_id', data.parentDeptId)
        .in('name', validNames);

      // Note: .in() is case-sensitive usually, but for batch check it's a start.
      // Ideally we iteratively check or use a Postgres function, but client-side check is okay for now.
      // For stricter case-insensitive list check, we might need a different approach or just accept case-sensitive for batch.
      // Let's stick to strict check for batch or iterate. Iterating is safer for case-insensitive.

      for (const name of validNames) {
        const { data: dup } = await supabase
          .from('departments')
          .select('id')
          .eq('parent_department_id', data.parentDeptId)
          .ilike('name', name)
          .maybeSingle();
        if (dup) throw new Error(`Subdepartment '${name}' already exists`);
      }

      const { error } = await supabase
        .from('departments')
        .insert(
          validNames.map(name => ({
            name: name.trim(),
            category: data.category,
            parent_department_id: data.parentDeptId,
            is_template: true,
          }))
        );

      toast.success('Subdepartments created');
      setSubdepartmentNames(['']);
      setAddSubdepartmentsOpen(false);
      setSelectedDepartmentForSubs(null);
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to create subdepartments');
    },
  });

  const updateDepartmentMutation = useMutation({
    mutationFn: async (data: { id: string; name: string }) => {
      // Get current Dept to check context
      const { data: current } = await supabase
        .from('departments')
        .select('*')
        .eq('id', data.id)
        .single();

      if (!current) throw new Error('Department not found');

      let query = supabase.from('departments').select('id').ilike('name', data.name).neq('id', data.id);

      if (current.parent_department_id) {
        query = query.eq('parent_department_id', current.parent_department_id);
      } else {
        query = query.eq('category', current.category).is('parent_department_id', null);
      }

      const { data: existing } = await query.maybeSingle();

      if (existing) {
        throw new Error('Department/Subdepartment with this name already exists');
      }

      const { error } = await supabase
        .from('departments')
        .update({ name: data.name })
        .eq('id', data.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['departments-with-subs'] });
      toast.success('Department updated');
      setEditDepartmentOpen(false);
      setEditingDepartment(null);
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to update department');
    },
  });

  const deleteDepartmentMutation = useMutation({
    mutationFn: async (departmentId: string) => {
      const { data: subs, error: checkError } = await supabase
        .from('departments')
        .select('id')
        .eq('parent_department_id', departmentId);

      if (checkError) throw checkError;

      if (subs && subs.length > 0) {
        throw new Error('Delete subdepartments first');
      }

      const { error } = await supabase
        .from('departments')
        .delete()
        .eq('id', departmentId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['departments-with-subs'] });
      toast.success('Department deleted');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to delete department');
    },
  });

  const handleCreateCategory = (e: React.FormEvent) => {
    e.preventDefault();
    if (!categoryName.trim()) {
      toast.error('Please enter a category name');
      return;
    }
    createCategoryMutation.mutate({ name: categoryName, description: categoryDescription });
  };

  const handleUpdateCategory = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCategory) return;
    updateCategoryMutation.mutate(editingCategory);
  };

  const handleCreateDepartment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!departmentName.trim() || !selectedCategoryForDept) {
      toast.error('Please fill all fields');
      return;
    }
    createDepartmentMutation.mutate({ name: departmentName, category: selectedCategoryForDept.name });
  };

  const handleCreateSubdepartments = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDepartmentForSubs) return;

    createSubdepartmentsMutation.mutate({
      names: subdepartmentNames,
      parentDeptId: selectedDepartmentForSubs.id,
      category: selectedDepartmentForSubs.category,
    });
  };

  const handleUpdateDepartment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDepartment?.name.trim()) {
      toast.error('Please enter a department name');
      return;
    }
    updateDepartmentMutation.mutate({ id: editingDepartment.id, name: editingDepartment.name });
  };

  const addSubdepartmentField = () => {
    if (subdepartmentNames.length < 10) {
      setSubdepartmentNames([...subdepartmentNames, '']);
    } else {
      toast.error('Maximum 10 subdepartments at once');
    }
  };

  const removeSubdepartmentField = (index: number) => {
    setSubdepartmentNames(subdepartmentNames.filter((_, i) => i !== index));
  };

  const updateSubdepartmentName = (index: number, value: string) => {
    const newNames = [...subdepartmentNames];
    newNames[index] = value;
    setSubdepartmentNames(newNames);
  };

  return (
    <Card className="border-none shadow-none sm:border-2 sm:shadow-sm">
      <CardHeader className="px-3 sm:px-6 pt-0 sm:pt-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-xl sm:text-2xl font-bold tracking-tight">
              <FolderTree className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
              Categories & Departments
            </CardTitle>
            <CardDescription className="text-xs sm:text-sm">
              Manage organizational structure templates
            </CardDescription>
          </div>
          <Button onClick={() => setCreateCategoryOpen(true)} className="bg-gradient-primary w-full sm:w-auto h-11 sm:h-10 text-xs sm:text-sm">
            <Plus className="mr-2 h-4 w-4" />
            Add Category
          </Button>
        </div>
      </CardHeader>
      <CardContent className="px-3 sm:px-6 py-0 sm:py-6">
        {categoriesLoading ? (
          <div className="text-center py-8 text-muted-foreground">
            Loading...
          </div>
        ) : !categories || categories.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <FolderTree className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No categories yet</p>
          </div>
        ) : (
          <div className="space-y-2">
            {categories.map((category: any) => {
              const isExpanded = expandedCategory === category.id;
              const categoryDepts = getDepartmentsByCategory(category.name);

              return (
                <Card key={category.id} className="border-2 sm:border bg-card/50">
                  <div className="p-3 sm:p-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0 mt-0.5 rounded-lg hover:bg-primary/5"
                          onClick={() => setExpandedCategory(isExpanded ? null : category.id)}
                        >
                          {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </Button>
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="font-semibold text-base sm:text-lg tracking-tight truncate">{category.name}</h3>
                            <div className="flex gap-1">
                              {category.is_system_default && (
                                <Badge variant="secondary" className="text-[10px] sm:text-xs h-5 sm:h-auto font-medium bg-primary/5 text-primary border-primary/10">
                                  System
                                </Badge>
                              )}
                              {!category.is_active && (
                                <Badge variant="secondary" className="text-[10px] sm:text-xs h-5 sm:h-auto font-medium">
                                  Inactive
                                </Badge>
                              )}
                            </div>
                          </div>
                          {category.description && (
                            <p className="text-xs sm:text-sm text-muted-foreground mt-1 line-clamp-1 sm:line-clamp-none">{category.description}</p>
                          )}
                          <div className="flex items-center gap-1.5 mt-2">
                            <Badge variant="outline" className="text-[10px] px-1.5 h-5 flex items-center gap-1">
                              <Layout className="h-3 w-3" />
                              {categoryDepts.length} {categoryDepts.length === 1 ? 'Dept' : 'Depts'}
                            </Badge>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 justify-end sm:justify-start pt-3 sm:pt-0 border-t sm:border-0">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 text-[11px] px-2"
                          onClick={() => {
                            setSelectedCategoryForDept(category);
                            setCreateDepartmentOpen(true);
                          }}
                        >
                          <Plus className="h-3.5 w-3.5 mr-1" />
                          Add Dept
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => {
                            setEditingCategory({ ...category });
                            setEditCategoryOpen(true);
                          }}
                        >
                          <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                        </Button>
                        {!category.is_system_default && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => deleteCategoryMutation.mutate(category.id)}
                            disabled={deleteCategoryMutation.isPending}
                          >
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        )}
                      </div>
                    </div>

                    {isExpanded && categoryDepts.length > 0 && (
                      <div className="mt-4 sm:ml-11 space-y-2 border-l-2 border-primary/10 pl-3 sm:pl-0">
                        {categoryDepts.map((dept: any) => {
                          const subs = getSubdepartments(dept.id);

                          return (
                            <div key={dept.id} className="border-2 rounded-lg p-3 sm:p-4 bg-background shadow-sm hover:border-primary/20 transition-all">
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                <div className="flex-1 min-w-0">
                                  <div className="font-semibold text-sm sm:text-base text-foreground truncate">{dept.name}</div>
                                  <div className="flex items-center gap-1.5 mt-1">
                                    <span className="text-[10px] sm:text-xs text-muted-foreground font-normal">
                                      {subs.length} {subs.length === 1 ? 'subdepartment' : 'subdepartments'}
                                    </span>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2 justify-end sm:justify-start pt-2 sm:pt-0 border-t sm:border-0">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-7 sm:h-8 text-[10px] sm:text-[11px] px-2"
                                    onClick={() => {
                                      setSelectedDepartmentForSubs(dept);
                                      setSubdepartmentNames(['']);
                                      setAddSubdepartmentsOpen(true);
                                    }}
                                  >
                                    <Plus className="h-3 w-3 mr-1" />
                                    Add Subs
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 sm:h-8 sm:w-8"
                                    onClick={() => {
                                      setEditingDepartment({ ...dept });
                                      setEditDepartmentOpen(true);
                                    }}
                                  >
                                    <Pencil className="h-3 w-3 text-muted-foreground" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 sm:h-8 sm:w-8"
                                    onClick={() => deleteDepartmentMutation.mutate(dept.id)}
                                    disabled={deleteDepartmentMutation.isPending}
                                  >
                                    <Trash2 className="h-3 w-3 text-destructive" />
                                  </Button>
                                </div>
                              </div>

                              {subs.length > 0 && (
                                <div className="mt-2 ml-2 sm:ml-4 space-y-1">
                                  {subs.map((sub: any) => (
                                    <div key={sub.id} className="flex items-center justify-between p-1.5 sm:p-2 rounded bg-background/40 text-xs sm:text-sm">
                                      <span className="text-muted-foreground truncate flex-1">└─ {sub.name}</span>
                                      <div className="flex gap-1 shrink-0">
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-6 w-6 sm:h-7 sm:w-7"
                                          onClick={() => {
                                            setEditingDepartment({ ...sub });
                                            setEditDepartmentOpen(true);
                                          }}
                                        >
                                          <Pencil className="h-3 w-3 text-muted-foreground" />
                                        </Button>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-6 w-6 sm:h-7 sm:w-7"
                                          onClick={() => deleteDepartmentMutation.mutate(sub.id)}
                                          disabled={deleteDepartmentMutation.isPending}
                                        >
                                          <Trash2 className="h-3 w-3 text-destructive" />
                                        </Button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        {/* Create Category Dialog */}
        <Dialog open={createCategoryOpen} onOpenChange={setCreateCategoryOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Add Category</DialogTitle>
              <DialogDescription>
                Create a new organizational category
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreateCategory} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Category Name *</Label>
                <Input
                  id="name"
                  placeholder="e.g., Dental, Legal, Manufacturing"
                  value={categoryName}
                  onChange={(e) => setCategoryName(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  placeholder="Brief description"
                  value={categoryDescription}
                  onChange={(e) => setCategoryDescription(e.target.value)}
                  rows={3}
                />
              </div>

              <Button type="submit" className="w-full" disabled={createCategoryMutation.isPending}>
                {createCategoryMutation.isPending ? 'Creating...' : 'Add Category'}
              </Button>
            </form>
          </DialogContent>
        </Dialog>

        {/* Edit Category Dialog */}
        <Dialog open={editCategoryOpen} onOpenChange={setEditCategoryOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Edit Category</DialogTitle>
            </DialogHeader>
            {editingCategory && (
              <form onSubmit={handleUpdateCategory} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-name">Category Name *</Label>
                  <Input
                    id="edit-name"
                    value={editingCategory.name}
                    onChange={(e) => setEditingCategory({ ...editingCategory, name: e.target.value })}
                    required
                    disabled={editingCategory.is_system_default}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit-description">Description</Label>
                  <Textarea
                    id="edit-description"
                    value={editingCategory.description || ''}
                    onChange={(e) => setEditingCategory({ ...editingCategory, description: e.target.value })}
                    rows={3}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="is-active">Active</Label>
                    <p className="text-sm text-muted-foreground">Enable or disable</p>
                  </div>
                  <Switch
                    id="is-active"
                    checked={editingCategory.is_active}
                    onCheckedChange={(checked) => setEditingCategory({ ...editingCategory, is_active: checked })}
                  />
                </div>

                <Button type="submit" className="w-full" disabled={updateCategoryMutation.isPending}>
                  {updateCategoryMutation.isPending ? 'Updating...' : 'Update'}
                </Button>
              </form>
            )}
          </DialogContent>
        </Dialog>

        {/* Create Department Dialog */}
        <Dialog open={createDepartmentOpen} onOpenChange={setCreateDepartmentOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Add Department</DialogTitle>
              <DialogDescription>
                Add a department to {selectedCategoryForDept?.name}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreateDepartment} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="dept-name">Department Name *</Label>
                <Input
                  id="dept-name"
                  placeholder="e.g., Surgery, Emergency, HR"
                  value={departmentName}
                  onChange={(e) => setDepartmentName(e.target.value)}
                  required
                />
              </div>

              <Button type="submit" className="w-full" disabled={createDepartmentMutation.isPending}>
                {createDepartmentMutation.isPending ? 'Creating...' : 'Add Department'}
              </Button>
            </form>
          </DialogContent>
        </Dialog>

        {/* Edit Department Dialog */}
        <Dialog open={editDepartmentOpen} onOpenChange={setEditDepartmentOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Edit {editingDepartment?.parent_department_id ? 'Subdepartment' : 'Department'}</DialogTitle>
            </DialogHeader>
            {editingDepartment && (
              <form onSubmit={handleUpdateDepartment} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-dept-name">Name *</Label>
                  <Input
                    id="edit-dept-name"
                    value={editingDepartment.name}
                    onChange={(e) => setEditingDepartment({ ...editingDepartment, name: e.target.value })}
                    required
                  />
                </div>

                <Button type="submit" className="w-full" disabled={updateDepartmentMutation.isPending}>
                  {updateDepartmentMutation.isPending ? 'Updating...' : 'Update'}
                </Button>
              </form>
            )}
          </DialogContent>
        </Dialog>

        {/* Add Subdepartments Dialog */}
        <Dialog open={addSubdepartmentsOpen} onOpenChange={setAddSubdepartmentsOpen}>
          <DialogContent className="sm:max-w-md max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Add Subdepartments</DialogTitle>
              <DialogDescription>
                Add up to 10 subdepartments to {selectedDepartmentForSubs?.name}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreateSubdepartments} className="space-y-4">
              <div className="space-y-2">
                {subdepartmentNames.map((name, index) => (
                  <div key={index} className="flex gap-2">
                    <Input
                      placeholder={`Subdepartment ${index + 1}`}
                      value={name}
                      onChange={(e) => updateSubdepartmentName(index, e.target.value)}
                    />
                    {subdepartmentNames.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeSubdepartmentField(index)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>

              {subdepartmentNames.length < 10 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addSubdepartmentField}
                  className="w-full"
                >
                  <Plus className="h-3 w-3 mr-2" />
                  Add Another ({subdepartmentNames.length}/10)
                </Button>
              )}

              <Button type="submit" className="w-full" disabled={createSubdepartmentsMutation.isPending}>
                {createSubdepartmentsMutation.isPending ? 'Creating...' : 'Create Subdepartments'}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
};

export default CategoryDepartmentManagement;
