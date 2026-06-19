import express from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import { getDb, saveDb, createJob, updateJob, getJob, getCachedKpis, getCachedProductivity, initializeFirestoreDb, resetDbInMemory, getLatestUsersFromFirestore, syncServerFromFirestoreIfNeeded } from './src/data/dbService.js';
import { Employee, AttendanceRecord, LeaveRequest, ProductionLine, AppNotification, LineAllocationEntry } from './src/types';

// Let's resolve ESM-like paths for server in TS context
const __dirname = path.resolve();

const app = express();
const PORT = 3000;

// Increase limit to handle bulk imports
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Pre-synchronize backend state with Firestore on incoming requests
app.use('/api', async (req, res, next) => {
  try {
    await syncServerFromFirestoreIfNeeded();
  } catch (err) {
    console.error("API pre-sync error:", err);
  }
  next();
});

// Helper to write notifications
function logNotification(type: 'Alert' | 'Leave' | 'Milestone' | 'Shortage', title: string, message: string) {
  const db = getDb();
  const notif = {
    id: `notif_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    type,
    title,
    message,
    read: false,
    timestamp: new Date().toISOString()
  };
  db.notifications.unshift(notif);
  // Keep only last 100
  if (db.notifications.length > 100) {
    db.notifications = db.notifications.slice(0, 100);
  }
}

function ensureMockDataForDate(db: any, targetDate: string) {
  if (!targetDate) return;
  const seedDate = '2026-06-04';
  if (targetDate === seedDate) return;

  // 1. Employee Assignments
  const existingAssignments = db.employeeAssignments.filter((a: any) => a.assignmentDate === targetDate);
  if (existingAssignments.length === 0) {
    const seedAssignments = db.employeeAssignments.filter((a: any) => a.assignmentDate === seedDate);
    seedAssignments.forEach((a: any) => {
      db.employeeAssignments.push({
        ...a,
        id: `asgn_${a.employeeId}_${targetDate}`,
        assignmentDate: targetDate
      });
    });
  }

  // 2. Attendance Records
  const existingAttendance = db.attendance.filter((r: any) => r.date === targetDate);
  if (existingAttendance.length === 0) {
    const seedAttendance = db.attendance.filter((r: any) => r.date === seedDate);
    seedAttendance.forEach((r: any) => {
      db.attendance.push({
        id: `att_${r.employeeId}_${targetDate}`,
        employeeId: r.employeeId,
        date: targetDate,
        status: 'Absent',
        markedAt: `${targetDate}T08:00:00Z`,
        markedBy: 'System',
        method: 'Manual'
      });
    });
  }

  // 3. Line Style Assignments
  const existingLsa = db.lineStyleAssignments.filter((l: any) => l.effectiveDate === targetDate);
  if (existingLsa.length === 0) {
    const seedLsa = db.lineStyleAssignments.filter((l: any) => l.effectiveDate === seedDate);
    seedLsa.forEach((l: any) => {
      db.lineStyleAssignments.push({
        ...l,
        id: `lsa_${l.lineNumber}_${targetDate}`,
        effectiveDate: targetDate,
        assignedAt: l.assignedAt ? l.assignedAt.replace(seedDate, targetDate) : `${targetDate}T08:00:00Z`
      });
    });
  }

  // 4. Garment Style History
  const existingGsh = db.garmentStyleHistory.filter((g: any) => g.changeDate === targetDate);
  if (existingGsh.length === 0) {
    const seedGsh = db.garmentStyleHistory.filter((g: any) => g.changeDate === seedDate);
    seedGsh.forEach((g: any) => {
      db.garmentStyleHistory.push({
        ...g,
        id: `gsh_${g.lineNumber}_${targetDate}`,
        changeDate: targetDate
      });
    });
  }

  // Sanitize both existing and newly generated attendance records for non-seed dates
  sanitizeAttendanceRecords(db);
}

function getUploadedDates(db: any): string[] {
  if (!db.uploadedDates) {
    db.uploadedDates = ['2026-06-04'];
  }
  // Scan all existing attendance records to find dates containing manual or biometric entries that are not system-marked as Absent.
  if (db.attendance) {
    db.attendance.forEach((r: any) => {
      if (r.date && r.date !== '2026-06-04') {
        const isSelfUploadedOrMarked = 
          (r.markedBy && r.markedBy !== 'System' && r.markedBy !== 'hr_ananya') || 
          (r.status && r.status !== 'Absent' && r.markedBy !== 'System' && r.markedBy !== 'hr_ananya');
        if (isSelfUploadedOrMarked) {
          if (!db.uploadedDates.includes(r.date)) {
            db.uploadedDates.push(r.date);
          }
        }
      }
    });
  }
  return db.uploadedDates;
}

function sanitizeAttendanceRecords(db: any) {
  if (!db || !db.attendance) return;
  const uploaded = getUploadedDates(db);
  let modified = false;

  db.attendance.forEach((r: any) => {
    if (r.date && r.date !== '2026-06-04' && !uploaded.includes(r.date)) {
      if (r.status !== 'Absent' || r.checkInTime !== undefined || r.checkOutTime !== undefined) {
        r.status = 'Absent';
        delete r.checkInTime;
        delete r.checkOutTime;
        r.markedBy = 'System';
        r.markedAt = `${r.date}T08:00:00Z`;
        modified = true;
      }
    }
  });

  if (modified) {
    console.log('Sanitized auto-generated non-uploaded attendance records to Absent.');
    saveDb();
  }
}

// ==========================================
// 1. SETTINGS & SYSTEM STATE API
// ==========================================

app.get('/api/system/settings', (req, res) => {
  const db = getDb();
  if (db.systemDate) {
    ensureMockDataForDate(db, db.systemDate);
  }
  const sessionData = validateAndGetSessionUser(req);
  const currentUser = sessionData ? sessionData.user : null;
  res.json({
    systemDate: db.systemDate,
    overallTarget: db.overallTarget,
    overallActual: db.overallActual,
    theme: db.theme,
    currentUser,
    allUsers: db.allUsers,
    lockedLines: db.lockedLines || [],
    currentGarment: db.currentGarment
  });
});

app.post('/api/system/settings', (req, res) => {
  const db = getDb();
  const { systemDate, overallTarget, overallActual, theme, lockedLines, currentGarmentId } = req.body;

  if (systemDate !== undefined) {
    db.systemDate = systemDate;
    ensureMockDataForDate(db, systemDate);
  }
  if (overallTarget !== undefined) db.overallTarget = Number(overallTarget);
  if (overallActual !== undefined) db.overallActual = Number(overallActual);
  if (theme !== undefined) db.theme = theme;
  if (lockedLines !== undefined) db.lockedLines = lockedLines;
  if (currentGarmentId !== undefined) {
    const s = db.garmentStyles.find(g => g.id === currentGarmentId);
    if (s) {
      db.currentGarment = s;
    }
  }

  saveDb();
  
  const sessionData = validateAndGetSessionUser(req);
  const currentUser = sessionData ? sessionData.user : null;

  res.json({ success: true, settings: {
    systemDate: db.systemDate,
    overallTarget: db.overallTarget,
    overallActual: db.overallActual,
    theme: db.theme,
    currentUser,
    lockedLines: db.lockedLines,
    currentGarment: db.currentGarment
  }});
});

// ==========================================
// 2. EMPLOYEE MASTER API (PAGINATION, SEARCH, FILTERING)
// ==========================================

app.get('/api/employees', (req, res) => {
  const db = getDb();
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.max(1, parseInt(req.query.limit as string) || 25);
  const search = (req.query.search as string || '').toLowerCase().trim();
  const department = req.query.department as string || 'All';
  const skillCategory = req.query.skillCategory as string || 'All';

  // Apply searches & filtering directly in the database
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

  // Paginated Results page
  const total = filtered.length;
  const pages = Math.ceil(total / limit);
  const paginatedData = filtered.slice((page - 1) * limit, page * limit);

  // Fallback to default avatar image logic (pass photoUrl as-is from database)
  const responseData = paginatedData.map(emp => {
    return {
      ...emp,
      photoUrl: emp.photoUrl || ''
    };
  });

  res.json({
    data: responseData,
    total,
    page,
    limit,
    pages
  });
});

app.get('/api/employees/:id', (req, res) => {
  const db = getDb();
  const emp = db.employees.find(e => e.id.toUpperCase() === req.params.id.toUpperCase());
  if (!emp) {
    return res.status(404).json({ error: 'Employee not found' });
  }
  res.json(emp);
});

app.post('/api/employees', (req, res) => {
  const db = getDb();
  const emp: Employee = req.body;
  if (!emp.id || !emp.name) {
    return res.status(400).json({ error: 'Missing employee fields' });
  }

  // Prevent duplicate
  const exists = db.employees.some(e => e.id.toUpperCase() === emp.id.toUpperCase());
  if (exists) {
    return res.status(400).json({ error: 'Employee ID already exists' });
  }

  // Ensure eligibility defaults
  if (emp.productionWorkforceEligible === undefined) {
    const dept = (emp.department || '').toLowerCase();
    emp.productionWorkforceEligible = dept === 'sewing' || dept === 'floater';
  }

  db.employees.unshift(emp);
  saveDb();
  logNotification('Milestone', 'New Operator Registered', `${emp.name} (${emp.id}) has been added to the database.`);
  res.status(201).json(emp);
});

app.put('/api/employees/:id', (req, res) => {
  const db = getDb();
  const index = db.employees.findIndex(e => e.id.toUpperCase() === req.params.id.toUpperCase());
  if (index === -1) {
    return res.status(404).json({ error: 'Employee not found' });
  }

  const updated: Employee = { ...db.employees[index], ...req.body };
  db.employees[index] = updated;
  saveDb();
  res.json(updated);
});

app.delete('/api/employees/:id', (req, res) => {
  const db = getDb();
  const initialLen = db.employees.length;
  db.employees = db.employees.filter(e => e.id.toUpperCase() !== req.params.id.toUpperCase());
  
  if (db.employees.length === initialLen) {
    return res.status(404).json({ error: 'Employee not found' });
  }

  saveDb();
  res.json({ success: true });
});

app.post('/api/employees/bulk-update', (req, res) => {
  const db = getDb();
  const updates = req.body;

  if (!Array.isArray(updates)) {
    return res.status(400).json({ error: 'Payload must be an array of updates' });
  }

  updates.forEach((updatedEmp: any) => {
    const idx = db.employees.findIndex(e => e.id.toUpperCase() === updatedEmp.id.toUpperCase());
    if (idx !== -1) {
      db.employees[idx] = { ...db.employees[idx], ...updatedEmp };
    }
  });

  saveDb();
  res.json({ success: true, count: updates.length });
});

// ==========================================
// 3. ATTENDANCE RECORD API
// ==========================================

app.get('/api/attendance', (req, res) => {
  const db = getDb();
  const date = req.query.date as string;
  let records = db.attendance;

  if (date) {
    records = records.filter(r => r.date === date);
  }

  // Return list with lightweight employee reference
  res.json(records);
});

app.post('/api/attendance', (req, res) => {
  const db = getDb();
  const payload = req.body; // Can be single record or array

  if (Array.isArray(payload)) {
    // Bulk records ingest
    payload.forEach((newRec: AttendanceRecord) => {
      const idx = db.attendance.findIndex(r => r.employeeId.toUpperCase() === newRec.employeeId.toUpperCase() && r.date === newRec.date);
      if (idx !== -1) {
        db.attendance[idx] = { ...db.attendance[idx], ...newRec };
      } else {
        db.attendance.push(newRec);
      }
    });

    if (payload.length > 0 && payload[0].date) {
      const uDate = payload[0].date;
      if (!db.uploadedDates) db.uploadedDates = ['2026-06-04'];
      if (!db.uploadedDates.includes(uDate)) {
        db.uploadedDates.push(uDate);
      }
    }

    saveDb();
    logNotification('Milestone', 'Attendance Records Imported', `Processed ${payload.length} attendance updates in bulk.`);
    return res.json({ success: true, count: payload.length });
  } else {
    // Single update
    const { employeeId, date, status, method, markedBy } = payload;
    if (!employeeId || !date || !status) {
      return res.status(400).json({ error: 'Invalid attendance details' });
    }

    const idx = db.attendance.findIndex(r => r.employeeId.toUpperCase() === employeeId.toUpperCase() && r.date === date);
    const rec: AttendanceRecord = {
      id: idx !== -1 ? db.attendance[idx].id : `att_${employeeId}_${date}`,
      employeeId,
      date,
      status,
      method: method || 'Manual',
      markedBy: markedBy || 'System',
      markedAt: new Date().toISOString()
    };

    if (rec.status !== 'Absent') {
      if (!db.uploadedDates) db.uploadedDates = ['2026-06-04'];
      if (!db.uploadedDates.includes(date)) {
        db.uploadedDates.push(date);
      }
    }

    if (idx !== -1) {
      db.attendance[idx] = rec;
    } else {
      db.attendance.push(rec);
    }
    saveDb();
    res.json(rec);
  }
});

// ==========================================
// 4. LEAVE RECORDS API
// ==========================================

app.get('/api/leave-requests', (req, res) => {
  const db = getDb();
  res.json(db.leaveRequests);
});

app.post('/api/leave-requests', (req, res) => {
  const db = getDb();
  const reqData = req.body;
  if (!reqData.employeeId || !reqData.startDate || !reqData.endDate) {
    return res.status(400).json({ error: 'Invalid leave request form' });
  }

  const newRequest: LeaveRequest = {
    id: `leave_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    employeeId: reqData.employeeId,
    leaveType: reqData.leaveType || 'Casual',
    startDate: reqData.startDate,
    endDate: reqData.endDate,
    reason: reqData.reason || '',
    status: 'Pending',
    requestedDate: db.systemDate
  };

  db.leaveRequests.unshift(newRequest);
  saveDb();
  logNotification('Leave', 'New Leave Request', `Leave request generated for employee ${reqData.employeeId}.`);
  res.status(201).json(newRequest);
});

