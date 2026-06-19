/**
 * SWM Client-Side persistent mock database & browser fetch routing.
 * Ensures the application is fully functional offline or on static hosting (like Netlify).
 */

import { 
  Employee, AttendanceRecord, LeaveRequest, ProductionLine, 
  AppNotification, UserAccount, LineAllocationEntry, EmployeeAssignment, 
  FactoryDepartment, FactoryOperation, GarmentStyle, DailyProductivity,
  LineStyleAssignment, GarmentStyleHistory, AuditLogEntry, WorkforceAssignmentStatus
} from '../types';

import { 
  SYSTEM_USERS, INITIAL_EMPLOYEES, INITIAL_LEAVE_REQUESTS, 
  INITIAL_PRODUCTION_LINES, generateBaseAttendance, INITIAL_DAILY_PRODUCTIVITY,
  INITIAL_NOTIFICATIONS
} from './mockData';

import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, doc, getDoc, setDoc } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

// Initialize client-side Firebase instance for shared cloud persistence
let firestoreDb: any = null;
try {
  const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
  firestoreDb = getFirestore(app, firebaseConfig.firestoreDatabaseId);
} catch (e) {
  console.warn("Could not lazily initialize Firebase in clientDbService:", e);
}

// Secure SHA-256 implementation in pure JS
export function clientSha256(ascii: string): string {
  function rightRotate(value: number, amount: number) {
    return (value >>> amount) | (value << (32 - amount));
  }
  
  let i: number, j: number;
  let result = '';

  const words: number[] = [];
  const asciiLength = ascii.length;
  const hash = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
  ];
  const k = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ];

  // Initialize words array filled with 0s
  for (let z = 0; z < 64; z++) words[z] = 0;

  for (let z = 0; z < asciiLength; z++) {
    words[z >> 2] |= (ascii.charCodeAt(z) & 0xff) << (24 - (z % 4) * 8);
  }

  words[asciiLength >> 2] |= 128 << (24 - (asciiLength % 4) * 8);
  words[(((asciiLength + 8) >> 6) << 4) + 15] = asciiLength * 8;
  
  for (i = 0; i < words.length; i += 16) {
    const w = words.slice(i, i + 16);
    // Fill up words array to 64 items
    while (w.length < 64) {
      w.push(0);
    }
    const oldHash = [...hash];
    for (j = 0; j < 64; j++) {
      if (j >= 16) {
        const s0 = rightRotate(w[j - 15], 7) ^ rightRotate(w[j - 15], 18) ^ (w[j - 15] >>> 3);
        const s1 = rightRotate(w[j - 2], 17) ^ rightRotate(w[j - 2], 19) ^ (w[j - 2] >>> 10);
        w[j] = (w[j - 16] + s0 + w[j - 7] + s1) | 0;
      }
      const ch = (hash[4] & hash[5]) ^ (~hash[4] & hash[6]);
      const maj = (hash[0] & hash[1]) ^ (hash[0] & hash[2]) ^ (hash[1] & hash[2]);
      const sigma0 = rightRotate(hash[0], 2) ^ rightRotate(hash[0], 13) ^ rightRotate(hash[0], 22);
      const sigma1 = rightRotate(hash[4], 6) ^ rightRotate(hash[4], 11) ^ rightRotate(hash[4], 25);
      const temp1 = hash[7] + sigma1 + ch + k[j] + (w[j] || 0);
      const temp2 = sigma0 + maj;
      hash[7] = hash[6];
      hash[6] = hash[5];
      hash[5] = hash[4];
      hash[4] = (hash[3] + temp1) | 0;
      hash[3] = hash[2];
      hash[2] = hash[1];
      hash[1] = hash[0];
      hash[0] = (temp1 + temp2) | 0;
    }
    for (j = 0; j < 8; j++) {
      hash[j] = (hash[j] + oldHash[j]) | 0;
    }
  }

  for (i = 0; i < 8; i++) {
    const h = hash[i];
    const val = (h >>> 0).toString(16);
    result += '00000000'.substring(val.length) + val;
  }
  return result;
}

export function clientHashPassword(password: string): string {
  return clientSha256(password);
}

export interface ClientDatabase {
  systemDate: string;
  overallTarget: number;
  overallActual: number;
  theme: 'light' | 'dark';
  currentUser: UserAccount | null;
  allUsers: UserAccount[];
  employees: Employee[];
  attendance: AttendanceRecord[];
  leaveRequests: LeaveRequest[];
  productionLines: ProductionLine[];
  notifications: AppNotification[];
  dailyProductivity: DailyProductivity[];
  lineAllocations: LineAllocationEntry[];
  employeeAssignments: EmployeeAssignment[];
  lockedLines: number[];
  departments: FactoryDepartment[];
  operations: FactoryOperation[];
  garmentStyles: GarmentStyle[];
  currentGarment: GarmentStyle | null;
  lineStyleAssignments: LineStyleAssignment[];
  garmentStyleHistory: GarmentStyleHistory[];
  auditLogs: AuditLogEntry[];
  sessions?: any[];
}

