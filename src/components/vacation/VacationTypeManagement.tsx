import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Plus, Edit, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

const VacationTypeManagement = () => {
  const queryClient = useQueryClient();
  const formRef = useRef<HTMLDivElement>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editingType, setEditingType] = useState<any>(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    max_days: 0,
    requires_documentation: false,
  });

  const { data: vacationTypes, isLoading } = useQuery({
    queryKey: ['vacation-types'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('vacation_types')
        .select('*')
        .order('name');
      if (error) throw error;
      return data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const { error } = await supabase.from('vacation_types').insert(data);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vacation-types'] });
      toast.success('Vacation type created');
      resetForm();
    },
    onError: () => toast.error('Failed to create vacation type'),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: any) => {
      const { error } = await supabase
        .from('vacation_types')
        .update(data)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vacation-types'] });
      toast.success('Vacation type updated');
      resetForm();
    },
    onError: () => toast.error('Failed to update vacation type'),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, is_active }: any) => {
      const { error } = await supabase
        .from('vacation_types')
        .update({ is_active })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vacation-types'] });
      toast.success('Vacation type status updated');
    },
  });

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      max_days: 0,
      requires_documentation: false,
    });
    setIsEditing(false);
    setEditingType(null);
  };

  const handleEdit = (type: any) => {
    setEditingType(type);
    setFormData({
      name: type.name,
      description: type.description || '',
      max_days: type.max_days || 0,
      requires_documentation: type.requires_documentation || false,
    });
    setIsEditing(true);

    // Scroll to the edit form
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const normalizedName = formData.name.trim();

    // Check for duplicate name
    const existingType = vacationTypes?.find(
      (t: any) =>
        t.name.toLowerCase() === normalizedName.toLowerCase() &&
        t.id !== editingType?.id
    );

    if (existingType) {
      toast.error(`A vacation type with the name "${normalizedName}" already exists.`);
      return;
    }

    if (editingType) {
      updateMutation.mutate({ id: editingType.id, data: { ...formData, name: normalizedName } });
    } else {
      createMutation.mutate({ ...formData, name: normalizedName });
    }
  };

  if (isLoading) return <div>Loading...</div>;

  return (
    <div className="space-y-6">
      <div ref={formRef}>
        <Card>
          <CardHeader>
            <CardTitle>
              {isEditing ? 'Edit Vacation Type' : 'Create Vacation Type'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  required
                />
              </div>
              <div>
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                />
              </div>
              <div>
                <Label htmlFor="max_days">Maximum Days</Label>
                <Input
                  id="max_days"
                  type="number"
                  value={formData.max_days}
                  onChange={(e) =>
                    setFormData({ ...formData, max_days: parseInt(e.target.value) })
                  }
                />
              </div>
              <div className="flex items-center space-x-2">
                <Switch
                  id="requires_documentation"
                  checked={formData.requires_documentation}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, requires_documentation: checked })
                  }
                />
                <Label htmlFor="requires_documentation">
                  Requires Documentation
                </Label>
              </div>
              <div className="flex gap-2">
                <Button type="submit">
                  {isEditing ? 'Update' : 'Create'}
                </Button>
                {isEditing && (
                  <Button type="button" variant="outline" onClick={resetForm}>
                    Cancel
                  </Button>
                )}
              </div>
            </form>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Vacation Types</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {vacationTypes?.map((type) => (
              <div
                key={type.id}
                className="flex items-center justify-between p-4 border rounded-lg"
              >
                <div>
                  <h3 className="font-semibold">{type.name}</h3>
                  <p className="text-sm text-muted-foreground">
                    {type.description}
                  </p>
                  <p className="text-sm">Max days: {type.max_days || 'N/A'}</p>
                  {type.requires_documentation && (
                    <p className="text-sm text-warning">Requires documentation</p>
                  )}
                </div>
                <div className="flex gap-2">
                  <Switch
                    checked={type.is_active}
                    onCheckedChange={(checked) =>
                      toggleActiveMutation.mutate({
                        id: type.id,
                        is_active: checked,
                      })
                    }
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleEdit(type)}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default VacationTypeManagement;