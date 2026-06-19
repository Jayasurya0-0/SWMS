/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Employee, AttendanceRecord, LeaveRequest, ProductionLine, AppNotification, UserAccount } from '../types';

export const SYSTEM_USERS: UserAccount[] = [
  {
    id: 'USR001',
    username: 'admin_prakash',
    email: 'prakash@smartgarments.com',
    role: 'Admin',
    avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=facearea&facepad=2&w=256&h=256&q=80',
  },
  {
    id: 'USR002',
    username: 'hr_ananya',
    email: 'ananya.hr@smartgarments.com',
    role: 'HR Manager',
    avatarUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=facearea&facepad=2&w=256&h=256&q=80',
  },
  {
    id: 'USR003',
    username: 'pm_vikram',
    email: 'vikram.production@smartgarments.com',
    role: 'Production Manager',
    avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=facearea&facepad=2&w=256&h=256&q=80',
  },
  {
    id: 'USR004',
    username: 'sup_karthik',
    email: 'karthik.l4@smartgarments.com',
    role: 'Supervisor',
    avatarUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=facearea&facepad=2&w=256&h=256&q=80',
    assignedLines: [3, 4],
  },
  {
    id: 'USR005',
    username: 'ie_rahul',
    email: 'rahul.ie@smartgarments.com',
    role: 'Industrial Engineer',
    avatarUrl: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=facearea&facepad=2&w=256&h=256&q=80',
  },
];

export const DEPARTMENTS = [
  { id: 'DEPT01', name: 'Sewing', manager: 'Vikram Mehta', totalEmployees: 65 },
  { id: 'DEPT02', name: 'Cutting', manager: 'Sanjay Sharma', totalEmployees: 12 },
  { id: 'DEPT03', name: 'QA', manager: 'Deepa Nair', totalEmployees: 15 },
  { id: 'DEPT04', name: 'Finishing & Packing', manager: 'Amit Saxena', totalEmployees: 18 },
];

export const OPERATIONS_LIST = [
  'Collar Join',
  'Sleeve Attach',
  'Bottom Hemming',
  'Pocket Attaching',
  'Pocket Welting',
  'Button Stitching',
  'Side Seam Join',
  'Cuff Attachment',
  'Fabric Inspection',
  'Quality Audit Audit',
  'Final Ironing',
];

export const FESTIVAL_SEASONS = [
  { name: 'Diwali Peak Phase', month: 10, riskModifier: 1.6, description: 'Post-autumn festival leaves' },
  { name: 'Eid Celebration Proximity', month: 4, riskModifier: 1.5, description: 'Family gatherings travel' },
  { name: 'Harvest Season (Pongal/Baisakhi)', month: 1, riskModifier: 1.4, description: 'Agrarian workers visit' },
  { name: 'Monsoon Peak Rain Week', month: 7, riskModifier: 1.3, description: 'Infrastructure disruptions' },
];

