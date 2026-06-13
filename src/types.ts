/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type UserRole = 'Admin' | 'IE' | 'Industrial Engineer' | 'HR' | 'HR Manager' | 'Production Manager' | 'Supervisor' | 'Viewer';

export interface UserAccount {
  id: string; // User ID / Employee ID
  username: string;
  email: string;
  role: UserRole;
  avatarUrl?: string;
  assignedLines?: number[]; // lines they supervise/manage
  
  // Database-driven credentials fields
  passwordHash?: string;
  employeeId?: string;
  employeeName?: string;
  department?: string;
  designation?: string;
  accountStatus?: 'Active' | 'Inactive';
  failedAttempts?: number;
  lockedUntil?: string | null; // ISO String or null
  lastLogin?: string | null; // ISO timestamp
}

export interface AuditLogEntry {
  id: string;
  userId: string; // The user ID affected or performing
  action: string;
  timestamp: string;
  adminName: string; // administrator executing or "System"
  details?: string;
}

export type SkillLevel = 'Beginner' | 'Intermediate' | 'Advanced' | 'Expert';
export type TrainingStatus = 'Completed' | 'In Training' | 'Not Started';

export interface WorkerSkill {
  operationName: string;
  skillLevel?: SkillLevel;
  proficiency: number; // 0 to 100 percentage
  trainingStatus?: TrainingStatus;
}

export type RiskLevel = 'Low' | 'Medium' | 'High' | 'Critical';
export type SkillCategory = 'Grade A Operator' | 'Grade B Operator' | 'Grade C Operator' | 'Helper' | 'Quality Inspector' | 'Ironer/Finisher';

export type WorkforceAssignmentStatus = 'Assigned' | 'Unassigned' | 'Available for Replacement' | 'Training' | 'Meeting' | 'Quality Audit' | 'Maintenance Support' | 'Off-Line Activity' | 'Leave';

export interface EmployeeAssignment {
  id: string; // Assignment ID
  employeeId: string;
  assignmentDate: string; // YYYY-MM-DD
  assignedLine: number; // production line number
  assignedOperation: string;
  assignmentStatus: WorkforceAssignmentStatus;
  startTime: string;
  endTime: string;
  assignedBy: string;
  availabilityFlag: boolean;
  department?: string; // Added department
  assignmentSource?: string; // Added assignmentSource
  history?: Array<{
    date: string;
    line: number;
    operation: string;
    status: string;
    updater: string;
  }>; // Added assignment history
}

export interface AssignmentConflict {
  id: string;
  type: 'duplicate' | 'orphan' | 'invalid_reference' | 'unavailable' | 'inconsistency' | 'department_mismatch';
  severity: 'Warning' | 'Error';
  employeeId: string;
  employeeName: string;
  details: string;
  suggestedResolution: string;
}

export interface Employee {
  id: string;
  name: string;
  photoUrl: string;
  gender?: 'Male' | 'Female' | 'Other' | string;
  department: string; // e.g., "Sewing", "Cutting", "Finishing", "Quality Assurance"
  section: string; // e.g., "Main Line", "Sampling", "Packing"
  lineNumber: number; // e.g., 1, 2, 3, 4, 5, or 0 for non-line workers
  operationAssignment?: string; // core operation assignment
  designation: string; // e.g., "Senior Sewing Operator", "Junior Operator", "Helper", "QA Auditor"
  joiningDate: string;
  skillCategory: SkillCategory;
  experience: number; // years
  contactNumber: string;
  skills: WorkerSkill[];
  baseEfficiency: number; // average productivity percentage (e.g., 75 for 75%)
  historicalAttendanceRate: number; // overall percentage (e.g. 94)
  avgPcsProducedPerDay?: number; // Average pieces produced per day
  attendanceReliability?: number; // Attendance reliability percentage
  defectRate?: number; // Defect Rate Percentage (0 to 100)
  riskScore: number; // calculated absenteeism risk score (0-100)
  riskLevel: RiskLevel;
  leaveBalances: {
    casual: number;
    sick: number;
    earned: number;
    emergency: number;
  };
  workforceAssignmentStatus?: WorkforceAssignmentStatus;
  productionWorkforceEligible?: boolean;
}

export type AttendanceStatus = 'Present' | 'Absent' | 'Leave' | 'Late';
export type AttendanceMethod = 'Manual' | 'QR Code' | 'Biometric' | 'RFID';

export interface AttendanceRecord {
  id: string;
  employeeId: string;
  date: string; // YYYY-MM-DD
  status: AttendanceStatus;
  checkInTime?: string;
  checkOutTime?: string;
  method: AttendanceMethod;
  markedBy: string; // User ID or system
  markedAt: string;
}