export function getInitialClientDb(): ClientDatabase {
  const baseEmp = INITIAL_EMPLOYEES.map(e => {
    const dept = (e.department || '').toLowerCase();
    const isEligible = dept === 'sewing' || dept === 'floater' || dept.includes('finishing');
    return { ...e, productionWorkforceEligible: isEligible };
  });

  const baseAttendance = generateBaseAttendance(baseEmp);

  const initialLineAllocations = baseEmp.map(emp => {
    const isFloater = (emp.department || '').toLowerCase().includes('floater') || emp.lineNumber === 10 || emp.lineNumber === 99;
    const resolvedLine = isFloater ? 99 : (emp.lineNumber || 0);
    return {
      employeeId: emp.id,
      employeeName: emp.name,
      department: emp.department,
      assignedLine: resolvedLine,
      assignmentStatus: emp.workforceAssignmentStatus || (resolvedLine > 0 ? 'Assigned' : 'Unassigned'),
      remarks: '',
      assignedOperation: emp.operationAssignment || ''
    } as LineAllocationEntry;
  });

  const initialAssignments = baseEmp
    .filter(emp => {
      const att = baseAttendance.some(r => r.employeeId.toUpperCase() === emp.id.toUpperCase() && r.date === '2026-06-04' && (r.status === 'Present' || r.status === 'Late'));
      return att;
    })
    .map(emp => {
      const alloc = initialLineAllocations.find(a => a.employeeId.toUpperCase() === emp.id.toUpperCase());
      const assignedLine = alloc ? alloc.assignedLine : ((emp.department || '').toLowerCase().includes('floater') ? 99 : emp.lineNumber);
      const assignedOp = alloc ? alloc.assignedOperation : (emp.operationAssignment || '');
      const status = alloc ? alloc.assignmentStatus : (emp.workforceAssignmentStatus || (assignedLine > 0 ? 'Assigned' : 'Unassigned'));

      return {
        id: `asgn_${emp.id}_2026-06-04`,
        employeeId: emp.id,
        assignmentDate: '2026-06-04',
        assignedLine: assignedLine,
        assignedOperation: assignedOp,
        assignmentStatus: status,
        startTime: '08:00',
        endTime: '17:00',
        assignedBy: 'ie_rahul',
        availabilityFlag: status === 'Unassigned' || status === 'Available for Replacement',
        department: emp.department,
        assignmentSource: 'Official IE Allocation'
      } as EmployeeAssignment;
    });

  const INITIAL_FACTORY_DEPARTMENTS: FactoryDepartment[] = [
    { id: 'DEPT01', name: 'Sewing', supervisor: 'Vikram Mehta', totalEmployees: 65, status: 'Active' },
    { id: 'DEPT02', name: 'Cutting', supervisor: 'Sanjay Sharma', totalEmployees: 12, status: 'Active' },
    { id: 'DEPT03', name: 'QA', supervisor: 'Deepa Nair', totalEmployees: 15, status: 'Active' },
    { id: 'DEPT04', name: 'Finishing & Packing', supervisor: 'Amit Saxena', totalEmployees: 18, status: 'Active' },
    { id: 'DEPT05', name: 'Sampling', supervisor: 'Karan Johar', totalEmployees: 5, status: 'Active' },
    { id: 'DEPT06', name: 'CAD', supervisor: 'Ritu Kumar', totalEmployees: 3, status: 'Active' },
    { id: 'DEPT07', name: 'Warehouse', supervisor: 'Sunil Shetty', totalEmployees: 8, status: 'Active' },
    { id: 'DEPT08', name: 'Store', supervisor: 'Bobby Deol', totalEmployees: 4, status: 'Active' },
    { id: 'DEPT09', name: 'Safety', supervisor: 'Akshay Kumar', totalEmployees: 2, status: 'Active' },
    { id: 'DEPT10', name: 'Floater', supervisor: 'Salman Khan', totalEmployees: 10, status: 'Active' }
  ];

  const INITIAL_FACTORY_OPERATIONS: FactoryOperation[] = [
    { code: 'OP-SEW-01', name: 'Collar Join', departmentId: 'DEPT01', skillCategory: 'Grade A Operator', smv: 1.5, machineType: 'Single Needle Lockstitch', targetEfficiency: 80, minSkillLevel: 'Expert', status: 'Active' },
    { code: 'OP-SEW-02', name: 'Sleeve Attach', departmentId: 'DEPT01', skillCategory: 'Grade A Operator', smv: 1.25, machineType: 'Overlock 4-Thread', targetEfficiency: 85, minSkillLevel: 'Advanced', status: 'Active' },
    { code: 'OP-SEW-03', name: 'Bottom Hemming', departmentId: 'DEPT01', skillCategory: 'Grade B Operator', smv: 0.95, machineType: 'Flatlock', targetEfficiency: 80, minSkillLevel: 'Intermediate', status: 'Active' },
    { code: 'OP-SEW-04', name: 'Pocket Attaching', departmentId: 'DEPT01', skillCategory: 'Grade A Operator', smv: 1.10, machineType: 'Single Needle Lockstitch', targetEfficiency: 75, minSkillLevel: 'Advanced', status: 'Active' },
    { code: 'OP-SEW-05', name: 'Pocket Welting', departmentId: 'DEPT01', skillCategory: 'Grade A Operator', smv: 1.65, machineType: 'Pocket Welting Machine', targetEfficiency: 70, minSkillLevel: 'Expert', status: 'Active' },
    { code: 'OP-SEW-06', name: 'Button Stitching', departmentId: 'DEPT01', skillCategory: 'Grade C Operator', smv: 0.60, machineType: 'Button Stitching Machine', targetEfficiency: 90, minSkillLevel: 'Beginner', status: 'Active' },
    { code: 'OP-SEW-07', name: 'Side Seam Join', departmentId: 'DEPT01', skillCategory: 'Grade B Operator', smv: 1.20, machineType: 'Overlock 5-Thread', targetEfficiency: 85, minSkillLevel: 'Intermediate', status: 'Active' },
    { code: 'OP-SEW-08', name: 'Cuff Attachment', departmentId: 'DEPT01', skillCategory: 'Grade A Operator', smv: 1.40, machineType: 'Single Needle Lockstitch', targetEfficiency: 78, minSkillLevel: 'Advanced', status: 'Active' },
    { code: 'OP-SEW-09', name: 'Label Attaching', departmentId: 'DEPT01', skillCategory: 'Grade C Operator', smv: 0.45, machineType: 'Single Needle Lockstitch', targetEfficiency: 90, minSkillLevel: 'Beginner', status: 'Active' },
    { code: 'OP-CUT-01', name: 'Fabric Inspection', departmentId: 'DEPT02', skillCategory: 'Helper', smv: 2.0, machineType: 'Inspection Table', targetEfficiency: 95, minSkillLevel: 'Intermediate', status: 'Active' },
    { code: 'OP-QA-01', name: 'Quality Audit Audit', departmentId: 'DEPT03', skillCategory: 'Quality Inspector', smv: 1.0, machineType: 'Measuring Board', targetEfficiency: 95, minSkillLevel: 'Advanced', status: 'Active' },
    { code: 'OP-FIN-01', name: 'Final Ironing', departmentId: 'DEPT04', skillCategory: 'Ironer/Finisher', smv: 1.5, machineType: 'Steam Iron', targetEfficiency: 85, minSkillLevel: 'Intermediate', status: 'Active' },
    { code: 'OP-FIN-02', name: 'Thread Trimming', departmentId: 'DEPT04', skillCategory: 'Helper', smv: 0.8, machineType: 'Trimming Scissors', targetEfficiency: 90, minSkillLevel: 'Beginner', status: 'Active' }
  ];

  const INITIAL_FACTORY_GARMENT_STYLES: GarmentStyle[] = [
    {
      id: 'POLO-CLASSIC-01',
      name: "Classic Men's Polo",
      type: 'Polo Shirt',
      smv: 14.5,
      requiredManpower: 15,
      estimatedManpower: 14,
      description: 'Standard cotton pique knit short sleeve polo with rib collar.',
      version: '1.2.0',
      isArchived: false,
      status: 'Active',
      operations: [
        { operationCode: 'OP-SEW-01', name: 'Collar Join', sequenceOrder: 1, smv: 1.50, machineType: 'Single Needle Lockstitch', skillRequired: 'Expert', departmentId: 'DEPT01' },
        { operationCode: 'OP-SEW-02', name: 'Sleeve Attach', sequenceOrder: 2, smv: 1.25, machineType: 'Overlock 4-Thread', skillRequired: 'Advanced', departmentId: 'DEPT01' },
        { operationCode: 'OP-SEW-08', name: 'Cuff Attachment', sequenceOrder: 3, smv: 1.40, machineType: 'Single Needle Lockstitch', skillRequired: 'Advanced', departmentId: 'DEPT01' },
        { operationCode: 'OP-SEW-07', name: 'Side Seam Join', sequenceOrder: 4, smv: 1.20, machineType: 'Overlock 5-Thread', skillRequired: 'Intermediate', departmentId: 'DEPT01' },
        { operationCode: 'OP-SEW-03', name: 'Bottom Hemming', sequenceOrder: 5, smv: 0.95, machineType: 'Flatlock', skillRequired: 'Intermediate', departmentId: 'DEPT01' },
        { operationCode: 'OP-SEW-04', name: 'Pocket Attaching', sequenceOrder: 6, smv: 1.10, machineType: 'Single Needle Lockstitch', skillRequired: 'Advanced', departmentId: 'DEPT01' },
        { operationCode: 'OP-SEW-06', name: 'Button Stitching', sequenceOrder: 7, smv: 0.60, machineType: 'Button Stitching Machine', skillRequired: 'Beginner', departmentId: 'DEPT01' },
        { operationCode: 'OP-QA-01', name: 'Quality Audit Audit', sequenceOrder: 8, smv: 1.00, machineType: 'Measuring Board', skillRequired: 'Advanced', departmentId: 'DEPT03' }
      ],
      linesAllocated: [1, 2],
      createdAt: '2026-06-01T08:00:00Z',
      lastModifiedAt: '2026-06-06T10:00:00Z'
    },
    {
      id: 'TSHIRT-ROUND-01',
      name: 'Standard Round Neck T-Shirt',
      type: 'T-Shirt',
      smv: 8.5,
      requiredManpower: 10,
      estimatedManpower: 8,
      description: 'Casual combed-jersey round neck knit t-shirt.',
      version: '2.0.1',
      isArchived: false,
      status: 'Active',
      operations: [
        { operationCode: 'OP-SEW-02', name: 'Sleeve Attach', sequenceOrder: 1, smv: 1.25, machineType: 'Overlock 4-Thread', skillRequired: 'Advanced', departmentId: 'DEPT01' },
        { operationCode: 'OP-SEW-07', name: 'Side Seam Join', sequenceOrder: 2, smv: 1.20, machineType: 'Overlock 5-Thread', skillRequired: 'Intermediate', departmentId: 'DEPT01' },
        { operationCode: 'OP-SEW-03', name: 'Bottom Hemming', sequenceOrder: 3, smv: 0.95, machineType: 'Flatlock', skillRequired: 'Intermediate', departmentId: 'DEPT01' },
        { operationCode: 'OP-SEW-09', name: 'Label Attaching', sequenceOrder: 4, smv: 0.45, machineType: 'Single Needle Lockstitch', skillRequired: 'Beginner', departmentId: 'DEPT01' }
      ],
      linesAllocated: [3],
      createdAt: '2026-06-02T09:00:05Z',
      lastModifiedAt: '2026-06-05T15:20:00Z'
    },
    {
      id: 'HOODIE-ZIP-02',
      name: 'Fleece Zipper Hoodie',
      type: 'Hoodie',
      smv: 15.6,
      requiredManpower: 16,
      estimatedManpower: 15,
      description: 'Heavyweight brushed back fleece jacket with metal front zip.',
      version: '1.0.1',
      isArchived: false,
      status: 'Active',
      operations: [
        { operationCode: 'OP-SEW-02', name: 'Sleeve Attach', sequenceOrder: 1, smv: 1.25, machineType: 'Overlock 4-Thread', skillRequired: 'Advanced', departmentId: 'DEPT01' },
        { operationCode: 'OP-SEW-08', name: 'Cuff Attachment', sequenceOrder: 2, smv: 1.40, machineType: 'Single Needle Lockstitch', skillRequired: 'Advanced', departmentId: 'DEPT01' },
        { operationCode: 'OP-SEW-07', name: 'Side Seam Join', sequenceOrder: 3, smv: 1.20, machineType: 'Overlock 5-Thread', skillRequired: 'Intermediate', departmentId: 'DEPT01' },
        { operationCode: 'OP-SEW-05', name: 'Pocket Welting', sequenceOrder: 4, smv: 1.65, machineType: 'Pocket Welting Machine', skillRequired: 'Expert', departmentId: 'DEPT01' }
      ],
      linesAllocated: [4],
      createdAt: '2026-06-03T11:00:00Z',
      lastModifiedAt: '2026-06-04T12:00:00Z'
    }
  ];

  const initialLineStyleAssignments: LineStyleAssignment[] = INITIAL_PRODUCTION_LINES.map(line => {
    const matchingStyle = INITIAL_FACTORY_GARMENT_STYLES.find(g => g.linesAllocated?.includes(line.id)) || INITIAL_FACTORY_GARMENT_STYLES[0];
    return {
      id: `lsa_${line.id}`,
      lineNumber: line.id,
      garmentStyleId: matchingStyle.id,
      assignedAt: '2026-06-04T08:00:00Z',
      effectiveDate: '2026-06-04',
      effectiveTime: '08:00',
      remarks: 'Initial platform style allocation'
    } as LineStyleAssignment;
  });

  const initialGarmentStyleHistory: GarmentStyleHistory[] = INITIAL_PRODUCTION_LINES.map(line => {
    const matchingStyle = INITIAL_FACTORY_GARMENT_STYLES.find(g => g.linesAllocated?.includes(line.id)) || INITIAL_FACTORY_GARMENT_STYLES[0];
    return {
      id: `gsh_init_${line.id}`,
      lineNumber: line.id,
      previousGarmentStyleId: null,
      previousGarmentStyleName: null,
      newGarmentStyleId: matchingStyle.id,
      newGarmentStyleName: matchingStyle.name,
      changeDate: '2026-06-04',
      changeTime: '08:00',
      changedBy: 'System Bootstrap',
      reason: 'Initial platform line assignment',
      operatorsCount: line.requiredManpower,
      remarks: 'Auto-synchronized database allocation.'
    } as GarmentStyleHistory;
  });

  // Default hash and admin password
  const defaultHash = clientHashPassword('SWM2026!');
  const adminHash = clientHashPassword('Jayasurya@21'); // Explicit admin password required by user

  const users: UserAccount[] = SYSTEM_USERS.map(usr => {
    return {
      ...usr,
      passwordHash: usr.username === 'admin_prakash' ? adminHash : defaultHash,
      accountStatus: 'Active',
      failedAttempts: 0,
      lockedUntil: null,
      lastLogin: null,
      employeeId: usr.employeeId || usr.id,
      employeeName: usr.username === 'admin_prakash' ? 'Prakash Mehta' :
                    usr.username === 'hr_ananya' ? 'Ananya Sharma' :
                    usr.username === 'pm_vikram' ? 'Vikram Singh' :
                    usr.username === 'sup_karthik' ? 'Karthik S.' : 'Rahul Patel',
      department: usr.username === 'admin_prakash' ? 'IT & Administration' :
                  usr.username === 'hr_ananya' ? 'Human Resources' :
                  usr.username === 'pm_vikram' ? 'Production' : 'Industrial Engineering',
      designation: usr.username === 'admin_prakash' ? 'Systems Manager' :
                   usr.username === 'hr_ananya' ? 'HR Representative' : 'Staff Observer'
    } as UserAccount;
  });

  // Cast INITIAL_DAILY_PRODUCTIVITY explicitly
  const typedDailyProductivity: DailyProductivity[] = INITIAL_DAILY_PRODUCTIVITY.map((dp: any) => ({
    id: dp.id,
    date: dp.date,
    lineNumber: dp.lineNumber,
    targetQuantity: dp.targetQuantity,
    actualQuantity: dp.actualQuantity,
    efficiency: dp.efficiency,
    smv: dp.smv,
    workingHours: dp.workingHours
  }));

  return {
    systemDate: '2026-06-04',
    overallTarget: 6000,
    overallActual: 0,
    theme: 'light',
    currentUser: null,
    allUsers: users,
    employees: baseEmp,
    attendance: baseAttendance,
    leaveRequests: INITIAL_LEAVE_REQUESTS,
    productionLines: INITIAL_PRODUCTION_LINES,
    notifications: INITIAL_NOTIFICATIONS,
    dailyProductivity: typedDailyProductivity,
    lineAllocations: initialLineAllocations,
    employeeAssignments: initialAssignments,
    lockedLines: [],
    departments: INITIAL_FACTORY_DEPARTMENTS,
    operations: INITIAL_FACTORY_OPERATIONS,
    garmentStyles: INITIAL_FACTORY_GARMENT_STYLES,
    currentGarment: INITIAL_FACTORY_GARMENT_STYLES[0],
    lineStyleAssignments: initialLineStyleAssignments,
    garmentStyleHistory: initialGarmentStyleHistory,
    auditLogs: [{
      id: 'audit_init',
      userId: 'admin_prakash',
      action: 'Client-Side Security Initialized',
      timestamp: new Date().toISOString(),
      adminName: 'System',
      details: 'All data operations routed to persistent LocalStorage Sandbox.'
    }]
  };
}