app.put('/api/leave-requests/:id', (req, res) => {
  const db = getDb();
  const idx = db.leaveRequests.findIndex(l => l.id === req.params.id);
  if (idx === -1) {
    return res.status(404).json({ error: 'Leave request not found' });
  }

  const { status, remarks, approvedBySupervisor, approvedByHR } = req.body;
  db.leaveRequests[idx] = {
    ...db.leaveRequests[idx],
    status: status || db.leaveRequests[idx].status,
    comments: remarks || db.leaveRequests[idx].comments,
    approvedBySupervisor: approvedBySupervisor || db.leaveRequests[idx].approvedBySupervisor,
    approvedByHR: approvedByHR || db.leaveRequests[idx].approvedByHR
  };

  // If approved, dynamically update leaves records & status in DB
  const leave = db.leaveRequests[idx];
  if (status === 'Approved') {
    // If leave spans today, we add attendance record as 'Leave'
    const today = db.systemDate;
    if (today >= leave.startDate && today <= leave.endDate) {
      const aIdx = db.attendance.findIndex(a => a.employeeId.toUpperCase() === leave.employeeId.toUpperCase() && a.date === today);
      const leaveAttendance: AttendanceRecord = {
        id: aIdx !== -1 ? db.attendance[aIdx].id : `att_${leave.employeeId}_${today}`,
        employeeId: leave.employeeId,
        date: today,
        status: 'Leave',
        method: 'Manual',
        markedBy: 'Leave Approver',
        markedAt: new Date().toISOString()
      };
      if (aIdx !== -1) {
        db.attendance[aIdx] = leaveAttendance;
      } else {
        db.attendance.push(leaveAttendance);
      }
    }
  }

  saveDb();
  res.json(db.leaveRequests[idx]);
});

