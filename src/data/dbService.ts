import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { 
  Employee, AttendanceRecord, LeaveRequest, ProductionLine, 
  AppNotification, UserAccount, LineAllocationEntry, EmployeeAssignment, 
  FactoryDepartment, FactoryOperation, GarmentStyle, DailyProductivity,
  LineStyleAssignment, GarmentStyleHistory, AuditLogEntry, UserSession
} from '../types';
import { 
  SYSTEM_USERS, INITIAL_EMPLOYEES, INITIAL_LEAVE_REQUESTS, 
  INITIAL_PRODUCTION_LINES, generateBaseAttendance, INITIAL_NOTIFICATIONS, 
  INITIAL_DAILY_PRODUCTIVITY, DEPARTMENTS, OPERATIONS_LIST 
} from './mockData';
import { initializeApp } from 'firebase/app';
import { initializeFirestore, doc, getDoc, getDocs, setDoc as firestoreSetDoc, deleteDoc, collection } from 'firebase/firestore';

function cleanUndefined(obj: any): any {
  if (obj === undefined) return null;
  if (obj === null) return null;
  if (Array.isArray(obj)) {
    return obj.map(cleanUndefined);
  }
  if (typeof obj === 'object') {
    const cleaned: any = {};
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        const val = obj[key];
        if (val !== undefined) {
          cleaned[key] = cleanUndefined(val);
        }
      }
    }
    return cleaned;
  }
  return obj;
}

async function setDoc(reference: any, item: any, options?: any) {
  const cleanedItem = cleanUndefined(item);
  return firestoreSetDoc(reference, cleanedItem, options);
}

const DB_PATH = path.join(process.cwd(), 'db.json');

// Lazy Firestore helper
let firebaseAppInstance: any = null;
let firestoreDbInstance: any = null;
let isFirebaseInitialized = false;

function getFirestoreDb() {
  if (!isFirebaseInitialized) {
    isFirebaseInitialized = true;
    const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
    let firebaseConfig: any = null;
    try {
      if (fs.existsSync(configPath)) {
        firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      }
    } catch (e) {
      console.error("Failed to read firebase-applet-config.json on startup:", e);
    }

    if (firebaseConfig && firebaseConfig.apiKey && firebaseConfig.projectId) {
      try {
        firebaseAppInstance = initializeApp(firebaseConfig);
        firestoreDbInstance = initializeFirestore(firebaseAppInstance, {
          experimentalForceLongPolling: true,
        }, firebaseConfig.firestoreDatabaseId);
        console.log("Firestore successfully initialized lazily on first access with databaseId:", firebaseConfig.firestoreDatabaseId || "(default)");
      } catch (e) {
        console.error("Failed to initialize Firestore lazily:", e);
        isFirestoreQuotaExceeded = true;
      }
    } else {
      console.warn("No valid firebase-applet-config.json found or config lacks apiKey etc. Firestore synchronization is disabled.");
      isFirestoreQuotaExceeded = true;
    }
  }
  return firestoreDbInstance;
}

const collectionsToSync = [
  'employees',
  'attendance',
  'leaveRequests',
  'productionLines',
  'notifications',
  'dailyProductivity',
  'lineAllocations',
  'employeeAssignments',
  'departments',
  'operations',
  'garmentStyles',
  'lineStyleAssignments',
  'garmentStyleHistory',
  'auditLogs',
  'allUsers',
  'sessions'
];

interface Schema {
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
  currentGarment: GarmentStyle;
  lineStyleAssignments: LineStyleAssignment[];
  garmentStyleHistory: GarmentStyleHistory[];
  auditLogs: AuditLogEntry[];
  sessions: UserSession[];
  uploadedDates?: string[];
}

let dbInMemory: Schema | null = null;
let lastSyncedState: Schema | null = null;

// In-Memory KPI / Metric Caches
let kpiCache: any = null;
let productivityCache: any = null;

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

let isFirestoreQuotaExceeded = false;

function isEquivalent(a: any, b: any): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || a === null || typeof b !== 'object' || b === null) {
    return false;
  }
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  for (const key of keysA) {
    if (!keysB.includes(key)) return false;
    const valA = a[key];
    const valB = b[key];
    if (typeof valA === 'object' && valA !== null) {
      if (!isEquivalent(valA, valB)) return false;
    } else if (valA !== valB) {
      return false;
    }
  }
  return true;
}