export const INITIAL_EMPLOYEES: Employee[] = [
  {
    id: 'EMP101',
    name: 'Rajesh Kumar',
    photoUrl: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=facearea&facepad=2&w=256&h=256&q=80',
    department: 'Sewing',
    section: 'Main Line',
    lineNumber: 1,
    designation: 'Senior Sewing Operator',
    joiningDate: '2022-03-15',
    skillCategory: 'Grade A Operator',
    experience: 6,
    contactNumber: '+91 98765 43210',
    baseEfficiency: 82,
    historicalAttendanceRate: 96,
    riskScore: 8,
    riskLevel: 'Low',
    leaveBalances: { casual: 4, sick: 6, earned: 12, emergency: 3 },
    skills: [
      { operationName: 'Collar Join', skillLevel: 'Expert', proficiency: 92, trainingStatus: 'Completed' },
      { operationName: 'Sleeve Attach', skillLevel: 'Advanced', proficiency: 85, trainingStatus: 'Completed' },
      { operationName: 'Pocket Attaching', skillLevel: 'Advanced', proficiency: 80, trainingStatus: 'Completed' },
    ],
  },
  {
    id: 'EMP102',
    name: 'Savitha Devi',
    photoUrl: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=facearea&facepad=2&w=256&h=256&q=80',
    department: 'Sewing',
    section: 'Main Line',
    lineNumber: 1,
    designation: 'Senior Sewing Operator',
    joiningDate: '2021-08-10',
    skillCategory: 'Grade A Operator',
    experience: 5,
    contactNumber: '+91 98765 43211',
    baseEfficiency: 79,
    historicalAttendanceRate: 93,
    riskScore: 18,
    riskLevel: 'Low',
    leaveBalances: { casual: 3, sick: 5, earned: 9, emergency: 2 },
    skills: [
      { operationName: 'Sleeve Attach', skillLevel: 'Expert', proficiency: 90, trainingStatus: 'Completed' },
      { operationName: 'Cuff Attachment', skillLevel: 'Advanced', proficiency: 84, trainingStatus: 'Completed' },
      { operationName: 'Bottom Hemming', skillLevel: 'Intermediate', proficiency: 72, trainingStatus: 'Completed' },
    ],
  },
  {
    id: 'EMP103',
    name: 'Manoj Yadav',
    photoUrl: 'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?auto=format&fit=facearea&facepad=2&w=256&h=256&q=80',
    department: 'Sewing',
    section: 'Main Line',
    lineNumber: 2,
    designation: 'Sewing Operator',
    joiningDate: '2023-01-20',
    skillCategory: 'Grade B Operator',
    experience: 3,
    contactNumber: '+91 98765 43212',
    baseEfficiency: 74,
    historicalAttendanceRate: 88,
    riskScore: 35,
    riskLevel: 'Medium',
    leaveBalances: { casual: 2, sick: 4, earned: 7, emergency: 1 },
    skills: [
      { operationName: 'Pocket Attaching', skillLevel: 'Advanced', proficiency: 82, trainingStatus: 'Completed' },
      { operationName: 'Bottom Hemming', skillLevel: 'Advanced', proficiency: 80, trainingStatus: 'Completed' },
      { operationName: 'Side Seam Join', skillLevel: 'Intermediate', proficiency: 75, trainingStatus: 'Completed' },
    ],
  },
  {
    id: 'EMP104',
    name: 'Priya Sharma',
    photoUrl: 'https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?auto=format&fit=facearea&facepad=2&w=256&h=256&q=80',
    department: 'Sewing',
    section: 'Main Line',
    lineNumber: 3,
    designation: 'Senior Sewing Operator',
    joiningDate: '2020-05-12',
    skillCategory: 'Grade A Operator',
    experience: 7,
    contactNumber: '+91 98765 43213',
    baseEfficiency: 85,
    historicalAttendanceRate: 91,
    riskScore: 25,
    riskLevel: 'Medium',
    leaveBalances: { casual: 2, sick: 6, earned: 14, emergency: 3 },
    skills: [
      { operationName: 'Pocket Welting', skillLevel: 'Expert', proficiency: 95, trainingStatus: 'Completed' },
      { operationName: 'Pocket Attaching', skillLevel: 'Expert', proficiency: 91, trainingStatus: 'Completed' },
      { operationName: 'Collar Join', skillLevel: 'Advanced', proficiency: 82, trainingStatus: 'Completed' },
    ],
  },
  {
    id: 'EMP105',
    name: 'Vikram Singh',
    photoUrl: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?auto=format&fit=facearea&facepad=2&w=256&h=256&q=80',
    department: 'Sewing',
    section: 'Main Line',
    lineNumber: 3,
    designation: 'Support Operator',
    joiningDate: '2023-06-10',
    skillCategory: 'Grade C Operator',
    experience: 2,
    contactNumber: '+91 98765 43214',
    baseEfficiency: 68,
    historicalAttendanceRate: 74,
    riskScore: 78,
    riskLevel: 'Critical',
    leaveBalances: { casual: 0, sick: 2, earned: 4, emergency: 1 },
    skills: [
      { operationName: 'Button Stitching', skillLevel: 'Advanced', proficiency: 86, trainingStatus: 'Completed' },
      { operationName: 'Bottom Hemming', skillLevel: 'Intermediate', proficiency: 70, trainingStatus: 'Completed' },
      { operationName: 'Side Seam Join', skillLevel: 'Beginner', proficiency: 50, trainingStatus: 'In Training' },
    ],
  },
  {
    id: 'EMP106',
    name: 'Anita Mondal',
    photoUrl: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=facearea&facepad=2&w=256&h=256&q=80',
    department: 'Sewing',
    section: 'Main Line',
    lineNumber: 4,
    designation: 'Senior Sewing Operator',
    joiningDate: '2019-11-01',
    skillCategory: 'Grade A Operator',
    experience: 8,
    contactNumber: '+91 98765 43215',
    baseEfficiency: 88,
    historicalAttendanceRate: 98,
    riskScore: 3,
    riskLevel: 'Low',
    leaveBalances: { casual: 5, sick: 8, earned: 18, emergency: 4 },
    skills: [
      { operationName: 'Collar Join', skillLevel: 'Expert', proficiency: 96, trainingStatus: 'Completed' },
      { operationName: 'Pocket Welting', skillLevel: 'Expert', proficiency: 93, trainingStatus: 'Completed' },
      { operationName: 'Cuff Attachment', skillLevel: 'Expert', proficiency: 92, trainingStatus: 'Completed' },
    ],
  },
  {
    id: 'EMP107',
    name: 'Deepak Thapa',
    photoUrl: 'https://images.unsplash.com/photo-1542909168-82c3e7fdca5c?auto=format&fit=facearea&facepad=2&w=256&h=256&q=80',
    department: 'Sewing',
    section: 'Main Line',
    lineNumber: 4,
    designation: 'Sewing Operator',
    joiningDate: '2023-04-18',
    skillCategory: 'Grade B Operator',
    experience: 3,
    contactNumber: '+91 98765 43216',
    baseEfficiency: 76,
    historicalAttendanceRate: 85,
    riskScore: 48,
    riskLevel: 'High',
    leaveBalances: { casual: 1, sick: 3, earned: 6, emergency: 1 },
    skills: [
      { operationName: 'Side Seam Join', skillLevel: 'Advanced', proficiency: 83, trainingStatus: 'Completed' },
      { operationName: 'Bottom Hemming', skillLevel: 'Advanced', proficiency: 81, trainingStatus: 'Completed' },
      { operationName: 'Button Stitching', skillLevel: 'Intermediate', proficiency: 68, trainingStatus: 'Completed' },
    ],
  },
  {
    id: 'EMP108',
    name: 'Karan Malhotra',
    photoUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=facearea&facepad=2&w=256&h=256&q=80',
    department: 'Cutting',
    section: 'Spread & Cut',
    lineNumber: 0,
    designation: 'Senior Fabric Cutter',
    joiningDate: '2020-02-15',
    skillCategory: 'Grade A Operator',
    experience: 8,
    contactNumber: '+91 98765 43217',
    baseEfficiency: 84,
    historicalAttendanceRate: 95,
    riskScore: 10,
    riskLevel: 'Low',
    leaveBalances: { casual: 4, sick: 7, earned: 11, emergency: 3 },
    skills: [
      { operationName: 'Fabric Inspection', skillLevel: 'Expert', proficiency: 94, trainingStatus: 'Completed' },
    ],
  },
  {
    id: 'EMP109',
    name: 'Reema Sonawane',
    photoUrl: 'https://images.unsplash.com/photo-1567532939604-b6b5b0db2604?auto=format&fit=facearea&facepad=2&w=256&h=256&q=80',
    department: 'QA',
    section: 'Line QA',
    lineNumber: 4,
    designation: 'QA Line Auditor',
    joiningDate: '2022-09-01',
    skillCategory: 'Quality Inspector',
    experience: 4,
    contactNumber: '+91 98765 43218',
    baseEfficiency: 86,
    historicalAttendanceRate: 92,
    riskScore: 22,
    riskLevel: 'Low',
    leaveBalances: { casual: 3, sick: 5, earned: 8, emergency: 2 },
    skills: [
      { operationName: 'Quality Audit Audit', skillLevel: 'Expert', proficiency: 91, trainingStatus: 'Completed' },
    ],
  },
  {
    id: 'EMP110',
    name: 'Sunil Paswan',
    photoUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=facearea&facepad=2&w=256&h=256&q=80',
    department: 'Finishing & Packing',
    section: 'Pressing',
    lineNumber: 0,
    designation: 'Ironer/Helper',
    joiningDate: '2023-09-12',
    skillCategory: 'Ironer/Finisher',
    experience: 1.5,
    contactNumber: '+91 98765 43219',
    baseEfficiency: 70,
    historicalAttendanceRate: 80,
    riskScore: 65,
    riskLevel: 'High',
    leaveBalances: { casual: 1, sick: 2, earned: 3, emergency: 1 },
    skills: [
      { operationName: 'Final Ironing', skillLevel: 'Advanced', proficiency: 82, trainingStatus: 'Completed' },
    ],
  },
  {
    id: 'EMP111',
    name: 'Arjun Das',
    photoUrl: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?auto=format&fit=facearea&facepad=2&w=256&h=256&q=80',
    department: 'Sewing',
    section: 'Main Line',
    lineNumber: 4,
    designation: 'Under-Training Operator',
    joiningDate: '2024-02-10',
    skillCategory: 'Helper',
    experience: 0.5,
    contactNumber: '+91 98765 43220',
    baseEfficiency: 55,
    historicalAttendanceRate: 72,
    riskScore: 82,
    riskLevel: 'Critical',
    leaveBalances: { casual: 1, sick: 1, earned: 2, emergency: 0 },
    skills: [
      { operationName: 'Bottom Hemming', skillLevel: 'Beginner', proficiency: 55, trainingStatus: 'In Training' },
      { operationName: 'Button Stitching', skillLevel: 'Intermediate', proficiency: 62, trainingStatus: 'Completed' },
    ],
  },
  {
    id: 'EMP112',
    name: 'Meena Kumari',
    photoUrl: 'https://images.unsplash.com/photo-1554151228-14d9def656e4?auto=format&fit=facearea&facepad=2&w=256&h=256&q=80',
    department: 'Sewing',
    section: 'Main Line',
    lineNumber: 2,
    designation: 'Multi-Skilled Carver',
    joiningDate: '2021-04-14',
    skillCategory: 'Grade A Operator',
    experience: 5.5,
    contactNumber: '+91 98765 43221',
    baseEfficiency: 81,
    historicalAttendanceRate: 94,
    riskScore: 12,
    riskLevel: 'Low',
    leaveBalances: { casual: 4, sick: 6, earned: 11, emergency: 2 },
    skills: [
      { operationName: 'Collar Join', skillLevel: 'Advanced', proficiency: 82, trainingStatus: 'Completed' },
      { operationName: 'Sleeve Attach', skillLevel: 'Advanced', proficiency: 86, trainingStatus: 'Completed' },
      { operationName: 'Pocket Attaching', skillLevel: 'Expert', proficiency: 90, trainingStatus: 'Completed' },
      { operationName: 'Bottom Hemming', skillLevel: 'Expert', proficiency: 94, trainingStatus: 'Completed' },
    ],
  },
  {
    id: 'EMP113',
    name: 'Suhail Khan',
    photoUrl: 'https://images.unsplash.com/photo-1504257400762-ff36f7ec5768?auto=format&fit=facearea&facepad=2&w=256&h=256&q=80',
    department: 'Sewing',
    section: 'Main Line',
    lineNumber: 4,
    designation: 'Sewing Operator',
    joiningDate: '2023-08-11',
    skillCategory: 'Grade B Operator',
    experience: 2.5,
    contactNumber: '+91 98765 43222',
    baseEfficiency: 73,
    historicalAttendanceRate: 85,
    riskScore: 55,
    riskLevel: 'High',
    leaveBalances: { casual: 2, sick: 3, earned: 5, emergency: 1 },
    skills: [
      { operationName: 'Bottom Hemming', skillLevel: 'Advanced', proficiency: 80, trainingStatus: 'Completed' },
      { operationName: 'Side Seam Join', skillLevel: 'Intermediate', proficiency: 74, trainingStatus: 'Completed' },
    ],
  }
];