// ==========================================
// 5. PRODUCTION LINES CONFIG API
// ==========================================

app.get('/api/production-lines', (req, res) => {
  const db = getDb();
  res.json(db.productionLines);
});

app.post('/api/production-lines', (req, res) => {
  const db = getDb();
  const line: ProductionLine = req.body;
  if (line.id === undefined) {
    return res.status(400).json({ error: 'Production Line must have an ID' });
  }

  const idx = db.productionLines.findIndex(l => l.id === line.id);
  if (idx !== -1) {
    db.productionLines[idx] = { ...db.productionLines[idx], ...line };
  } else {
    db.productionLines.push(line);
  }
  saveDb();
  res.json(line);
});

app.delete('/api/production-lines/:id', (req, res) => {
  const db = getDb();
  const idNum = parseInt(req.params.id);
  db.productionLines = db.productionLines.filter(l => l.id !== idNum);
  saveDb();
  res.json({ success: true });
});

// ==========================================
// 6. FACTORY DATA LIBRARIES
// ==========================================

app.get('/api/departments', (req, res) => {
  const db = getDb();
  res.json(db.departments);
});

app.post('/api/departments', (req, res) => {
  const db = getDb();
  const dept = req.body;
  if (!dept.id || !dept.name) {
    return res.status(400).json({ error: 'Departments must have an ID and name' });
  }
  const idx = db.departments.findIndex(d => d.id === dept.id);
  if (idx !== -1) {
    db.departments[idx] = { ...db.departments[idx], ...dept };
  } else {
    db.departments.push(dept);
  }
  saveDb();
  res.json(dept);
});

app.put('/api/departments/:id', (req, res) => {
  const db = getDb();
  const idx = db.departments.findIndex(d => d.id === req.params.id);
  if (idx === -1) {
    return res.status(404).json({ error: 'Department not found' });
  }
  db.departments[idx] = { ...db.departments[idx], ...req.body };
  saveDb();
  res.json(db.departments[idx]);
});

app.delete('/api/departments/:id', (req, res) => {
  const db = getDb();
  db.departments = db.departments.filter(d => d.id !== req.params.id);
  saveDb();
  res.json({ success: true });
});

app.get('/api/operations', (req, res) => {
  const db = getDb();
  res.json(db.operations);
});

app.post('/api/operations', (req, res) => {
  const db = getDb();
  const op = req.body;
  if (!op.code || !op.name) {
    return res.status(400).json({ error: 'Operations must have a Code and Name' });
  }
  const idx = db.operations.findIndex(o => o.code === op.code);
  if (idx !== -1) {
    db.operations[idx] = { ...db.operations[idx], ...op };
  } else {
    db.operations.push(op);
  }
  saveDb();
  res.json(op);
});

app.put('/api/operations/:code', (req, res) => {
  const db = getDb();
  const idx = db.operations.findIndex(o => o.code === req.params.code);
  if (idx === -1) {
    return res.status(404).json({ error: 'Operation not found' });
  }
  db.operations[idx] = { ...db.operations[idx], ...req.body };
  saveDb();
  res.json(db.operations[idx]);
});

app.delete('/api/operations/:code', (req, res) => {
  const db = getDb();
  db.operations = db.operations.filter(o => o.code !== req.params.code);
  saveDb();
  res.json({ success: true });
});

// Garment Styles Bulletin Ingest & Config
app.get('/api/garment-styles', (req, res) => {
  const db = getDb();
  res.json(db.garmentStyles);
});

app.post('/api/garment-styles', (req, res) => {
  const db = getDb();
  const style = req.body;
  if (!style.id || !style.name) {
    return res.status(400).json({ error: 'Styles must have an ID and Name' });
  }

  const idx = db.garmentStyles.findIndex(g => g.id === style.id);
  if (idx !== -1) {
    db.garmentStyles[idx] = { ...db.garmentStyles[idx], ...style };
  } else {
    db.garmentStyles.push(style);
  }
  saveDb();
  res.json(style);
});

app.put('/api/garment-styles/:id', (req, res) => {
  const db = getDb();
  const idx = db.garmentStyles.findIndex(g => g.id === req.params.id);
  if (idx === -1) {
    return res.status(404).json({ error: 'Garment style not found' });
  }
  db.garmentStyles[idx] = { ...db.garmentStyles[idx], ...req.body };
  saveDb();
  res.json(db.garmentStyles[idx]);
});

app.delete('/api/garment-styles/:id', (req, res) => {
  const db = getDb();
  db.garmentStyles = db.garmentStyles.filter(g => g.id !== req.params.id);
  if (db.currentGarment && db.currentGarment.id === req.params.id) {
    db.currentGarment = db.garmentStyles.length > 0 ? db.garmentStyles[0] : null;
  }
  saveDb();
  res.json({ success: true, currentGarment: db.currentGarment });
});

// ==========================================
// 7. LINE ALLOCATIONS & ACTIVE ASSIGNMENTS
// ==========================================

app.get('/api/line-allocations', (req, res) => {
  const db = getDb();
  res.json(db.lineAllocations);
});

app.post('/api/line-allocations', (req, res) => {
  const db = getDb();
  const payload = req.body;

  if (Array.isArray(payload)) {
    payload.forEach((entry: LineAllocationEntry) => {
      if (!entry.employeeId) return;
      const idx = db.lineAllocations.findIndex(a => a.employeeId.toUpperCase() === entry.employeeId.toUpperCase());
      if (idx !== -1) {
        db.lineAllocations[idx] = { ...db.lineAllocations[idx], ...entry };
      } else {
        db.lineAllocations.push(entry);
      }

      // Keep employee record aligned
      const empIdx = db.employees.findIndex(e => e.id.toUpperCase() === entry.employeeId.toUpperCase());
      if (empIdx !== -1) {
        db.employees[empIdx].lineNumber = entry.assignedLine;
        db.employees[empIdx].operationAssignment = entry.assignedOperation;
        db.employees[empIdx].workforceAssignmentStatus = entry.assignmentStatus;
      }
    });
    saveDb();
    return res.json({ success: true, count: payload.length });
  } else {
    const entry: LineAllocationEntry = payload;
    if (!entry.employeeId) {
      return res.status(400).json({ error: 'Missing employee ID' });
    }

    const idx = db.lineAllocations.findIndex(a => a.employeeId.toUpperCase() === entry.employeeId.toUpperCase());
    if (idx !== -1) {
      db.lineAllocations[idx] = { ...db.lineAllocations[idx], ...entry };
    } else {
      db.lineAllocations.push(entry);
    }

    // Keep employee record aligned
    const empIdx = db.employees.findIndex(e => e.id.toUpperCase() === entry.employeeId.toUpperCase());
    if (empIdx !== -1) {
      db.employees[empIdx].lineNumber = entry.assignedLine;
      db.employees[empIdx].operationAssignment = entry.assignedOperation;
      db.employees[empIdx].workforceAssignmentStatus = entry.assignmentStatus;
    }

    saveDb();
    res.json({ success: true });
  }
});

