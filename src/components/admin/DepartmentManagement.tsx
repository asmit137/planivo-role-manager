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

// Department presets organized by category
const departmentPresets = {
  medical: {
    departments: [
      { name: 'Emergency Department', min_staffing: 8, subdepartments: ['Emergency Medicine', 'Trauma Unit', 'Triage', 'Observation Unit', 'Fast Track', 'Resuscitation Unit', 'Pediatric Emergency'] },
      { name: 'Internal Medicine', min_staffing: 10, subdepartments: ['General Internal Medicine', 'Cardiology', 'Pulmonology', 'Gastroenterology', 'Nephrology', 'Endocrinology', 'Rheumatology', 'Hematology', 'Infectious Diseases', 'Geriatrics'] },
      { name: 'Surgery', min_staffing: 12, subdepartments: ['General Surgery', 'Cardiothoracic Surgery', 'Neurosurgery', 'Orthopedic Surgery', 'Plastic & Reconstructive Surgery', 'Vascular Surgery', 'Pediatric Surgery', 'Transplant Surgery', 'Trauma Surgery', 'Minimally Invasive Surgery', 'Colorectal Surgery', 'Hepatobiliary Surgery'] },
      { name: 'Pediatrics', min_staffing: 8, subdepartments: ['General Pediatrics', 'Neonatology', 'Pediatric Cardiology', 'Pediatric Neurology', 'Pediatric Oncology', 'Pediatric Intensive Care', 'Pediatric Surgery', 'Pediatric Emergency', 'Pediatric Gastroenterology', 'Pediatric Pulmonology', 'Adolescent Medicine'] },
      { name: 'Obstetrics & Gynecology', min_staffing: 8, subdepartments: ['Obstetrics', 'Gynecology', 'Maternal-Fetal Medicine', 'Gynecologic Oncology', 'Reproductive Endocrinology & Infertility', 'Labor & Delivery', 'Postpartum Unit', 'Family Planning'] },
      { name: 'Intensive Care Units', min_staffing: 12, subdepartments: ['Medical ICU', 'Surgical ICU', 'Cardiac ICU', 'Neuro ICU', 'Pediatric ICU', 'Neonatal ICU', 'Burn ICU', 'Trauma ICU'] },
      { name: 'Cardiology', min_staffing: 6, subdepartments: ['General Cardiology', 'Interventional Cardiology', 'Electrophysiology', 'Heart Failure Clinic', 'Cardiac Rehabilitation', 'Non-Invasive Cardiology'] },
      { name: 'Oncology', min_staffing: 8, subdepartments: ['Medical Oncology', 'Radiation Oncology', 'Surgical Oncology', 'Hematology-Oncology', 'Pediatric Oncology', 'Breast Cancer Center', 'Palliative Care'] },
      { name: 'Neurology & Neurosciences', min_staffing: 6, subdepartments: ['General Neurology', 'Stroke Unit', 'Epilepsy Center', 'Movement Disorders', 'Neuromuscular Disorders', 'Neuro-Oncology', 'Neurophysiology', 'Memory Disorders Clinic'] },
      { name: 'Orthopedics', min_staffing: 6, subdepartments: ['General Orthopedics', 'Sports Medicine', 'Joint Replacement', 'Spine Surgery', 'Hand Surgery', 'Foot & Ankle Surgery', 'Pediatric Orthopedics', 'Trauma Orthopedics', 'Orthopedic Oncology'] },
      { name: 'Radiology & Imaging', min_staffing: 8, subdepartments: ['Diagnostic Radiology', 'Interventional Radiology', 'CT Scan', 'MRI', 'Ultrasound', 'X-Ray', 'Nuclear Medicine', 'Mammography', 'Neuroradiology'] },
      { name: 'Laboratory Services', min_staffing: 10, subdepartments: ['Clinical Pathology', 'Anatomical Pathology', 'Hematology Lab', 'Microbiology Lab', 'Clinical Chemistry', 'Blood Bank', 'Immunology Lab', 'Molecular Diagnostics', 'Cytology Lab', 'Histopathology'] },
      { name: 'Anesthesiology', min_staffing: 8, subdepartments: ['General Anesthesia', 'Regional Anesthesia', 'Cardiac Anesthesia', 'Neuro Anesthesia', 'Pediatric Anesthesia', 'Obstetric Anesthesia', 'Pain Management', 'Critical Care Anesthesia'] },
      { name: 'Psychiatry & Mental Health', min_staffing: 6, subdepartments: ['General Psychiatry', 'Child & Adolescent Psychiatry', 'Geriatric Psychiatry', 'Addiction Medicine', 'Eating Disorders', 'Crisis Intervention', 'Psychotherapy', 'Inpatient Psychiatry'] },
      { name: 'Dermatology', min_staffing: 3, subdepartments: ['General Dermatology', 'Cosmetic Dermatology', 'Dermatologic Surgery', 'Pediatric Dermatology', 'Dermatopathology'] },
      { name: 'Ophthalmology', min_staffing: 4, subdepartments: ['General Ophthalmology', 'Retina & Vitreous', 'Glaucoma', 'Cornea & External Disease', 'Oculoplastics', 'Pediatric Ophthalmology', 'Neuro-Ophthalmology', 'Refractive Surgery'] },
      { name: 'Otolaryngology (ENT)', min_staffing: 4, subdepartments: ['General ENT', 'Rhinology', 'Otology', 'Head & Neck Surgery', 'Laryngology', 'Pediatric ENT', 'Sleep Medicine'] },
      { name: 'Urology', min_staffing: 4, subdepartments: ['General Urology', 'Urologic Oncology', 'Pediatric Urology', 'Female Urology', 'Male Infertility', 'Stone Disease', 'Reconstructive Urology'] },
      { name: 'Nephrology & Dialysis', min_staffing: 5, subdepartments: ['General Nephrology', 'Hemodialysis', 'Peritoneal Dialysis', 'Kidney Transplant', 'Acute Kidney Injury Unit'] },
      { name: 'Gastroenterology', min_staffing: 4, subdepartments: ['General Gastroenterology', 'Hepatology', 'Endoscopy Unit', 'Inflammatory Bowel Disease Clinic', 'Motility Disorders'] },
      { name: 'Pulmonology', min_staffing: 5, subdepartments: ['General Pulmonology', 'Sleep Medicine', 'Interventional Pulmonology', 'Cystic Fibrosis Center', 'Asthma/COPD Clinic'] },
      { name: 'Pharmacy', min_staffing: 8, subdepartments: ['Inpatient Pharmacy', 'Outpatient Pharmacy', 'Clinical Pharmacy', 'Drug Information Center', 'Sterile Compounding', 'Oncology Pharmacy'] },
      { name: 'Physical Medicine & Rehabilitation', min_staffing: 6, subdepartments: ['Physical Therapy', 'Occupational Therapy', 'Speech Therapy', 'Cardiac Rehabilitation', 'Neurological Rehabilitation', 'Orthopedic Rehabilitation', 'Sports Rehabilitation'] },
      { name: 'Nutrition & Dietetics', min_staffing: 4, subdepartments: ['Clinical Nutrition', 'Diabetes Education', 'Outpatient Nutrition Counseling', 'Enteral/Parenteral Nutrition'] },
      { name: 'Pain Management', min_staffing: 3, subdepartments: ['Chronic Pain Clinic', 'Interventional Pain Management', 'Palliative Care', 'Cancer Pain Management'] },
      { name: 'Infectious Diseases', min_staffing: 4, subdepartments: ['HIV/AIDS Clinic', 'Tuberculosis Clinic', 'Travel Medicine', 'Hospital Infection Control'] },
      { name: 'Allergy & Immunology', min_staffing: 3, subdepartments: ['Allergy Testing & Treatment', 'Asthma Clinic', 'Immunodeficiency Clinic'] },
      { name: 'Nuclear Medicine', min_staffing: 3, subdepartments: ['Diagnostic Nuclear Medicine', 'Therapeutic Nuclear Medicine', 'PET/CT Imaging'] },
      { name: 'Blood Bank & Transfusion Services', min_staffing: 6, subdepartments: ['Blood Donation Center', 'Blood Processing', 'Blood Storage', 'Transfusion Services', 'Apheresis'] },
      { name: 'Nursing Services', min_staffing: 20, subdepartments: ['Medical-Surgical Nursing', 'Critical Care Nursing', 'Pediatric Nursing', 'Maternity Nursing', 'Operating Room Nursing', 'Emergency Nursing', 'Outpatient Nursing', 'Infection Control Nursing', 'Nursing Education'] },
      { name: 'Respiratory Therapy', min_staffing: 6, subdepartments: ['Inpatient Respiratory Care', 'Pulmonary Function Testing', 'Sleep Lab', 'Home Oxygen Services'] },
    ],
  },
  dental: {
    departments: [
      { name: 'General Dentistry', min_staffing: 4, subdepartments: [] },
      { name: 'Oral Surgery', min_staffing: 3, subdepartments: [] },
      { name: 'Orthodontics', min_staffing: 3, subdepartments: [] },
      { name: 'Periodontics', min_staffing: 2, subdepartments: [] },
      { name: 'Endodontics', min_staffing: 2, subdepartments: [] },
      { name: 'Prosthodontics', min_staffing: 2, subdepartments: [] },
      { name: 'Pediatric Dentistry', min_staffing: 3, subdepartments: [] },
      { name: 'Cosmetic Dentistry', min_staffing: 2, subdepartments: [] },
    ],
  },
  engineering: {
    departments: [
      { name: 'Software Engineering', min_staffing: 5, subdepartments: ['Frontend Development', 'Backend Development', 'DevOps', 'Quality Assurance', 'Mobile Development'] },
      { name: 'Mechanical Engineering', min_staffing: 4, subdepartments: ['Design Engineering', 'Manufacturing', 'Thermal Systems'] },
      { name: 'Electrical Engineering', min_staffing: 4, subdepartments: ['Power Systems', 'Control Systems', 'Electronics'] },
      { name: 'Civil Engineering', min_staffing: 4, subdepartments: ['Structural Engineering', 'Transportation Engineering', 'Geotechnical Engineering', 'Water Resources'] },
      { name: 'Chemical Engineering', min_staffing: 3, subdepartments: [] },
      { name: 'Industrial Engineering', min_staffing: 3, subdepartments: [] },
      { name: 'Aerospace Engineering', min_staffing: 3, subdepartments: [] },
      { name: 'Biomedical Engineering', min_staffing: 3, subdepartments: [] },
      { name: 'Environmental Engineering', min_staffing: 3, subdepartments: [] },
      { name: 'Computer Engineering', min_staffing: 4, subdepartments: [] },
    ],
  },
  administration: {
    departments: [
      { name: 'Human Resources', min_staffing: 2, subdepartments: ['Recruitment', 'Payroll', 'Benefits'] },
      { name: 'Finance', min_staffing: 3, subdepartments: ['Accounting', 'Budgeting', 'Auditing'] },
      { name: 'Legal', min_staffing: 2, subdepartments: [] },
      { name: 'Marketing', min_staffing: 3, subdepartments: ['Digital Marketing', 'Brand Management', 'Communications'] },
      { name: 'Customer Service', min_staffing: 4, subdepartments: [] },
    ],
  },
  operations: {
    departments: [
      { name: 'Maintenance', min_staffing: 3, subdepartments: ['Electrical Maintenance', 'Mechanical Maintenance', 'Building Maintenance'] },
      { name: 'Security', min_staffing: 4, subdepartments: [] },
      { name: 'Housekeeping', min_staffing: 5, subdepartments: [] },
      { name: 'Logistics', min_staffing: 3, subdepartments: ['Procurement', 'Inventory', 'Distribution'] },
    ],
  },
};