export type LeaveType = 'Casual' | 'Sick' | 'Emergency' | 'Earned';
export type LeaveStatus = 'Pending' | 'Approved' | 'Rejected';

export interface LeaveRequest {
  id: string;
  employeeId: string;
  leaveType: LeaveType;
  startDate: string;
  endDate: string;
  reason: string;
  status: LeaveStatus;
  requestedDate: string;
  approvedBySupervisor?: string; // name
  approvedByHR?: string; // name
  comments?: string;
}

export interface ProductionLine {
  id: number; // Line number 1, 2, 3, 4, 5
  supervisor: string;
  targetQuantity: number; // pieces per day
  actualQuantity: number;
  requiredManpower: number;
  availableManpower: number;
  targetEfficiency: number; // e.g. 80%
  baseEfficiency: number; // Current day line efficiency
  bottleneckOperation: string;
  status: 'Running' | 'Understaffed' | 'Critical';
  manualTargetQuantity?: number;
  manualActualQuantity?: number;
  operatorsCount?: number;
}

export interface DailyProductivity {
  id: string;
  date: string;
  lineNumber: number;
  targetQuantity: number;
  actualQuantity: number;
  efficiency: number;
  smv: number; // Standard Minute Value (difficulty)
  workingHours: number;
}

export interface AppNotification {
  id: string;
  type: 'Alert' | 'Leave' | 'Milestone' | 'Shortage';
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
  meta?: any;
}

export interface FactoryDepartment {
  id: string;
  name: string;
  supervisor: string;
  totalEmployees?: number;
  status: 'Active' | 'Inactive';
}

export interface FactoryOperation {
  code: string;
  name: string;
  departmentId: string;
  skillCategory: string; // Grade A Operator, Grade B Operator, Helper, etc.
  smv: number;
  machineType: string;
  targetEfficiency: number; // e.g. 80
  minSkillLevel: SkillLevel;
  status: 'Active' | 'Inactive';
}

export interface GarmentOperationSequenceItem {
  operationCode: string;
  name: string;
  sequenceOrder: number;
  smv: number;
  machineType: string;
  skillRequired: SkillLevel;
  departmentId: string;
}

export interface GarmentStyle {
  id: string; // Style code, e.g. STY-POLO-001
  name: string;
  type: 'T-Shirt' | 'Polo Shirt' | 'Hoodie' | 'Shirt' | 'Trousers' | 'Jeans' | 'Jacket' | 'Dress' | 'Custom';
  smv: number;
  requiredManpower: number;
  estimatedManpower: number;
  description: string;
  version: string;
  isArchived: boolean;
  status: 'Active' | 'Inactive';
  operations: GarmentOperationSequenceItem[];
  linesAllocated: number[]; // e.g. [1, 2, 3]
  createdAt: string;
  lastModifiedAt: string;
}

export interface LineAllocationEntry {
  employeeId: string;
  employeeName: string;
  department: string;
  assignedLine: number; // 0 for Unassigned, 1-5 for standard lines, 99 for Floater Pool
  assignmentStatus: WorkforceAssignmentStatus;
  remarks?: string;
  assignedOperation: string; // manual operation assignment by IE, e.g. "Collar Join". Empty value represents "Vacant"
}

export interface LineStyleAssignment {
  id: string; // e.g. "lsa_1", "lsa_2"
  lineNumber: number;
  garmentStyleId: string;
  assignedAt: string;
  effectiveDate: string;
  effectiveTime: string;
  remarks?: string;
}

export interface GarmentStyleHistory {
  id: string;
  lineNumber: number;
  previousGarmentStyleId: string | null;
  previousGarmentStyleName: string | null;
  newGarmentStyleId: string;
  newGarmentStyleName: string;
  changeDate: string;
  changeTime: string;
  changedBy: string;
  reason: string;
  operatorsCount: number;
  remarks?: string;
}

export function calculateQAPS(
  proficiency: number,
  efficiency: number,
  attendance: number,
  defectRate: number,
  avgPcs: number
): number {
  // Quality Adjusted Efficiency
  const qae = efficiency * (1 - defectRate / 100);
  // Normalize average PCS produced per day, e.g., standard operator target is around 120 pcs
  const normalizedPcs = Math.min(100, Math.max(10, (avgPcs / 120) * 100));
  
  // Weights:
  // - Skill Match (Proficiency %): 30%
  // - Quality-Adjusted Efficiency (QAE): 45%
  // - Attendance Reliability %: 15%
  // - normalized Avg PCS Produced: 10%
  const score = (proficiency * 0.3) + (qae * 0.45) + (attendance * 0.15) + (normalizedPcs * 0.1);
  return Math.max(10, Math.min(100, Math.round(score)));
}