// Active workforce deployment assignments
app.get('/api/employee-assignments', (req, res) => {
  const db = getDb();
  const date = req.query.date as string || db.systemDate;
  const assignments = db.employeeAssignments.filter(a => a.assignmentDate === date);
  res.json(assignments);
});

app.post('/api/employee-assignments', (req, res) => {
  const db = getDb();
  const { employeeId, line, operation, status, date, startTime, endTime, source } = req.body;
  const targetDate = date || db.systemDate;

  if (!employeeId) return res.status(400).json({ error: 'Missing Employee ID' });

  const sessionData = validateAndGetSessionUser(req);
  const assignedBy = sessionData?.user?.username || 'Admin';

  const idx = db.employeeAssignments.findIndex(a => a.employeeId.toUpperCase() === employeeId.toUpperCase() && a.assignmentDate === targetDate);
  const nextAss: any = {
    id: idx !== -1 ? db.employeeAssignments[idx].id : `asgn_${employeeId}_${targetDate}`,
    employeeId,
    assignmentDate: targetDate,
    assignedLine: line !== undefined ? Number(line) : 0,
    assignedOperation: operation || '',
    assignmentStatus: status || 'Assigned',
    startTime: startTime || '08:00',
    endTime: endTime || '17:00',
    assignedBy,
    availabilityFlag: status === 'Unassigned' || status === 'Available for Replacement',
    assignmentSource: source || 'Shift Supervisor Plan'
  };

  if (idx !== -1) {
    db.employeeAssignments[idx] = nextAss;
  } else {
    db.employeeAssignments.push(nextAss);
  }

  // Also update employee assignment status instantly in Employee Master
  const empIdx = db.employees.findIndex(e => e.id.toUpperCase() === employeeId.toUpperCase());
  if (empIdx !== -1) {
    db.employees[empIdx].workforceAssignmentStatus = status || 'Assigned';
    if (line !== undefined) db.employees[empIdx].lineNumber = Number(line);
    if (operation !== undefined) db.employees[empIdx].operationAssignment = operation;
  }

  // Also update corresponding line allocation entry so that the workforce layout is synchronized
  const lineAllocIdx = db.lineAllocations.findIndex(a => a.employeeId.toUpperCase() === employeeId.toUpperCase());
  if (lineAllocIdx !== -1) {
    if (line !== undefined) db.lineAllocations[lineAllocIdx].assignedLine = Number(line);
    if (operation !== undefined) db.lineAllocations[lineAllocIdx].assignedOperation = operation || '';
    if (status !== undefined) db.lineAllocations[lineAllocIdx].assignmentStatus = status || 'Assigned';
  } else {
    const matchedEmployee = db.employees.find(e => e.id.toUpperCase() === employeeId.toUpperCase());
    db.lineAllocations.push({
      employeeId: employeeId,
      employeeName: matchedEmployee ? matchedEmployee.name : 'Unknown Operator',
      department: matchedEmployee ? matchedEmployee.department : 'Sewing',
      assignedLine: line !== undefined ? Number(line) : 0,
      assignedOperation: operation || '',
      assignmentStatus: status || 'Assigned',
      remarks: 'Synchronized from direct allocation'
    });
  }

  saveDb();
  res.json(nextAss);
});

// ==========================================
// CENTRALIZED LINE STYLE ASSIGNMENT & HISTORY API
// ==========================================
app.get('/api/line-style-assignments', (req, res) => {
  const db = getDb();
  res.json(db.lineStyleAssignments || []);
});

app.get('/api/garment-style-history', (req, res) => {
  const db = getDb();
  res.json(db.garmentStyleHistory || []);
});

app.delete('/api/garment-style-history/:id', (req, res) => {
  const db = getDb();
  const sessionData = validateAndGetSessionUser(req);
  const user = sessionData?.user;
  
  if (!user || user.role !== 'Admin') {
    return res.status(403).json({ error: 'Unauthorized. Only Administrators are permitted to delete history items.' });
  }

  const initialLen = db.garmentStyleHistory?.length || 0;
  if (db.garmentStyleHistory) {
    db.garmentStyleHistory = db.garmentStyleHistory.filter(h => h.id !== req.params.id);
  }

  if ((db.garmentStyleHistory?.length || 0) === initialLen) {
    return res.status(404).json({ error: 'History record not found.' });
  }

  saveDb();
  res.json({ success: true });
});