export const INITIAL_LEAVE_REQUESTS: LeaveRequest[] = [
  {
    id: 'LV001',
    employeeId: 'EMP105', // Vikram Singh
    leaveType: 'Sick',
    startDate: '2026-06-03',
    endDate: '2026-06-04',
    reason: 'Suffering from high seasonal viral fever.',
    status: 'Approved',
    requestedDate: '2026-06-02',
    approvedBySupervisor: 'sup_karthik',
    approvedByHR: 'hr_ananya',
  },
  {
    id: 'LV002',
    employeeId: 'EMP107', // Deepak Thapa
    leaveType: 'Casual',
    startDate: '2026-06-05',
    endDate: '2026-06-07',
    reason: 'Urgent family work in home town.',
    status: 'Pending',
    requestedDate: '2026-06-03',
  },
  {
    id: 'LV003',
    employeeId: 'EMP110', // Sunil Paswan
    leaveType: 'Emergency',
    startDate: '2026-06-04',
    endDate: '2026-06-04',
    reason: 'Slipped and minor injury. Medical emergency.',
    status: 'Approved',
    requestedDate: '2026-06-04',
    approvedBySupervisor: 'sup_karthik',
    approvedByHR: 'hr_ananya',
  },
  {
    id: 'LV004',
    employeeId: 'EMP113', // Suhail Khan
    leaveType: 'Casual',
    startDate: '2026-06-06',
    endDate: '2026-06-07',
    reason: 'Attending relative marriage ceremony.',
    status: 'Pending',
    requestedDate: '2026-06-03',
  }
];

