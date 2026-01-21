import { z } from 'zod';

// ============================================
// Common Validation Schemas
// ============================================

export const emailSchema = z
  .string()
  .min(1, 'Email is required')
  .email('Invalid email format')
  .max(255, 'Email must be less than 255 characters')
  .transform((email) => email.toLowerCase().trim());

export const passwordSchema = z
  .string()
  .min(6, 'Password must be at least 6 characters')
  .max(128, 'Password must be less than 128 characters');

export const strongPasswordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must be less than 128 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number');

export const uuidSchema = z
  .string()
  .uuid('Invalid UUID format');

export const fullNameSchema = z
  .string()
  .min(2, 'Name must be at least 2 characters')
  .max(100, 'Name must be less than 100 characters')
  .transform((name) => name.trim());

export const phoneSchema = z
  .string()
  .regex(/^\+?[1-9]\d{1,14}$/, 'Invalid phone number format')
  .optional()
  .nullable();

export const textSchema = (maxLength: number = 1000) =>
  z
    .string()
    .max(maxLength, `Text must be less than ${maxLength} characters`)
    .transform((text) => text.trim());

export const titleSchema = z
  .string()
  .min(1, 'Title is required')
  .max(200, 'Title must be less than 200 characters')
  .transform((title) => title.trim());

export const descriptionSchema = z
  .string()
  .max(2000, 'Description must be less than 2000 characters')
  .optional()
  .nullable()
  .transform((desc) => desc?.trim() || null);

// ============================================
// Role Validation
// ============================================

export const appRoleSchema = z.enum([
  'super_admin',
  'organization_admin',
  'general_admin',
  'workplace_supervisor',
  'facility_supervisor',
  'department_head',
  'staff',
]);

export type AppRole = z.infer<typeof appRoleSchema>;

// ============================================
// User Creation Schema
// ============================================

export const createUserSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  full_name: fullNameSchema,
  role: appRoleSchema,
  workspace_id: uuidSchema.optional().nullable(),
  facility_id: uuidSchema.optional().nullable(),
  department_id: uuidSchema.optional().nullable(),
  specialty_id: uuidSchema.optional().nullable(),
  organization_id: uuidSchema.optional().nullable(),
  force_password_change: z.boolean().optional().default(false),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;

// ============================================
// Vacation Plan Schema
// ============================================

export const vacationPlanSchema = z.object({
  staff_id: uuidSchema,
  department_id: uuidSchema,
  vacation_type_id: uuidSchema,
  total_days: z.number().min(1).max(365),
  notes: descriptionSchema,
  splits: z.array(
    z.object({
      start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format'),
      end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format'),
      days: z.number().min(1),
    })
  ).min(1, 'At least one split is required'),
});

// ============================================
// Task Schema
// ============================================

export const taskSchema = z.object({
  title: titleSchema,
  description: descriptionSchema,
  priority: z.enum(['low', 'medium', 'high']).optional().default('medium'),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format').optional().nullable(),
  scope_type: z.enum(['workspace', 'facility', 'department']),
  workspace_id: uuidSchema.optional().nullable(),
  facility_id: uuidSchema.optional().nullable(),
  department_id: uuidSchema.optional().nullable(),
});

// ============================================
// Training Event Schema
// ============================================

export const trainingEventSchema = z.object({
  title: titleSchema,
  description: descriptionSchema,
  event_type: z.enum(['training', 'workshop', 'seminar', 'webinar', 'meeting', 'conference', 'other']),
  location_type: z.enum(['online', 'physical', 'hybrid']),
  start_datetime: z.string().datetime('Invalid datetime format'),
  end_datetime: z.string().datetime('Invalid datetime format'),
  max_participants: z.number().min(1).max(10000).optional().nullable(),
  location_address: textSchema(500).optional().nullable(),
  online_link: z.string().url('Invalid URL').optional().nullable(),
});

// ============================================
// Sanitization Helpers
// ============================================

export function sanitizeHtml(input: string): string {
  // Basic HTML entity encoding for XSS prevention
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

export function sanitizeSearchQuery(query: string): string {
  // Remove potential SQL injection patterns
  return query
    .replace(/[;'"\\]/g, '')
    .slice(0, 100)
    .trim();
}

// ============================================
// Validation Helper
// ============================================

export function validateInput<T>(schema: z.ZodSchema<T>, data: unknown): {
  success: true;
  data: T;
} | {
  success: false;
  errors: string[];
} {
  const result = schema.safeParse(data);

  if (result.success) {
    return { success: true, data: result.data };
  }

  const errors = result.error.errors.map((err) =>
    `${err.path.join('.')}: ${err.message}`
  );

  return { success: false, errors };
}