app.post('/api/line-style-assignments/change', (req, res) => {
  const db = getDb();
  let { lineNumber, garmentStyleId, effectiveDate, effectiveTime, reason, remarks, changedBy } = req.body;
  
  const sessionData = validateAndGetSessionUser(req);
  if (!changedBy) {
    changedBy = sessionData?.user?.username || 'Industrial Engineer';
  }
  
  if (lineNumber === undefined || !garmentStyleId) {
    return res.status(400).json({ error: 'Missing lineNumber or garmentStyleId' });
  }

  const lineNum = Number(lineNumber);
  const selectedStyle = db.garmentStyles.find(g => g.id === garmentStyleId);
  if (!selectedStyle) {
    return res.status(404).json({ error: 'Selected Garment Style not found' });
  }

  if (!db.lineStyleAssignments) db.lineStyleAssignments = [];
  if (!db.garmentStyleHistory) db.garmentStyleHistory = [];

  const prevIdx = db.lineStyleAssignments.findIndex(a => a.lineNumber === lineNum);
  let previousGarmentStyleId: string | null = null;
  let previousGarmentStyleName: string | null = null;

  if (prevIdx !== -1) {
    previousGarmentStyleId = db.lineStyleAssignments[prevIdx].garmentStyleId;
    const prevStyleVal = db.garmentStyles.find(g => g.id === previousGarmentStyleId);
    previousGarmentStyleName = prevStyleVal ? prevStyleVal.name : 'Unknown';

    db.lineStyleAssignments[prevIdx] = {
      ...db.lineStyleAssignments[prevIdx],
      garmentStyleId,
      assignedAt: new Date().toISOString(),
      effectiveDate: effectiveDate || db.systemDate,
      effectiveTime: effectiveTime || '08:00',
      remarks: remarks || ''
    };
  } else {
    db.lineStyleAssignments.push({
      id: `lsa_${lineNum}`,
      lineNumber: lineNum,
      garmentStyleId,
      assignedAt: new Date().toISOString(),
      effectiveDate: effectiveDate || db.systemDate,
      effectiveTime: effectiveTime || '08:00',
      remarks: remarks || ''
    });
  }

  const operatorsCount = db.lineAllocations.filter(la => la.assignedLine === lineNum && la.assignmentStatus === 'Assigned').length 
                         || db.employees.filter(e => e.lineNumber === lineNum).length 
                         || selectedStyle.requiredManpower 
                         || 12;

  const historyRecord = {
    id: `gsh_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    lineNumber: lineNum,
    previousGarmentStyleId,
    previousGarmentStyleName,
    newGarmentStyleId: garmentStyleId,
    newGarmentStyleName: selectedStyle.name,
    changeDate: effectiveDate || db.systemDate || new Date().toISOString().split('T')[0],
    changeTime: effectiveTime || '08:00',
    changedBy,
    reason: reason || 'Routine Style Transition',
    operatorsCount,
    remarks: remarks || ''
  };

  db.garmentStyleHistory.unshift(historyRecord);

  // Sync to linesAllocated in garmentStyles for client compatibility
  db.garmentStyles.forEach(g => {
    if (!g.linesAllocated) g.linesAllocated = [];
    if (g.id === garmentStyleId) {
      if (!g.linesAllocated.includes(lineNum)) {
        g.linesAllocated.push(lineNum);
      }
    } else {
      g.linesAllocated = g.linesAllocated.filter(l => Number(l) !== lineNum);
    }
  });

  // Log visual notification
  logNotification(
    'Milestone',
    `Style Changed on Line ${lineNum}`,
    `Style transitioned from "${previousGarmentStyleName || 'Primary Setup'}" to "${selectedStyle.name}" effective ${effectiveDate} ${effectiveTime}.`
  );

  saveDb();
  res.json({
    success: true,
    assignment: db.lineStyleAssignments.find(a => a.lineNumber === lineNum),
    historyRecord
  });
});

// ==========================================
// IE REPORTS & DATA EXPORT CENTER AUDIT ENDPOINTS
// ==========================================

app.get('/api/export-logs', (req, res) => {
  const db = getDb() as any;
  if (!db.exportLogs) {
    db.exportLogs = [];
  }
  res.json(db.exportLogs);
});

app.post('/api/export-logs', (req, res) => {
  const db = getDb() as any;
  if (!db.exportLogs) {
    db.exportLogs = [];
  }

  const { username, role, reportType, exportFormat, dateRange, recordsCount } = req.body;

  const sessionData = validateAndGetSessionUser(req);
  const resolvedUsername = username || sessionData?.user?.username || 'Unknown';
  const resolvedRole = role || sessionData?.user?.role || 'Guest';

  const newLog = {
    id: `log_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    username: resolvedUsername,
    role: resolvedRole,
    reportType,
    exportFormat,
    dateRange,
    timestamp: new Date().toISOString(),
    recordsCount: Number(recordsCount || 0)
  };

  db.exportLogs.unshift(newLog);
  if (db.exportLogs.length > 500) {
    db.exportLogs = db.exportLogs.slice(0, 500);
  }

  saveDb();
  res.json({ success: true, log: newLog });
});

// Reset system to clean state
app.post('/api/system/reset', (req, res) => {
  fs.rmSync(path.join(process.cwd(), 'db.json'), { force: true });
  // Reload
  resetDbInMemory(); 
  const reloaded = getDb();
  res.json({ success: true, state: reloaded });
});

// ==========================================
// 8. ASYNC BACKGROUND ACTION PROCESSING
// ==========================================

app.post('/api/jobs/import-employees', (req, res) => {
  const { records, actionRule } = req.body;
  if (!records || !Array.isArray(records)) {
    return res.status(400).json({ error: 'Invalid file records array' });
  }

  const jobId = createJob('Excel Employees Import', records.length);
  res.json({ jobId });

  // Handle sequentially asynchronously in background
  setTimeout(() => {
    updateJob(jobId, { status: 'running', progress: 5 });
    const db = getDb();
    let updated = 0;
    let added = 0;

    for (let i = 0; i < records.length; i++) {
      const rec = records[i];
      if (!rec.id || !rec.name) continue;

      const idx = db.employees.findIndex(e => e.id.toUpperCase() === rec.id.toUpperCase());

      if (idx !== -1) {
        if (actionRule === 'update-only' || actionRule === 'merge-update') {
          db.employees[idx] = { ...db.employees[idx], ...rec };
          updated++;
        }
      } else {
        if (actionRule === 'add-only' || actionRule === 'merge-update') {
          // Add default fields if omitted
          const rawDept = (rec.department || 'Sewing');
          const isElig = rawDept.toLowerCase() === 'sewing' || rawDept.toLowerCase() === 'floater';
          db.employees.unshift({
            photoUrl: rec.photoUrl || '',
            department: rawDept,
            section: rec.section || 'Main Line',
            lineNumber: rec.lineNumber || 1,
            designation: rec.designation || 'Sewing Operator',
            joiningDate: rec.joiningDate || db.systemDate,
            skillCategory: rec.skillCategory || 'Grade B Operator',
            experience: rec.experience || 2,
            contactNumber: rec.contactNumber || '+91 99999 88888',
            skills: rec.skills || [{ operationName: 'Sleeve Attach', proficiency: 75, skillLevel: 'Intermediate', trainingStatus: 'Completed' }],
            baseEfficiency: rec.baseEfficiency || 70,
            historicalAttendanceRate: rec.historicalAttendanceRate || 92,
            riskScore: rec.riskScore || 20,
            riskLevel: rec.riskLevel || 'Low',
            leaveBalances: rec.leaveBalances || { casual: 5, sick: 7, earned: 10, emergency: 2 },
            productionWorkforceEligible: isElig,
            ...rec
          });
          added++;
        }
      }

      // Progress reporting
      if (i % Math.ceil(records.length / 10) === 0 || i === records.length - 1) {
        const percent = Math.round((i / records.length) * 100);
        updateJob(jobId, { progress: percent, processedCount: i + 1 });
      }
    }

    saveDb();
    updateJob(jobId, { 
      status: 'completed', 
      progress: 100, 
      result: { added, updated } 
    });

    logNotification('Milestone', 'Bulk Operator Import Successful', `Async database background job completed. Added: ${added}, Updated: ${updated}.`);
  }, 100);
});

app.get('/api/jobs/status/:id', (req, res) => {
  const job = getJob(req.params.id);
  if (!job) {
    return res.status(404).json({ error: 'Migration job not found' });
  }
  res.json(job);
});

// ==========================================
// 9. HIGH-PERFORMANCE LIGHTWEIGHT KPI DASHBOARD
// ==========================================

