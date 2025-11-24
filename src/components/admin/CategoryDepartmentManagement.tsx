import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { FolderTree, Plus, Pencil, Trash2, ChevronRight, ChevronDown, X } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';

const CategoryDepartmentManagement = () => {
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

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['departments-with-subs'] });
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
    <Card className="border-2">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FolderTree className="h-5 w-5" />
              Categories & Departments
            </CardTitle>
            <CardDescription>
              Manage organizational structure templates
            </CardDescription>
          </div>
          <Button onClick={() => setCreateCategoryOpen(true)} className="bg-gradient-primary">
            <Plus className="mr-2 h-4 w-4" />
            Add Category
          </Button>
        </div>
      </CardHeader>
      <CardContent>
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
                <Card key={category.id} className="border">
                  <div className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 flex-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setExpandedCategory(isExpanded ? null : category.id)}
                        >
                          {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </Button>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold">{category.name}</h3>
                            {category.is_system_default && <Badge variant="secondary">System</Badge>}
                            {!category.is_active && <Badge variant="secondary">Inactive</Badge>}
                          </div>
                          {category.description && (
                            <p className="text-sm text-muted-foreground">{category.description}</p>
                          )}
                          <p className="text-xs text-muted-foreground mt-1">
                            {categoryDepts.length} {categoryDepts.length === 1 ? 'department' : 'departments'}
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedCategoryForDept(category);
                            setCreateDepartmentOpen(true);
                          }}
                        >
                          <Plus className="h-3 w-3 mr-1" />
                          Add Dept
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setEditingCategory({ ...category });
                            setEditCategoryOpen(true);
                          }}
                        >
                          <Pencil className="h-3 w-3" />
                        </Button>
                        {!category.is_system_default && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => deleteCategoryMutation.mutate(category.id)}
                            disabled={deleteCategoryMutation.isPending}
                          >
                            <Trash2 className="h-3 w-3 text-destructive" />
                          </Button>
                        )}
                      </div>
                    </div>

                    {isExpanded && categoryDepts.length > 0 && (
                      <div className="mt-4 ml-11 space-y-2">
                        {categoryDepts.map((dept: any) => {
                          const subs = getSubdepartments(dept.id);
                          
                          return (
                            <div key={dept.id} className="border rounded-lg p-3 bg-muted/30">
                              <div className="flex items-center justify-between">
                                <div className="flex-1">
                                  <div className="font-medium">{dept.name}</div>
                                  <p className="text-xs text-muted-foreground">
                                    {subs.length} {subs.length === 1 ? 'subdepartment' : 'subdepartments'}
                                  </p>
                                </div>
                                <div className="flex gap-1">
                                  <Button
                                    variant="outline"
                                    size="sm"
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
                                    onClick={() => {
                                      setEditingDepartment({ ...dept });
                                      setEditDepartmentOpen(true);
                                    }}
                                  >
                                    <Pencil className="h-3 w-3" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => deleteDepartmentMutation.mutate(dept.id)}
                                    disabled={deleteDepartmentMutation.isPending}
                                  >
                                    <Trash2 className="h-3 w-3 text-destructive" />
                                  </Button>
                                </div>
                              </div>

                              {subs.length > 0 && (
                                <div className="mt-3 ml-4 space-y-1">
                                  {subs.map((sub: any) => (
                                    <div key={sub.id} className="flex items-center justify-between p-2 rounded bg-background/50 text-sm">
                                      <span className="text-muted-foreground">└─ {sub.name}</span>
                                      <div className="flex gap-1">
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-6 w-6"
                                          onClick={() => {
                                            setEditingDepartment({ ...sub });
                                            setEditDepartmentOpen(true);
                                          }}
                                        >
                                          <Pencil className="h-3 w-3" />
                                        </Button>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-6 w-6"
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