export const INITIAL_PRODUCTION_LINES: ProductionLine[] = [
  {
    id: 1,
    supervisor: 'Karthik S.',
    targetQuantity: 400,
    actualQuantity: 390,
    requiredManpower: 12,
    availableManpower: 12,
    targetEfficiency: 80,
    baseEfficiency: 79.5,
    bottleneckOperation: 'Collar Join',
    status: 'Running'
  },
  {
    id: 2,
    supervisor: 'Manjesh Pal',
    targetQuantity: 420,
    actualQuantity: 380,
    requiredManpower: 14,
    availableManpower: 13,
    targetEfficiency: 82,
    baseEfficiency: 75.2,
    bottleneckOperation: 'Sleeve Attach',
    status: 'Running'
  },
  {
    id: 3,
    supervisor: 'Karthik S.',
    targetQuantity: 380,
    actualQuantity: 310,
    requiredManpower: 11,
    availableManpower: 8,
    targetEfficiency: 78,
    baseEfficiency: 68.4,
    bottleneckOperation: 'Pocket Welting',
    status: 'Understaffed'
  },
  {
    id: 4,
    supervisor: 'Vikas Dubey',
    targetQuantity: 450,
    actualQuantity: 280,
    requiredManpower: 15,
    availableManpower: 10,
    targetEfficiency: 85,
    baseEfficiency: 58.1,
    bottleneckOperation: 'Cuff Attachment',
    status: 'Critical'
  }
];