app.get('/api/dashboard/kpis', (req, res) => {
  const db = getDb();
  
  // Use cached KPIs to avoid heavy recalculations (cached until write)
  const stats = getCachedKpis(() => {
    const today = db.systemDate;
    const activePool = db.employees.filter(emp => {
      const dept = (emp.department || '').toLowerCase();
      return dept === 'sewing' || dept === 'floater' || emp.lineNumber === 99 || emp.lineNumber > 0;
    });

    const totalWorkforce = activePool.length;

    // Check attendance records for today
    const presentOperators = activePool.filter(emp => {
      const rec = db.attendance.find(a => a.employeeId.toUpperCase() === emp.id.toUpperCase() && a.date === today);
      return rec?.status === 'Present' || rec?.status === 'Late';
    }).length;

    const onLeaveOrOffline = activePool.filter(emp => {
      const rec = db.attendance.find(a => a.employeeId.toUpperCase() === emp.id.toUpperCase() && a.date === today);
      if (rec?.status === 'Leave') return true;
      const onApprovedLeave = db.leaveRequests.some(l => 
        l.employeeId.toUpperCase() === emp.id.toUpperCase() && 
        l.status === 'Approved' && 
        today >= l.startDate && today <= l.endDate
      );
      return onApprovedLeave && rec?.status !== 'Present' && rec?.status !== 'Late';
    }).length;

    const absentOperators = totalWorkforce - presentOperators - onLeaveOrOffline;

    const attendanceRate = totalWorkforce > 0 ? Math.round((presentOperators / totalWorkforce) * 100) : 100;

    // Floaters
    const availableFloaters = activePool.filter(emp => {
      const isPresent = db.attendance.some(a => a.employeeId.toUpperCase() === emp.id.toUpperCase() && a.date === today && (a.status === 'Present' || a.status === 'Late'));
      if (!isPresent) return false;

      const isFloaterLine = emp.lineNumber === 99 || emp.department.toLowerCase().includes('floater');
      if (!isFloaterLine) return false;

      // Has no assignment on line today
      const hasDeployment = db.employeeAssignments.some(
        a => a.employeeId.toUpperCase() === emp.id.toUpperCase() && 
             a.assignmentDate === today && 
             a.assignmentStatus !== 'Unassigned' &&
             a.assignmentStatus !== 'Available for Replacement'
      );
      return !hasDeployment;
    }).length;

    return {
      totalWorkforce,
      presentOperators,
      absentOperators,
      onLeaveOrOffline,
      attendanceRate,
      availableFloaters,
      systemDate: today
    };
  });

  res.json(stats);
});

app.get('/api/dashboard/productivity', (req, res) => {
  const db = getDb();
  const prod = getCachedProductivity(() => {
    return db.dailyProductivity || [];
  });
  res.json(prod);
});

// Notifications manager APIs
app.get('/api/notifications', (req, res) => {
  const db = getDb();
  res.json(db.notifications);
});

app.post('/api/notifications/read-all', (req, res) => {
  const db = getDb();
  db.notifications.forEach(n => n.read = true);
  saveDb();
  res.json({ success: true });
});

app.post('/api/notifications/clear-all', (req, res) => {
  const db = getDb();
  db.notifications = [];
  saveDb();
  res.json({ success: true });
});


// ==========================================
// 9.5. DATABASE AUTHENTICATION & CONTROL CENTER APIs
// ==========================================

import { hashPassword, writeAuditLog } from './src/data/dbService.js';
import crypto from 'crypto';

function parseCookies(cookieHeader?: string): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!cookieHeader) return cookies;
  cookieHeader.split(';').forEach(cookie => {
    const parts = cookie.trim().split('=');
    if (parts.length >= 2) {
      cookies[parts[0].trim()] = parts.slice(1).join('=').trim();
    }
  });
  return cookies;
}

function extractToken(req: any) {
  const cookies = parseCookies(req.headers.cookie);
  let token = cookies.sid || req.headers['x-session-id'];
  if (!token && req.headers.authorization) {
    const parts = req.headers.authorization.split(' ');
    if (parts.length === 2 && parts[0].toLowerCase() === 'bearer') {
      token = parts[1];
    }
  }
  return token;
}

function validateAndGetSessionUser(req: any) {
  const token = extractToken(req);
  if (!token) return null;

  const db = getDb();
  if (!db.sessions) db.sessions = [];
  const session = db.sessions.find((s: any) => s.id === token && s.status === 'Active');
  if (!session) return null;

  const loginTime = new Date(session.loginTime).getTime();
  const now = Date.now();
  // 8 hours absolute session limit
  if (now - loginTime > 8 * 60 * 60 * 1000) {
    session.status = 'Expired';
    saveDb();
    return null;
  }

  // 1 hour inactivity timeout
  const lastActivity = new Date(session.lastActivityTime).getTime();
  if (now - lastActivity > 60 * 60 * 1000) {
    session.status = 'Expired';
    saveDb();
    return null;
  }

  // Update last activity time
  session.lastActivityTime = new Date().toISOString();
  saveDb();

  const user = db.allUsers.find((u: any) => u.id === session.userId);
  if (!user || user.accountStatus === 'Inactive') {
    return null;
  }

  return { user, session };
}

app.get('/api/auth/me', (req, res) => {
  const sessionData = validateAndGetSessionUser(req);
  if (!sessionData) {
    return res.status(401).json({ error: 'Session expired or unauthorized.' });
  }
  res.json({ user: sessionData.user, session: sessionData.session });
});

function isSha256(str: any): boolean {
  return typeof str === 'string' && str.length === 64 && /^[0-9a-fA-F]+$/.test(str);
}

app.post('/api/auth/login', async (req, res) => {
  const { usernameOrEmpId, password } = req.body;
  if (!usernameOrEmpId || !password) {
    return res.status(400).json({ error: 'Username or Employee ID and password are required.' });
  }

  // Ensure absolute latest remote directory users are pulled from active Firestore database
  try {
    await getLatestUsersFromFirestore();
  } catch (err) {
    console.error("Non-blocking error retrieving live Firestore users during login route:", err);
  }

  const db = getDb();
  let searchKey = usernameOrEmpId.toLowerCase().trim();
  if (searchKey === 'admin') {
    searchKey = 'admin_prakash';
  }
  
  // Find user by username OR employeeId
  const user = db.allUsers.find(u => 
    u.username.toLowerCase() === searchKey || 
    (u.employeeId && u.employeeId.toLowerCase() === searchKey)
  );

  if (!user) {
    return res.status(401).json({ error: 'Invalid security credentials or account does not exist.' });
  }

  // Check lockout
  const now = new Date();
  if (user.lockedUntil) {
    const lockedTime = new Date(user.lockedUntil);
    if (lockedTime > now) {
       const minutesLeft = Math.ceil((lockedTime.getTime() - now.getTime()) / 60000);
      return res.status(403).json({ 
        error: `Account locked out due to multiple failed logins. Try again in ${minutesLeft} minutes.` 
      });
    } else {
      // Lock has expired
      user.lockedUntil = null;
      user.failedAttempts = 0;
      saveDb();
    }
  }

  if (user.accountStatus === 'Inactive') {
    return res.status(403).json({ error: 'Your account has been deactivated by the System Administrator.' });
  }

  const typedPasswordHash = hashPassword(password);
  const isPlainPasswordMatch = typeof user.passwordHash === 'string' && !isSha256(user.passwordHash) && user.passwordHash === password;
  const isMatch = (user.passwordHash === typedPasswordHash) || isPlainPasswordMatch;

  if (!isMatch) {
    user.failedAttempts = (user.failedAttempts || 0) + 1;
    let errorMsg = 'Incorrect temporary or master security password.';
    
    if (user.failedAttempts >= 5) {
      const lockUntilDate = new Date(now.getTime() + 15 * 60000); // 15 mins lock
      user.lockedUntil = lockUntilDate.toISOString();
      errorMsg = 'Account locked out for 15 minutes due to 5 failed login attempts.';
    } else {
      errorMsg += ` ${5 - user.failedAttempts} attempt(s) remaining before security lockout.`;
    }
    
    // Add audit log for failed login attempt
    writeAuditLog(db, user.id, 'Failed Login Attempt', 'System', `Incorrect password matching failed. Attempt count ${user.failedAttempts} for username: ${user.username}`);
    saveDb();
    return res.status(401).json({ error: errorMsg });
  }

  // Successful login - if they logged in with a plain password (e.g. manually set in Firebase board), upgrade it now!
  if (isPlainPasswordMatch) {
    user.passwordHash = typedPasswordHash;
  }
  user.failedAttempts = 0;
  user.lockedUntil = null;
  user.lastLogin = now.toISOString();
  
  // Create unique session token
  const sessionId = 'sid_' + crypto.randomBytes(16).toString('hex');
  const userAgent = req.headers['user-agent'] || 'Unknown';
  const ipAddress = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
  
  let browserInfo = 'Other';
  if (userAgent.includes('Chrome')) browserInfo = 'Chrome';
  else if (userAgent.includes('Firefox')) browserInfo = 'Firefox';
  else if (userAgent.includes('Safari') && !userAgent.includes('Chrome')) browserInfo = 'Safari';
  else if (userAgent.includes('Edge')) browserInfo = 'Edge';

  let deviceInfo = 'Desktop';
  if (userAgent.includes('Mobi') || userAgent.includes('Android') || userAgent.includes('iPhone')) {
    deviceInfo = 'Mobile';
  } else if (userAgent.includes('iPad') || userAgent.includes('Tablet')) {
    deviceInfo = 'Tablet';
  }

  const newSession = {
    id: sessionId,
    userId: user.id,
    username: user.username,
    role: user.role,
    employeeName: user.employeeName || user.username,
    loginTime: now.toISOString(),
    deviceInfo,
    browserInfo,
    ipAddress: String(ipAddress),
    lastActivityTime: now.toISOString(),
    status: 'Active' as const
  };

  if (!db.sessions) db.sessions = [];
  db.sessions.push(newSession);
  
  writeAuditLog(db, user.id, 'User Login Success', 'System', `Platform access granted. Role: ${user.role}. Session: ${sessionId}`);
  saveDb();
  
  // Set Cookie for device/browser-specific state
  res.cookie('sid', sessionId, {
    httpOnly: true,
    path: '/',
    sameSite: 'none',
    secure: true,
    maxAge: 8 * 60 * 60 * 1000 // 8 hours
  });

  res.json({ success: true, user, token: sessionId, session: newSession });
});