let lastFirestoreFetchTime = 0;
let isFirestoreFetching = false;
let firestoreFetchPromise: Promise<any> | null = null;

export async function syncFromFirestoreIfNeeded() {
  if (typeof window === 'undefined' || !firestoreDb) return;
  const now = Date.now();
  // Sync if it has been more than 4 seconds since the last fetch
  if (now - lastFirestoreFetchTime > 4000) {
    if (isFirestoreFetching && firestoreFetchPromise) {
      await firestoreFetchPromise;
      return;
    }

    isFirestoreFetching = true;
    firestoreFetchPromise = (async () => {
      try {
        const docRef = doc(firestoreDb, 'swm_shared', 'global_database');
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const remoteDb = docSnap.data() as ClientDatabase;
          if (remoteDb) {
            // Retain local context (currentUser and theme) to avoid session kick outs
            let localCurrentUser = null;
            let localTheme: 'light' | 'dark' = 'light';
            const rawLocal = localStorage.getItem('swm_client_db');
            if (rawLocal) {
              try {
                const localDb = JSON.parse(rawLocal);
                localCurrentUser = localDb.currentUser;
                localTheme = localDb.theme || 'light';
              } catch (e1) {
                // ignore
              }
            }
            remoteDb.currentUser = localCurrentUser;
            remoteDb.theme = localTheme;

            localStorage.setItem('swm_client_db', JSON.stringify(remoteDb));
            lastFirestoreFetchTime = Date.now();
            console.log("Client database synced with Firestore cloud.");
          }
        } else {
          // Bootstrap Firestore with default database setup
          const seeded = getInitialClientDb();
          await setDoc(docRef, seeded);
          lastFirestoreFetchTime = Date.now();
          console.log("Initialized global_database in Firestore with default seeded data.");
        }
      } catch (err) {
        console.warn("Firestore data sync warning:", err);
      } finally {
        isFirestoreFetching = false;
        firestoreFetchPromise = null;
      }
    })();

    await firestoreFetchPromise;
  }
}

