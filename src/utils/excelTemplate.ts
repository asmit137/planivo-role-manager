import ExcelJS from 'exceljs';

export interface BulkUserTemplate {
  email: string;
  full_name: string;
  organization_name?: string;
  workspace_name?: string;
  facility_name?: string;
  department_name?: string;
  specialty_name?: string;
  role: string;
}

export interface TemplateData {
  organizations: string[];
  workspaces: string[];
  facilities: string[];
  departments: string[];
  roles: string[];
}

export const downloadBulkUserTemplate = async (data: TemplateData) => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Bulk Users Template');

  // Define columns
  worksheet.columns = [
    { header: 'Email', key: 'email', width: 30 },
    { header: 'Full Name', key: 'full_name', width: 25 },
    { header: 'Organization Name', key: 'organization_name', width: 25 },
    { header: 'Workspace Name', key: 'workspace_name', width: 25 },
    { header: 'Facility Name', key: 'facility_name', width: 25 },
    { header: 'Department Name', key: 'department_name', width: 30 },
    { header: 'Specialty Name', key: 'specialty_name', width: 30 },
    { header: 'Role', key: 'role', width: 20 },
  ];

  // Add example data
  worksheet.addRow({
    email: 'staff@example.com',
    full_name: 'John Staff',
    organization_name: data.organizations[0] || 'My Hospital Group',
    workspace_name: data.workspaces[0] || 'Main Workspace',
    facility_name: data.facilities[0] || 'Main Hospital',
    department_name: data.departments[0] || 'Emergency',
    specialty_name: 'Nurse',
    role: 'staff',
  });

  // Add dropdowns for 100 rows
  for (let i = 2; i <= 101; i++) {
    // Role Dropdown
    worksheet.getCell(`H${i}`).dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: [`"${data.roles.join(',')}"`],
    };

    // Org Dropdown
    if (data.organizations.length > 0) {
      worksheet.getCell(`C${i}`).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: [`"${data.organizations.join(',')}"`],
      };
    }

    // Workspace Dropdown
    if (data.workspaces.length > 0) {
      worksheet.getCell(`D${i}`).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: [`"${data.workspaces.join(',')}"`],
      };
    }

    // Facility Dropdown
    if (data.facilities.length > 0) {
      worksheet.getCell(`E${i}`).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: [`"${data.facilities.join(',')}"`],
      };
    }

    // Department Dropdown
    if (data.departments.length > 0) {
      worksheet.getCell(`F${i}`).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: [`"${data.departments.join(',')}"`],
      };
    }
  }

  // Generate buffer
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'bulk-users-template.xlsx';
  anchor.click();
  window.URL.revokeObjectURL(url);
};

export const parseBulkUserExcel = async (file: File): Promise<BulkUserTemplate[]> => {
  const workbook = new ExcelJS.Workbook();
  const arrayBuffer = await file.arrayBuffer();
  await workbook.xlsx.load(arrayBuffer);
  const worksheet = workbook.getWorksheet(1);

  const users: BulkUserTemplate[] = [];

  worksheet?.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // Skip header

    const user: BulkUserTemplate = {
      email: row.getCell(1).text?.trim(),
      full_name: row.getCell(2).text?.trim(),
      organization_name: row.getCell(3).text?.trim() || undefined,
      workspace_name: row.getCell(4).text?.trim() || undefined,
      facility_name: row.getCell(5).text?.trim() || undefined,
      department_name: row.getCell(6).text?.trim() || undefined,
      specialty_name: row.getCell(7).text?.trim() || undefined,
      role: row.getCell(8).text?.trim() as any,
    };

    if (user.email && user.full_name && user.role) {
      users.push(user);
    }
  });

  return users;
};
