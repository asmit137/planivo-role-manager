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

export interface HierarchicalTemplateData {
  organizations: {
    name: string;
    workspaces: {
      name: string;
      facilities: {
        name: string;
        departments: {
          name: string;
        }[];
      }[];
    }[];
  }[];
  roles: string[];
}

export const downloadBulkUserTemplate = async (data: HierarchicalTemplateData) => {
  const workbook = new ExcelJS.Workbook();

  // ===============================
  // MAIN SHEET
  // ===============================
  const worksheet = workbook.addWorksheet('Bulk Users Template');

  worksheet.columns = [
    { header: 'Email', key: 'email', width: 30 },
    { header: 'Full Name', key: 'full_name', width: 25 },
    { header: 'Organization Name', key: 'organization_name', width: 30 },
    { header: 'Workspace Name', key: 'workspace_name', width: 30 },
    { header: 'Facility Name', key: 'facility_name', width: 30 },
    { header: 'Department Name', key: 'department_name', width: 30 },
    { header: 'Specialty Name', key: 'specialty_name', width: 30 },
    { header: 'Role', key: 'role', width: 20 },
  ];

  // ===============================
  // VALIDATION SHEET (HIDDEN)
  // ===============================
  const validationSheet = workbook.addWorksheet('ValidationData');
  validationSheet.state = 'hidden';

  const orgList: string[] = [];
  const wsList: string[] = [];
  const facList: string[] = [];
  const deptList: string[] = [];

  data.organizations.forEach(org => {
    orgList.push(org.name);

    org.workspaces.forEach(ws => {
      wsList.push(`${ws.name} [${org.name}]`);

      ws.facilities.forEach(fac => {
        facList.push(`${fac.name} [${ws.name}]`);

        fac.departments.forEach(dep => {
          deptList.push(`${dep.name} [${fac.name}]`);
        });
      });
    });
  });

  // ===============================
  // WRITE LISTS (NO NAMED RANGES)
  // ===============================
  const writeColumn = (colIndex: number, header: string, values: string[]) => {
    const col = validationSheet.getColumn(colIndex);
    col.values = [header, ...values];
  };

  writeColumn(1, 'Organizations', orgList);
  writeColumn(2, 'Workspaces', wsList);
  writeColumn(3, 'Facilities', facList);
  writeColumn(4, 'Departments', deptList);
  writeColumn(5, 'Roles', data.roles);

  // ===============================
  // CALCULATE EXACT LIST END ROWS
  // ===============================
  const orgEnd = orgList.length + 1;
  const wsEnd = wsList.length + 1;
  const facEnd = facList.length + 1;
  const deptEnd = deptList.length + 1;
  const roleEnd = data.roles.length + 1;


  // ===============================
  // APPLY DATA VALIDATION
  // ===============================
  for (let row = 2; row <= 200; row++) {
    worksheet.getCell(`C${row}`).dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: [`=ValidationData!$A$2:$A$${orgEnd}`],
    };

    worksheet.getCell(`D${row}`).dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: [`=ValidationData!$B$2:$B$${wsEnd}`],
    };

    worksheet.getCell(`E${row}`).dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: [`=ValidationData!$C$2:$C$${facEnd}`],
    };

    worksheet.getCell(`F${row}`).dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: [`=ValidationData!$D$2:$D$${deptEnd}`],
    };

    worksheet.getCell(`H${row}`).dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: [`=ValidationData!$E$2:$E$${roleEnd}`],
    };
  }

  // NOTE: No sample row added - users start from row 2
  // This prevents example data from being accidentally uploaded

  // ===============================
  // DOWNLOAD
  // ===============================
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'bulk-users-template.xlsx';
  a.click();
  URL.revokeObjectURL(url);
};


// Update Parser to Strip Context Suffix
export const parseBulkUserExcel = async (file: File): Promise<BulkUserTemplate[]> => {
  const workbook = new ExcelJS.Workbook();
  const arrayBuffer = await file.arrayBuffer();
  await workbook.xlsx.load(arrayBuffer);
  const worksheet = workbook.getWorksheet(1);

  const users: BulkUserTemplate[] = [];

  const cleanValue = (val: string | undefined) => {
    if (!val) return undefined;
    // Remove " [ParentContext]" suffix if exists
    // Valid format: "Name [Parent]" -> "Name"
    // Regex: Match everything up to the last " [anything]"
    const match = val.match(/^(.+?)\s*\[[^\]]+\]$/);
    return match ? match[1].trim() : val.trim();
  };

  worksheet?.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // Skip header

    const user: BulkUserTemplate = {
      email: row.getCell(1).text?.trim(),
      full_name: row.getCell(2).text?.trim(),
      organization_name: row.getCell(3).text?.trim() || undefined,
      workspace_name: cleanValue(row.getCell(4).text),
      facility_name: cleanValue(row.getCell(5).text),
      department_name: cleanValue(row.getCell(6).text),
      specialty_name: row.getCell(7).text?.trim() || undefined,
      role: row.getCell(8).text?.trim() as any,
    };

    if (user.email && user.full_name && user.role) {
      console.log('Parsed user from Excel:', {
        email: user.email,
        organization_name: user.organization_name,
        workspace_name: user.workspace_name,
        facility_name: user.facility_name,
        department_name: user.department_name,
        role: user.role
      });
      users.push(user);
    }
  });

  return users;
};