// Seed attendance for past 7 days plus today (date 2026-06-04)
// We will generate attendance dynamically in state init, but let's have base records here
export const generateBaseAttendance = (employees: Employee[]): AttendanceRecord[] => {
  const records: AttendanceRecord[] = [];
  const days = ['2026-05-28', '2026-05-29', '2026-05-30', '2026-06-01', '2026-06-02', '2026-06-03'];
  
  days.forEach((day, idx) => {
    employees.forEach(emp => {
      // Simulate random attendance according to their rate
      const seed = Math.random() * 100;
      let status: 'Present' | 'Absent' | 'Leave' | 'Late' = 'Present';
      let cin: string | undefined = '08:00';
      let cout: string | undefined = '17:00';
      
      // Emp105 is approved for sick leave on 06-03 and 06-04
      if (emp.id === 'EMP105' && (day === '2026-06-03')) {
        status = 'Leave';
        cin = undefined;
        cout = undefined;
      } else if (seed > emp.historicalAttendanceRate) {
        // Person was absent or late or leave
        const pSeed = Math.random();
        if (pSeed < 0.5) {
          status = 'Absent';
          cin = undefined;
          cout = undefined;
        } else if (pSeed < 0.8) {
          status = 'Late';
          cin = '08:35';
        } else {
          status = 'Leave';
          cin = undefined;
          cout = undefined;
        }
      }
      
      records.push({
        id: `att_${emp.id}_${day}`,
        employeeId: emp.id,
        date: day,
        status,
        checkInTime: cin,
        checkOutTime: cout,
        method: Math.random() > 0.4 ? 'Biometric' : (Math.random() > 0.5 ? 'RFID Code' : 'Manual') as any,
        markedBy: 'system_gate_biometric',
        markedAt: `${day}T08:01:02Z`
      });
    });
  });

  // Adding today's predefined records as of local time 2026-06-04
  // Today, Vikram (EMP105) is on Approved Sick Leave.
  // Sunil (EMP110) is on Approved emergency leave.
  // Anita (EMP106 - low risk) is Present.
  // Arjun (EMP111 - Critical risk) is Absent.
  // Deep Thapa (EMP107) is Late.
  // Everyone else: mostly present, some absent to simulate a typical high-stress factory day.
  const today = '2026-06-04';
  const todayRosterMap: Record<string, {status: 'Present' | 'Absent' | 'Late' | 'Leave', cin?: string}> = {
    'EMP101': { status: 'Present', cin: '07:55' },
    'EMP102': { status: 'Present', cin: '07:58' },
    'EMP103': { status: 'Present', cin: '08:02' },
    'EMP104': { status: 'Present', cin: '07:50' },
    'EMP105': { status: 'Leave' }, // approved sick leave
    'EMP106': { status: 'Present', cin: '07:44' },
    'EMP107': { status: 'Late', cin: '08:24' },
    'EMP108': { status: 'Present', cin: '07:52' },
    'EMP109': { status: 'Present', cin: '07:56' },
    'EMP110': { status: 'Leave' }, // approved emergency leave
    'EMP111': { status: 'Absent' }, // critical risk absent
    'EMP112': { status: 'Present', cin: '07:58' },
    'EMP113': { status: 'Absent' }, // high risk absent
  };

  employees.forEach(emp => {
    const r = todayRosterMap[emp.id] || { status: 'Present', cin: '08:00' };
    records.push({
      id: `att_${emp.id}_${today}`,
      employeeId: emp.id,
      date: today,
      status: r.status,
      checkInTime: r.cin,
      checkOutTime: r.status === 'Present' || r.status === 'Late' ? '17:00' : undefined,
      method: r.status === 'Leave' ? 'Manual' : 'Biometric',
      markedBy: r.status === 'Leave' ? 'hr_ananya' : 'system_gate_biometric',
      markedAt: `${today}T08:00:00Z`
    });
  });

  return records;
};

