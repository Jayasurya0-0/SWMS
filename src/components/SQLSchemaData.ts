/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface SQLTable {
  name: string;
  description: string;
  columns: { name: string; type: string; constraints?: string; desc: string }[];
  ddl: string;
}

export const SQL_TABLES: SQLTable[] = [
  {
    name: 'employees',
    description: 'Stores personal details, skills category, designation and joining date of garment operators',
    columns: [
      { name: 'id', type: 'VARCHAR(50)', constraints: 'PRIMARY KEY', desc: 'Unique Employee Identifier' },
      { name: 'name', type: 'VARCHAR(255)', constraints: 'NOT NULL', desc: 'Full Name of the worker' },
      { name: 'department_id', type: 'VARCHAR(50)', constraints: 'REFERENCES departments(id)', desc: 'Foreign key to Department' },
      { name: 'section', type: 'VARCHAR(100)', desc: 'Floor section (e.g. Sewing Line, Finishing)' },
      { name: 'line_number', type: 'INT', desc: 'Assigned production line (1 to 5)' },
      { name: 'designation', type: 'VARCHAR(100)', desc: 'Official job title' },
      { name: 'joining_date', type: 'DATE', desc: 'Date of joining the mill' },
      { name: 'skill_category', type: 'VARCHAR(100)', desc: 'A, B, C grade operator, Helper, QA or Finisher' },
      { name: 'experience_years', type: 'DECIMAL(3,1)', desc: 'Industry experience in years' },
      { name: 'contact_number', type: 'VARCHAR(20)', desc: 'Phone number' },
      { name: 'base_efficiency', type: 'INT', desc: 'Average operator efficiency percentage' },
      { name: 'historical_att_rate', type: 'INT', desc: 'Overall attendance percentage' }
    ],
    ddl: `CREATE TABLE employees (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  department_id VARCHAR(50) REFERENCES departments(id),
  section VARCHAR(100),
  line_number INT,
  designation VARCHAR(100),
  joining_date DATE,
  skill_category VARCHAR(100) CHECK (skill_category IN ('Grade A Operator', 'Grade B Operator', 'Grade C Operator', 'Helper', 'Quality Inspector', 'Ironer/Finisher')),
  experience_years DECIMAL(3,1),
  contact_number VARCHAR(20),
  base_efficiency INT CHECK (base_efficiency BETWEEN 0 AND 100),
  historical_att_rate INT CHECK (historical_att_rate BETWEEN 0 AND 100)
);`
  },
  {
    name: 'attendance',
    description: 'Tracks daily shift gates check-ins, check-outs, methods and marks status',
    columns: [
      { name: 'id', type: 'VARCHAR(50)', constraints: 'PRIMARY KEY', desc: 'Unique attendance log identifier' },
      { name: 'employee_id', type: 'VARCHAR(50)', constraints: 'REFERENCES employees(id) ON DELETE CASCADE', desc: 'Associated worker' },
      { name: 'date', type: 'DATE', constraints: 'NOT NULL', desc: 'Attendance Date (YYYY-MM-DD)' },
      { name: 'status', type: 'VARCHAR(20)', constraints: 'NOT NULL', desc: 'Present, Absent, Leave, Late' },
      { name: 'check_in_time', type: 'TIME', desc: 'Time operator cleared biometric gates' },
      { name: 'check_out_time', type: 'TIME', desc: 'Time operator logged out' },
      { name: 'method', type: 'VARCHAR(30)', desc: 'Biometric, RFID, QR Code, or Manual HR' },
      { name: 'marked_by', type: 'VARCHAR(100)', desc: 'ID of supervisor/system who recorded' },
      { name: 'marked_at', type: 'TIMESTAMP', desc: 'Database registration timestamp' }
    ],
    ddl: `CREATE TABLE attendance (
  id VARCHAR(50) PRIMARY KEY,
  employee_id VARCHAR(50) REFERENCES employees(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  status VARCHAR(20) CHECK (status IN ('Present', 'Absent', 'Leave', 'Late')),
  check_in_time TIME,
  check_out_time TIME,
  method VARCHAR(30) CHECK (method IN ('Manual', 'QR Code', 'Biometric', 'RFID')),
  marked_by VARCHAR(100),
  marked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_emp_date UNIQUE (employee_id, date)
);`
  },
  {
    name: 'leave_requests',
    description: 'Saves employee official time-off submissions and tracking details',
    columns: [
      { name: 'id', type: 'VARCHAR(50)', constraints: 'PRIMARY KEY', desc: 'Request register ID' },
      { name: 'employee_id', type: 'VARCHAR(50)', constraints: 'REFERENCES employees(id) ON DELETE CASCADE', desc: 'Requesting employee' },
      { name: 'leave_type', type: 'VARCHAR(30)', constraints: 'NOT NULL', desc: 'Casual, Sick, Emergency, Earned' },
      { name: 'start_date', type: 'DATE', constraints: 'NOT NULL', desc: 'First day of leave' },
      { name: 'end_date', type: 'DATE', constraints: 'NOT NULL', desc: 'Last day of leave' },
      { name: 'reason', type: 'TEXT', desc: 'Written application rationale' },
      { name: 'status', type: 'VARCHAR(20)', constraints: 'DEFAULT Pending', desc: 'Pending, Approved, Rejected' },
      { name: 'requested_date', type: 'DATE', desc: 'Date petition was logged' },
      { name: 'approved_by_supervisor', type: 'VARCHAR(100)', desc: 'Floor supervisor approving signature' },
      { name: 'approved_by_hr', type: 'VARCHAR(100)', desc: 'HR Manager approving signature' }
    ],
    ddl: `CREATE TABLE leave_requests (
  id VARCHAR(50) PRIMARY KEY,
  employee_id VARCHAR(50) REFERENCES employees(id) ON DELETE CASCADE,
  leave_type VARCHAR(30) CHECK (leave_type IN ('Casual', 'Sick', 'Emergency', 'Earned')),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  reason TEXT,
  status VARCHAR(20) DEFAULT 'Pending' CHECK (status IN ('Pending', 'Approved', 'Rejected')),
  requested_date DATE DEFAULT CURRENT_DATE,
  approved_by_supervisor VARCHAR(100),
  approved_by_hr VARCHAR(100)
);`
  },
  {
    name: 'worker_skills',
    description: 'Relational map of operations that operators are certified to execute with levels',
    columns: [
      { name: 'employee_id', type: 'VARCHAR(50)', constraints: 'PRIMARY KEY (with operation)', desc: 'Link to employee' },
      { name: 'operation_name', type: 'VARCHAR(100)', constraints: 'PRIMARY KEY', desc: 'Operation name (e.g. Collar Join, Hemming)' },
      { name: 'skill_level', type: 'VARCHAR(20)', constraints: 'NOT NULL', desc: 'Beginner, Intermediate, Advanced, Expert' },
      { name: 'proficiency', type: 'INT', desc: 'Numeric efficiency ranking (0-100)' },
      { name: 'training_status', type: 'VARCHAR(30)', desc: 'Completed, In Training, Not Started' }
    ],
    ddl: `CREATE TABLE worker_skills (
  employee_id VARCHAR(50) REFERENCES employees(id) ON DELETE CASCADE,
  operation_name VARCHAR(100) NOT NULL,
  skill_level VARCHAR(20) CHECK (skill_level IN ('Beginner', 'Intermediate', 'Advanced', 'Expert')),
  proficiency INT CHECK (proficiency BETWEEN 0 AND 100),
  training_status VARCHAR(30) CHECK (training_status IN ('Completed', 'In Training', 'Not Started')),
  PRIMARY KEY (employee_id, operation_name)
);`
  },
  {
    name: 'production_lines',
    description: 'Defines sewing modular assembly lines, capacity targets, supervisors',
    columns: [
      { name: 'id', type: 'INT', constraints: 'PRIMARY KEY', desc: 'Line Number (1 to 5)' },
      { name: 'supervisor_name', type: 'VARCHAR(255)', desc: 'Supervisor in charge' },
      { name: 'target_quantity', type: 'INT', desc: 'Daily targeted shirt/trouser output pieces' },
      { name: 'required_manpower', type: 'INT', desc: 'Standard target headcount for optimal line balancing' },
      { name: 'target_efficiency', type: 'INT', desc: 'Required target line efficiency percentage' },
      { name: 'bottleneck_operation', type: 'VARCHAR(100)', desc: 'Highest standard minute value operation in the lines flow' }
    ],
    ddl: `CREATE TABLE production_lines (
  id INT PRIMARY KEY,
  supervisor_name VARCHAR(255),
  target_quantity INT NOT NULL,
  required_manpower INT NOT NULL,
  target_efficiency INT CHECK (target_efficiency BETWEEN 0 AND 100),
  bottleneck_operation VARCHAR(100)
);`
  },
  {
    name: 'employee_assignments',
    description: 'Bridges attendance and active deployments on production operations, lines or special offline events',
    columns: [
      { name: 'assignment_id', type: 'VARCHAR(50)', constraints: 'PRIMARY KEY', desc: 'Unique assignment register identifier' },
      { name: 'employee_id', type: 'VARCHAR(50)', constraints: 'REFERENCES employees(id) ON DELETE CASCADE', desc: 'Associated worker link' },
      { name: 'assignment_date', type: 'DATE', constraints: 'NOT NULL', desc: 'Date of assignment (YYYY-MM-DD)' },
      { name: 'assigned_line', type: 'INT', desc: 'Target production line (1 to 5) or 0 for off-line' },
      { name: 'assigned_operation', type: 'VARCHAR(100)', desc: 'Specific operation name (e.g. Collar Join)' },
      { name: 'assignment_status', type: 'VARCHAR(50)', constraints: 'NOT NULL', desc: 'Assigned, Unassigned, Available for Replacement, Training, Meeting, QA, Maintenance, Off-Line' },
      { name: 'assignment_start_time', type: 'TIME', desc: 'Daily allocation kickoff time' },
      { name: 'assignment_end_time', type: 'TIME', desc: 'Daily allocation release time' },
      { name: 'assigned_by', type: 'VARCHAR(100)', desc: 'Supervisor who recorded alignment' },
      { name: 'availability_flag', type: 'BOOLEAN', constraints: 'DEFAULT TRUE', desc: 'Whether work-cell can spare this operator for line recovery' }
    ],
    ddl: `CREATE TABLE employee_assignments (
  assignment_id VARCHAR(50) PRIMARY KEY,
  employee_id VARCHAR(50) REFERENCES employees(id) ON DELETE CASCADE,
  assignment_date DATE NOT NULL,
  assigned_line INT,
  assigned_operation VARCHAR(100),
  assignment_status VARCHAR(50) NOT NULL,
  assignment_start_time TIME,
  assignment_end_time TIME,
  assigned_by VARCHAR(100),
  availability_flag BOOLEAN DEFAULT TRUE,
  CONSTRAINT uq_emp_assign_date UNIQUE (employee_id, assignment_date)
);`
  }
];
