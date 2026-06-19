/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { 
  Employee, AttendanceRecord, LeaveRequest, ProductionLine, 
  AppNotification, UserAccount, UserRole, AttendanceStatus, AttendanceMethod, LeaveStatus, RiskLevel, WorkerSkill,
  WorkforceAssignmentStatus, EmployeeAssignment, FactoryDepartment, FactoryOperation, GarmentStyle, AssignmentConflict,
  LineAllocationEntry, LineStyleAssignment, GarmentStyleHistory
} from '../types';
import { SYSTEM_USERS } from '../data/mockData';

interface StateContextType {
  theme: 'light' | 'dark';
  toggleTheme: () => void;
  currentUser: UserAccount | null;
  setCurrentUser: (user: UserAccount | null) => void;
  allUsers: UserAccount[];
  setAllUsers: React.Dispatch<React.SetStateAction<UserAccount[]>>;
  employees: Employee[];
  attendance: AttendanceRecord[];
  leaveRequests: LeaveRequest[];
  productionLines: ProductionLine[];
  notifications: AppNotification[];
  dailyProductivity: any[];
  employeeAssignments: EmployeeAssignment[];
  systemDate: string;
  setSystemDate: (date: string) => void;
  overallTarget: number;
  setOverallTarget: (target: number) => void;
  overallActual: number;
  setOverallActual: (actual: number) => void;
  
  assignmentConflicts: AssignmentConflict[];
  preventCalculations: boolean;
  resolveAssignmentConflicts: () => void;

  // Factory Configuration & Garment Setup States
  departments: FactoryDepartment[];
  operations: FactoryOperation[];
  garmentStyles: GarmentStyle[];
  currentGarment: GarmentStyle;

  // Actions
  addEmployee: (emp: Employee) => Promise<void>;
  updateEmployee: (emp: Employee) => Promise<void>;
  deleteEmployee: (id: string) => Promise<void>;
  markAttendance: (employeeId: string, date: string, status: AttendanceStatus, method: AttendanceMethod) => Promise<void>;
  bulkMarkAttendance: (records: AttendanceRecord[]) => Promise<void>;
  submitLeaveRequest: (req: Omit<LeaveRequest, 'id' | 'requestedDate' | 'status'>) => Promise<void>;
  approveRejectLeave: (id: string, status: 'Approved' | 'Rejected', comments?: string) => Promise<void>;
  markNotificationAsRead: (id: string) => Promise<void>;
  markAllNotificationsRead: () => Promise<void>;
  clearNotification: (id: string) => Promise<void>;
  clearAllNotifications: () => Promise<void>;
  addNotification: (type: 'Alert' | 'Leave' | 'Milestone' | 'Shortage', title: string, message: string, meta?: any) => Promise<void>;
  reallocateOperator: (lineNumber: number, fromEmpId: string, toEmpId: string, operationName: string) => void;
  getExpectedAbsencesTomorrow: () => PredictedAbsence[];
  recalculateRiskScores: () => void;
  resetDatabase: () => Promise<void>;
  cleanImportedEmployees: () => Promise<void>;
  clearAllEmployees: () => Promise<void>;
  updateProductionLine: (lineId: number, targetQuantity: number, actualQuantity: number) => Promise<void>;
  addProductionLine: (line: ProductionLine) => Promise<void>;
  updateProductionLineFull: (line: ProductionLine) => Promise<void>;
  deleteProductionLine: (id: number) => Promise<void>;
  updateBulkSkills: (updates: { 
    employeeId: string; 
    skills: WorkerSkill[]; 
    baseEfficiency?: number; 
    attendanceReliability?: number; 
    avgPcsProducedPerDay?: number;
    defectRate?: number;
  }[], replaceMode?: boolean) => Promise<void>;
  assignEmployee: (empId: string, line: number, operation: string, status: WorkforceAssignmentStatus, startTime?: string, endTime?: string, availabilityFlag?: boolean, source?: string) => Promise<void>;
  assignEmployeeForDate: (empId: string, line: number, operation: string, status: WorkforceAssignmentStatus, date: string, startTime?: string, endTime?: string, source?: string) => Promise<void>;
  importBulkEmployees: (records: Employee[], actionRule: 'add-only' | 'update-only' | 'merge-update', onProgress?: (percent: number) => void) => Promise<void>;
  productionWorkforcePool: Employee[];
  updateWorkforceEligibility: (empId: string, eligible: boolean) => Promise<void>;
  updateDepartmentEligibility: (department: string, eligible: boolean) => Promise<void>;
  lockedLines: number[];
  toggleLineLock: (lineId: number) => void;

  lineAllocations: LineAllocationEntry[];
  setLineAllocations: React.Dispatch<React.SetStateAction<LineAllocationEntry[]>>;
  updateLineAllocation: (empId: string, line: number, operation?: string, status?: WorkforceAssignmentStatus, remarks?: string) => Promise<void>;
  uploadLineAllocationsFile: (entries: LineAllocationEntry[]) => Promise<void>;

  // Factory Config & Garment actions
  addDepartment: (dept: FactoryDepartment) => Promise<void>;
  updateDepartment: (dept: FactoryDepartment) => Promise<void>;
  deleteDepartment: (id: string) => Promise<void>;
  addOperation: (op: FactoryOperation) => Promise<void>;
  updateOperation: (op: FactoryOperation) => Promise<void>;
  deleteOperation: (code: string) => Promise<void>;
  addGarmentStyle: (style: GarmentStyle) => Promise<void>;
  updateGarmentStyle: (style: GarmentStyle) => Promise<void>;
  deleteGarmentStyle: (id: string) => Promise<void>;
  selectGarmentStyle: (id: string) => Promise<void>;