export const INITIAL_NOTIFICATIONS: AppNotification[] = [
  {
    id: 'NFL001',
    type: 'Shortage',
    title: 'Critical Manpower Shortage: Line 4',
    message: 'Line 4 has 4 operators absent today. Bottleneck risk high on Pocket welting and Cuff attaching operations.',
    timestamp: '2026-06-04T08:15:00Z',
    read: false,
    meta: { lineId: 4, absentCount: 4 }
  },
  {
    id: 'NFL002',
    type: 'Leave',
    title: 'New Leave Request: Savitha Devi (EMP102)',
    message: 'Savitha Devi has requested 3 days of Casual Leave starting 2026-06-08.',
    timestamp: '2026-06-04T08:05:00Z',
    read: false,
  },
  {
    id: 'NFL003',
    type: 'Alert',
    title: 'High Absenteeism Rate Warning',
    message: 'Overall factory absenteeism has crossed the 12% trigger limit. Current: 23% in Line 4, 15% in Line 3.',
    timestamp: '2026-06-04T08:30:00Z',
    read: false,
  },
  {
    id: 'NFL004',
    type: 'Milestone',
    title: 'Milestone: Anita Mondal (EMP106)',
    message: 'Anita Mondal achieved 180 Days of Continuous Perfect Attendance! Eligible for the Platinum reward.',
    timestamp: '2026-06-03T17:00:00Z',
    read: true,
  }
];

