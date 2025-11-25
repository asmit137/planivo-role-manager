import * as XLSX from 'xlsx';

export interface BulkUserTemplate {
  email: string;
  full_name: string;
  facility_name: string;
  department_name: string;
  specialty_name: string;
  role: 'staff' | 'department_head' | 'facility_supervisor';
}

export const generateBulkUserTemplate = () => {
  const template: BulkUserTemplate[] = [
    {
      email: 'example@email.com',
      full_name: 'John Doe',
      facility_name: 'Main Hospital',
      department_name: 'Emergency Department',
      specialty_name: 'Emergency Nurse',
      role: 'staff',
    },
    {
      email: 'jane@email.com',
      full_name: 'Jane Smith',
      facility_name: 'Main Hospital',
      department_name: 'Surgery',
      specialty_name: 'Surgical Nurse',
      role: 'staff',
    },
  ];

  const worksheet = XLSX.utils.json_to_sheet(template);
  
  // Set column widths
  worksheet['!cols'] = [
    { wch: 25 }, // email
    { wch: 20 }, // full_name
    { wch: 20 }, // facility_name
    { wch: 25 }, // department_name
    { wch: 25 }, // specialty_name
    { wch: 20 }, // role
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Bulk Users Template');

  return workbook;
};

export const downloadBulkUserTemplate = () => {
  const workbook = generateBulkUserTemplate();
  XLSX.writeFile(workbook, 'bulk-users-template.xlsx');
};

export const parseBulkUserExcel = (file: File): Promise<BulkUserTemplate[]> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json<BulkUserTemplate>(worksheet);
        
        // Filter out empty rows and validate
        const validData = jsonData.filter(row => 
          row.email && 
          row.full_name && 
          row.facility_name && 
          row.department_name &&
          row.role
        );
        
        resolve(validData);
      } catch (error) {
        reject(error);
      }
    };
    
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsBinaryString(file);
  });
};