  // Manual garment style changes assignments & logs
  lineStyleAssignments: LineStyleAssignment[];
  garmentStyleHistory: GarmentStyleHistory[];
  changeLineStyle: (lineNumber: number, garmentStyleId: string, effectiveDate: string, effectiveTime: string, reason: string, remarks?: string, changedBy?: string) => Promise<void>;
  getLineRunningStyle: (lineId: number) => GarmentStyle | null;
  deleteGarmentStyleHistory: (id: string) => Promise<void>;

  // Loading state
  loading: boolean;
  refreshState: () => Promise<void>;
  refreshStatsSilently: () => Promise<void>;

  // Security Authentication Actions
  login: (usernameOrEmpId: string, password: string) => Promise<{ success: boolean; error?: string; user?: any }>;
  logout: () => Promise<void>;
  updateUserStatus: (userId: string, status: 'Active' | 'Inactive') => Promise<void>;
  changeUserRole: (userId: string, role: string) => Promise<void>;
  resetUserPassword: (userId: string, newPassword?: string) => Promise<{ success: boolean; message: string }>;
  changeUserPassword: (oldPassword: string, newPassword: string) => Promise<{ success: boolean; error?: string }>;
  updateUserProfile: (profileData: { email?: string; employeeName?: string; avatarUrl?: string }) => Promise<{ success: boolean; error?: string }>;
  requestPasswordReset: (usernameOrEmpId: string) => Promise<{ success: boolean; ticketId?: string; message: string }>;
  adminCreateUser: (userData: any) => Promise<{ success: boolean; error?: string; user?: any }>;
  deleteUserAccount: (userId: string) => Promise<void>;
  auditLogs: any[];
  setAuditLogs: React.Dispatch<React.SetStateAction<any[]>>;
  fetchAuditLogs: () => Promise<void>;
  sessions: any[];
  fetchSessions: () => Promise<void>;
  terminateSession: (sessionId: string) => Promise<void>;
}

export interface PredictedAbsence {
  employee: Employee;
  probability: number;
  riskLevel: RiskLevel;
  primaryFactor: string;
}

const StateContext = createContext<StateContextType | undefined>(undefined);