const DepartmentManagement = () => {
  const [open, setOpen] = useState(false);
  const [departmentName, setDepartmentName] = useState('');
  const [category, setCategory] = useState<string>('');
  const [selectedFacility, setSelectedFacility] = useState('');
  const [parentDepartment, setParentDepartment] = useState<string>('');
  const [minStaffing, setMinStaffing] = useState<number>(1);
  const [usePreset, setUsePreset] = useState(false);
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

  // Get preset departments for selected category
  const categoryPresets = category ? departmentPresets[category as keyof typeof departmentPresets] : null;
  
  // Get subdepartment presets for selected parent department
  const selectedParentDept = parentDepartments.find(d => d.id === parentDepartment);
  const parentPreset = categoryPresets?.departments.find(d => d.name === selectedParentDept?.name);

  // Handle preset selection
  const handlePresetSelect = (presetName: string) => {
    const preset = categoryPresets?.departments.find(d => d.name === presetName);
    if (preset) {
      setDepartmentName(preset.name);
      setMinStaffing(preset.min_staffing);
      setUsePreset(true);
    }
  };

  const handleSubdepartmentPresetSelect = (subName: string) => {
    setDepartmentName(subName);
    setMinStaffing(2);
    setUsePreset(true);
  };

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
                    <Label htmlFor="category">Category *</Label>
                    <Select value={category} onValueChange={(val) => {
                      setCategory(val);
                      setDepartmentName('');
                      setParentDepartment('');
                      setUsePreset(false);
                    }}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="medical">Medical</SelectItem>
                        <SelectItem value="dental">Dental</SelectItem>
                        <SelectItem value="engineering">Engineering</SelectItem>
                        <SelectItem value="administration">Administration</SelectItem>
                        <SelectItem value="operations">Operations</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Show preset departments when category is selected and no parent department */}
                  {category && !parentDepartment && categoryPresets && (
                    <div className="space-y-2">
                      <Label>Department Presets (Optional)</Label>
                      <div className="border rounded-lg p-3 max-h-48 overflow-y-auto space-y-2 bg-muted/30">
                        {categoryPresets.departments.map((preset) => (
                          <Button
                            key={preset.name}
                            type="button"
                            variant="outline"
                            size="sm"
                            className="w-full justify-start text-left"
                            onClick={() => handlePresetSelect(preset.name)}
                          >
                            <div className="flex items-center justify-between w-full">
                              <span>{preset.name}</span>
                              <Badge variant="secondary" className="text-xs">
                                Min: {preset.min_staffing}
                              </Badge>
                            </div>
                          </Button>
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Click a preset to auto-fill the department name and staffing
                      </p>
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="dept-name">Department Name *</Label>
                    <Input
                      id="dept-name"
                      placeholder="e.g., Emergency Department"
                      value={departmentName}
                      onChange={(e) => {
                        setDepartmentName(e.target.value);
                        setUsePreset(false);
                      }}
                      required
                    />
                  </div>

                  {selectedFacility && parentDepartments.length > 0 && (
                    <div className="space-y-2">
                      <Label htmlFor="parent">Parent Department (Optional)</Label>
                      <Select value={parentDepartment} onValueChange={(val) => {
                        setParentDepartment(val);
                        setDepartmentName('');
                        setUsePreset(false);
                      }}>
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

                  {/* Show subdepartment presets when parent department is selected */}
                  {parentDepartment && parentPreset && parentPreset.subdepartments.length > 0 && (
                    <div className="space-y-2">
                      <Label>Subdepartment Presets (Optional)</Label>
                      <div className="border rounded-lg p-3 max-h-48 overflow-y-auto space-y-2 bg-muted/30">
                        {parentPreset.subdepartments.map((subName) => (
                          <Button
                            key={subName}
                            type="button"
                            variant="outline"
                            size="sm"
                            className="w-full justify-start"
                            onClick={() => handleSubdepartmentPresetSelect(subName)}
                          >
                            ↳ {subName}
                          </Button>
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Click a preset to auto-fill the subdepartment name
                      </p>
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
                        {workspace.facilities.map((facility: any) => {
                          // Group departments by category
                          const departmentsByCategory = facility.departments?.reduce((acc: any, dept: any) => {
                            const cat = dept.category || 'uncategorized';
                            if (!acc[cat]) acc[cat] = [];
                            acc[cat].push(dept);
                            return acc;
                          }, {} as Record<string, any[]>) || {};

                          const categories = Object.keys(departmentsByCategory).sort();

                          return (
                            <div key={facility.id} className="border rounded-lg p-3 bg-muted/30">
                              <div className="flex items-center gap-2 mb-3">
                                <Building2 className="h-4 w-4 text-muted-foreground" />
                                <span className="font-medium">{facility.name}</span>
                                <Badge variant="outline">{facility.departments?.length || 0} departments</Badge>
                              </div>
                              {categories.length > 0 ? (
                                <div className="space-y-3 ml-4">
                                  {categories.map((category) => (
                                    <div key={category} className="border-l-4 border-primary/40 pl-3 space-y-2">
                                      <div className="flex items-center gap-2 mb-2">
                                        <Badge className="capitalize font-semibold">{category}</Badge>
                                        <span className="text-xs text-muted-foreground">
                                          {departmentsByCategory[category].length} departments
                                        </span>
                                      </div>
                                      <div className="space-y-2">
                                        {departmentsByCategory[category].map((dept: any) => (
                                          <div key={dept.id} className="space-y-2">
                                            <div className="p-2 rounded bg-background text-sm group">
                                              <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                  <span className="font-medium">{dept.name}</span>
                                                  <Badge variant="secondary" className="text-xs">
                                                    <Users className="h-3 w-3 mr-1" />
                                                    Min: {dept.min_staffing}
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
                                                  <div key={subDept.id} className="p-2 rounded bg-muted/50 text-sm border-l-2 border-primary/20 group">
                                                    <div className="flex items-center justify-between">
                                                      <div className="flex items-center gap-2">
                                                        <span className="text-sm">↳ {subDept.name}</span>
                                                        <Badge variant="outline" className="text-xs">
                                                          <Users className="h-3 w-3 mr-1" />
                                                          Min: {subDept.min_staffing}
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
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-sm text-muted-foreground py-2 ml-4">No departments in this facility</p>
                              )}
                            </div>
                          );
                        })}
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