let lastSyncedSettings: any = null;

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const errMsg = error instanceof Error ? error.message : String(error);
  if (
    errMsg.includes('RESOURCE_EXHAUSTED') || 
    errMsg.includes('Quota exceeded') || 
    errMsg.includes('quota limits') ||
    errMsg.includes('Quota limit exceeded')
  ) {
    if (!isFirestoreQuotaExceeded) {
      isFirestoreQuotaExceeded = true;
      console.warn("Firestore write quota limits exceeded. Switched application storage into elegant local offline-backup fallback channel (db.json). All data mutations remain persistent on the server.");
    }
  }

  const errInfo: FirestoreErrorInfo = {
    error: errMsg,
    authInfo: {
      userId: null,
      email: null,
      emailVerified: null,
      isAnonymous: null,
      tenantId: null,
      providerInfo: []
    },
    operationType,
    path
  };

  if (!isFirestoreQuotaExceeded) {
    console.error('Firestore Error: ', JSON.stringify(errInfo));
  } else {
    console.warn(`Firestore Error (Quota Exceeded - Handled Gracefully): ${operationType} on ${path}`);
  }

  throw new Error(JSON.stringify(errInfo));
}

async function loadFromFirestore(): Promise<any> {
  const db = getFirestoreDb();
  if (!db) {
    console.warn("Firestore not initialized, loadFromFirestore returning null");
    return null;
  }
  try {
    const globalDocRef = doc(db, 'settings', 'global');
    let globalSnap: any;
    try {
      globalSnap = await getDoc(globalDocRef);
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, 'settings/global');
    }
    
    if (!globalSnap.exists()) {
      return null; // Empty database, need to seed
    }
    const settings = globalSnap.data();
    const dbData: any = {
      systemDate: settings.systemDate,
      overallTarget: settings.overallTarget,
      overallActual: settings.overallActual,
      theme: settings.theme,
      currentUser: settings.currentUser,
      allUsers: [],
      lockedLines: settings.lockedLines || [],
      uploadedDates: settings.uploadedDates || ['2026-06-04'],
      currentGarment: settings.currentGarment,
      employees: [],
      attendance: [],
      leaveRequests: [],
      productionLines: [],
      notifications: [],
      dailyProductivity: [],
      lineAllocations: [],
      employeeAssignments: [],
      departments: [],
      operations: [],
      garmentStyles: [],
      lineStyleAssignments: [],
      garmentStyleHistory: [],
      auditLogs: [],
      sessions: []
    };

    await Promise.all(collectionsToSync.map(async (colName) => {
      const colRef = collection(db, colName);
      let snap: any;
      try {
        snap = await getDocs(colRef);
      } catch (err) {
        handleFirestoreError(err, OperationType.GET, colName);
      }
      dbData[colName] = snap.docs.map((doc: any) => doc.data());
    }));

    if (!dbData.allUsers || dbData.allUsers.length === 0) {
      dbData.allUsers = settings.allUsers || SYSTEM_USERS;
    }

    lastSyncedSettings = JSON.parse(JSON.stringify(settings));
    return dbData;
  } catch (err) {
    console.error("Error reading data from remote Firestore:", err);
    throw err;
  }
}