app.post('/api/auth/logout', (req, res) => {
  const token = extractToken(req);
  const db = getDb();
  if (token) {
    const session = db.sessions?.find((s: any) => s.id === token && s.status === 'Active');
    if (session) {
      session.status = 'Revoked';
      writeAuditLog(db, session.userId, 'User Logout', 'System', `Session closed successfully: ${session.id}`);
    }
  }
  saveDb();
  res.clearCookie('sid', {
    path: '/',
    sameSite: 'none',
    secure: true
  });
  res.json({ success: true });
});

// Admin Controlled: User Creation
app.post('/api/auth/create-user', async (req, res) => {
  // Ensure absolute latest remote directory users are pulled from active Firestore database
  try {
    await getLatestUsersFromFirestore();
  } catch (err) {
    console.error("Non-blocking error retrieving live Firestore users during create-user route:", err);
  }

  const db = getDb();
  const sessionData = validateAndGetSessionUser(req);
  const caller = sessionData?.user;
  
  if (!caller || caller.role !== 'Admin') {
    return res.status(403).json({ error: 'Access unauthorized. System Administrator privileges required.' });
  }

  const { employeeId, employeeName, username, email, role, department, designation, password, accountStatus, avatarUrl } = req.body;

  if (!employeeId || !employeeName || !username || !email || !role || !password) {
    return res.status(400).json({ error: 'Please supply all mandatory fields (Employee ID, Name, Username, Email, Role, and Password).' });
  }

  // Check uniqueness of username and employeeId
  const existingUser = db.allUsers.find(u => 
    u.username.toLowerCase() === username.toLowerCase() || 
    (u.employeeId && u.employeeId.toLowerCase() === employeeId.toLowerCase())
  );

  if (existingUser) {
    return res.status(400).json({ error: 'A security profile already exists with that Username or Employee ID.' });
  }

  const newUser: any = {
    id: `USR${Date.now().toString().slice(-4)}`,
    employeeId,
    employeeName,
    username,
    email,
    role,
    department: department || 'Production',
    designation: designation || 'Officer',
    passwordHash: hashPassword(password),
    accountStatus: accountStatus || 'Active',
    failedAttempts: 0,
    lockedUntil: null,
    lastLogin: null,
    avatarUrl: avatarUrl || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=facearea&facepad=2&w=256&h=256&q=80',
  };

  db.allUsers.push(newUser);
  writeAuditLog(db, newUser.id, 'Created Security User', caller.username, `New login profile created for ${employeeName} as ${role}`);
  saveDb();

  res.json({ success: true, user: newUser });
});

// Admin Controlled: Toggle Status (Activate/Deactivate)
app.post('/api/auth/update-user-status', (req, res) => {
  const db = getDb();
  const sessionData = validateAndGetSessionUser(req);
  const caller = sessionData?.user;
  
  if (!caller || caller.role !== 'Admin') {
    return res.status(403).json({ error: 'Access unauthorized. System Administrator privileges required.' });
  }

  const { userId, status } = req.body;
  if (!userId || !status) {
    return res.status(400).json({ error: 'Missing userId or status definition.' });
  }

  const user = db.allUsers.find(u => u.id === userId);
  if (!user) {
    return res.status(404).json({ error: 'Target user record not found.' });
  }

  if (user.id === caller.id) {
    return res.status(400).json({ error: 'A System Administrator is forbidden from self-deactivating their active account.' });
  }

  const oldStatus = user.accountStatus;
  user.accountStatus = status;
  
  writeAuditLog(db, user.id, status === 'Active' ? 'Activated User' : 'Deactivated User', caller.username, `Account status altered from ${oldStatus} to ${status}`);
  saveDb();

  res.json({ success: true, user });
});

// Admin Controlled: Edit user role
app.post('/api/auth/update-user-role', (req, res) => {
  const db = getDb();
  const sessionData = validateAndGetSessionUser(req);
  const caller = sessionData?.user;
  
  if (!caller || caller.role !== 'Admin') {
    return res.status(403).json({ error: 'Access unauthorized. System Administrator privileges required.' });
  }

  const { userId, role } = req.body;
  const user = db.allUsers.find(u => u.id === userId);
  if (!user) {
    return res.status(404).json({ error: 'Target user record not found.' });
  }

  const oldRole = user.role;
  user.role = role;
  
  writeAuditLog(db, user.id, 'Modified User Role', caller.username, `Privileges reallocated from ${oldRole} to ${role}`);
  saveDb();

  res.json({ success: true, user });
});

// Admin Controlled: Reset User Password
app.post('/api/auth/reset-password-admin', (req, res) => {
  const db = getDb();
  const sessionData = validateAndGetSessionUser(req);
  const caller = sessionData?.user;
  
  if (!caller || caller.role !== 'Admin') {
    return res.status(403).json({ error: 'Access unauthorized. System Administrator privileges required.' });
  }

  const { userId, newPassword } = req.body;
  const user = db.allUsers.find(u => u.id === userId);
  if (!user) {
    return res.status(404).json({ error: 'Target user record not found.' });
  }

  const defaultResetPassword = newPassword || 'SWM2026!';
  user.passwordHash = hashPassword(defaultResetPassword);
  user.failedAttempts = 0;
  user.lockedUntil = null;
  
  writeAuditLog(db, user.id, 'Reset Password Admin', caller.username, `Master reset successfully executed. Default payload configured.`);
  saveDb();

  res.json({ success: true, message: `Password reset successfully to: ${defaultResetPassword}` });
});