export function loadClientDb(): ClientDatabase {
  if (typeof window === 'undefined') {
    return getInitialClientDb();
  }
  const raw = localStorage.getItem('swm_client_db');
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      // Fast check for admin_prakash password override on load
      const adminHash = clientHashPassword('Jayasurya@21');
      if (parsed.allUsers) {
        const adm = parsed.allUsers.find((u: any) => u.username === 'admin_prakash');
        if (adm && adm.passwordHash !== adminHash) {
          adm.passwordHash = adminHash;
          localStorage.setItem('swm_client_db', JSON.stringify(parsed));
        }
      }
      return parsed;
    } catch (e) {
      console.error("Failed to parse client database:", e);
    }
  }
  const seeded = getInitialClientDb();
  saveClientDb(seeded);
  return seeded;
}

export function saveClientDb(db: ClientDatabase) {
  if (typeof window !== 'undefined') {
    localStorage.setItem('swm_client_db', JSON.stringify(db));
    
    // Back up to Firebase Firestore asynchronously
    if (firestoreDb) {
      const docRef = doc(firestoreDb, 'swm_shared', 'global_database');
      setDoc(docRef, db)
        .then(() => {
          console.log("Successfully back-propagated client database changes to Firestore.");
        })
        .catch(err => {
          console.error("Failed to back-propagate changes to Firestore:", err);
        });
    }
  }
}

