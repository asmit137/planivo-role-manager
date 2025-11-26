-- Allow users to delete their own draft vacation plans
CREATE POLICY "Users can delete their own draft plans"
ON vacation_plans FOR DELETE
USING (
  status = 'draft' AND 
  (created_by = auth.uid() OR staff_id = auth.uid())
);