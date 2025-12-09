-- Add unique constraint for workspace_departments to enable proper upsert
ALTER TABLE public.workspace_departments 
ADD CONSTRAINT workspace_departments_workspace_department_unique 
UNIQUE (workspace_id, department_template_id);

-- Add unique constraint for workspace_categories as well
ALTER TABLE public.workspace_categories 
ADD CONSTRAINT workspace_categories_workspace_category_unique 
UNIQUE (workspace_id, category_id);