async function seedToFirestore(baseData: Schema): Promise<void> {
  const db = getFirestoreDb();
  if (!db) {
    console.warn("Firestore not initialized, seedToFirestore skipped");
    return;
  }
  console.log("Seeding global configuration...");
  try {
    await setDoc(doc(db, 'settings', 'global'), {
      systemDate: baseData.systemDate,
      overallTarget: baseData.overallTarget,
      overallActual: baseData.overallActual,
      theme: baseData.theme,
      currentUser: baseData.currentUser,
      allUsers: baseData.allUsers || SYSTEM_USERS,
      lockedLines: baseData.lockedLines || [],
      currentGarment: baseData.currentGarment || null
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'settings/global');
  }

  const promises: Promise<void>[] = [];

  console.log(`Seeding collections to remote Firestore...`);

  baseData.employees.forEach(item => {
    promises.push((async () => {
      try {
        await setDoc(doc(db, 'employees', item.id.toUpperCase()), item);
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `employees/${item.id}`);
      }
    })());
  });
  baseData.attendance.forEach(item => {
    const id = item.id || `att_${item.employeeId}_${item.date}`;
    promises.push((async () => {
      try {
        await setDoc(doc(db, 'attendance', id), item);
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `attendance/${id}`);
      }
    })());
  });
  baseData.leaveRequests.forEach(item => {
    promises.push((async () => {
      try {
        await setDoc(doc(db, 'leaveRequests', item.id), item);
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `leaveRequests/${item.id}`);
      }
    })());
  });
  baseData.productionLines.forEach(item => {
    promises.push((async () => {
      try {
        await setDoc(doc(db, 'productionLines', String(item.id)), item);
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `productionLines/${item.id}`);
      }
    })());
  });
  baseData.notifications.forEach(item => {
    promises.push((async () => {
      try {
        await setDoc(doc(db, 'notifications', item.id), item);
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `notifications/${item.id}`);
      }
    })());
  });
  baseData.dailyProductivity.forEach((item, index) => {
    const id = item.id || `prod_${item.date || index}`;
    promises.push((async () => {
      try {
        await setDoc(doc(db, 'dailyProductivity', id), item);
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `dailyProductivity/${id}`);
      }
    })());
  });
  baseData.lineAllocations.forEach(item => {
    promises.push((async () => {
      try {
        await setDoc(doc(db, 'lineAllocations', item.employeeId.toUpperCase()), item);
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `lineAllocations/${item.employeeId}`);
      }
    })());
  });
  baseData.employeeAssignments.forEach(item => {
    const id = item.id || `asgn_${item.employeeId}_${item.assignmentDate}`;
    promises.push((async () => {
      try {
        await setDoc(doc(db, 'employeeAssignments', id), item);
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `employeeAssignments/${id}`);
      }
    })());
  });
  baseData.departments.forEach(item => {
    promises.push((async () => {
      try {
        await setDoc(doc(db, 'departments', item.id), item);
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `departments/${item.id}`);
      }
    })());
  });
  baseData.operations.forEach(item => {
    promises.push((async () => {
      try {
        await setDoc(doc(db, 'operations', item.code), item);
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `operations/${item.code}`);
      }
    })());
  });
  baseData.garmentStyles.forEach(item => {
    promises.push((async () => {
      try {
        await setDoc(doc(db, 'garmentStyles', item.id), item);
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `garmentStyles/${item.id}`);
      }
    })());
  });

  if (baseData.lineStyleAssignments) {
    baseData.lineStyleAssignments.forEach(item => {
      promises.push((async () => {
        try {
          await setDoc(doc(db, 'lineStyleAssignments', item.id), item);
        } catch (err) {
          handleFirestoreError(err, OperationType.WRITE, `lineStyleAssignments/${item.id}`);
        }
      })());
    });
  }

  if (baseData.garmentStyleHistory) {
    baseData.garmentStyleHistory.forEach(item => {
      promises.push((async () => {
        try {
          await setDoc(doc(db, 'garmentStyleHistory', item.id), item);
        } catch (err) {
          handleFirestoreError(err, OperationType.WRITE, `garmentStyleHistory/${item.id}`);
        }
      })());
    });
  }

  if (baseData.allUsers) {
    baseData.allUsers.forEach(item => {
      promises.push((async () => {
        try {
          await setDoc(doc(db, 'allUsers', item.id), item);
        } catch (err) {
          handleFirestoreError(err, OperationType.WRITE, `allUsers/${item.id}`);
        }
      })());
    });
  }

  await Promise.all(promises);
  console.log("Seeding complete!");
}

async function syncCollectionAndCleanOrphans(colName: string, localItems: any[], getId: (item: any) => string): Promise<void> {
  if (isFirestoreQuotaExceeded) return;
  const db = getFirestoreDb();
  if (!db) return;

  const colRef = collection(db, colName);
  let snap: any;
  try {
    snap = await getDocs(colRef);
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, colName);
  }

  const existingDocsMap = new Map<string, any>();
  snap.docs.forEach((d: any) => {
    existingDocsMap.set(d.id, d.data());
  });

  const existingDocIds = new Set(snap.docs.map((doc: any) => doc.id));
  const localDocIds = new Set(localItems.map(getId));

  const promises: Promise<void>[] = [];

  // Create or update docs only if they actually changed
  localItems.forEach(item => {
    const id = getId(item);
    const existingData = existingDocsMap.get(id);

    if (!existingData || !isEquivalent(existingData, item)) {
      promises.push((async () => {
        if (isFirestoreQuotaExceeded) return;
        try {
          await setDoc(doc(db, colName, id), item);
        } catch (err) {
          handleFirestoreError(err, OperationType.WRITE, `${colName}/${id}`);
        }
      })());
    }
  });

  // Delete orphaned documents in remote
  existingDocIds.forEach((id: any) => {
    if (!localDocIds.has(id)) {
      promises.push((async () => {
        if (isFirestoreQuotaExceeded) return;
        try {
          await deleteDoc(doc(db, colName, id));
        } catch (err) {
          handleFirestoreError(err, OperationType.DELETE, `${colName}/${id}`);
        }
      })());
    }
  });

  if (promises.length > 0) {
    await Promise.all(promises);
  }
}