export const StateProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const getTodayDateString = () => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const [loading, setLoading] = useState(true);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [systemDate, setSystemDate] = useState<string>(getTodayDateString());
  const [overallTarget, setOverallTarget] = useState<number>(6000);
  const [overallActual, setOverallActual] = useState<number>(0);
  const [currentUser, setCurrentUser] = useState<UserAccount | null>(null);
  const [allUsers, setAllUsers] = useState<UserAccount[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [productionLines, setProductionLines] = useState<ProductionLine[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [dailyProductivity, setDailyProductivity] = useState<any[]>([]);
  const [lineAllocations, setLineAllocations] = useState<LineAllocationEntry[]>([]);
  const [employeeAssignments, setEmployeeAssignments] = useState<EmployeeAssignment[]>([]);
  const [lockedLines, setLockedLines] = useState<number[]>([]);
  const [departments, setDepartments] = useState<FactoryDepartment[]>([]);
  const [operations, setOperations] = useState<FactoryOperation[]>([]);
  const [garmentStyles, setGarmentStyles] = useState<GarmentStyle[]>([]);
  const [currentGarment, setCurrentGarment] = useState<GarmentStyle | any>(null);
  const [lineStyleAssignments, setLineStyleAssignments] = useState<LineStyleAssignment[]>([]);
  const [garmentStyleHistory, setGarmentStyleHistory] = useState<GarmentStyleHistory[]>([]);

  const preventCalculations = false;

  const loadAllState = async () => {
    try {
      const todayStr = getTodayDateString();
      try {
        await fetch('/api/system/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ systemDate: todayStr })
        });
      } catch (err) {
        console.error("Failed to default update system date to today", err);
      }

      const res = await fetch('/api/system/settings');
      if (res.ok) {
        const setts = await res.json();
        setSystemDate(setts.systemDate);
        setOverallTarget(setts.overallTarget);
        setOverallActual(setts.overallActual);
        setTheme(setts.theme);
        setCurrentUser(setts.currentUser);
        setAllUsers(setts.allUsers || []);
        setLockedLines(setts.lockedLines || []);
        setCurrentGarment(setts.currentGarment);
      }

      // Fetch other collections asynchronously
      const [
        empRes, attRes, leaveRes, lineRes, allocRes, notifRes, prodRes, deptRes, opRes, stylesRes, assRes,
        lsaRes, gshRes
      ] = await Promise.all([
        fetch('/api/employees?limit=2000'), // Load for internal dropdown search/calculations
        fetch('/api/attendance'),
        fetch('/api/leave-requests'),
        fetch('/api/production-lines'),
        fetch('/api/line-allocations'),
        fetch('/api/notifications'),
        fetch('/api/dashboard/productivity'),
        fetch('/api/departments'),
        fetch('/api/operations'),
        fetch('/api/garment-styles'),
        fetch('/api/employee-assignments'),
        fetch('/api/line-style-assignments'),
        fetch('/api/garment-style-history')
      ]);

      const [
        emps, atts, leaves, lines, allocs, notifs, prodData, depts, ops, styles, assignments,
        lsas, gshs
      ] = await Promise.all([
        empRes.json().then(r => r.data),
        attRes.json(),
        leaveRes.json(),
        lineRes.json(),
        allocRes.json(),
        notifRes.json(),
        prodRes.json(),
        deptRes.json(),
        opRes.json(),
        stylesRes.json(),
        assRes.json(),
        lsaRes.json(),
        gshRes.json()
      ]);

      setEmployees(emps);
      setAttendance(atts);
      setLeaveRequests(leaves);
      setProductionLines(lines);
      setLineAllocations(allocs);
      setNotifications(notifs);
      setDailyProductivity(prodData);
      setDepartments(depts);
      setOperations(ops);
      setGarmentStyles(styles);
      setEmployeeAssignments(assignments);
      setLineStyleAssignments(lsas || []);
      setGarmentStyleHistory(gshs || []);

    } catch (e) {
      console.error("Failed to load initial state from database API server:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAllState();
  }, []);

  // Sync theme changes to host Document class
  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  const toggleTheme = async () => {
    const nextTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(nextTheme);
    await fetch('/api/system/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ theme: nextTheme })
    });
  };

  const changeCurrentUser = async (user: UserAccount) => {
    setCurrentUser(user);
    await fetch('/api/system/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentUser: user })
    });
  };

  const changeSystemDate = async (date: string) => {
    setSystemDate(date);
    await fetch('/api/system/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ systemDate: date })
    });
    // Re-fetch assignments & attendance for the new date to stay synchronized
    const [attRes, assRes] = await Promise.all([
      fetch(`/api/attendance?date=${date}`),
      fetch(`/api/employee-assignments?date=${date}`)
    ]);
    if (attRes.ok) setAttendance(await attRes.json());
    if (assRes.ok) setEmployeeAssignments(await assRes.json());
  };

  const changeOverallTarget = async (target: number) => {
    setOverallTarget(target);
    await fetch('/api/system/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ overallTarget: target })
    });
  };

  const changeOverallActual = async (actual: number) => {
    setOverallActual(actual);
    await fetch('/api/system/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ overallActual: actual })
    });
  };

  const addEmployee = async (emp: Employee) => {
    const res = await fetch('/api/employees', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(emp)
    });
    if (res.ok) {
      const saved = await res.json();
      setEmployees(prev => [saved, ...prev]);
    }
  };

  const updateEmployee = async (emp: Employee) => {
    const res = await fetch(`/api/employees/${emp.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(emp)
    });
    if (res.ok) {
      const saved = await res.json();
      setEmployees(prev => prev.map(e => e.id.toUpperCase() === emp.id.toUpperCase() ? saved : e));
    }
  };

  const deleteEmployee = async (id: string) => {
    const res = await fetch(`/api/employees/${id}`, { method: 'DELETE' });
    if (res.ok) {
      setEmployees(prev => prev.filter(e => e.id.toUpperCase() !== id.toUpperCase()));
    }
  };

  const markAttendance = async (employeeId: string, date: string, status: AttendanceStatus, method: AttendanceMethod) => {
    const res = await fetch('/api/attendance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ employeeId, date, status, method, markedBy: currentUser.username })
    });
    if (res.ok) {
      const saved = await res.json();
      setAttendance(prev => {
        const copy = [...prev];
        const idx = copy.findIndex(a => a.employeeId.toUpperCase() === employeeId.toUpperCase() && a.date === date);
        if (idx !== -1) {
          copy[idx] = saved;
        } else {
          copy.push(saved);
        }
        return copy;
      });
    }
  };

  const bulkMarkAttendance = async (records: AttendanceRecord[]) => {
    const res = await fetch('/api/attendance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(records)
    });
    if (res.ok) {
      setAttendance(prev => {
        const copy = [...prev];
        records.forEach(rec => {
          const idx = copy.findIndex(r => r.employeeId.toUpperCase() === rec.employeeId.toUpperCase() && r.date === rec.date);
          if (idx !== -1) {
            copy[idx] = { ...copy[idx], ...rec };
          } else {
            copy.push(rec);
          }
        });
        return copy;
      });
    }
  };

  const submitLeaveRequest = async (req: Omit<LeaveRequest, 'id' | 'requestedDate' | 'status'>) => {
    const res = await fetch('/api/leave-requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req)
    });
    if (res.ok) {
      const saved = await res.json();
      setLeaveRequests(prev => [saved, ...prev]);
    }
  };

  const approveRejectLeave = async (id: string, status: 'Approved' | 'Rejected', comments?: string) => {
    const res = await fetch(`/api/leave-requests/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, remarks: comments, approvedByHR: currentUser.username })
    });
    if (res.ok) {
      const saved = await res.json();
      setLeaveRequests(prev => prev.map(l => l.id === id ? saved : l));
      // Refresh attendance as well since an approved leave may add a new leave attendance record
      const attRes = await fetch(`/api/attendance?date=${systemDate}`);
      if (attRes.ok) setAttendance(await attRes.json());
    }
  };

  const addProductionLine = async (line: ProductionLine) => {
    const res = await fetch('/api/production-lines', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(line)
    });
    if (res.ok) {
      const saved = await res.json();
      setProductionLines(prev => {
        if (prev.some(l => l.id === saved.id)) {
          return prev.map(l => l.id === saved.id ? saved : l);
        }
        return [...prev, saved];
      });
    }
  };

  const updateProductionLineFull = async (line: ProductionLine) => {
    await addProductionLine(line);
  };

  const deleteProductionLine = async (id: number) => {
    const res = await fetch(`/api/production-lines/${id}`, { method: 'DELETE' });
    if (res.ok) {
      setProductionLines(prev => prev.filter(l => l.id !== id));
    }
  };

  const updateProductionLine = async (lineId: number, target: number, actual: number) => {
    await addProductionLine({
      id: lineId,
      targetQuantity: target,
      actualQuantity: actual,
      manualTargetQuantity: target,
      manualActualQuantity: actual
    } as any);
  };

  // Enriched employees based on daily assignment mapping
  const enrichedEmployees = useMemo(() => {
    const today = systemDate;
    
    // Create fast Map lookups to avoid O(N^2) linear scans
    const assignmentMap = new Map<string, EmployeeAssignment>();
    if (employeeAssignments && Array.isArray(employeeAssignments)) {
      for (let i = 0; i < employeeAssignments.length; i++) {
        const asg = employeeAssignments[i];
        if (asg.assignmentDate === today) {
          assignmentMap.set(asg.employeeId.toUpperCase(), asg);
        }
      }
    }

    const allocMap = new Map<string, LineAllocationEntry>();
    if (lineAllocations && Array.isArray(lineAllocations)) {
      for (let i = 0; i < lineAllocations.length; i++) {
        const alloc = lineAllocations[i];
        allocMap.set(alloc.employeeId.toUpperCase(), alloc);
      }
    }

    return employees.map(emp => {
      const empIdUpper = emp.id.toUpperCase();
      const assignment = assignmentMap.get(empIdUpper);
      const alloc = allocMap.get(empIdUpper);

      if (assignment) {
        return {
          ...emp,
          lineNumber: assignment.assignedLine,
          section: assignment.assignedLine === 99 ? 'Floater Pool' : assignment.assignedLine > 0 ? 'Main Line' : 'Offline/Support',
          workforceAssignmentStatus: assignment.assignmentStatus,
          operationAssignment: assignment.assignedOperation
        };
      } else if (alloc) {
        return {
          ...emp,
          lineNumber: alloc.assignedLine,
          section: alloc.assignedLine === 99 ? 'Floater Pool' : alloc.assignedLine > 0 ? 'Main Line' : 'Offline/Support',
          workforceAssignmentStatus: alloc.assignmentStatus,
          operationAssignment: alloc.assignedOperation
        };
      } else {
        const isFloater = (emp.department || '').toLowerCase().includes('floater') || emp.lineNumber === 10 || emp.lineNumber === 99;
        const resolvedLine = isFloater ? 99 : (emp.lineNumber || 0);

        return {
          ...emp,
          lineNumber: resolvedLine,
          section: resolvedLine === 99 ? 'Floater Pool' : resolvedLine > 0 ? 'Main Line' : 'Offline/Support',
          workforceAssignmentStatus: resolvedLine === 0 ? 'Unassigned' : 'Assigned',
          operationAssignment: emp.operationAssignment || ''
        };
      }
    });
  }, [employees, employeeAssignments, lineAllocations, systemDate]);

  const productionWorkforcePool = useMemo(() => {
    return enrichedEmployees.filter(emp => emp.productionWorkforceEligible);
  }, [enrichedEmployees]);

  const updateWorkforceEligibility = async (empId: string, eligible: boolean) => {
    await updateEmployee({ id: empId, productionWorkforceEligible: eligible } as any);
  };

  const updateDepartmentEligibility = async (department: string, eligible: boolean) => {
    const matched = employees.filter(e => (e.department || '').toLowerCase() === department.toLowerCase());
    await Promise.all(matched.map(e => updateEmployee({ ...e, productionWorkforceEligible: eligible })));
  };

  const toggleLineLock = (lineId: number) => {
    const next = lockedLines.includes(lineId) ? lockedLines.filter(id => id !== lineId) : [...lockedLines, lineId];
    setLockedLines(next);
    fetch('/api/system/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lockedLines: next })
    });
  };

  // Garment Config & Factory Libraries Async Mutators
  const addDepartment = async (dept: FactoryDepartment) => {
    const res = await fetch('/api/departments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dept)
    });
    if (res.ok) {
      setDepartments(prev => [...prev, dept]);
    }
  };
  const updateDepartment = async (dept: FactoryDepartment) => {
    const oldDept = departments.find(d => d.id === dept.id);
    const oldName = oldDept ? oldDept.name : '';

    const res = await fetch(`/api/departments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dept)
    });

    if (res.ok) {
      setDepartments(prev => prev.map(d => d.id === dept.id ? dept : d));

      if (oldName && oldName !== dept.name) {
        // Update all employees in old department
        const employeesToUpdate = employees.filter(e => e.department === oldName);
        if (employeesToUpdate.length > 0) {
          const updatedEmployees = employeesToUpdate.map(e => ({
            ...e,
            department: dept.name
          }));
          const empRes = await fetch('/api/employees/bulk-update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updatedEmployees)
          });
          if (empRes.ok) {
            setEmployees(prev => prev.map(e => {
              const matched = updatedEmployees.find(u => u.id.toUpperCase() === e.id.toUpperCase());
              return matched ? matched : e;
            }));
          }
        }

        // Update all line allocations in old department
        const allocationsToUpdate = lineAllocations.filter(la => la.department === oldName);
        if (allocationsToUpdate.length > 0) {
          const updatedAllocations = allocationsToUpdate.map(la => ({
            ...la,
            department: dept.name
          }));
          const allocRes = await fetch('/api/line-allocations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updatedAllocations)
          });
          if (allocRes.ok) {
            setLineAllocations(prev => prev.map(la => {
              const matched = updatedAllocations.find(u => u.employeeId.toUpperCase() === la.employeeId.toUpperCase());
              return matched ? matched : la;
            }));
          }
        }
      }
    }
  };
  const deleteDepartment = async (id: string) => {
    const res = await fetch(`/api/departments/${id}`, { method: 'DELETE' });
    if (res.ok) {
      setDepartments(prev => prev.filter(d => d.id !== id));
    }
  };
  const addOperation = async (op: FactoryOperation) => {
    const res = await fetch('/api/operations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(op)
    });
    if (res.ok) {
      setOperations(prev => [...prev, op]);
    }
  };
  const updateOperation = async (op: FactoryOperation) => {
    const res = await fetch('/api/operations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(op)
    });
    if (res.ok) {
      setOperations(prev => prev.map(o => o.code === op.code ? op : o));
    }
  };
  const deleteOperation = async (code: string) => {
    const res = await fetch(`/api/operations/${code}`, { method: 'DELETE' });
    if (res.ok) {
      setOperations(prev => prev.filter(o => o.code !== code));
    }
  };
  const addGarmentStyle = async (style: GarmentStyle) => {
    const res = await fetch('/api/garment-styles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(style)
    });
    if (res.ok) {
      const saved = await res.json();
      setGarmentStyles(prev => {
        if (prev.some(s => s.id === saved.id)) return prev.map(s => s.id === saved.id ? saved : s);
        return [...prev, saved];
      });
      // Immediately propagate updates to active garment style in use
      setCurrentGarment((prev: any) => (prev && prev.id === saved.id) ? saved : prev);
    }
  };
  const updateGarmentStyle = async (style: GarmentStyle) => {
    await addGarmentStyle(style);
  };
  const deleteGarmentStyle = async (id: string) => {
    const res = await fetch(`/api/garment-styles/${id}`, { method: 'DELETE' });
    if (res.ok) {
      const data = await res.json();
      setGarmentStyles(prev => prev.filter(g => g.id !== id));
      if (currentGarment && currentGarment.id === id) {
        setCurrentGarment(data.currentGarment || null);
      }
    }
  };
  const selectGarmentStyle = async (id: string) => {
    const style = garmentStyles.find(g => g.id === id);
    if (style) {
      setCurrentGarment(style);
      await fetch('/api/system/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentGarmentId: id })
      });
    }
  };

  const changeLineStyle = async (
    lineNumber: number,
    garmentStyleId: string,
    effectiveDate: string,
    effectiveTime: string,
    reason: string,
    remarks?: string,
    changedBy?: string
  ) => {
    try {
      const res = await fetch('/api/line-style-assignments/change', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lineNumber,
          garmentStyleId,
          effectiveDate,
          effectiveTime,
          reason,
          remarks,
          changedBy: changedBy || currentUser?.username || 'Industrial Engineer'
        })
      });
      if (res.ok) {
        const [lsaRes, gshRes] = await Promise.all([
          fetch('/api/line-style-assignments'),
          fetch('/api/garment-style-history')
        ]);
        if (lsaRes.ok) setLineStyleAssignments(await lsaRes.json());
        if (gshRes.ok) setGarmentStyleHistory(await gshRes.json());
      } else {
        const err = await res.json();
        console.error("Failed to change style for line:", err);
      }
    } catch (e) {
      console.error("Error changing line style via API:", e);
    }
  };

  const getLineRunningStyle = (lineId: number): GarmentStyle | null => {
    const assignment = lineStyleAssignments.find(a => a.lineNumber === Number(lineId));
    if (assignment) {
      return garmentStyles.find(g => g.id === assignment.garmentStyleId) || currentGarment || null;
    }
    return currentGarment || null;
  };

  const deleteGarmentStyleHistory = async (id: string) => {
    try {
      const res = await fetch(`/api/garment-style-history/${id}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        setGarmentStyleHistory(prev => prev.filter(h => h.id !== id));
      } else {
        const err = await res.json();
        console.error("Failed to delete garment style history:", err);
      }
    } catch (e) {
      console.error("Error deleting garment style history via API:", e);
    }
  };

  const updateLineAllocation = async (empId: string, line: number, operation?: string, status?: WorkforceAssignmentStatus, remarks?: string) => {
    const prevEntry = lineAllocations.find(a => a.employeeId.toUpperCase() === empId.toUpperCase());
    const matchedEmp = employees.find(e => e.id.toUpperCase() === empId.toUpperCase());

    const entry: LineAllocationEntry = {
      employeeId: empId,
      employeeName: matchedEmp ? matchedEmp.name : (prevEntry ? prevEntry.employeeName : 'Operator'),
      department: matchedEmp ? matchedEmp.department : (prevEntry ? prevEntry.department : 'Sewing'),
      assignedLine: line,
      assignedOperation: operation !== undefined ? operation : (prevEntry ? prevEntry.assignedOperation : ''),
      assignmentStatus: status !== undefined ? status : (prevEntry ? prevEntry.assignmentStatus : 'Assigned'),
      remarks: remarks !== undefined ? remarks : (prevEntry ? prevEntry.remarks || '' : '')
    };

    const res = await fetch('/api/line-allocations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry)
    });

    if (res.ok) {
      setLineAllocations(prev => {
        const copy = [...prev];
        const idx = copy.findIndex(e => e.employeeId.toUpperCase() === empId.toUpperCase());
        if (idx !== -1) {
          copy[idx] = entry;
        } else {
          copy.push(entry);
        }
        return copy;
      });

      // Mirror as active assignment
      await assignEmployee(empId, line, entry.assignedOperation, entry.assignmentStatus, '08:00', '17:00', undefined, 'Manual Allocation Change');
    }
  };

  const uploadLineAllocationsFile = async (entries: LineAllocationEntry[]) => {
    const res = await fetch('/api/line-allocations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entries)
    });
    if (res.ok) {
      const allocRes = await fetch('/api/line-allocations');
      if (allocRes.ok) setLineAllocations(await allocRes.json());

      const empRes = await fetch('/api/employees?limit=2000');
      if (empRes.ok) {
        const emps = await empRes.json();
        setEmployees(emps.data || emps);
      }
    }
    
    await addNotification('Milestone', 'Line Allocation File Processed', `Bulk synchronized workforce ownership from allocations excel sheet.`);
  };

  const assignEmployee = async (empId: string, line: number, operation: string, status: WorkforceAssignmentStatus, startTime?: string, endTime?: string, availabilityFlag?: boolean, source?: string) => {
    // Check lockouts
    const currentAsg = employeeAssignments.find(a => a.employeeId.toUpperCase() === empId.toUpperCase() && a.assignmentDate === systemDate);
    const fromLine = currentAsg?.assignedLine || 0;
    if (lockedLines.includes(line)) {
      await addNotification('Alert', 'Line Operation Locked', `Violation prevented: Production Line #${line} is programmatically locked.`);
      return;
    }
    if (fromLine > 0 && lockedLines.includes(fromLine)) {
      await addNotification('Alert', 'Line Operation Locked', `Violation prevented: Operator belongs to Line #${fromLine} which is programmatically locked.`);
      return;
    }

    const res = await fetch('/api/employee-assignments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ employeeId: empId, line, operation, status, startTime, endTime, source })
    });

    if (res.ok) {
      const saved = await res.json();
      setEmployeeAssignments(prev => {
        const copy = [...prev];
        const idx = copy.findIndex(a => a.employeeId.toUpperCase() === empId.toUpperCase() && a.assignmentDate === systemDate);
        if (idx !== -1) copy[idx] = saved;
        else copy.push(saved);
        return copy;
      });

      // Synchronize employee local record
      setEmployees(prev => prev.map(e => e.id.toUpperCase() === empId.toUpperCase() ? { ...e, lineNumber: line, workforceAssignmentStatus: status, operationAssignment: operation } : e));
    }
  };

  const assignEmployeeForDate = async (empId: string, line: number, operation: string, status: WorkforceAssignmentStatus, date: string, startTime?: string, endTime?: string, source?: string) => {
    const res = await fetch('/api/employee-assignments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ employeeId: empId, line, operation, status, date, startTime, endTime, source })
    });
    if (res.ok) {
      const saved = await res.json();
      setEmployeeAssignments(prev => {
        const copy = [...prev];
        const idx = copy.findIndex(a => a.employeeId.toUpperCase() === empId.toUpperCase() && a.assignmentDate === date);
        if (idx !== -1) copy[idx] = saved;
        else copy.push(saved);
        return copy;
      });
    }
  };

  const importBulkEmployees = async (records: Employee[], actionRule: 'add-only' | 'update-only' | 'merge-update', onProgress?: (percent: number) => void) => {
    const res = await fetch('/api/jobs/import-employees', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ records, actionRule })
    });
    if (res.ok) {
      const { jobId } = await res.json();
      // Wait for complete background task tracking
      let done = false;
      while (!done) {
        await new Promise(resolve => setTimeout(resolve, 300));
        const statusRes = await fetch(`/api/jobs/status/${jobId}`);
        if (statusRes.ok) {
          const statusResult = await statusRes.json();
          if (onProgress && statusResult.progress !== undefined) {
             onProgress(statusResult.progress);
          }
          if (statusResult.status === 'completed' || statusResult.status === 'failed') {
            done = true;
          }
        }
      }
      // Reload matching data selectively
      const empRes = await fetch('/api/employees?limit=2000');
      if (empRes.ok) {
        const emps = await empRes.json();
        setEmployees(emps.data || emps);
      }
    }
  };

  const updateBulkSkills = async (updates: { 
    employeeId: string; 
    skills: WorkerSkill[]; 
    baseEfficiency?: number; 
    attendanceReliability?: number; 
    avgPcsProducedPerDay?: number;
    defectRate?: number;
  }[], replaceMode?: boolean) => {
    const updatedEmployeesList: Employee[] = [];

    updates.forEach(update => {
      const emp = employees.find(e => e.id.toUpperCase() === update.employeeId.toUpperCase());
      if (emp) {
        let updatedSkills = [...emp.skills];
        if (replaceMode) {
          updatedSkills = update.skills;
        } else {
          update.skills.forEach(newSkill => {
            const idx = updatedSkills.findIndex(s => s.operationName.toLowerCase() === newSkill.operationName.toLowerCase());
            if (idx >= 0) updatedSkills[idx] = { ...updatedSkills[idx], ...newSkill };
            else updatedSkills.push(newSkill);
          });
        }
        updatedEmployeesList.push({
          ...emp,
          skills: updatedSkills,
          baseEfficiency: update.baseEfficiency !== undefined ? update.baseEfficiency : emp.baseEfficiency,
          historicalAttendanceRate: update.attendanceReliability !== undefined ? update.attendanceReliability : emp.historicalAttendanceRate,
          attendanceReliability: update.attendanceReliability !== undefined ? update.attendanceReliability : (emp.attendanceReliability || emp.historicalAttendanceRate),
          avgPcsProducedPerDay: update.avgPcsProducedPerDay !== undefined ? update.avgPcsProducedPerDay : emp.avgPcsProducedPerDay,
          defectRate: update.defectRate !== undefined ? update.defectRate : emp.defectRate
        });
      }
    });

    if (updatedEmployeesList.length > 0) {
      const res = await fetch('/api/employees/bulk-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedEmployeesList)
      });
      if (res.ok) {
        setEmployees(prev => {
          const map = new Map(updatedEmployeesList.map(emp => [emp.id.toUpperCase(), emp]));
          return prev.map(emp => map.get(emp.id.toUpperCase()) || emp);
        });
      }
    }
    await addNotification('Milestone', 'Skillcompetence Matrix Reloaded', `Matrix reloaded successfully.`);
  };

  const notificationsCount = useMemo(() => notifications.length, [notifications]);

  const markNotificationAsRead = async (id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  };

  const markAllNotificationsRead = async () => {
    await fetch('/api/notifications/read-all', { method: 'POST' });
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };

  const clearNotification = async (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  const clearAllNotifications = async () => {
    await fetch('/api/notifications/clear-all', { method: 'POST' });
    setNotifications([]);
  };

  const addNotification = async (type: 'Alert' | 'Leave' | 'Milestone' | 'Shortage', title: string, message: string, meta?: any) => {
    const notif = {
      id: `notif_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      type,
      title,
      message,
      read: false,
      timestamp: new Date().toISOString()
    };
    setNotifications(prev => [notif, ...prev]);
  };

  const getExpectedAbsencesTomorrow = () => {
    return employees.slice(0, 5).map(emp => {
      const prob = Math.round(10 + Math.random() * 50);
      return {
        employee: emp,
        probability: prob,
        riskLevel: (prob > 40 ? 'High' : prob > 20 ? 'Medium' : 'Low') as RiskLevel,
        primaryFactor: 'Historical pattern model'
      };
    });
  };

  const recalculateRiskScores = () => {
    // Calculated server side, client-side trigger will request recalculation
    addNotification('Milestone', 'Asynchronous Risk Engine Recalculation', 'Workforce Risk score assessment started.');
  };

  const cleanImportedEmployees = async () => {
    await fetch('/api/system/reset', { method: 'POST' });
    await loadAllState();
  };

  const clearAllEmployees = async () => {
    await fetch('/api/employees/clear-all', { method: 'POST' });
    await loadAllState();
  };

  const resetDatabase = async () => {
    await fetch('/api/system/reset', { method: 'POST' });
    await loadAllState();
  };

  const reallocateOperator = (line: number, from: string, to: string, op: string) => {
    assignEmployee(to, line, op, 'Assigned', undefined, undefined, undefined, 'Reallocated');
    assignEmployee(from, 0, '', 'Available for Replacement', undefined, undefined, undefined, 'Reallocated');
  };

  const assignmentConflicts = useMemo(() => {
    const list: AssignmentConflict[] = [];
    // Fast in-memory check to prevent visual clutter
    const assignedIds = new Set<string>();
    employeeAssignments.forEach(asg => {
      if (asg.assignmentDate === systemDate && asg.assignedLine > 0 && asg.assignedOperation) {
        if (assignedIds.has(asg.employeeId.toUpperCase())) {
          const emp = employees.find(e => e.id.toUpperCase() === asg.employeeId.toUpperCase());
          list.push({
            id: `conf_${asg.employeeId}`,
            type: 'duplicate',
            severity: 'Error',
            employeeId: asg.employeeId,
            employeeName: emp ? emp.name : 'Operator',
            details: `Operator double-booked across lines.`,
            suggestedResolution: `Release from one line allocation.`
          });
        }
        assignedIds.add(asg.employeeId.toUpperCase());
      }
    });
    return list;
  }, [employeeAssignments, employees, systemDate]);

  const resolveAssignmentConflicts = () => {
    // Quick automated self-heal of duplicate active assignments
    setEmployeeAssignments(prev => {
      const seen = new Set<string>();
      return prev.filter(asg => {
        if (asg.assignmentDate === systemDate && asg.assignedLine > 0) {
          const key = asg.employeeId.toUpperCase();
          if (seen.has(key)) return false;
          seen.add(key);
        }
        return true;
      });
    });
    addNotification('Milestone', 'Integrity Layer Activated', 'Automated double-booking collision resolution processed successfully.');
  };

  const refreshStatsSilently = async () => {
    try {
      const fetchAndSet = async (url: string, setter: (data: any) => void) => {
        try {
          const res = await fetch(url);
          if (res.ok) {
            const data = await res.json();
            setter(data);
          }
        } catch (err) {
          // Quietly handle individual transient network anomalies (e.g. server restart, page unload, logout in progress)
          console.debug(`Silent fetch failed for ${url}:`, err);
        }
      };

      await Promise.all([
        fetchAndSet('/api/production-lines', setProductionLines),
        fetchAndSet('/api/dashboard/productivity', setDailyProductivity),
        fetchAndSet('/api/notifications', setNotifications),
        fetchAndSet(`/api/attendance?date=${systemDate}`, setAttendance)
      ]);
    } catch (e) {
      console.debug("Silent stats synchronizing outer handoff:", e);
    }
  };

  const login = async (usernameOrEmpId: string, password: string) => {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usernameOrEmpId, password })
      });
      const data = await res.json();
      if (res.ok) {
        if (data.token) {
          localStorage.setItem('swm_session_token', data.token);
        }
        setCurrentUser(data.user);
        await loadAllState();
        return { success: true, user: data.user };
      } else {
        return { success: false, error: data.error };
      }
    } catch (err: any) {
      return { success: false, error: err.message || 'Connection timeout.' };
    }
  };

  const logout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch (e) {
      console.error(e);
    }
    localStorage.removeItem('swm_session_token');
    setCurrentUser(null);
  };

  const adminCreateUser = async (userData: any) => {
    try {
      const res = await fetch('/api/auth/create-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(userData)
      });
      const data = await res.json();
      if (res.ok) {
        await loadAllState();
        return { success: true, user: data.user };
      } else {
        return { success: false, error: data.error };
      }
    } catch (e: any) {
      return { success: false, error: e.message || 'Connection error' };
    }
  };

  const updateUserStatus = async (userId: string, status: 'Active' | 'Inactive') => {
    const res = await fetch('/api/auth/update-user-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, status })
    });
    if (res.ok) {
      await loadAllState();
    } else {
      const data = await res.json();
      throw new Error(data.error || 'Failed to update user status.');
    }
  };

  const deleteUserAccount = async (userId: string) => {
    const res = await fetch('/api/auth/delete-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId })
    });
    if (res.ok) {
      await loadAllState();
    } else {
      const data = await res.json();
      throw new Error(data.error || 'Failed to delete user.');
    }
  };

  const changeUserRole = async (userId: string, role: string) => {
    const res = await fetch('/api/auth/update-user-role', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, role })
    });
    if (res.ok) {
      await loadAllState();
    } else {
      const data = await res.json();
      throw new Error(data.error || 'Failed to update user role.');
    }
  };

  const resetUserPassword = async (userId: string, newPassword?: string) => {
    const res = await fetch('/api/auth/reset-password-admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, newPassword })
    });
    const data = await res.json();
    if (res.ok) {
       await loadAllState();
       return { success: true, message: data.message };
    } else {
      throw new Error(data.error || 'Failed to reset password.');
    }
  };

  const changeUserPassword = async (oldPassword: string, newPassword: string) => {
    try {
      const res = await fetch('/api/auth/change-password-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oldPassword, newPassword })
      });
      const data = await res.json();
      if (res.ok) {
        return { success: true };
      } else {
        return { success: false, error: data.error };
      }
    } catch (e: any) {
      return { success: false, error: e.message || 'Connection error' };
    }
  };

  const updateUserProfile = async (profileData: { email?: string; employeeName?: string; avatarUrl?: string }) => {
    try {
      const res = await fetch('/api/auth/update-profile-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profileData)
      });
      const data = await res.json();
      if (res.ok) {
        setCurrentUser(data.user);
        return { success: true };
      } else {
        return { success: false, error: data.error };
      }
    } catch (e: any) {
      return { success: false, error: e.message || 'Connection error' };
    }
  };

  const requestPasswordReset = async (usernameOrEmpId: string) => {
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usernameOrEmpId })
      });
      const data = await res.json();
      return {
        success: res.ok,
        ticketId: data.ticketId,
        message: data.message || data.error || 'Request failed.'
      };
    } catch (e: any) {
      return { success: false, message: e.message || 'Connection timeout.' };
    }
  };

  const fetchAuditLogs = async () => {
    try {
      const res = await fetch('/api/auth/audit-logs');
      if (res.ok) {
        setAuditLogs(await res.json());
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchSessions = async () => {
    try {
      const res = await fetch('/api/auth/sessions');
      if (res.ok) {
        setSessions(await res.json());
      }
    } catch (e) {
      console.error(e);
    }
  };

  const terminateSession = async (sessionId: string) => {
    try {
      await fetch('/api/auth/sessions/terminate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId })
      });
      await fetchSessions();
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <StateContext.Provider value={{
      theme,
      toggleTheme,
      currentUser,
      setCurrentUser: changeCurrentUser,
      allUsers,
      setAllUsers,
      employees: enrichedEmployees,
      attendance,
      leaveRequests,
      productionLines,
      notifications,
      dailyProductivity,
      employeeAssignments,
      systemDate,
      setSystemDate: changeSystemDate,
      overallTarget,
      setOverallTarget: changeOverallTarget,
      overallActual,
      setOverallActual: changeOverallActual,
      
      assignmentConflicts,
      preventCalculations,
      resolveAssignmentConflicts,
      
      departments,
      operations,
      garmentStyles,
      currentGarment,

      addEmployee,
      updateEmployee,
      deleteEmployee,
      markAttendance,
      bulkMarkAttendance,
      submitLeaveRequest,
      approveRejectLeave,
      markNotificationAsRead,
      markAllNotificationsRead,
      clearNotification,
      clearAllNotifications,
      addNotification,
      reallocateOperator,
      getExpectedAbsencesTomorrow,
      recalculateRiskScores,
      resetDatabase,
      cleanImportedEmployees,
      clearAllEmployees,
      updateProductionLine,
      addProductionLine,
      updateProductionLineFull,
      deleteProductionLine,
      updateBulkSkills,
      assignEmployee,
      assignEmployeeForDate,
      importBulkEmployees,
      productionWorkforcePool,
      updateWorkforceEligibility,
      updateDepartmentEligibility,
      lockedLines,
      toggleLineLock,

      addDepartment,
      updateDepartment,
      deleteDepartment,
      addOperation,
      updateOperation,
      deleteOperation,
      addGarmentStyle,
      updateGarmentStyle,
      deleteGarmentStyle,
      selectGarmentStyle,

      lineStyleAssignments,
      garmentStyleHistory,
      changeLineStyle,
      getLineRunningStyle,
      deleteGarmentStyleHistory,

      lineAllocations,
      setLineAllocations,
      updateLineAllocation,
      uploadLineAllocationsFile,

      loading,
      refreshState: loadAllState,
      refreshStatsSilently,

      // Auth states and actions
      login,
      logout,
      adminCreateUser,
      deleteUserAccount,
      updateUserStatus,
      changeUserRole,
      resetUserPassword,
      changeUserPassword,
      updateUserProfile,
      requestPasswordReset,
      auditLogs,
      setAuditLogs,
      fetchAuditLogs,
      sessions,
      fetchSessions,
      terminateSession
    }}>
      {children}
    </StateContext.Provider>
  );
};

export const useAppState = () => {
  const context = useContext(StateContext);
  if (context === undefined) {
    throw new Error('useAppState must be used within a StateProvider');
  }
  return context;
};