// Admin Controlled: Delete User Profile
app.post('/api/auth/delete-user', (req, res) => {
  const db = getDb();
  const sessionData = validateAndGetSessionUser(req);
  const caller = sessionData?.user;
  
  if (!caller || caller.role !== 'Admin') {
    return res.status(403).json({ error: 'Access unauthorized. System Administrator privileges required.' });
  }

  const { userId } = req.body;
  if (caller.id === userId) {
    return res.status(400).json({ error: 'System Administrator cannot self-delete.' });
  }

  const userIndex = db.allUsers.findIndex(u => u.id === userId);
  if (userIndex === -1) {
    return res.status(404).json({ error: 'Target user record not found.' });
  }

  const user = db.allUsers[userIndex];
  db.allUsers.splice(userIndex, 1);
  
  writeAuditLog(db, user.id, 'Deleted Security User', caller.username, `User account ${user.username} (${user.employeeName}) deleted permanently from the platform.`);
  saveDb();

  res.json({ success: true, message: `User record deleted successfully.` });
});

// Change Password: Self (User-Specific Mode)
app.post('/api/auth/change-password-user', (req, res) => {
  const db = getDb();
  const sessionData = validateAndGetSessionUser(req);
  const caller = sessionData?.user;
  
  if (!caller) {
    return res.status(401).json({ error: 'Please log in to complete password updates.' });
  }

  const { oldPassword, newPassword } = req.body;
  if (!oldPassword || !newPassword) {
    return res.status(400).json({ error: 'Please supply your current password and target password.' });
  }

  const oldHash = hashPassword(oldPassword);
  if (caller.passwordHash !== oldHash) {
    return res.status(401).json({ error: 'Direct match validation failed. Current password is incorrect.' });
  }

  // Update caller and save
  const userInList = db.allUsers.find(u => u.id === caller.id);
  if (userInList) {
    userInList.passwordHash = hashPassword(newPassword);
  }
  
  writeAuditLog(db, caller.id, 'User Self Password Change', caller.username, 'Password updated securely via authenticated profile settings');
  saveDb();

  res.json({ success: true });
});

// Self Profile Details Update
app.post('/api/auth/update-profile-user', (req, res) => {
  const db = getDb();
  const sessionData = validateAndGetSessionUser(req);
  const caller = sessionData?.user;
  if (!caller) {
    return res.status(401).json({ error: 'Please log in to update details.' });
  }

  const { email, employeeName, avatarUrl } = req.body;
  const userInList = db.allUsers.find(u => u.id === caller.id);
  
  if (userInList) {
    if (email) userInList.email = email;
    if (employeeName) userInList.employeeName = employeeName;
    if (avatarUrl) userInList.avatarUrl = avatarUrl;
  }

  writeAuditLog(db, caller.id, 'User Self Details Update', caller.username, 'Personal credentials records updated');
  saveDb();
  res.json({ success: true, user: userInList || caller });
});

// Submit Reset Password Request (Forgot Password)
app.post('/api/auth/forgot-password', (req, res) => {
  const { usernameOrEmpId } = req.body;
  if (!usernameOrEmpId) {
    return res.status(400).json({ error: 'Username or Employee ID is mandatory.' });
  }

  const db = getDb();
  const user = db.allUsers.find(u => 
    u.username.toLowerCase() === usernameOrEmpId.toLowerCase() || 
    (u.employeeId && u.employeeId.toLowerCase() === usernameOrEmpId.toLowerCase())
  );

  if (!user) {
    return res.status(404).json({ error: 'Security account lookup returned no matches.' });
  }

  // Generate a mock reset pending ticket details in audit log
  const ticketId = `RST-${Math.floor(100000 + Math.random() * 900000)}`;
  
  writeAuditLog(db, user.id, 'Password Reset Requested', 'Self (Unauthenticated)', `Ticket ID generated: ${ticketId}. Needs manual approval.`);
  saveDb();

  res.json({ 
    success: true, 
    ticketId, 
    message: `Password reset request registered successfully! Please request manual unlocking approval from your System Administrator (Prakash Mehta). Ticket Details reference: ${ticketId}`
  });
});

app.get('/api/auth/audit-logs', (req, res) => {
  const db = getDb();
  const sessionData = validateAndGetSessionUser(req);
  const caller = sessionData?.user;
  if (!caller || caller.role !== 'Admin') {
    return res.status(403).json({ error: 'Access unauthorized. Administrator permissions required.' });
  }
  res.json(db.auditLogs || []);
});

// Admin-Controlled: List all active and past sessions
app.get('/api/auth/sessions', (req, res) => {
  const sessionData = validateAndGetSessionUser(req);
  if (!sessionData || sessionData.user.role !== 'Admin') {
    return res.status(403).json({ error: 'Access unauthorized. System Administrator privileges required.' });
  }
  const db = getDb();
  res.json(db.sessions || []);
});

// Terminate / Revoke specific active user session
app.post('/api/auth/sessions/terminate', (req, res) => {
  const sessionData = validateAndGetSessionUser(req);
  if (!sessionData) {
    return res.status(401).json({ error: 'Please log in.' });
  }

  const { sessionId } = req.body;
  if (!sessionId) {
    return res.status(400).json({ error: 'Session ID is required.' });
  }

  const db = getDb();
  if (!db.sessions) db.sessions = [];
  const sessionToTerm = db.sessions.find((s: any) => s.id === sessionId);
  if (!sessionToTerm) {
    return res.status(404).json({ error: 'Session record not found.' });
  }

  // Administrators can revoke any session. Standard users can only terminate their OWN active session.
  if (sessionData.user.role !== 'Admin' && sessionToTerm.userId !== sessionData.user.id) {
    return res.status(403).json({ error: 'Access denied. You do not have permissions to terminate this session.' });
  }

  sessionToTerm.status = 'Revoked';
  writeAuditLog(db, sessionToTerm.userId, 'Session Revoked', sessionData.user.username, `Session ID ${sessionToTerm.id} was terminated remotely by ${sessionData.user.username}`);
  saveDb();

  res.json({ success: true, message: 'Session terminated successfully.' });
});


// ==========================================
// 10. VITE MIDDLEWARE SETUP
// ==========================================

async function startServer() {
  console.log('Quick-booting server with local database fallback...');
  // Instantly load database state so Express is active immediately
  const db = getDb();
  sanitizeAttendanceRecords(db);

  // Synchronize state with Cloud Firestore in the background
  console.log('Synchronizing state with Cloud Firestore in the background...');
  initializeFirestoreDb()
    .then(() => {
      console.log('Cloud Firestore integration ready!');
    })
    .catch((err) => {
      console.error('Cloud Firestore custom background sync warning:', err);
    });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { 
        middlewareMode: true,
        watch: {
          ignored: [
            '**/db.json',
            '**/db.json.tmp',
            '**/db.json*',
            '**/*.tmp'
          ]
        }
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`SWM Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