export function writeClientAuditLog(db: ClientDatabase, userId: string, action: string, adminName: string, details?: string): void {
  const log: AuditLogEntry = {
    id: `audit_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    userId,
    action,
    timestamp: new Date().toISOString(),
    adminName,
    details: details || ''
  };
  if (!db.auditLogs) db.auditLogs = [];
  db.auditLogs.unshift(log);
}

function getClientActiveUser(db: any) {
  let sid = '';
  if (typeof document !== 'undefined') {
    const cookies: Record<string, string> = {};
    document.cookie.split(';').forEach(c => {
      const parts = c.trim().split('=');
      if (parts.length >= 2) cookies[parts[0]] = parts[1];
    });
    sid = cookies.sid || '';
  }
  if (!sid && typeof localStorage !== 'undefined') {
    sid = localStorage.getItem('sid') || '';
  }
  
  if (!sid) return db.currentUser;
  
  if (!db.sessions) db.sessions = [];
  const s = db.sessions.find((s: any) => s.id === sid && s.status === 'Active');
  if (!s) return null;
  
  return db.allUsers.find((u: any) => u.id === s.userId) || null;
}

export async function handleMockRequest(urlStr: string, init?: RequestInit): Promise<Response> {
  await syncFromFirestoreIfNeeded();
  const db = loadClientDb();
  const parsed = new URL(urlStr, window.location.origin);
  const pathname = parsed.pathname;
  const method = (init?.method || 'GET').toUpperCase();
  const body = init?.body ? JSON.parse(init.body as string) : null;
  const params = parsed.searchParams;

  let status = 200;
  let responseData: any = { success: true };

  try {
    if (pathname === '/api/system/settings') {
      if (method === 'GET') {
        responseData = {
          systemDate: db.systemDate,
          overallTarget: db.overallTarget,
          overallActual: db.overallActual,
          theme: db.theme,
          currentUser: getClientActiveUser(db),
          allUsers: db.allUsers,
          lockedLines: db.lockedLines,
          currentGarment: db.currentGarment
        };
      } else {
        const { systemDate, overallTarget, overallActual, theme, lockedLines, currentGarment } = body || {};
        if (systemDate !== undefined) db.systemDate = systemDate;
        if (overallTarget !== undefined) db.overallTarget = Number(overallTarget);
        if (overallActual !== undefined) db.overallActual = Number(overallActual);
        if (theme !== undefined) db.theme = theme;
        if (lockedLines !== undefined) db.lockedLines = lockedLines;
        if (currentGarment !== undefined) db.currentGarment = currentGarment;
        saveClientDb(db);
        responseData = { success: true };
      }
    } 
    
    else if (pathname === '/api/employees') {
      if (method === 'GET') {
        const page = Math.max(1, parseInt(params.get('page') || '1'));
        const limit = Math.max(1, parseInt(params.get('limit') || '25'));
        const search = (params.get('search') || '').toLowerCase().trim();
        const department = params.get('department') || 'All';
        const skillCategory = params.get('skillCategory') || 'All';

        let filtered = db.employees;
        if (search) {
          filtered = filtered.filter(emp => 
            emp.id.toLowerCase().includes(search) || 
            emp.name.toLowerCase().includes(search) || 
            (emp.designation && emp.designation.toLowerCase().includes(search)) ||
            (emp.department && emp.department.toLowerCase().includes(search))
          );
        }
        if (department !== 'All') {
          filtered = filtered.filter(emp => emp.department === department);
        }
        if (skillCategory !== 'All') {
          filtered = filtered.filter(emp => emp.skillCategory === skillCategory);
        }

        const total = filtered.length;
        const pages = Math.ceil(total / limit);
        const paginatedData = filtered.slice((page - 1) * limit, page * limit);

        responseData = {
          data: paginatedData,
          total,
          page,
          limit,
          pages
        };
      } else {
        const emp = body as Employee;
        if (!emp.id) {
          emp.id = `EMP${Date.now()}`;
        }
        db.employees.push(emp);
        saveClientDb(db);
        responseData = emp;
      }
    } 
    
    else if (pathname.startsWith('/api/employees/')) {
      const empId = pathname.replace('/api/employees/', '');
      if (empId === 'clear-all') {
        db.employees = [];
        saveClientDb(db);
        responseData = { success: true };
      } else if (method === 'DELETE') {
        db.employees = db.employees.filter(e => e.id.toUpperCase() !== empId.toUpperCase());
        saveClientDb(db);
        responseData = { success: true };
      } else if (method === 'POST') {
        if (pathname.includes('bulk-update')) {
          const updates = body as Employee[];
          updates.forEach(upd => {
            const idx = db.employees.findIndex(e => e.id.toUpperCase() === upd.id.toUpperCase());
            if (idx !== -1) {
              db.employees[idx] = { ...db.employees[idx], ...upd };
            }
          });
          saveClientDb(db);
          responseData = { success: true };
        } else {
          const idx = db.employees.findIndex(e => e.id.toUpperCase() === empId.toUpperCase());
          if (idx !== -1) {
            db.employees[idx] = { ...db.employees[idx], ...body };
            saveClientDb(db);
            responseData = db.employees[idx];
          } else {
            status = 404;
            responseData = { error: 'Employee not found' };
          }
        }
      }
    } 
    
    else if (pathname === '/api/attendance') {
      if (method === 'GET') {
        const qDate = params.get('date');
        if (qDate) {
          responseData = db.attendance.filter(a => a.date === qDate);
        } else {
          responseData = db.attendance;
        }
      } else {
        const records = Array.isArray(body) ? body : [body];
        records.forEach(rec => {
          const idx = db.attendance.findIndex(a => a.employeeId.toUpperCase() === rec.employeeId.toUpperCase() && a.date === rec.date);
          if (idx !== -1) {
            db.attendance[idx] = { ...db.attendance[idx], ...rec };
          } else {
            rec.id = rec.id || `att_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
            db.attendance.push(rec);
          }
        });
        saveClientDb(db);
        responseData = Array.isArray(body) ? records : records[0];
      }
    } 
    
    else if (pathname === '/api/leave-requests') {
      if (method === 'GET') {
        responseData = db.leaveRequests;
      } else {
        const req = body as LeaveRequest;
        req.id = req.id || `leave_${Date.now()}`;
        db.leaveRequests.push(req);
        saveClientDb(db);
        responseData = req;
      }
    } 
    
    else if (pathname.startsWith('/api/leave-requests/')) {
      const leaveId = pathname.replace('/api/leave-requests/', '');
      const idx = db.leaveRequests.findIndex(r => r.id === leaveId);
      if (idx !== -1) {
        db.leaveRequests[idx] = { ...db.leaveRequests[idx], ...body };
        saveClientDb(db);
        responseData = db.leaveRequests[idx];
      } else {
        status = 404;
        responseData = { error: 'Leave request not found' };
      }
    } 
    
    else if (pathname === '/api/production-lines') {
      if (method === 'GET') {
        responseData = db.productionLines;
      } else {
        const line = body as ProductionLine;
        line.id = line.id || db.productionLines.length + 1;
        db.productionLines.push(line);
        saveClientDb(db);
        responseData = line;
      }
    } 
    
    else if (pathname.startsWith('/api/production-lines/')) {
      const lineId = parseInt(pathname.replace('/api/production-lines/', ''));
      if (method === 'DELETE') {
        db.productionLines = db.productionLines.filter(l => l.id !== lineId);
        saveClientDb(db);
        responseData = { success: true };
      }
    } 
    
    else if (pathname === '/api/departments') {
      responseData = db.departments;
    } 
    
    else if (pathname === '/api/operations') {
      responseData = db.operations;
    } 
    
    else if (pathname === '/api/garment-styles') {
      if (method === 'GET') {
        responseData = db.garmentStyles;
      } else {
        const style = body as GarmentStyle;
        style.id = style.id || `STYLE_${Date.now()}`;
        db.garmentStyles.push(style);
        saveClientDb(db);
        responseData = style;
      }
    } 
    
    else if (pathname.startsWith('/api/garment-styles/')) {
      const styleId = pathname.replace('/api/garment-styles/', '');
      if (method === 'DELETE') {
        db.garmentStyles = db.garmentStyles.filter(s => s.id !== styleId);
        saveClientDb(db);
        responseData = { success: true };
      }
    } 
    
    else if (pathname === '/api/line-allocations') {
      if (method === 'GET') {
        responseData = db.lineAllocations;
      } else {
        const records = Array.isArray(body) ? body : [body];
        records.forEach(rec => {
          const idx = db.lineAllocations.findIndex(a => a.employeeId.toUpperCase() === rec.employeeId.toUpperCase());
          if (idx !== -1) {
            db.lineAllocations[idx] = { ...db.lineAllocations[idx], ...rec };
          } else {
            db.lineAllocations.push(rec);
          }
        });
        saveClientDb(db);
        responseData = db.lineAllocations;
      }
    } 
    
    else if (pathname === '/api/employee-assignments') {
      if (method === 'GET') {
        const qDate = params.get('date');
        if (qDate) {
          responseData = db.employeeAssignments.filter(a => a.assignmentDate === qDate);
        } else {
          responseData = db.employeeAssignments;
        }
      } else {
        const { employeeId, line, operation, status: aStatus, date, startTime, endTime } = body;
        const formattedStatus = aStatus as WorkforceAssignmentStatus;
        const idx = db.employeeAssignments.findIndex(a => a.employeeId.toUpperCase() === employeeId.toUpperCase() && a.assignmentDate === date);
        const record = {
          id: idx !== -1 ? db.employeeAssignments[idx].id : `asgn_${employeeId}_${date}`,
          employeeId,
          assignmentDate: date,
          assignedLine: line,
          assignedOperation: operation,
          assignmentStatus: formattedStatus,
          startTime: startTime || '08:00',
          endTime: endTime || '17:00',
          assignedBy: 'ie_rahul',
          availabilityFlag: formattedStatus === 'Unassigned' || formattedStatus === 'Available for Replacement',
          department: db.employees.find(e => e.id.toUpperCase() === employeeId.toUpperCase())?.department || 'Sewing',
          assignmentSource: 'Official IE Allocation'
        } as EmployeeAssignment;

        if (idx !== -1) {
          db.employeeAssignments[idx] = record;
        } else {
          db.employeeAssignments.push(record);
        }
        
        // Sync to employee record too
        const empIdx = db.employees.findIndex(e => e.id.toUpperCase() === employeeId.toUpperCase());
        if (empIdx !== -1) {
          db.employees[empIdx].lineNumber = line;
          db.employees[empIdx].workforceAssignmentStatus = formattedStatus;
          db.employees[empIdx].operationAssignment = operation;
        }

        saveClientDb(db);
        responseData = record;
      }
    } 
    
    else if (pathname === '/api/line-style-assignments') {
      responseData = db.lineStyleAssignments;
    } 
    
    else if (pathname === '/api/garment-style-history') {
      responseData = db.garmentStyleHistory;
    } 
    
    else if (pathname === '/api/line-style-assignments/change') {
      const { lineId, styleId, changedBy } = body;
      const assignment: LineStyleAssignment = {
        id: `lsa_${lineId}_${styleId}`,
        lineNumber: lineId,
        garmentStyleId: styleId,
        assignedAt: new Date().toISOString(),
        effectiveDate: db.systemDate,
        effectiveTime: '08:00',
        remarks: 'Direct style re-routing'
      };

      const lsaIdx = db.lineStyleAssignments.findIndex(a => a.lineNumber === lineId);
      if (lsaIdx !== -1) {
        db.lineStyleAssignments[lsaIdx] = assignment;
      } else {
        db.lineStyleAssignments.push(assignment);
      }

      const style = db.garmentStyles.find(s => s.id === styleId);
      const hist: GarmentStyleHistory = {
        id: `gsh_${Date.now()}`,
        lineNumber: lineId,
        previousGarmentStyleId: null,
        previousGarmentStyleName: null,
        newGarmentStyleId: styleId,
        newGarmentStyleName: style ? style.name : 'Unknown Style',
        changeDate: db.systemDate,
        changeTime: '08:00',
        changedBy: changedBy || 'Systems',
        reason: 'Client style modification',
        operatorsCount: 15,
        remarks: 'Auto-synchronized database allocation.'
      };
      db.garmentStyleHistory.unshift(hist);
      saveClientDb(db);

      responseData = assignment;
    } 
    
    else if (pathname === '/api/notifications') {
      responseData = db.notifications;
    } 
    
    else if (pathname === '/api/notifications/read-all') {
      db.notifications = db.notifications.map(n => ({ ...n, read: true }));
      saveClientDb(db);
      responseData = { success: true };
    } 
    
    else if (pathname === '/api/notifications/clear-all') {
      db.notifications = [];
      saveClientDb(db);
      responseData = { success: true };
    } 
    
    else if (pathname === '/api/dashboard/productivity') {
      responseData = db.dailyProductivity;
    } 
    
    else if (pathname === '/api/auth/me') {
      const activeUser = getClientActiveUser(db);
      if (!activeUser) {
        status = 401;
        responseData = { error: 'Unauthorized session.' };
      } else {
        let sid = '';
        if (typeof document !== 'undefined') {
          const cookies: Record<string, string> = {};
          document.cookie.split(';').forEach(c => {
            const parts = c.trim().split('=');
            if (parts.length >= 2) cookies[parts[0]] = parts[1];
          });
          sid = cookies.sid || '';
        }
        if (!sid && typeof localStorage !== 'undefined') {
          sid = localStorage.getItem('sid') || '';
        }
        if (!db.sessions) db.sessions = [];
        const session = db.sessions.find((s: any) => s.id === sid);
        responseData = { user: activeUser, session };
      }
    } 
    
    else if (pathname === '/api/auth/sessions') {
      const caller = getClientActiveUser(db);
      if (!caller || caller.role !== 'Admin') {
        status = 403;
        responseData = { error: 'System Administrator privileges required.' };
      } else {
        responseData = db.sessions || [];
      }
    }

    else if (pathname === '/api/auth/sessions/terminate') {
      const caller = getClientActiveUser(db);
      if (!caller) {
        status = 401;
        responseData = { error: 'Please log in.' };
      } else {
        const { sessionId } = body || {};
        if (!db.sessions) db.sessions = [];
        const sessionToTerm = db.sessions.find((s: any) => s.id === sessionId);
        if (!sessionToTerm) {
          status = 404;
          responseData = { error: 'Session not found.' };
        } else {
          if (caller.role !== 'Admin' && sessionToTerm.userId !== caller.id) {
            status = 403;
            responseData = { error: 'Permissions denied.' };
          } else {
            sessionToTerm.status = 'Revoked';
            writeClientAuditLog(db, sessionToTerm.userId, 'Session Revoked', caller.username, `Session ${sessionToTerm.id} was terminated remotely by ${caller.username}`);
            saveClientDb(db);
            responseData = { success: true };
          }
        }
      }
    }

    else if (pathname === '/api/auth/login') {
      const { usernameOrEmpId, password } = body || {};
      let searchKey = (usernameOrEmpId || '').toLowerCase().trim();
      if (searchKey === 'admin') {
        searchKey = 'admin_prakash';
      }
 
      // Search in persistent mock users
      const user = db.allUsers.find(u => 
        u.username.toLowerCase() === searchKey || 
        (u.employeeId && u.employeeId.toLowerCase() === searchKey)
      );
 
      if (!user) {
        status = 401;
        responseData = { error: 'Invalid security credentials or account does not exist.' };
      } else {
        const now = new Date();
        if (user.accountStatus === 'Inactive') {
          status = 403;
          responseData = { error: 'Your account has been deactivated by the System Administrator.' };
        } else {
          // Compare hashes
          const inputHash = clientHashPassword(password || '');
          if (user.passwordHash !== inputHash) {
            user.failedAttempts = (user.failedAttempts || 0) + 1;
            status = 401;
            responseData = { error: `Incorrect security password. ${5 - user.failedAttempts} attempt(s) remaining.` };
            writeClientAuditLog(db, user.id, 'Failed Login Attempt', 'System', `Password match failed. IP: Mock-Sandbox.`);
            saveClientDb(db);
          } else {
            // Success
            user.failedAttempts = 0;
            user.lastLogin = now.toISOString();
            
            const sessionId = 'sid_' + Math.floor(Math.random() * 1000000000).toString(16);
            if (typeof localStorage !== 'undefined') {
              localStorage.setItem('sid', sessionId);
            }
            if (typeof document !== 'undefined') {
              document.cookie = `sid=${sessionId}; Path=/; Max-Age=28800`;
            }
            
            const newSession = {
              id: sessionId,
              userId: user.id,
              username: user.username,
              role: user.role,
              employeeName: user.employeeName || user.username,
              loginTime: now.toISOString(),
              deviceInfo: 'Desktop',
              browserInfo: 'Chrome',
              ipAddress: '127.0.0.1',
              lastActivityTime: now.toISOString(),
              status: 'Active' as const
            };
            
            if (!db.sessions) db.sessions = [];
            db.sessions.push(newSession);
            db.currentUser = user;
            
            writeClientAuditLog(db, user.id, 'User Login Success', 'System', `Client-side container entry granted. Session: ${sessionId}`);
            saveClientDb(db);
            responseData = { success: true, user, token: sessionId, session: newSession };
          }
        }
      }
    } 
    
    else if (pathname === '/api/auth/logout') {
      let sid = '';
      if (typeof document !== 'undefined') {
        const cookies: Record<string, string> = {};
        document.cookie.split(';').forEach(c => {
          const parts = c.trim().split('=');
          if (parts.length >= 2) cookies[parts[0]] = parts[1];
        });
        sid = cookies.sid || '';
      }
      if (!sid && typeof localStorage !== 'undefined') {
        sid = localStorage.getItem('sid') || '';
      }
      
      if (sid) {
        if (!db.sessions) db.sessions = [];
        const session = db.sessions.find((s: any) => s.id === sid && s.status === 'Active');
        if (session) {
          session.status = 'Revoked';
          writeClientAuditLog(db, session.userId, 'User Logout', 'System', `Session closed successfully: ${session.id}`);
        }
      }
      
      db.currentUser = null;
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem('sid');
      }
      if (typeof document !== 'undefined') {
        document.cookie = 'sid=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT;';
      }
      
      saveClientDb(db);
      responseData = { success: true };
    } 
    
    else if (pathname === '/api/auth/create-user') {
      const user = body as UserAccount;
      user.id = user.id || `USR${Date.now()}`;
      user.passwordHash = clientHashPassword('SWM2026!');
      db.allUsers.push(user);
      saveClientDb(db);
      responseData = { success: true, user };
    } 
    
    else if (pathname === '/api/auth/update-user-status') {
      const { userId, status: newStat } = body;
      const idx = db.allUsers.findIndex(u => u.id === userId);
      if (idx !== -1) {
        db.allUsers[idx].accountStatus = newStat;
        saveClientDb(db);
      }
      responseData = { success: true };
    } 
    
    else if (pathname === '/api/auth/update-user-role') {
      const { userId, role } = body;
      const idx = db.allUsers.findIndex(u => u.id === userId);
      if (idx !== -1) {
        db.allUsers[idx].role = role;
        saveClientDb(db);
      }
      responseData = { success: true };
    } 
    
    else if (pathname === '/api/auth/reset-password-admin') {
      const { userId, newPassword } = body;
      const idx = db.allUsers.findIndex(u => u.id === userId);
      if (idx !== -1) {
        db.allUsers[idx].passwordHash = clientHashPassword(newPassword || 'SWM2026!');
        saveClientDb(db);
      }
      responseData = { success: true, message: 'Password reset successfully' };
    } 
    
    else if (pathname === '/api/auth/delete-user') {
      const { userId } = body;
      db.allUsers = db.allUsers.filter(u => u.id !== userId);
      saveClientDb(db);
      responseData = { success: true };
    } 
    
    else if (pathname === '/api/auth/change-password-user') {
      const { oldPassword, newPassword } = body || {};
      const caller = getClientActiveUser(db);
      if (caller) {
        const oldHash = clientHashPassword(oldPassword);
        if (caller.passwordHash !== oldHash) {
          status = 401;
          responseData = { error: 'Current password is incorrect.' };
        } else {
          const userIdx = db.allUsers.findIndex(u => u.id === caller.id);
          if (userIdx !== -1) {
            db.allUsers[userIdx].passwordHash = clientHashPassword(newPassword);
            saveClientDb(db);
          }
          responseData = { success: true };
        }
      } else {
        status = 401;
        responseData = { error: 'Not authenticated' };
      }
    } 
    
    else if (pathname === '/api/auth/update-profile-user') {
      const { email, employeeName, avatarUrl } = body || {};
      const caller = getClientActiveUser(db);
      if (caller) {
        const userIdx = db.allUsers.findIndex(u => u.id === caller.id);
        if (userIdx !== -1) {
          if (email !== undefined) db.allUsers[userIdx].email = email;
          if (employeeName !== undefined) db.allUsers[userIdx].employeeName = employeeName;
          if (avatarUrl !== undefined) db.allUsers[userIdx].avatarUrl = avatarUrl;
          saveClientDb(db);
        }
        responseData = { success: true, user: userIdx !== -1 ? db.allUsers[userIdx] : caller };
      } else {
        status = 401;
        responseData = { error: 'Not authenticated' };
      }
    } 
    
    else if (pathname === '/api/auth/forgot-password') {
      responseData = { success: true, ticketId: `TK${Date.now().toString().slice(6)}`, message: 'Ticket logged successfully' };
    } 
    
    else if (pathname === '/api/auth/audit-logs') {
      responseData = db.auditLogs;
    } 
    
    else if (pathname === '/api/system/reset') {
      const curUser = db.currentUser;
      const seeded = getInitialClientDb();
      seeded.currentUser = curUser;
      saveClientDb(seeded);
      responseData = { success: true };
    } 
    
    else if (pathname === '/api/jobs/import-employees') {
      const { records } = body;
      records.forEach((rec: Employee) => {
        const idx = db.employees.findIndex(e => e.id.toUpperCase() === rec.id.toUpperCase());
        if (idx !== -1) {
          db.employees[idx] = { ...db.employees[idx], ...rec };
        } else {
          db.employees.push(rec);
        }
      });
      saveClientDb(db);
      responseData = { jobId: 'job_import' };
    } 
    
    else if (pathname.startsWith('/api/jobs/status/')) {
      responseData = { status: 'completed', progress: 100 };
    }

    else if (pathname === '/api/dashboard/kpis') {
      responseData = {
        totalEmployees: db.employees.length,
        attendanceToday: db.attendance.filter(a => a.date === db.systemDate && (a.status === 'Present' || a.status === 'Late')).length,
        activeLeaves: db.leaveRequests.filter(r => r.status === 'Approved').length,
        lineEfficiency: 82.4
      };
    }
  } catch (e: any) {
    status = 500;
    responseData = { error: e.message || 'Internal Simulation Exception' };
  }

  // Create standard fetch response
  const bodyStr = JSON.stringify(responseData);
  const response = new Response(bodyStr, {
    status,
    headers: { 'Content-Type': 'application/json' }
  });

  return response;
}