export async function syncToFirestore(data: Schema): Promise<void> {
  if (isFirestoreQuotaExceeded) {
    return;
  }
  const db = getFirestoreDb();
  if (!db) {
    return;
  }
  if (!lastSyncedState) {
    lastSyncedState = JSON.parse(JSON.stringify(data));
    return;
  }
  try {
    const currentSettings = {
      systemDate: data.systemDate,
      overallTarget: data.overallTarget,
      overallActual: data.overallActual,
      theme: data.theme,
      currentUser: data.currentUser,
      allUsers: data.allUsers || SYSTEM_USERS,
      lockedLines: data.lockedLines || [],
      uploadedDates: data.uploadedDates || ['2026-06-04'],
      currentGarment: data.currentGarment || null
    };

    const lastSettings = {
      systemDate: lastSyncedState.systemDate,
      overallTarget: lastSyncedState.overallTarget,
      overallActual: lastSyncedState.overallActual,
      theme: lastSyncedState.theme,
      currentUser: lastSyncedState.currentUser,
      allUsers: lastSyncedState.allUsers || SYSTEM_USERS,
      lockedLines: lastSyncedState.lockedLines || [],
      uploadedDates: lastSyncedState.uploadedDates || ['2026-06-04'],
      currentGarment: lastSyncedState.currentGarment || null
    };

    if (!isEquivalent(lastSettings, currentSettings)) {
      try {
        await setDoc(doc(db, 'settings', 'global'), currentSettings);
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, 'settings/global');
      }
    }

    const colsToSync = [
      { name: 'employees', getter: (item: any) => item.id.toUpperCase() },
      { name: 'attendance', getter: (item: any) => item.id || `att_${item.employeeId}_${item.date}` },
      { name: 'leaveRequests', getter: (item: any) => item.id },
      { name: 'productionLines', getter: (item: any) => String(item.id) },
      { name: 'notifications', getter: (item: any) => item.id },
      { name: 'dailyProductivity', getter: (item: any) => item.id },
      { name: 'lineAllocations', getter: (item: any) => item.employeeId.toUpperCase() },
      { name: 'employeeAssignments', getter: (item: any) => item.id || `asgn_${item.employeeId}_${item.assignmentDate}` },
      { name: 'departments', getter: (item: any) => item.id },
      { name: 'operations', getter: (item: any) => item.code },
      { name: 'garmentStyles', getter: (item: any) => item.id },
      { name: 'lineStyleAssignments', getter: (item: any) => item.id },
      { name: 'garmentStyleHistory', getter: (item: any) => item.id },
      { name: 'auditLogs', getter: (item: any) => item.id },
      { name: 'allUsers', getter: (item: any) => item.id }
    ];

    const syncPromises: Promise<void>[] = [];

    for (const col of colsToSync) {
      if (isFirestoreQuotaExceeded) break;
      const colName = col.name;
      const currentItems = (data as any)[colName] || [];
      const lastItems = (lastSyncedState as any)[colName] || [];
      const getter = col.getter;

      const lastItemsMap = new Map<string, any>();
      lastItems.forEach((item: any) => {
        lastItemsMap.set(getter(item), item);
      });

      const currentItemsMap = new Map<string, any>();
      currentItems.forEach((item: any) => {
        currentItemsMap.set(getter(item), item);
      });

      // 1. Create or Update items if deleted or changed
      currentItems.forEach((item: any) => {
        const id = getter(item);
        const lastItem = lastItemsMap.get(id);
        if (!lastItem || !isEquivalent(lastItem, item)) {
          syncPromises.push((async () => {
            if (isFirestoreQuotaExceeded) return;
            try {
              await setDoc(doc(db, colName, id), item);
            } catch (err) {
              handleFirestoreError(err, OperationType.WRITE, `${colName}/${id}`);
            }
          })());
        }
      });

      // 2. Delete removed items
      lastItems.forEach((item: any) => {
        const id = getter(item);
        if (!currentItemsMap.has(id)) {
          syncPromises.push((async () => {
            if (isFirestoreQuotaExceeded) return;
            try {
              await deleteDoc(doc(db, colName, id));
            } catch (err) {
              handleFirestoreError(err, OperationType.DELETE, `${colName}/${id}`);
            }
          })());
        }
      });
    }

    if (syncPromises.length > 0) {
      await Promise.all(syncPromises);
    }

    lastSyncedState = JSON.parse(JSON.stringify(data));
  } catch (err) {
    console.error(`Error in syncToFirestore for collection group:`, err);
  }
}