export const INITIAL_DAILY_PRODUCTIVITY = [
  { id: '1', date: '2026-06-01', lineNumber: 1, targetQuantity: 400, actualQuantity: 410, efficiency: 82, smv: 14.5, workingHours: 8 },
  { id: '2', date: '2026-06-01', lineNumber: 2, targetQuantity: 420, actualQuantity: 415, efficiency: 81, smv: 15.2, workingHours: 8 },
  { id: '3', date: '2026-06-01', lineNumber: 3, targetQuantity: 380, actualQuantity: 360, efficiency: 75, smv: 18.0, workingHours: 8 },
  { id: '4', date: '2026-06-01', lineNumber: 4, targetQuantity: 450, actualQuantity: 440, efficiency: 83, smv: 16.5, workingHours: 8 },

  { id: '5', date: '2026-06-02', lineNumber: 1, targetQuantity: 400, actualQuantity: 405, efficiency: 81, smv: 14.5, workingHours: 8 },
  { id: '6', date: '2026-06-02', lineNumber: 2, targetQuantity: 420, actualQuantity: 395, efficiency: 77, smv: 15.2, workingHours: 8 },
  { id: '7', date: '2026-06-02', lineNumber: 3, targetQuantity: 380, actualQuantity: 340, efficiency: 71, smv: 18.0, workingHours: 8 },
  { id: '8', date: '2026-06-02', lineNumber: 4, targetQuantity: 450, actualQuantity: 410, efficiency: 78, smv: 16.5, workingHours: 8 },

  { id: '9', date: '2026-06-03', lineNumber: 1, targetQuantity: 400, actualQuantity: 395, efficiency: 79, smv: 14.5, workingHours: 8 },
  { id: '10', date: '2026-06-03', lineNumber: 2, targetQuantity: 420, actualQuantity: 385, efficiency: 76, smv: 15.2, workingHours: 8 },
  { id: '11', date: '2026-06-03', lineNumber: 3, targetQuantity: 380, actualQuantity: 320, efficiency: 69, smv: 18.0, workingHours: 8 },
  { id: '12', date: '2026-06-03', lineNumber: 4, targetQuantity: 450, actualQuantity: 310, efficiency: 62, smv: 16.5, workingHours: 8 },
];