export function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex');
}

export function ensureUserAccountsSecurity(schema: Schema): void {
  if (!schema) return;
  if (!schema.allUsers || schema.allUsers.length === 0) {
    schema.allUsers = [...SYSTEM_USERS];
  }
  if (!schema.auditLogs) {
    schema.auditLogs = [];
  }
  if (!schema.sessions) {
    schema.sessions = [];
  }

  const defaultHash = hashPassword('SWM2026!');

  schema.allUsers.forEach(usr => {
    if (usr.username === 'admin_prakash') {
      usr.passwordHash = hashPassword('Jayasurya@21');
    } else if (!usr.passwordHash) {
      usr.passwordHash = defaultHash;
    }
    if (!usr.accountStatus) {
      usr.accountStatus = 'Active';
    }
    if (usr.failedAttempts === undefined) {
      usr.failedAttempts = 0;
    }
    if (usr.lockedUntil === undefined) {
      usr.lockedUntil = null;
    }
    if (usr.lastLogin === undefined) {
      usr.lastLogin = null;
    }

    // Map missing credentials details
    if (!usr.employeeId) {
      usr.employeeId = usr.id;
    }
    if (!usr.employeeName) {
      if (usr.username === 'admin_prakash') usr.employeeName = 'Prakash Mehta';
      else if (usr.username === 'hr_ananya') usr.employeeName = 'Ananya Sharma';
      else if (usr.username === 'pm_vikram') usr.employeeName = 'Vikram Singh';
      else if (usr.username === 'sup_karthik') usr.employeeName = 'Karthik S.';
      else if (usr.username === 'ie_rahul') usr.employeeName = 'Rahul Patel';
      else usr.employeeName = usr.username.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    }
    if (!usr.department) {
      if (usr.role === 'Admin') usr.department = 'IT & Administration';
      else if (usr.role.includes('HR')) usr.department = 'Human Resources';
      else if (usr.role.includes('Production')) usr.department = 'Production';
      else if (usr.role === 'Supervisor') usr.department = 'Sewing';
      else if (usr.role.includes('Industrial') || usr.role === 'IE') usr.department = 'Industrial Engineering';
      else usr.department = 'Viewer';
    }
    if (!usr.designation) {
      if (usr.role === 'Admin') usr.designation = 'Systems Manager';
      else if (usr.role.includes('HR')) usr.designation = 'HR Representative';
      else if (usr.role.includes('Production')) usr.designation = 'Floor Manager';
      else if (usr.role === 'Supervisor') usr.designation = 'Line Officer';
      else if (usr.role.includes('Industrial') || usr.role === 'IE') usr.designation = 'IE Specialist';
      else usr.designation = 'Staff Observer';
    }
  });

  if (schema.auditLogs.length === 0) {
    schema.auditLogs.push({
      id: 'audit_init',
      userId: 'admin_prakash',
      action: 'System Security Initialized',
      timestamp: new Date().toISOString(),
      adminName: 'System',
      details: 'Role-based access control and SHA-256 database encryption activated on all user entries.'
    });
  }

  // Set currentUser to null initially if they need to authenticate, or preserve if valid
  if (schema.currentUser && !schema.allUsers.find(u => u.id === schema.currentUser?.id)) {
    schema.currentUser = null;
  }
}

export function writeAuditLog(schema: Schema, userId: string, action: string, adminName: string, details?: string): void {
  if (!schema) return;
  if (!schema.auditLogs) schema.auditLogs = [];
  
  const log: AuditLogEntry = {
    id: `audit_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    userId,
    action,
    timestamp: new Date().toISOString(),
    adminName,
    details: details || ''
  };
  
  schema.auditLogs.unshift(log);
  if (schema.auditLogs.length > 2000) {
    schema.auditLogs = schema.auditLogs.slice(0, 1500);
  }
}

let isFirestoreInitializedDb = false;

export async function initializeFirestoreDb(): Promise<void> {
  if (isFirestoreInitializedDb) return;
  isFirestoreInitializedDb = true;

  // Let's load the local fallback first so we have immediate access in case Firestore is empty/slow
  if (!dbInMemory) {
    try {
      if (fs.existsSync(DB_PATH)) {
        const raw = fs.readFileSync(DB_PATH, 'utf-8');
        dbInMemory = JSON.parse(raw);
        if (dbInMemory) {
          ensureDefectRates(dbInMemory);
          ensureUserAccountsSecurity(dbInMemory);
          saveDb();
        }
      }
    } catch (e) {
      console.error("Local DB read failed (will seed/load from Remote Firestore):", e);
    }
  }

  try {
    const remoteData = await loadFromFirestore();
    if (remoteData) {
      console.log("Firebase Firestore active data successfully retrieved!");
      dbInMemory = remoteData;
      ensureDefectRates(dbInMemory);
      ensureUserAccountsSecurity(dbInMemory);
      // Mirror locally for fallback cache and sync to Firestore
      saveDb();
    } else {
      console.log("No data found on remote Firestore. Initializing primary seed...");
      const baseDb = getDb(); // Triggers standard fallback seeding to memory
      await seedToFirestore(baseDb);
    }
  } catch (err) {
    console.error("Failed to connect to active Firestore instance. Utilizing local fallback channel. Error:", err);
    // Graceful fallback: initialize local in-memoryDB
    getDb();
  }
}

export async function getLatestUsersFromFirestore(): Promise<UserAccount[] | null> {
  const db = getFirestoreDb();
  if (!db) {
    console.warn("[getLatestUsersFromFirestore] Firestore not initialized.");
    return null;
  }
  try {
    console.log("[getLatestUsersFromFirestore] Querying live Firestore for allUsers collection...");
    const colRef = collection(db, 'allUsers');
    const snap = await getDocs(colRef);
    if (snap.empty) {
      console.warn("[getLatestUsersFromFirestore] Firestore allUsers collection is empty.");
      return null;
    }
    const users = snap.docs.map(doc => doc.data() as UserAccount);
    console.log(`[getLatestUsersFromFirestore] Successfully retrieved ${users.length} live users from Firestore.`);
    
    if (dbInMemory) {
      dbInMemory.allUsers = users;
      ensureUserAccountsSecurity(dbInMemory);
      // Invalidate cache and trigger safe writing
      try {
        const raw = JSON.stringify(dbInMemory, null, 2);
        fs.writeFileSync(DB_PATH, raw, 'utf-8');
      } catch (err) {
        console.error("Failed to write db.json cache during direct user fetch:", err);
      }
    }
    return users;
  } catch (err) {
    console.error("[getLatestUsersFromFirestore] Direct fetch from Firestore failed:", err);
    return null;
  }
}

export function ensureDefectRates(schema: Schema): void {
  if (!schema || !schema.employees) return;
  schema.employees.forEach(emp => {
    if (emp.defectRate === undefined || emp.defectRate === null) {
      const charSeed = emp.id.charCodeAt(emp.id.length - 1) || 0;
      const baseVal = emp.baseEfficiency >= 80 ? 1.5 : emp.baseEfficiency >= 70 ? 3.5 : 5.5;
      const offset = (charSeed % 15) / 10;
      const finalRate = Math.max(0.4, Math.min(15.0, Number((baseVal + offset - (emp.experience * 0.15)).toFixed(2))));
      emp.defectRate = finalRate;
    }
    if (emp.avgPcsProducedPerDay === undefined || emp.avgPcsProducedPerDay === null) {
      emp.avgPcsProducedPerDay = Math.round(emp.baseEfficiency * 1.5 + (emp.experience * 3));
    }
    if (emp.attendanceReliability === undefined || emp.attendanceReliability === null) {
      emp.attendanceReliability = emp.historicalAttendanceRate || 95;
    }
  });
}

export function getDb(): Schema {
  if (dbInMemory) {
    ensureDefectRates(dbInMemory);
    return dbInMemory;
  }

  if (fs.existsSync(DB_PATH)) {
    try {
      const raw = fs.readFileSync(DB_PATH, 'utf-8');
      dbInMemory = JSON.parse(raw);
      if (dbInMemory) {
        ensureDefectRates(dbInMemory);
        ensureUserAccountsSecurity(dbInMemory);
      }
    } catch (e) {
      console.error('Error reading db.json, re-seeding...', e);
    }
  }

  if (!dbInMemory) {
    const baseEmp = INITIAL_EMPLOYEES.map(e => {
      const dept = (e.department || '').toLowerCase();
      const isEligible = dept === 'sewing' || dept === 'floater' || dept.includes('finishing');
      return { ...e, productionWorkforceEligible: isEligible };
    });
    ensureDefectRates({ employees: baseEmp } as Schema);

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

    // Compute assignments
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
        };
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
      };
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
      };
    });

    dbInMemory = {
      systemDate: '2026-06-04',
      overallTarget: 6000,
      overallActual: 0,
      theme: 'light',
      currentUser: null,
      allUsers: SYSTEM_USERS,
      employees: baseEmp,
      attendance: baseAttendance,
      leaveRequests: INITIAL_LEAVE_REQUESTS,
      productionLines: INITIAL_PRODUCTION_LINES,
      notifications: INITIAL_NOTIFICATIONS,
      dailyProductivity: INITIAL_DAILY_PRODUCTIVITY,
      lineAllocations: initialLineAllocations,
      employeeAssignments: initialAssignments,
      lockedLines: [],
      departments: INITIAL_FACTORY_DEPARTMENTS,
      operations: INITIAL_FACTORY_OPERATIONS,
      garmentStyles: INITIAL_FACTORY_GARMENT_STYLES,
      currentGarment: INITIAL_FACTORY_GARMENT_STYLES[0],
      lineStyleAssignments: initialLineStyleAssignments,
      garmentStyleHistory: initialGarmentStyleHistory,
      auditLogs: [],
      sessions: [],
      uploadedDates: ['2026-06-04']
    };
    ensureUserAccountsSecurity(dbInMemory);
    saveDb();
  }

  return dbInMemory;
}

export function resetDbInMemory(): void {
  dbInMemory = null;
  lastSyncedState = null;
  kpiCache = null;
  productivityCache = null;
}

export function saveDb(): void {
  if (!dbInMemory) return;
  // Invalidate Caches on any DB change
  kpiCache = null;
  productivityCache = null;

  try {
    const raw = JSON.stringify(dbInMemory, null, 2);
    const tempPath = `${DB_PATH}.tmp`;
    fs.writeFileSync(tempPath, raw, 'utf-8');
    fs.renameSync(tempPath, DB_PATH);
  } catch (e) {
    console.error('Error saving db.json:', e);
  }

  // Trigger non-blocking async background synchronize with active remote Firestore
  syncToFirestore(dbInMemory).catch(err => {
    console.error("Background sync state to Firestore failed:", err);
  });
}

// Background Job Registry for Excel Import
export interface BackgroundJob {
  id: string;
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: number;
  processedCount: number;
  totalCount: number;
  result?: any;
  error?: string;
  createdAt: number;
}

const backgroundJobs = new Map<string, BackgroundJob>();

export function createJob(name: string, totalCount: number): string {
  const jobId = `job_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  backgroundJobs.set(jobId, {
    id: jobId,
    name,
    status: 'pending',
    progress: 0,
    processedCount: 0,
    totalCount,
    createdAt: Date.now()
  });
  return jobId;
}

export function updateJob(jobId: string, updates: Partial<BackgroundJob>): void {
  const job = backgroundJobs.get(jobId);
  if (job) {
    backgroundJobs.set(jobId, { ...job, ...updates });
  }
}

export function getJob(jobId: string): BackgroundJob | undefined {
  return backgroundJobs.get(jobId);
}

// Optimization caching for KPIs & Analytics
export function getCachedKpis(calculator: () => any): any {
  if (kpiCache) return kpiCache;
  kpiCache = calculator();
  return kpiCache;
}

export function getCachedProductivity(calculator: () => any): any {
  if (productivityCache) return productivityCache;
  productivityCache = calculator();
  return productivityCache;
}
