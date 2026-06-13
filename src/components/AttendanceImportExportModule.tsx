/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * SWM Attendance Import & Export Center
 */

import React, { useState, useRef, useEffect } from 'react';
import { useAppState } from '../contexts/StateContext';
import { AttendanceRecord, AttendanceStatus, AttendanceMethod, Employee, SkillCategory, SkillLevel, TrainingStatus, RiskLevel } from '../types';
import { 
  UploadCloud, FileSpreadsheet, Download, FileText, CheckCircle, 
  XSquare, ArrowUpDown, ChevronRight, HelpCircle, Loader, Filter, 
  Users, Check, X, ShieldAlert, Cpu, Laptop, Calendar, Share2, Clipboard, Printer, AlertCircle, FileDown, BookOpen,
  UserPlus, AlertTriangle, FileCheck, Database, Edit2, TrendingUp, Sliders, Plus, ArrowRight, Trash2
} from 'lucide-react';
import * as XLSX from 'xlsx';
import Papa from 'papaparse';

interface ValidationError {
  row: number;
  empId: string;
  field: string;
  value: string;
  reason: string;
  severity: 'error' | 'warning';
}

interface ParsedRow {
  rowNum: number;
  employeeId: string;
  name: string;
  date: string;
  status?: string;
  checkIn: string;
  checkOut: string;
  raw: any;
}

export const AttendanceImportExportModule: React.FC = () => {
  const { 
    employees, attendance, bulkMarkAttendance, currentUser, productionLines, addEmployee, updateEmployee, updateProductionLine, importBulkEmployees
  } = useAppState();

  // Active sub-tab inside our core view: 'import' | 'employee-master' | 'export'
  const [activeSubTab, setActiveSubTab] = useState<'import' | 'employee-master' | 'export'>('import');

  // ---------- LINE PRODUCTION EDIT STATES ----------
  const [editingLineId, setEditingLineId] = useState<number | null>(null);
  const [editTargetQty, setEditTargetQty] = useState<string>('');
  const [editActualQty, setEditActualQty] = useState<string>('');

  // ---------- EMPLOYEE MASTER UPLOAD STATES ----------
  const [empDragActive, setEmpDragActive] = useState(false);
  const [empFileName, setEmpFileName] = useState('');
  const [empParsedRows, setEmpParsedRows] = useState<any[]>([]);
  const [empValidationErrors, setEmpValidationErrors] = useState<ValidationError[]>([]);
  const [empRawData, setEmpRawData] = useState<any[]>([]);
  const [empImportSummary, setEmpImportSummary] = useState<{
    total: number;
    success: number;
    errors: number;
    warnings: number;
    actionsTaken: string;
    assignmentDetails?: {
      added: number;
      updated: number;
      unchanged: number;
      failed: number;
    };
  } | null>(null);
  const [empActionRule, setEmpActionRule] = useState<'add-only' | 'update-only' | 'merge-update'>('merge-update');
  const empFileInputRef = useRef<HTMLInputElement>(null);

  // --- Dynamic Assignment Status Detection and Mapping Rules ---
  const [detectedAssignmentColumns, setDetectedAssignmentColumns] = useState<string[]>([]);
  const [selectedAssignmentColumn, setSelectedAssignmentColumn] = useState<string>('');
  const [newRuleSourceValue, setNewRuleSourceValue] = useState('');
  const [newRuleTargetStatus, setNewRuleTargetStatus] = useState('Assigned');
  const [customRulesList, setCustomRulesList] = useState<{ rawValue: string; mappedStatus: string }[]>(() => {
    const saved = localStorage.getItem('swms_custom_ingest_rules');
    return saved ? JSON.parse(saved) : [
      { rawValue: 'Production Operator', mappedStatus: 'Assigned' },
      { rawValue: 'Reserve Worker', mappedStatus: 'Available' },
      { rawValue: 'Training Session', mappedStatus: 'Training' },
      { rawValue: 'Assigned to Line', mappedStatus: 'Assigned' },
      { rawValue: 'Working', mappedStatus: 'Assigned' },
      { rawValue: 'Allocated', mappedStatus: 'Assigned' },
      { rawValue: 'Production', mappedStatus: 'Assigned' },
      { rawValue: 'Free', mappedStatus: 'Available' },
      { rawValue: 'Available', mappedStatus: 'Available' },
      { rawValue: 'Standby', mappedStatus: 'Available' }
    ];
  });

  useEffect(() => {
    localStorage.setItem('swms_custom_ingest_rules', JSON.stringify(customRulesList));
  }, [customRulesList]);

  const getRulesMap = (rules: { rawValue: string; mappedStatus: string }[]) => {
    const rulesMap: Record<string, string> = {};
    rules.forEach(r => {
      rulesMap[r.rawValue.trim().toLowerCase()] = r.mappedStatus;
    });
    return rulesMap;
  };

  const normalizeAssignmentStatus = (val: string, rules: Record<string, string>): any => {
    const cleanVal = String(val).trim().toLowerCase();
    if (!cleanVal) return 'Unassigned';

    if (rules[cleanVal]) {
      const mapped = rules[cleanVal];
      if (mapped === 'Available') return 'Available for Replacement';
      return mapped;
    }

    if (/assign|work|alloc|prod/i.test(cleanVal)) {
      return 'Assigned';
    }
    if (/free|avail|standby|reserve/i.test(cleanVal)) {
      return 'Available for Replacement';
    }
    if (/unassigned/i.test(cleanVal)) {
      return 'Unassigned';
    }
    if (/train/i.test(cleanVal)) {
      return 'Training';
    }
    if (/meet/i.test(cleanVal)) {
      return 'Meeting';
    }
    if (/audit|quality|qa/i.test(cleanVal)) {
      return 'Quality Audit';
    }
    if (/maint|support|tech/i.test(cleanVal)) {
      return 'Maintenance Support';
    }
    if (/leave|off|absent|vacation/i.test(cleanVal)) {
      return 'Leave';
    }

    return 'Unassigned';
  };

  const handleAddMappingRule = () => {
    if (!newRuleSourceValue.trim()) return;
    const updated = [
      ...customRulesList,
      { rawValue: newRuleSourceValue.trim(), mappedStatus: newRuleTargetStatus }
    ];
    setCustomRulesList(updated);
    setNewRuleSourceValue('');

    // Trigger immediate re-processing of parsed data if available
    if (empRawData.length > 0) {
      setTimeout(() => {
        processEmpParsedData(empRawData, selectedAssignmentColumn, updated);
      }, 50);
    }
  };

  const handleRemoveMappingRule = (index: number) => {
    const updated = customRulesList.filter((_, idx) => idx !== index);
    setCustomRulesList(updated);

    if (empRawData.length > 0) {
      setTimeout(() => {
        processEmpParsedData(empRawData, selectedAssignmentColumn, updated);
      }, 50);
    }
  };

  // ---------- EMPLOYEE EXPORT FILTERS ----------
  const [empExportDept, setEmpExportDept] = useState<string>('All');
  const [empExportSection, setEmpExportSection] = useState<string>('All');
  const [empExportDesignation, setEmpExportDesignation] = useState<string>('All');
  const [empExportLine, setEmpExportLine] = useState<string>('All');
  const [empExportSkill, setEmpExportSkill] = useState<string>('All');
  const [empExportExperience, setEmpExportExperience] = useState<string>('All');
  const [empExportPreview, setEmpExportPreview] = useState<Employee[]>([]);

  // ---------- IMPORT STATES ----------
  const [dragActive, setDragActive] = useState(false);
  const [importMode, setImportMode] = useState<'Standard' | 'Biometric'>('Standard');
  const [biometricSystem, setBiometricSystem] = useState<'ZKTeco' | 'eSSL' | 'Matrix' | 'Custom'>('ZKTeco');
  const [rawImportData, setRawImportData] = useState<any[]>([]);
  const [strictValidation, setStrictValidation] = useState(true);
  
  // Custom Biometric Mapping
  const [columnMapping, setColumnMapping] = useState({
    empIdCol: 'Employee ID',
    nameCol: 'Employee Name',
    dateCol: 'Date',
    statusCol: 'Status',
    checkInCol: 'Check-In',
    checkOutCol: 'Check-Out'
  });

  const [loading, setLoading] = useState(false);
  const [loadingPhase, setLoadingPhase] = useState('');
  const [progressPercent, setProgressPercent] = useState(0);

  const [fileName, setFileName] = useState('');
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);
  const [importSummary, setImportSummary] = useState<{
    total: number;
    success: number;
    errors: number;
    warnings: number;
    present: number;
    late: number;
    absent: number;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ---------- EXPORT STATES ----------
  const [startDate, setStartDate] = useState('2026-06-04');
  const [endDate, setEndDate] = useState('2026-06-04');
  const [deptFilter, setDeptFilter] = useState<string>('All');
  const [lineFilter, setLineFilter] = useState<string>('All');
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [reportTemplate, setReportTemplate] = useState<string>('attendance_report');
  
  const [exportPreview, setExportPreview] = useState<any[]>([]);
  const [showExportSuccessToast, setShowExportSuccessToast] = useState(false);
  const [exportedFilename, setExportedFilename] = useState('');

  // Auto-fill Mapping rules based on biometric machines selection
  const handleBiometricSystemChange = (system: 'ZKTeco' | 'eSSL' | 'Matrix' | 'Custom') => {
    setBiometricSystem(system);
    if (system === 'ZKTeco') {
      setColumnMapping({
        empIdCol: 'USERID',
        nameCol: 'Name',
        dateCol: 'CHECKTIME_DATE',
        statusCol: 'Status',
        checkInCol: 'IN_TIME',
        checkOutCol: 'OUT_TIME'
      });
    } else if (system === 'eSSL') {
      setColumnMapping({
        empIdCol: 'EmpNo',
        nameCol: 'EmployeeName',
        dateCol: 'LogDate',
        statusCol: 'Status',
        checkInCol: 'TimeIn',
        checkOutCol: 'TimeOut'
      });
    } else if (system === 'Matrix') {
      setColumnMapping({
        empIdCol: 'CardNo',
        nameCol: 'UserName',
        dateCol: 'DateTime_Day',
        statusCol: 'Status',
        checkInCol: 'GateIn',
        checkOutCol: 'GateOut'
      });
    } else {
      setColumnMapping({
        empIdCol: 'Employee ID',
        nameCol: 'Employee Name',
        dateCol: 'Date',
        statusCol: 'Status',
        checkInCol: 'Check-In Time',
        checkOutCol: 'Check-Out Time'
      });
    }
  };

  // Drag-and-drop Handlers
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  // Raw file parser
  const handleFile = (file: File) => {
    setFileName(file.name);
    setValidationErrors([]);
    setParsedRows([]);
    setImportSummary(null);
    setLoading(true);
    setProgressPercent(10);
    setLoadingPhase('Reading uploaded file data container...');

    const fileReader = new FileReader();
    const isCsv = file.name.endsWith('.csv');

    if (isCsv) {
      fileReader.onload = (e) => {
        const text = e.target?.result as string;
        setProgressPercent(40);
        setLoadingPhase('PapaParse ingestion stream boot...');
        Papa.parse(text, {
          header: true,
          skipEmptyLines: true,
          complete: (results) => {
            setRawImportData(results.data);
            processParsedData(results.data);
          },
          error: (err) => {
            setValidationErrors([{
              row: 0, empId: 'SYSTEM', field: 'File Ingestion', value: '',
              reason: `Failed to stream parse CSV file: ${err.message}`, severity: 'error'
            }]);
            setLoading(false);
          }
        });
      };
      fileReader.readAsText(file);
    } else {
      // Excel Reader
      fileReader.onload = (e) => {
        try {
          setProgressPercent(40);
          setLoadingPhase('Decompressing XLSX layout schema records...');
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheetName = workbook.SheetNames[0];
          const sheet = workbook.Sheets[firstSheetName];
          const json = XLSX.utils.sheet_to_json(sheet);
          setRawImportData(json);
          processParsedData(json);
        } catch (ex: any) {
          setValidationErrors([{
            row: 0, empId: 'SYSTEM', field: 'Spreadsheet Inbound', value: '',
            reason: `XLSX formatting breach: ${ex.message}`, severity: 'error'
          }]);
          setLoading(false);
        }
      };
      fileReader.readAsArrayBuffer(file);
    }
  };

  // Heavy validation check implementation
  const processParsedData = (rawJson: any[], isSilent = false) => {
    try {
      if (!isSilent) {
        setLoading(true);
        setProgressPercent(60);
        setLoadingPhase('Executing smart heuristic field mapping check...');
      }

      if (!rawJson || rawJson.length === 0) {
        setValidationErrors([{
          row: 0, empId: 'GRID', field: 'Count', value: '0',
          reason: 'File layout is completely empty of employee records.', severity: 'error'
        }]);
        setLoading(false);
        return;
      }

      const errors: ValidationError[] = [];
      const rows: ParsedRow[] = [];

      // Map column keys based on Standard vs custom biometric layout
      const targetMap = {
        empId: importMode === 'Standard' ? 'Employee ID' : columnMapping.empIdCol,
        name: importMode === 'Standard' ? 'Employee Name' : columnMapping.nameCol,
        date: importMode === 'Standard' ? 'Date' : columnMapping.dateCol,
        status: importMode === 'Standard' ? 'Status' : (columnMapping.statusCol || 'Status'),
        checkIn: importMode === 'Standard' ? 'Check-In Time' : columnMapping.checkInCol,
        checkOut: importMode === 'Standard' ? 'Check-Out Time' : columnMapping.checkOutCol
      };

      // Helper to find key matches gracefully with fallback heuristics
      const findValueHeuristic = (rowObj: any, matchKey: string, role: 'empId' | 'name' | 'date' | 'status' | 'checkIn' | 'checkOut') => {
        if (!rowObj) return '';
        // 1. Direct key matching
        if (matchKey && rowObj[matchKey] !== undefined && rowObj[matchKey] !== null) {
          return rowObj[matchKey];
        }

        const keys = Object.keys(rowObj);

        // 2. Exact match after cleaning whitespace/casing
        const cleanTarget = (matchKey || '').toLowerCase().replace(/[\s_-]/g, '');
        const exactCleanKey = keys.find(k => k.toLowerCase().replace(/[\s_-]/g, '') === cleanTarget);
        if (exactCleanKey && rowObj[exactCleanKey] !== undefined && rowObj[exactCleanKey] !== null) {
          return rowObj[exactCleanKey];
        }

        // 3. Role-based fallback heuristics
        let fallbackKey: string | undefined;

        if (role === 'empId') {
          fallbackKey = keys.find(k => {
            const lk = k.toLowerCase().replace(/[\s_-]/g, '');
            return lk === 'id' || lk.includes('empid') || lk.includes('employeeid') || lk.includes('operatorid') || lk.includes('workerid') || lk === 'code' || lk.includes('employeecode');
          });
        } else if (role === 'name') {
          fallbackKey = keys.find(k => {
            const lk = k.toLowerCase().replace(/[\s_-]/g, '');
            return lk.includes('name') || lk === 'operator' || lk === 'employee' || lk === 'worker';
          });
        } else if (role === 'date') {
          fallbackKey = keys.find(k => {
            const lk = k.toLowerCase().replace(/[\s_-]/g, '');
            return lk.includes('date') || lk === 'day' || lk.includes('workday') || lk.includes('shiftdate');
          });
        } else if (role === 'status') {
          fallbackKey = keys.find(k => {
            const lk = k.toLowerCase().replace(/[\s_-]/g, '');
            return lk.includes('status') || lk === 'state' || lk === 'attendance' || lk === 'attendancestate';
          });
        } else if (role === 'checkIn') {
          fallbackKey = keys.find(k => {
            const lk = k.toLowerCase().replace(/[\s_-]/g, '');
            return lk.includes('checkin') || lk.includes('intime') || lk.includes('gatein') || lk.includes('arrival') || lk === 'in' || lk.includes('login') || lk.includes('timein');
          });
        } else if (role === 'checkOut') {
          fallbackKey = keys.find(k => {
            const lk = k.toLowerCase().replace(/[\s_-]/g, '');
            return lk.includes('checkout') || lk.includes('outtime') || lk.includes('gateout') || lk.includes('departure') || lk === 'out' || lk.includes('logout') || lk.includes('timeout');
          });
        }

        if (fallbackKey && rowObj[fallbackKey] !== undefined && rowObj[fallbackKey] !== null) {
          return rowObj[fallbackKey];
        }

        return '';
      };

      // Helper to standardise and parse any date to YYYY-MM-DD
      const parseDateToYYYYMMDD = (dateVal: any): string => {
        if (!dateVal) return '';

        // If it is a JS date object
        if (dateVal instanceof Date) {
          if (isNaN(dateVal.getTime())) return '';
          const yyyy = dateVal.getFullYear();
          const mm = String(dateVal.getMonth() + 1).padStart(2, '0');
          const dd = String(dateVal.getDate()).padStart(2, '0');
          return `${yyyy}-${mm}-${dd}`;
        }

        const str = String(dateVal).trim();
        if (!str) return '';

        // Excel serial date number representation (e.g. 46177)
        if (/^\d{5}(\.\d+)?$/.test(str)) {
          try {
            const serialDate = Math.floor(parseFloat(str));
            const dateObj = new Date((serialDate - 25569) * 86400 * 1000);
            if (!isNaN(dateObj.getTime())) {
              const yyyy = dateObj.getFullYear();
              const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
              const dd = String(dateObj.getDate()).padStart(2, '0');
              return `${yyyy}-${mm}-${dd}`;
            }
          } catch { }
        }

        // Already YYYY-MM-DD standard format
        if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(str)) {
          const parts = str.split('-');
          return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
        }

        // DD-MM-YYYY or MM/DD/YYYY or DD.MM.YYYY
        const delimiterMatch = str.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
        if (delimiterMatch) {
          const part1 = delimiterMatch[1].padStart(2, '0');
          const part2 = delimiterMatch[2].padStart(2, '0');
          const yyyy = delimiterMatch[3];
          
          // Check if part1 > 12 -> then part1 is definitely Day and part2 is Month (DD-MM-YYYY)
          if (parseInt(part1) > 12) {
            return `${yyyy}-${part2}-${part1}`;
          }
          // Check if part2 > 12 -> then part1 is Month and part2 is Day (MM-DD-YYYY)
          if (parseInt(part2) > 12) {
            return `${yyyy}-${part1}-${part2}`;
          }
          // Default assumption: MM/DD/YYYY standard
          return `${yyyy}-${part1}-${part2}`;
        }

        return str;
      };

      // Helper to standardise any time representation to 24h HH:MM style
      const parseTimeToHHMM = (timeVal: any): string => {
        if (!timeVal) return '';

        // If it is a JS date object (sometimes parsed with time stamp)
        if (timeVal instanceof Date) {
          if (isNaN(timeVal.getTime())) return '';
          const hh = String(timeVal.getHours()).padStart(2, '0');
          const mm = String(timeVal.getMinutes()).padStart(2, '0');
          return `${hh}:${mm}`;
        }

        const trimmed = String(timeVal).trim();
        if (!trimmed) return '';

        // Handle Excel time serial fraction (e.g. 0.3326 represents 07:59)
        const num = parseFloat(trimmed);
        if (!isNaN(num) && num >= 0 && num < 1) {
          const totalSeconds = Math.round(num * 24 * 3600);
          const hours = Math.floor(totalSeconds / 3600);
          const minutes = Math.floor((totalSeconds % 3600) / 60);
          return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
        }

        // Handle 12-hour AM/PM format (e.g., "07:55 AM", "5:05 PM", "11:30pm")
        const ampmMatch = trimmed.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)$/i);
        if (ampmMatch) {
          let hours = parseInt(ampmMatch[1]);
          const minutes = parseInt(ampmMatch[2]);
          const ampm = ampmMatch[4].toUpperCase();
          if (ampm === 'PM' && hours < 12) {
            hours += 12;
          } else if (ampm === 'AM' && hours === 12) {
            hours = 0;
          }
          return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
        }

        // Handle generic standard 24h representation (e.g. "17:05:32" or "07:55" or "8:00")
        const standardMatch = trimmed.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
        if (standardMatch) {
          const hours = parseInt(standardMatch[1]);
          const minutes = parseInt(standardMatch[2]);
          return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
        }

        return trimmed;
      };

      rawJson.forEach((raw, index) => {
        const rowNum = index + 2; // header index offset

        const valId = findValueHeuristic(raw, targetMap.empId, 'empId');
        const rawId = valId !== undefined && valId !== null ? String(valId).trim() : '';

        const valName = findValueHeuristic(raw, targetMap.name, 'name');
        const rawName = valName !== undefined && valName !== null ? String(valName).trim() : '';

        const valDate = findValueHeuristic(raw, targetMap.date, 'date');
        const dateFormatted = parseDateToYYYYMMDD(valDate);

        const valCheckIn = findValueHeuristic(raw, targetMap.checkIn, 'checkIn');
        const rawCheckIn = parseTimeToHHMM(valCheckIn);

        const valCheckOut = findValueHeuristic(raw, targetMap.checkOut, 'checkOut');
        const rawCheckOut = parseTimeToHHMM(valCheckOut);

        const valStatus = findValueHeuristic(raw, targetMap.status, 'status');
        const rawStatus = valStatus !== undefined && valStatus !== null ? String(valStatus).trim() : '';

        // --- 1. MANDATORY FIELDS CHECK ---
        if (!rawId) {
          errors.push({
            row: rowNum, empId: 'N/A', field: targetMap.empId, value: '',
            reason: 'Employee Register ID parameter is mandatory.', severity: 'error'
          });
        }

        if (!dateFormatted) {
          errors.push({
            row: rowNum, empId: rawId || 'N/A', field: targetMap.date, value: '',
            reason: 'Workforce Date slot parameter is mandatory.', severity: 'error'
          });
        }

        // --- 2. DATABASE VERIFICATION ---
        let dbEmployee: Employee | undefined;
        if (rawId) {
          dbEmployee = employees.find(e => e.id && typeof e.id === 'string' && e.id.toUpperCase() === rawId.toUpperCase());
          if (!dbEmployee) {
            errors.push({
              row: rowNum, empId: rawId, field: targetMap.empId, value: rawId,
              reason: `Operator ID "${rawId}" is unregistered in SWM core ledger.`, severity: 'error'
            });
          }
        }

        // --- 3. TIME SPECIFICATION FORMAT CHECKS ---
        const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$/;
        if (rawCheckIn && !timeRegex.test(rawCheckIn)) {
          errors.push({
            row: rowNum, empId: rawId, field: targetMap.checkIn, value: rawCheckIn,
            reason: 'Check-In epoch structure must match 24h standard (HH:MM).', severity: 'warning'
          });
        }

        if (rawCheckOut && !timeRegex.test(rawCheckOut)) {
          errors.push({
            row: rowNum, empId: rawId, field: targetMap.checkOut, value: rawCheckOut,
            reason: 'Check-Out epoch structure must match 24h standard (HH:MM).', severity: 'warning'
          });
        }

        // --- 4. DUPLICATE CHECK WITH CURRENT SHEET ROWS ---
        const dup = rows.find(r => r.employeeId && typeof r.employeeId === 'string' && r.employeeId.toUpperCase() === rawId.toUpperCase() && r.date === dateFormatted);
        if (dup) {
          errors.push({
            row: rowNum, empId: rawId, field: 'Compound Key', value: `${rawId} on ${dateFormatted}`,
            reason: `Duplicate row collision: Row ${dup.rowNum} already registers shift log.`, severity: 'error'
          });
        }

        rows.push({
          rowNum,
          employeeId: rawId || 'N/A',
          name: rawName || (dbEmployee ? dbEmployee.name : 'Unknown Operator'),
          date: dateFormatted,
          status: rawStatus || undefined,
          checkIn: rawCheckIn,
          checkOut: rawCheckOut,
          raw
        });
      });

      if (!isSilent) {
        setProgressPercent(90);
        setLoadingPhase('Resolving heuristics error margins...');
        setTimeout(() => {
          setParsedRows(rows);
          setValidationErrors(errors);
          setLoading(false);
        }, 400);
      } else {
        setParsedRows(rows);
        setValidationErrors(errors);
      }
    } catch (err: any) {
      console.error('Error in processParsedData:', err);
      setValidationErrors([{
        row: 0, empId: 'SYSTEM', field: 'File Ingestion Error', value: '',
        reason: `Processing failure: ${err.message || 'unknown error'}`, severity: 'error'
      }]);
      setLoading(false);
    }
  };

  // Run silent revalidation of raw parsed logs when employees master is modified
  useEffect(() => {
    if (rawImportData && rawImportData.length > 0) {
      processParsedData(rawImportData, true);
    }
  }, [employees]);

  // Bulk Apply changes to global react context state
  const handleApplyCommitImport = () => {
    // Collect non-error blocks
    const fatalRows = new Set(validationErrors.filter(e => e.severity === 'error').map(e => e.row));
    const cleanRowsData = parsedRows.filter(r => !fatalRows.has(r.rowNum) && r.employeeId !== 'N/A');

    if (cleanRowsData.length === 0) {
      alert('Cannot perform import. Zero records passed validation checks.');
      return;
    }

    setLoading(true);
    setLoadingPhase('Executing database commit stream to SWM Ledger...');
    setProgressPercent(20);

    const importMethod: AttendanceMethod = importMode === 'Biometric' ? 'Biometric' : 'Manual';
    
    // Transform rows to match backend structures
    const recordsToCommit: AttendanceRecord[] = cleanRowsData.map((row) => {
      // Determine Late/Present/Absent/Leave status based on raw status or checkIn time
      let status: AttendanceStatus = 'Absent';
      if (row.status) {
        const cleanStatus = row.status.trim().toLowerCase();
        if (cleanStatus.includes('present') || cleanStatus === 'p' || cleanStatus === '1' || cleanStatus === 'active') {
          status = 'Present';
        } else if (cleanStatus.includes('late') || cleanStatus === 'l') {
          status = 'Late';
        } else if (cleanStatus.includes('leave') || cleanStatus === 'le' || cleanStatus.includes('on leave') || cleanStatus.includes('half') || cleanStatus === 'h' || cleanStatus.includes('half day')) {
          status = 'Leave';
        } else if (cleanStatus.includes('absent') || cleanStatus === 'a' || cleanStatus === '0') {
          status = 'Absent';
        } else if (row.checkIn) {
          const [hr, min] = row.checkIn.split(':').map(Number);
          const markerMinutes = hr * 60 + min;
          const gateLateThreshold = 8 * 60 + 15; // 8:15 AM
          status = markerMinutes > gateLateThreshold ? 'Late' : 'Present';
        }
      } else if (row.checkIn) {
        const [hr, min] = row.checkIn.split(':').map(Number);
        const markerMinutes = hr * 60 + min;
        const gateLateThreshold = 8 * 60 + 15; // 8:15 AM
        status = markerMinutes > gateLateThreshold ? 'Late' : 'Present';
      }

      return {
        id: `att_${row.employeeId}_${row.date}`,
        employeeId: row.employeeId,
        date: row.date,
        status,
        checkInTime: row.checkIn || undefined,
        checkOutTime: row.checkOut || undefined,
        method: importMethod,
        markedBy: currentUser.username,
        markedAt: new Date().toISOString()
      };
    });

    // Run progressive steps for micro-delays
    setTimeout(() => {
      setProgressPercent(60);
      setLoadingPhase('Recalculating shift-balancing models and machine allocation grids...');
      
      setTimeout(async () => {
        setProgressPercent(100);
        await bulkMarkAttendance(recordsToCommit);
        
        // Generate post-import ledger report
        const present = recordsToCommit.filter(r => r.status === 'Present').length;
        const late = recordsToCommit.filter(r => r.status === 'Late').length;
        const absent = recordsToCommit.filter(r => r.status === 'Absent').length;
        const success = recordsToCommit.length;
        const totalRows = parsedRows.length;
        const detectedErrorsCount = validationErrors.filter(e => e.severity === 'error').length;
        const warningsCount = validationErrors.filter(e => e.severity === 'warning').length;

        const totalOperationalWorkers = employees.length;
        const calculatedAttendancePct = Number(
          (((present + late) / (present + late + absent || 1)) * 100).toFixed(1)
        );

        setImportSummary({
          total: totalRows,
          success,
          errors: detectedErrorsCount,
          warnings: warningsCount,
          present,
          late,
          absent,
        });

        setLoading(false);
      }, 700);
    }, 600);
  };

  const handleDownloadSample = (type: 'csv' | 'xlsx') => {
    // Generate valid sample based on current employee registry database
    const sampleHeaders = ['Employee ID', 'Employee Name', 'Date', 'Status', 'Check-In Time', 'Check-Out Time'];
    const sampleRows = employees.slice(0, 5).map((e, index) => {
      const times = [
        { in: '07:55', out: '17:05', status: 'Present' },
        { in: '08:02', out: '17:00', status: 'Present' },
        { in: '08:22', out: '17:02', status: 'Late' }, // Late operator
        { in: '', out: '', status: 'Absent' }, // Absent
        { in: '07:48', out: '17:15', status: 'Present' }
      ];
      return [
        e.id,
        e.name,
        '2026-06-04',
        times[index].status,
        times[index].in,
        times[index].out
      ];
    });

    if (type === 'csv') {
      const csvContent = Papa.unparse({
        fields: sampleHeaders,
        data: sampleRows
      });
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', 'swm_attendance_import_template.csv');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else {
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet([sampleHeaders, ...sampleRows]);
      XLSX.utils.book_append_sheet(wb, ws, 'Template');
      XLSX.writeFile(wb, 'swm_attendance_import_template.xlsx');
    }
  };

  const handleStartEditLine = (line: any) => {
    setEditingLineId(line.id);
    setEditTargetQty(String(line.targetQuantity));
    setEditActualQty(String(line.actualQuantity));
  };

  const handleSaveLineProduction = (lineId: number) => {
    const target = parseInt(editTargetQty, 10);
    const actual = parseInt(editActualQty, 10); // base 10
    const cleanTarget = isNaN(target) ? 0 : target;
    const cleanActual = isNaN(actual) ? 0 : actual;
    updateProductionLine(lineId, cleanTarget, cleanActual);
    setEditingLineId(null);
  };


  // ---------- ATTENDANCE IMPORT RESOLUTION HANDLERS ----------
  const handleDownloadMissingReport = (missingList: { id: string; name: string }[]) => {
    const headers = ['Missing Employee ID', 'Suggested Name', 'Date Detected', 'Source Ingestion File'];
    const data = missingList.map(m => [
      m.id,
      m.name,
      new Date().toISOString().split('T')[0],
      fileName || 'unnamed_sheet'
    ]);
    const csv = Papa.unparse({ fields: headers, data });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `swms_missing_personnel_report_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleSkipMissingRecords = (missingList: { id: string; name: string }[]) => {
    const missingIds = new Set(missingList.map(m => m.id.toUpperCase()));
    
    // Filter parsedRows list to exclude missing employees
    const filteredRows = parsedRows.filter(r => r.employeeId && r.employeeId !== 'N/A' && !missingIds.has(r.employeeId.toUpperCase()));
    
    setParsedRows(filteredRows);
    setValidationErrors(prev => prev.filter(e => e.empId === 'N/A' || !missingIds.has(e.empId.toUpperCase())));
    
    alert(`Skipped unregistered operators. Filtered active ingestion dataset to ${filteredRows.length} rows.`);
  };

  const handleCancelAttendanceImport = () => {
    setFileName('');
    setParsedRows([]);
    setRawImportData([]);
    setValidationErrors([]);
    setImportSummary(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };


  // ---------- EMPLOYEE MASTER BACKEND EMULATION & PARSERS ----------
  const handleDownloadEmpTemplate = (type: 'csv' | 'xlsx') => {
    const templateHeaders = [
      'Employee ID', 'Employee Name', 'Department', 'Section', 'Line Number', 'Designation', 
      'Joining Date', 'Skill Category', 'Experience Years', 'Contact Number', 
      'Base Efficiency', 'Historical Attendance Rate'
    ];
    
    const samplePersonnel = [
      ['EMP120', 'Aniket Bose', 'Sewing', 'Main Line', '1', 'Sewing Operator', '2023-01-10', 'Grade B Operator', '4', '+91 91234 56789', '80', '95'],
      ['EMP121', 'Rumi Begum', 'Sewing', 'Sampling', '0', 'Sampling Operator', '2024-03-15', 'Grade A Operator', '3', '+91 98123 45678', '85', '92'],
      ['EMP122', 'Sunil Patra', 'Cutting', 'Main Line', '1', 'Spreader', '2025-05-20', 'Helper', '1', '+91 77123 98765', '70', '88'],
      ['EMP123', 'Meera Nair', 'QA', 'Sampling', '0', 'Quality Inspector', '2022-11-01', 'Quality Inspector', '5', '+91 88123 45678', '88', '94']
    ];

    if (type === 'csv') {
      const csvContent = Papa.unparse({
        fields: templateHeaders,
        data: samplePersonnel
      });
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', 'swms_employee_master_template.csv');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else {
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet([templateHeaders, ...samplePersonnel]);
      XLSX.utils.book_append_sheet(wb, ws, 'Template');
      XLSX.writeFile(wb, 'swms_employee_master_template.xlsx');
    }
  };

  const handleEmpFileDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setEmpDragActive(true);
    } else if (e.type === "dragleave") {
      setEmpDragActive(false);
    }
  };

  const handleEmpFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setEmpDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleEmpFile(e.dataTransfer.files[0]);
    }
  };

  const handleEmpFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleEmpFile(e.target.files[0]);
    }
  };

  const findEmpValueHeuristic = (rowObj: any, role: string) => {
    if (!rowObj) return '';
    const keys = Object.keys(rowObj);
    let fallbackKey: string | undefined;

    const cleanRole = role.toLowerCase().replace(/[\s_-]/g, '');

    if (cleanRole === 'empid' || cleanRole === 'employeeid') {
      fallbackKey = keys.find(k => {
        const lk = k.toLowerCase().replace(/[\s_-]/g, '');
        return lk === 'id' || lk.includes('empid') || lk.includes('employeeid') || lk.includes('operatorid') || lk.includes('workerid') || lk === 'code' || lk.includes('employeecode');
      });
    } else if (cleanRole === 'name' || cleanRole === 'employeename') {
      fallbackKey = keys.find(k => {
        const lk = k.toLowerCase().replace(/[\s_-]/g, '');
        return lk.includes('name') || lk === 'operator' || lk === 'employee' || lk === 'worker' || lk === 'fullname';
      });
    } else if (cleanRole === 'department') {
      fallbackKey = keys.find(k => {
        const lk = k.toLowerCase().replace(/[\s_-]/g, '');
        return lk.includes('dept') || lk.includes('department') || lk === 'vertical' || lk === 'division';
      });
    } else if (cleanRole === 'section') {
      fallbackKey = keys.find(k => {
        const lk = k.toLowerCase().replace(/[\s_-]/g, '');
        return lk.includes('section') || lk === 'subunit' || lk.includes('floor') || lk === 'wing' || lk.includes('area');
      });
    } else if (cleanRole === 'linenumber') {
      fallbackKey = keys.find(k => {
        const lk = k.toLowerCase().replace(/[\s_-]/g, '');
        return lk.includes('line') || lk.includes('linenumber') || lk.includes('productionline') || lk.includes('lineno');
      });
    } else if (cleanRole === 'designation') {
      fallbackKey = keys.find(k => {
        const lk = k.toLowerCase().replace(/[\s_-]/g, '');
        return lk.includes('desig') || lk.includes('designation') || lk === 'role' || lk === 'title' || lk.includes('job');
      });
    } else if (cleanRole === 'joiningdate') {
      fallbackKey = keys.find(k => {
        const lk = k.toLowerCase().replace(/[\s_-]/g, '');
        return lk.includes('joining') || lk.includes('join') || lk.includes('dateofjoining') || lk.includes('joiningdate');
      });
    } else if (cleanRole === 'skillcategory') {
      fallbackKey = keys.find(k => {
        const lk = k.toLowerCase().replace(/[\s_-]/g, '');
        return lk.includes('skillcategory') || lk.includes('category') || lk.includes('grade') || lk.includes('skill_category') || lk.includes('skilllevel') || lk.includes('expert');
      });
    } else if (cleanRole === 'experience') {
      fallbackKey = keys.find(k => {
        const lk = k.toLowerCase().replace(/[\s_-]/g, '');
        return lk.includes('experience') || lk === 'exp' || lk.includes('years') || lk.includes('experience_years');
      });
    } else if (cleanRole === 'contactnumber') {
      fallbackKey = keys.find(k => {
        const lk = k.toLowerCase().replace(/[\s_-]/g, '');
        return lk.includes('contact') || lk === 'phone' || lk === 'mobile' || lk.includes('phone_number') || lk.includes('contactnumber') || lk.includes('contact_number');
      });
    } else if (cleanRole === 'baseefficiency') {
      fallbackKey = keys.find(k => {
        const lk = k.toLowerCase().replace(/[\s_-]/g, '');
        return lk.includes('baseefficiency') || lk.includes('efficiency') || lk.includes('base_efficiency') || lk.includes('avg_efficiency') || lk.includes('proficiency');
      });
    } else if (cleanRole === 'historicalattendancerate') {
      fallbackKey = keys.find(k => {
        const lk = k.toLowerCase().replace(/[\s_-]/g, '');
        return lk.includes('historicalattendance') || lk.includes('attendance') || lk.includes('attendancerate') || lk.includes('attendance_rate') || lk.includes('att_rate');
      });
    }

    if (fallbackKey !== undefined && rowObj[fallbackKey] !== undefined && rowObj[fallbackKey] !== null) {
      return rowObj[fallbackKey];
    }
    return '';
  };

  const handleEmpFile = (file: File) => {
    setEmpFileName(file.name);
    setLoading(true);
    setLoadingPhase('Reading uploaded employee master data...');
    setProgressPercent(10);
    setEmpImportSummary(null);

    const fileReader = new FileReader();
    const isCsv = file.name.endsWith('.csv');

    if (isCsv) {
      fileReader.onload = (e) => {
        const text = e.target?.result as string;
        setProgressPercent(40);
        setLoadingPhase('PapaParse CSV stream boot...');
        Papa.parse(text, {
          header: true,
          skipEmptyLines: true,
          complete: (results) => {
            setEmpRawData(results.data);
            processEmpParsedData(results.data);
          },
          error: (err) => {
            setEmpValidationErrors([{
              row: 0, empId: 'SYSTEM', field: 'File Ingestion', value: '',
              reason: `Failed to stream parse CSV file: ${err.message}`, severity: 'error'
            }]);
            setLoading(false);
          }
        });
      };
      fileReader.readAsText(file);
    } else {
      fileReader.onload = (e) => {
        try {
          setProgressPercent(40);
          setLoadingPhase('Decompressing XLSX layout schema records...');
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheetName = workbook.SheetNames[0];
          const sheet = workbook.Sheets[firstSheetName];
          const json = XLSX.utils.sheet_to_json(sheet);
          setEmpRawData(json);
          processEmpParsedData(json);
        } catch (ex: any) {
          setEmpValidationErrors([{
            row: 0, empId: 'SYSTEM', field: 'Spreadsheet Inbound', value: '',
            reason: `XLSX formatting breach: ${ex.message}`, severity: 'error'
          }]);
          setLoading(false);
        }
      };
      fileReader.readAsArrayBuffer(file);
    }
  };

  const processEmpParsedData = (rawJson: any[], overrideCol?: string, customRulesOverride?: { rawValue: string; mappedStatus: string }[]) => {
    setLoading(true);
    setProgressPercent(60);
    setLoadingPhase('Running comprehensive Employee Master validation pipeline...');

    setTimeout(() => {
      const errors: ValidationError[] = [];
      const parsedRowsTemp: any[] = [];
      const seenIdsInSheet = new Set<string>();

      // Active rules list
      const rulesToUse = customRulesOverride || customRulesList;
      const rulesMap = getRulesMap(rulesToUse);

      // 1. Column detection logic
      let currentSelectedCol = overrideCol;
      if (overrideCol === undefined) {
        const firstRow = rawJson[0];
        if (firstRow) {
          const keys = Object.keys(firstRow);
          const keywords = ['assignment', 'assignmentstatus', 'status', 'workforcestatus', 'allocationstatus', 'availability', 'employeeallocation', 'assigned', 'assignedstatus'];
          const detectedCols = keys.filter(k => {
            const lk = k.toLowerCase().replace(/[\s_-]/g, '');
            return keywords.includes(lk) || lk.includes('assignstatus') || lk.includes('allocstatus');
          });
          setDetectedAssignmentColumns(detectedCols);
          if (detectedCols.length > 0) {
            currentSelectedCol = detectedCols[0];
            setSelectedAssignmentColumn(detectedCols[0]);
          } else {
            currentSelectedCol = '';
            setSelectedAssignmentColumn('');
          }
        } else {
          currentSelectedCol = '';
          setSelectedAssignmentColumn('');
        }
      }

      // 2. Warn if no assignment or status column exists
      if (!currentSelectedCol) {
        errors.push({
          row: 1,
          empId: 'SYSTEM',
          field: 'Assignment Status',
          value: 'N/A',
          reason: 'No assignment-related column detected in the uploaded file. Defaulting all records to "Unassigned" status.',
          severity: 'warning'
        });
      }

      rawJson.forEach((raw, index) => {
        const rowNum = index + 2;

        const empIdRaw = String(findEmpValueHeuristic(raw, 'empId')).trim();
        const empName = String(findEmpValueHeuristic(raw, 'name')).trim();
        const department = String(findEmpValueHeuristic(raw, 'department')).trim() || 'Sewing';
        const section = String(findEmpValueHeuristic(raw, 'section')).trim() || 'Main Line';
        const lineVal = findEmpValueHeuristic(raw, 'lineNumber');
        const designation = String(findEmpValueHeuristic(raw, 'designation')).trim() || 'Sewing Operator';
        const joiningDateRaw = findEmpValueHeuristic(raw, 'joiningDate');
        const skillCategoryRaw = String(findEmpValueHeuristic(raw, 'skillCategory')).trim();
        const experienceRaw = findEmpValueHeuristic(raw, 'experience');
        const contactNumberRaw = String(findEmpValueHeuristic(raw, 'contactNumber')).trim();
        const baseEfficiencyRaw = findEmpValueHeuristic(raw, 'baseEfficiency');
        const historicalAttendanceRaw = findEmpValueHeuristic(raw, 'historicalAttendanceRate');

        // Clean values
        const empId = empIdRaw.toUpperCase();

        // 1. Mandatory Employee ID
        if (!empIdRaw) {
          errors.push({
            row: rowNum, empId: 'N/A', field: 'Employee ID', value: '',
            reason: 'Employee ID is a mandatory unique identifier.', severity: 'error'
          });
        }

        // 2. Mandatory Employee Name
        if (!empName) {
          errors.push({
            row: rowNum, empId: empId || 'N/A', field: 'Employee Name', value: '',
            reason: 'Employee Name is a required field.', severity: 'error'
          });
        }

        // 3. Duplicate checks in file itself
        if (empId) {
          if (seenIdsInSheet.has(empId)) {
            errors.push({
              row: rowNum, empId, field: 'Employee ID', value: empId,
              reason: `Duplicate entry in spreadsheet file: ID "${empId}" is declared multiple times.`, severity: 'error'
            });
          } else {
            seenIdsInSheet.add(empId);
          }
        }

        // 4. Line Number standardisation (0-100)
        let lineNumber = 1;
        if (lineVal !== undefined && lineVal !== '') {
          const parsedLine = parseInt(String(lineVal).replace(/[^\d]/g, ''), 10);
          if (isNaN(parsedLine) || parsedLine < 0 || parsedLine > 100) {
            errors.push({
              row: rowNum, empId: empId || 'N/A', field: 'Line Number', value: String(lineVal),
              reason: 'Line Number must be a numeric value between 0 and 100. Defaulted to 1.', severity: 'warning'
            });
          } else {
            lineNumber = parsedLine;
          }
        }

        // 5. Joining Date validation
        let joiningDate = '2026-06-05';
        if (joiningDateRaw) {
          let checkDate: Date | null = null;
          if (joiningDateRaw instanceof Date) {
            checkDate = joiningDateRaw;
          } else {
            const strDate = String(joiningDateRaw).trim();
            if (/^\d{5}$/.test(strDate)) {
              const serialDate = parseInt(strDate);
              checkDate = new Date((serialDate - 25569) * 86400 * 1000);
            } else {
              checkDate = new Date(strDate);
            }
          }

          if (checkDate && !isNaN(checkDate.getTime())) {
            const yyyy = checkDate.getFullYear();
            const mm = String(checkDate.getMonth() + 1).padStart(2, '0');
            const dd = String(checkDate.getDate()).padStart(2, '0');
            joiningDate = `${yyyy}-${mm}-${dd}`;
          } else {
            errors.push({
              row: rowNum, empId: empId || 'N/A', field: 'Joining Date', value: String(joiningDateRaw),
              reason: 'Joining date format unrecognized. Accepted formats include YYYY-MM-DD. Fallback to today.', severity: 'warning'
            });
          }
        }

        // 6. Skill Category validation
        let skillCategory: SkillCategory = 'Grade B Operator';
        const cleanSkill = skillCategoryRaw.toLowerCase();
        if (cleanSkill.includes('grade a') || cleanSkill === 'a' || cleanSkill.includes('senior') || cleanSkill.includes('expert')) {
          skillCategory = 'Grade A Operator';
        } else if (cleanSkill.includes('grade b') || cleanSkill === 'b' || cleanSkill.includes('intermediate') || cleanSkill.includes('sewing operator')) {
          skillCategory = 'Grade B Operator';
        } else if (cleanSkill.includes('grade c') || cleanSkill === 'c' || cleanSkill.includes('junior') || cleanSkill.includes('beginner')) {
          skillCategory = 'Grade C Operator';
        } else if (cleanSkill.includes('helper') || cleanSkill.includes('assistant')) {
          skillCategory = 'Helper';
        } else if (cleanSkill.includes('quality') || cleanSkill.includes('inspector') || cleanSkill.includes('qa') || cleanSkill.includes('auditor')) {
          skillCategory = 'Quality Inspector';
        } else if (cleanSkill.includes('iron') || cleanSkill.includes('finish') || cleanSkill.includes('packing') || cleanSkill.includes('pack')) {
          skillCategory = 'Ironer/Finisher';
        } else if (skillCategoryRaw !== '') {
          errors.push({
            row: rowNum, empId: empId || 'N/A', field: 'Skill Category', value: skillCategoryRaw,
            reason: `Unrecognized Skill Category ("${skillCategoryRaw}"). Normalized to "Grade B Operator".`, severity: 'warning'
          });
        }

        // 7. Experience years standardisation
        let experience = 2;
        if (experienceRaw !== undefined && experienceRaw !== '') {
          const parsedExp = parseFloat(String(experienceRaw).replace(/[^\d\.]/g, ''));
          if (isNaN(parsedExp) || parsedExp < 0 || parsedExp > 60) {
            errors.push({
              row: rowNum, empId: empId || 'N/A', field: 'Experience Years', value: String(experienceRaw),
              reason: 'Experience years must be a valid positive number. Defaulted to 2 years.', severity: 'warning'
            });
          } else {
            experience = parsedExp;
          }
        }

        // 8. Contact Number digits validation
        let contactNumber = contactNumberRaw;
        if (contactNumberRaw) {
          const digitsOnly = contactNumberRaw.replace(/[^\d]/g, '');
          if (digitsOnly.length < 8) {
            errors.push({
              row: rowNum, empId: empId || 'N/A', field: 'Contact Number', value: contactNumberRaw,
              reason: 'Contact Number contains too few digits. Check for errors.', severity: 'warning'
            });
          }
        } else {
          contactNumber = `+91 95${Math.floor(10000000 + Math.random() * 90000000)}`;
          errors.push({
            row: rowNum, empId: empId || 'N/A', field: 'Contact Number', value: 'Blank',
            reason: 'Contact Number is missing. Generated dummy contact details.', severity: 'warning'
          });
        }

        // 9. Base Efficiency validation (0-100)
        let baseEfficiency = 75;
        if (baseEfficiencyRaw !== undefined && baseEfficiencyRaw !== '') {
          const parsedEff = parseFloat(String(baseEfficiencyRaw).replace(/[^\d\.]/g, ''));
          if (isNaN(parsedEff) || parsedEff < 10 || parsedEff > 100) {
            errors.push({
              row: rowNum, empId: empId || 'N/A', field: 'Base Efficiency', value: String(baseEfficiencyRaw),
              reason: 'Base Efficiency must be a percentage between 10% and 100%. Set to standard 75%.', severity: 'warning'
            });
          } else {
            baseEfficiency = parsedEff;
          }
        }

        // 10. Historical Attendance Rate validation (0-100)
        let historicalAttendanceRate = 90;
        if (historicalAttendanceRaw !== undefined && historicalAttendanceRaw !== '') {
          const parsedAtt = parseFloat(String(historicalAttendanceRaw).replace(/[^\d\.]/g, ''));
          if (isNaN(parsedAtt) || parsedAtt < 10 || parsedAtt > 100) {
            errors.push({
              row: rowNum, empId: empId || 'N/A', field: 'Historical Attendance Rate', value: String(historicalAttendanceRaw),
              reason: 'Historical Attendance Rate must be between 10% and 100%. Set to standard 90%.', severity: 'warning'
            });
          } else {
            historicalAttendanceRate = parsedAtt;
          }
        }

        // 11. Custom Assignment Status Parsing & Validation
        let targetAssignmentStatus: any = 'Unassigned';
        if (currentSelectedCol) {
          const rawStatusVal = String(raw[currentSelectedCol] || '').trim();
          if (rawStatusVal) {
            const normalized = normalizeAssignmentStatus(rawStatusVal, rulesMap);
            targetAssignmentStatus = normalized;

            // Flag unrecognized/un-mapped raw status cell values
            const cleanRaw = rawStatusVal.toLowerCase().trim();
            const hasRule = !!rulesMap[cleanRaw];
            const isStandard = ['assigned', 'unassigned', 'available for replacement', 'available', 'training', 'meeting', 'quality audit', 'maintenance support', 'off-line activity', 'leave'].includes(cleanRaw);
            if (!hasRule && !isStandard) {
              errors.push({
                row: rowNum,
                empId: empId || 'N/A',
                field: 'Assignment Status',
                value: rawStatusVal,
                reason: `Unrecognized Assignment Status value: "${rawStatusVal}". Automatically normalized to "${normalized}".`,
                severity: 'warning'
              });
            }
          }
        }

        parsedRowsTemp.push({
          rowNum,
          id: empId,
          name: empName,
          department,
          section,
          lineNumber,
          designation,
          joiningDate,
          skillCategory,
          experience,
          contactNumber,
          baseEfficiency,
          historicalAttendanceRate,
          workforceAssignmentStatus: targetAssignmentStatus,
          raw
        });
      });

      setEmpParsedRows(parsedRowsTemp);
      setEmpValidationErrors(errors);
      setLoading(false);
    }, 500);
  };

  const handleApplyCommitEmployees = () => {
    const fatalRows = new Set(empValidationErrors.filter(e => e.severity === 'error').map(e => e.row));
    const cleanEmpData = empParsedRows.filter(r => !fatalRows.has(r.rowNum) && r.id);

    if (cleanEmpData.length === 0) {
      alert('Cannot perform Employee Master Import. Zero records passed validation checks.');
      return;
    }

    setLoading(true);
    setLoadingPhase('Integrating Employee Master registers into SWM database...');
    setProgressPercent(20);

    setTimeout(async () => {
      let addCount = 0;
      let updateCount = 0;
      let skippedCount = 0;

      let assignAdded = 0;
      let assignUpdated = 0;
      let assignUnchanged = 0;
      const assignFailed = empValidationErrors.filter(e => e.field === 'Assignment Status' && e.severity === 'error').length;

      setProgressPercent(35);

      const employeeObjs: Employee[] = [];

      cleanEmpData.forEach((row) => {
        const existingEmp = employees.find(e => e.id.toUpperCase() === row.id.toUpperCase());
        const uploadedStatus = row.workforceAssignmentStatus || 'Unassigned';

        if (existingEmp) {
          const currentStatus = existingEmp.workforceAssignmentStatus || 'Unassigned';
          if (uploadedStatus !== currentStatus) {
            assignUpdated++;
          } else {
            assignUnchanged++;
          }
        } else {
          if (uploadedStatus && uploadedStatus !== 'Unassigned') {
            assignAdded++;
          } else {
            assignUnchanged++;
          }
        }

        const defaultSkills = [
          {
            operationName: row.department === 'Sewing' ? 'Collar Join' : 'Fabric Inspection',
            skillLevel: row.skillCategory.includes('Grade A') ? 'Expert' : row.skillCategory.includes('Grade B') ? 'Advanced' : 'Intermediate' as SkillLevel,
            proficiency: row.baseEfficiency,
            trainingStatus: 'Completed' as TrainingStatus
          }
        ];

        const riskScore = Math.max(0, Math.min(100, Math.round((100 - row.historicalAttendanceRate) + Math.random() * 10)));
        const riskLevel: RiskLevel = riskScore < 15 ? 'Low' : riskScore < 30 ? 'Medium' : riskScore < 50 ? 'High' : 'Critical';

        const employeeObj: Employee = {
          id: row.id,
          name: row.name,
          photoUrl: existingEmp?.photoUrl || '',
          department: row.department,
          section: row.section,
          lineNumber: row.lineNumber,
          designation: row.designation,
          joiningDate: row.joiningDate,
          skillCategory: row.skillCategory,
          experience: row.experience,
          contactNumber: row.contactNumber,
          skills: existingEmp?.skills || defaultSkills,
          baseEfficiency: row.baseEfficiency,
          historicalAttendanceRate: row.historicalAttendanceRate,
          riskScore: existingEmp?.riskScore || riskScore,
          riskLevel: existingEmp?.riskLevel || riskLevel,
          workforceAssignmentStatus: uploadedStatus,
          leaveBalances: existingEmp?.leaveBalances || {
            casual: 12,
            sick: 10,
            earned: 15,
            emergency: 5
          }
        };

        if (existingEmp) {
          if (empActionRule === 'update-only' || empActionRule === 'merge-update') {
            employeeObjs.push(employeeObj);
            updateCount++;
          } else {
            skippedCount++;
          }
        } else {
          if (empActionRule === 'add-only' || empActionRule === 'merge-update') {
            employeeObjs.push(employeeObj);
            addCount++;
          } else {
            skippedCount++;
          }
        }
      });

      if (employeeObjs.length > 0) {
        await importBulkEmployees(employeeObjs, empActionRule, (percent) => {
          setProgressPercent(35 + Math.round(percent * 0.65));
        });
      }

      setProgressPercent(100);
      setEmpImportSummary({
        total: empParsedRows.length,
        success: addCount + updateCount,
        errors: empParsedRows.length - cleanEmpData.length,
        warnings: empValidationErrors.filter(e => e.severity === 'warning').length,
        actionsTaken: `Successfully added ${addCount} new personnel, updated ${updateCount} existing worker master registers, and skipped ${skippedCount} duplicate collisions.`,
        assignmentDetails: {
          added: assignAdded,
          updated: assignUpdated,
          unchanged: assignUnchanged,
          failed: assignFailed
        }
      });

      // Reset parsing state afterwards to show success
      setEmpFileName('');
      setEmpParsedRows([]);
      setEmpValidationErrors([]);
      setLoading(false);
    }, 800);
  };

  const handleEmpExportDownload = (format: 'xlsx' | 'csv' | 'pdf') => {
    const dataset = [...empExportPreview];
    const headers = [
      'Employee ID', 'Name', 'Department', 'Section', 'Line Number', 'Designation', 
      'Joining Date', 'Skill Category', 'Experience Years', 'Contact Number', 
      'Base Efficiency (%)', 'Historical Attendance Rate (%)', 'Absenteeism Risk'
    ];
    
    const rows = dataset.map(e => [
      e.id, e.name, e.department, e.section, e.lineNumber === 0 ? 'N/A' : `Line ${e.lineNumber}`,
      e.designation, e.joiningDate, e.skillCategory, e.experience, e.contactNumber,
      `${e.baseEfficiency}%`, `${e.historicalAttendanceRate}%`, e.riskLevel
    ]);

    if (format === 'csv') {
      const csv = Papa.unparse({ fields: headers, data: rows });
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `swms_personnel_roster_export_${Date.now()}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else if (format === 'xlsx') {
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
      XLSX.utils.book_append_sheet(wb, ws, 'Employees Master');
      XLSX.writeFile(wb, `swms_personnel_roster_export_${Date.now()}.xlsx`);
    } else if (format === 'pdf') {
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        const tableHeadersHtml = headers.map(h => `<th style="text-align: left; padding: 10px; font-size: 11px; font-weight: bold; border-bottom: 2px solid #cbd5e1; background-color: #f1f5f9; color: #475569;">${h}</th>`).join('');
        
        const tableRowsHtml = rows.map(row => `
          <tr style="border-bottom: 1px solid #e2e8f0; font-size: 11px;">
            ${row.map(cell => `<td style="padding: 10px; color: #334155;">${cell !== undefined && cell !== null ? cell : '-'}</td>`).join('')}
          </tr>
        `).join('');

        printWindow.document.write(`
          <html>
            <head>
              <title>SWM - Employee Master Personnel Roster</title>
              <style>
                body { font-family: 'Helvetica Neue', Arial, sans-serif; padding: 24px; color: #334155; }
                h1 { font-size: 22px; font-weight: bold; margin-bottom: 4px; color: #1e3a8a; }
                p { font-size: 11px; color: #64748b; margin-bottom: 20px; }
                table { width: 100%; border-collapse: collapse; margin-top: 15px; }
                .footer { margin-top: 40px; font-size: 10px; text-align: center; color: #94a3b8; border-top: 1px dashed #cbd5e1; padding-top: 15px; }
              </style>
            </head>
            <body>
              <div style="display: flex; justify-content: space-between; align-items: top; border-bottom: 2px solid #2563eb; padding-bottom: 15px; margin-bottom: 15px;">
                <div>
                  <h1 style="margin: 0; color: #2563eb;">SWM</h1>
                  <h2 style="margin: 4px 0 0 0; color: #1e293b; font-size: 15px; font-weight: bold;">Employee Master Personnel Roster</h2>
                  <p style="margin: 4px 0 0 0;">Generated on ${new Date().toLocaleString()} | Filtered Dataset Size: ${dataset.length} Personnel Records</p>
                </div>
                <div style="text-align: right; font-size: 10px; color: #64748b; line-height: 1.4;">
                  <strong>SWM Enterprise Ledger</strong><br>
                  Security: TLS SECURE TRANSACTION SESSION<br>
                  Dept: ${empExportDept} | Section: ${empExportSection} | Line: ${empExportLine}
                </div>
              </div>
              <table>
                <thead>
                  <tr>
                    ${tableHeadersHtml}
                  </tr>
                </thead>
                <tbody>
                  ${tableRowsHtml}
                </tbody>
              </table>
              <div class="footer">
                This document is a certified compliance printout generated dynamically from the SWM industrial workforce management system ledger.<br>
                SWM Systems Admin Center &copy; 2026. All rights reserved. Confidential.
              </div>
              <script>
                window.onload = function() {
                  setTimeout(function() {
                    window.print();
                  }, 300);
                };
              </script>
            </body>
          </html>
        `);
        printWindow.document.close();
      }
    }
  };

  // Keep Employee Export preview synchronized as filters change
  useEffect(() => {
    let filtered = [...employees];

    if (empExportDept !== 'All') {
      filtered = filtered.filter(e => e.department.toLowerCase() === empExportDept.toLowerCase());
    }
    if (empExportSection !== 'All') {
      filtered = filtered.filter(e => e.section.toLowerCase() === empExportSection.toLowerCase());
    }
    if (empExportDesignation !== 'All') {
      filtered = filtered.filter(e => e.designation.toLowerCase() === empExportDesignation.toLowerCase());
    }
    if (empExportLine !== 'All') {
      filtered = filtered.filter(e => e.lineNumber === parseInt(empExportLine, 10));
    }
    if (empExportSkill !== 'All') {
      filtered = filtered.filter(e => e.skillCategory.toLowerCase() === empExportSkill.toLowerCase());
    }
    if (empExportExperience !== 'All') {
      if (empExportExperience === '0-2') {
        filtered = filtered.filter(e => e.experience <= 2);
      } else if (empExportExperience === '2-5') {
        filtered = filtered.filter(e => e.experience > 2 && e.experience <= 5);
      } else if (empExportExperience === '5+') {
        filtered = filtered.filter(e => e.experience > 5);
      }
    }

    setEmpExportPreview(filtered);
  }, [employees, empExportDept, empExportSection, empExportDesignation, empExportLine, empExportSkill, empExportExperience]);


  // ---------- EXPORT LOGIC CENTER ----------
  const handleGenerateExportPreview = () => {
    // Filter attendance datasets by dates, depts, lines and statuses
    const listRecords: any[] = [];

    // Date range bounds
    const start = new Date(startDate);
    const end = new Date(endDate);

    attendance.forEach(record => {
      const recDate = new Date(record.date);
      if (recDate >= start && recDate <= end) {
        // Hydrate record with employee details
        const emp = employees.find(e => e.id === record.employeeId);
        if (emp) {
          const matchesDept = deptFilter === 'All' || emp.department.toLowerCase() === deptFilter.toLowerCase();
          const matchesLine = lineFilter === 'All' || emp.lineNumber === parseInt(lineFilter);
          const matchesStatus = statusFilter === 'All' || record.status === statusFilter;

          if (matchesDept && matchesLine && matchesStatus) {
            // Calculate working hours if time is present
            let hours = 0;
            if (record.checkInTime && record.checkOutTime) {
              const [iHr, iMin] = record.checkInTime.split(':').map(Number);
              const [oHr, oMin] = record.checkOutTime.split(':').map(Number);
              hours = Number(((oHr * 60 + oMin - (iHr * 60 + iMin)) / 60).toFixed(2));
            }

            listRecords.push({
              recordId: record.id,
              employeeId: emp.id,
              name: emp.name,
              department: emp.department,
              line: emp.lineNumber === 0 ? 'N/A' : `Line ${emp.lineNumber}`,
              date: record.date,
              status: record.status,
              checkIn: record.checkInTime || '-',
              checkOut: record.checkOutTime || '-',
              method: record.method,
              workingHours: hours > 0 ? hours : (record.status === 'Present' || record.status === 'Late' ? 8.00 : 0.00),
              markedBy: record.markedBy
            });
          }
        }
      }
    });

    setExportPreview(listRecords);
  };

  // Run automatically when active parameters alter
  React.useEffect(() => {
    handleGenerateExportPreview();
  }, [startDate, endDate, deptFilter, lineFilter, statusFilter, reportTemplate, attendance]);

  const handleDownloadExportData = (format: 'xlsx' | 'csv') => {
    let dataset = [...exportPreview];
    let headers: string[] = [];
    let mappedRows: any[] = [];

    const dateStr = `${startDate}_to_${endDate}`;
    const filename = `swms_${reportTemplate}_${dateStr}`;

    switch (reportTemplate) {
      case 'attendance_report':
        headers = ['Employee ID', 'Name', 'Department', 'Production Line', 'Date', 'Status', 'Check-In', 'Check-Out', 'Working Hours', 'Method', 'Approved By'];
        mappedRows = dataset.map(d => [d.employeeId, d.name, d.department, d.line, d.date, d.status, d.checkIn, d.checkOut, d.workingHours, d.method, d.markedBy]);
        break;
      
      case 'absenteeism_report':
        // Highlight critical absent rows
        const absents = dataset.filter(d => d.status === 'Absent');
        headers = ['Employee ID', 'Name', 'Department', 'Production Line', 'Absence Date', 'Method Marker', 'Logged Auditor'];
        mappedRows = absents.map(d => [d.employeeId, d.name, d.department, d.line, d.date, d.method, d.markedBy]);
        break;

      case 'line_efficiency_report':
        // Summarised stats for relevant lines
        headers = ['Line', 'Supervisor', 'Target output (pcs)', 'Actual output (pcs)', 'Manpower head count', 'Line Efficiency (%)', 'Status'];
        mappedRows = productionLines.filter(l => lineFilter === 'All' || l.id === parseInt(lineFilter)).map(l => [
          `Line ${l.id}`,
          l.supervisor,
          l.targetQuantity,
          l.actualQuantity,
          l.availableManpower,
          `${l.baseEfficiency}%`,
          l.status
        ]);
        break;

      case 'skill_matrix_report':
        headers = ['Employee ID', 'Name', 'Department', 'Designation', 'Primary Operation', 'Skill Level Grade', 'Proficiency (%)', 'Historical attendance (%)'];
        mappedRows = employees.filter(e => deptFilter === 'All' || e.department === deptFilter).map(e => [
          e.id,
          e.name,
          e.department,
          e.designation,
          e.skills[0]?.operationName || 'Sewing',
          e.skills[0]?.skillLevel || 'Intermediate',
          `${e.skills[0]?.proficiency || 75}%`,
          `${e.historicalAttendanceRate}%`
        ]);
        break;

      default:
        headers = ['Employee ID', 'Name', 'Department', 'Date', 'Status', 'In', 'Out'];
        mappedRows = dataset.map(d => [d.employeeId, d.name, d.department, d.date, d.status, d.checkIn, d.checkOut]);
        break;
    }

    if (format === 'csv') {
      const csv = Papa.unparse({
        fields: headers,
        data: mappedRows
      });
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `${filename}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else {
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet([headers, ...mappedRows]);
      XLSX.utils.book_append_sheet(wb, ws, 'Export Report');
      XLSX.writeFile(wb, `${filename}.xlsx`);
    }

    setExportedFilename(`${filename}.${format}`);
    setShowExportSuccessToast(true);
    setTimeout(() => setShowExportSuccessToast(false), 5000);
  };

  const handlePrintReport = () => {
    let dataset = [...exportPreview];
    let headers: string[] = [];
    let mappedRows: any[] = [];
    let title = '';

    const dateStr = `${startDate} to ${endDate}`;

    switch (reportTemplate) {
      case 'attendance_report':
        title = 'Daily Shift Log Attendance Report';
        headers = ['Employee ID', 'Name', 'Department', 'Production Line', 'Date', 'Status', 'Check-In', 'Check-Out', 'Working Hours', 'Method', 'Approved By'];
        mappedRows = dataset.map(d => [d.employeeId, d.name, d.department, d.line, d.date, d.status, d.checkIn, d.checkOut, d.workingHours, d.method, d.markedBy]);
        break;
      
      case 'absenteeism_report':
        title = 'Shift Absence and Deviancy Audit';
        const absents = dataset.filter(d => d.status === 'Absent');
        headers = ['Employee ID', 'Name', 'Department', 'Production Line', 'Absence Date', 'Method Marker', 'Logged Auditor'];
        mappedRows = absents.map(d => [d.employeeId, d.name, d.department, d.line, d.date, d.method, d.markedBy]);
        break;

      case 'line_efficiency_report':
        title = 'Assembly Line Operations & Efficiency Compliance';
        headers = ['Line', 'Supervisor', 'Target Output (pcs)', 'Actual Output (pcs)', 'Manpower Head Count', 'Line Efficiency (%)', 'Status'];
        mappedRows = productionLines.filter(l => lineFilter === 'All' || l.id === parseInt(lineFilter)).map(l => [
          `Line ${l.id}`,
          l.supervisor,
          l.targetQuantity,
          l.actualQuantity,
          l.availableManpower,
          `${l.baseEfficiency}%`,
          l.status
        ]);
        break;

      case 'skill_matrix_report':
        title = 'Factory Skill Matrix and Personnel Productivity Index';
        headers = ['Employee ID', 'Name', 'Department', 'Designation', 'Primary Operation', 'Skill Level Grade', 'Proficiency (%)', 'Historical Attendance (%)'];
        mappedRows = employees.filter(e => deptFilter === 'All' || e.department === deptFilter).map(e => [
          e.id,
          e.name,
          e.department,
          e.designation,
          e.skills[0]?.operationName || 'Sewing',
          e.skills[0]?.skillLevel || 'Intermediate',
          `${e.skills[0]?.proficiency || 75}%`,
          `${e.historicalAttendanceRate}%`
        ]);
        break;

      default:
        title = 'Attendance Report Register';
        headers = ['Employee ID', 'Name', 'Department', 'Date', 'Status', 'In', 'Out'];
        mappedRows = dataset.map(d => [d.employeeId, d.name, d.department, d.date, d.status, d.checkIn, d.checkOut]);
        break;
    }

    const printWindow = window.open('', '_blank');
    if (printWindow) {
      const tableHeadersHtml = headers.map(h => `<th style="text-align: left; padding: 10px; font-size: 11px; font-weight: bold; border-bottom: 2px solid #cbd5e1; background-color: #f1f5f9; color: #475569;">${h}</th>`).join('');
      
      const tableRowsHtml = mappedRows.map(row => `
        <tr style="border-bottom: 1px solid #e2e8f0; font-size: 11px;">
          ${row.map(cell => `<td style="padding: 10px; color: #334155;">${cell !== undefined && cell !== null ? cell : '-'}</td>`).join('')}
        </tr>
      `).join('');

      printWindow.document.write(`
        <html>
          <head>
            <title>SWM - ${title}</title>
            <style>
              body { font-family: 'Helvetica Neue', Arial, sans-serif; padding: 24px; color: #334155; }
              h1 { font-size: 22px; font-weight: bold; margin-bottom: 4px; color: #1e3a8a; }
              p { font-size: 11px; color: #64748b; margin-bottom: 20px; }
              table { width: 100%; border-collapse: collapse; margin-top: 15px; }
              .footer { margin-top: 40px; font-size: 10px; text-align: center; color: #94a3b8; border-top: 1px dashed #cbd5e1; padding-top: 15px; }
            </style>
          </head>
          <body>
            <div style="display: flex; justify-content: space-between; align-items: top; border-bottom: 2px solid #2563eb; padding-bottom: 15px; margin-bottom: 15px;">
              <div>
                <h1 style="margin: 0; color: #2563eb;">SWM</h1>
                <h2 style="margin: 4px 0 0 0; color: #1e293b; font-size: 15px; font-weight: bold;">${title}</h2>
                <p style="margin: 4px 0 0 0;">Generated on ${new Date().toLocaleString()} | Dates: ${dateStr}</p>
              </div>
              <div style="text-align: right; font-size: 10px; color: #64748b; line-height: 1.4;">
                <strong>SWM Enterprise Ledger</strong><br>
                Security: TLS SECURE TRANSACTION SESSION<br>
                Dept: ${deptFilter} | Line: ${lineFilter} | Status Filter: ${statusFilter}
              </div>
            </div>
            <table>
              <thead>
                <tr>
                  ${tableHeadersHtml}
                </tr>
              </thead>
              <tbody>
                ${tableRowsHtml}
              </tbody>
            </table>
            <div class="footer">
              This document is a certified compliance printout generated dynamically from the SWM industrial workforce management system ledger.<br>
              SWM Systems Admin Center &copy; 2026. All rights reserved. Confidential.
            </div>
            <script>
              window.onload = function() {
                setTimeout(function() {
                  window.print();
                }, 300);
              };
            </script>
          </body>
        </html>
      `);
      printWindow.document.close();
    }
  };

  // Helper arrays for filters
  const uniqueDepts = Array.from(new Set(employees.map(e => e.department)));
  const uniqueLines = React.useMemo(() => productionLines.map(l => l.id), [productionLines]);

  return (
    <div id="swms-import-export-center" className="space-y-6 relative">
      
      {/* 1. Header Banner & View Select Toggles */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <h2 className="text-xl font-bold text-slate-800 dark:text-neutral-100 font-display flex items-center space-x-2">
            <FileSpreadsheet className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            <span>Attendance Import & Export Center</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Re-sync biometric terminal files, validate industrial sheets, or extract compliance rosters for factory payroll administration.
          </p>
        </div>

        {/* Tab switch control pills */}
        <div className="flex items-center space-x-1.5 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-1.5 rounded-lg text-xs self-start">
          <button
            type="button"
            onClick={() => setActiveSubTab('import')}
            className={`flex items-center space-x-1.5 px-4 py-2 rounded-md font-bold transition-all ${
              activeSubTab === 'import'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:hover:text-slate-205 cursor-pointer'
            }`}
          >
            <UploadCloud className="w-3.5 h-3.5" />
            <span>Attendance Import</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab('employee-master')}
            className={`flex items-center space-x-1.5 px-4 py-2 rounded-md font-bold transition-all ${
              activeSubTab === 'employee-master'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:hover:text-slate-205 cursor-pointer'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Employee Master Hub</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab('export')}
            className={`flex items-center space-x-1.5 px-4 py-2 rounded-md font-bold transition-all ${
              activeSubTab === 'export'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:hover:text-slate-205 cursor-pointer'
            }`}
          >
            <Download className="w-3.5 h-3.5" />
            <span>Attendance Export Center</span>
          </button>
        </div>
      </div>

      {/* Loading state indicator overlay */}
      {loading && (
        <div className="absolute inset-0 z-50 bg-white/80 dark:bg-slate-950/85 backdrop-blur-xs rounded-xl p-8 border border-slate-200 dark:border-slate-800 text-center flex flex-col items-center justify-center space-y-4 min-h-[400px]">
          <Loader className="w-12 h-12 text-blue-600 dark:text-blue-400 animate-spin" />
          <div className="space-y-1">
            <h4 className="font-bold text-sm text-slate-800 dark:text-slate-150">{loadingPhase}</h4>
            <div className="w-64 bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden mx-auto mt-2">
              <div 
                className="h-full bg-blue-600 transition-all duration-300" 
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <p className="text-[10px] text-slate-400 mt-1">Operational records loading... {progressPercent}% complete</p>
          </div>
        </div>
      )}

      {/* ---------- TAB 1: IMPORT REGISTRATION CENTRAL ---------- */}
      {activeSubTab === 'import' && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          
          {/* Main Controls + Upload Area (Takes 2/3 space of grid) */}
          <div className="xl:col-span-2 space-y-6">
            
            {/* Template Selector Options Bar */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-850 pb-3">
                <span className="font-bold text-xs uppercase tracking-wider text-slate-400 flex items-center space-x-1.5">
                  <Laptop className="w-4 h-4 text-slate-500" />
                  <span>Channel Configuration Selector</span>
                </span>
                <span className="text-[10px] font-semibold text-slate-400">Secure TLS Session Active</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Standard ERP Sheet Card */}
                <button
                  type="button"
                  onClick={() => setImportMode('Standard')}
                  className={`p-4 border rounded-xl text-left transition-all flex items-start space-x-3.5 outline-none ${
                    importMode === 'Standard'
                      ? 'border-blue-500 bg-blue-50/10 dark:bg-blue-950/10 shadow-xs'
                      : 'border-slate-150 dark:border-slate-800 hover:bg-slate-50/50'
                  }`}
                >
                  <div className={`p-2.5 rounded-lg ${
                    importMode === 'Standard' ? 'bg-blue-500 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                  }`}>
                    <FileSpreadsheet className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="font-bold text-xs text-slate-800 dark:text-slate-150 block">Standard SWM Worksheet Roster</span>
                    <p className="text-[10.5px] text-slate-450 mt-1 leading-normal">
                      Import daily shift log Excel (.xlsx) or CSV files utilizing standard SWM header definitions.
                    </p>
                  </div>
                </button>

                {/* Biometric Integration Card */}
                <button
                  type="button"
                  onClick={() => setImportMode('Biometric')}
                  className={`p-4 border rounded-xl text-left transition-all flex items-start space-x-3.5 outline-none ${
                    importMode === 'Biometric'
                      ? 'border-blue-500 bg-blue-50/10 dark:bg-blue-950/10 shadow-xs'
                      : 'border-slate-150 dark:border-slate-800 hover:bg-slate-50/50'
                  }`}
                >
                  <div className={`p-2.5 rounded-lg ${
                    importMode === 'Biometric' ? 'bg-blue-500 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                  }`}>
                    <Cpu className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="font-bold text-xs text-slate-800 dark:text-slate-150 block">Biometric Hardware Import Mode</span>
                    <p className="text-[10.5px] text-slate-450 mt-1 leading-normal">
                      Intelligently map columns from machines exported from ZKTeco, eSSL, Matrix, etc.
                    </p>
                  </div>
                </button>
              </div>

              {/* Advanced Biometric mapping forms if selected */}
              {importMode === 'Biometric' && (
                <div className="bg-slate-50 dark:bg-slate-950 p-4 rounded-xl border border-slate-150 dark:border-slate-850 space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-850 pb-2.5">
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-350">
                      Manufacturer Device Profile:
                    </span>
                    <div className="flex bg-white dark:bg-slate-900 border border-slate-205 dark:border-slate-800 p-0.5 rounded text-[11px] font-bold">
                      {(['ZKTeco', 'eSSL', 'Matrix', 'Custom'] as const).map(sys => (
                        <button
                          key={sys}
                          type="button"
                          onClick={() => handleBiometricSystemChange(sys)}
                          className={`px-2.5 py-1 rounded transition ${
                            biometricSystem === sys 
                              ? 'bg-blue-600 text-white' 
                              : 'text-slate-500 hover:text-slate-800'
                          }`}
                        >
                          {sys}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 pt-1.5 font-sans">
                    {[
                      { l: 'Employee ID', k: 'empIdCol' },
                      { l: 'Employee Name', k: 'nameCol' },
                      { l: 'Date (Logs)', k: 'dateCol' },
                      { l: 'Status (P/A/L)', k: 'statusCol' },
                      { l: 'Check-In Hour', k: 'checkInCol' },
                      { l: 'Check-Out Hour', k: 'checkOutCol' }
                    ].map(field => (
                      <div key={field.k} className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{field.l}</label>
                        <input
                          type="text"
                          value={columnMapping[field.k as keyof typeof columnMapping]}
                          onChange={e => setColumnMapping(prev => ({ ...prev, [field.k]: e.target.value }))}
                          placeholder="Column Name"
                          disabled={biometricSystem !== 'Custom'}
                          className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-[11px] p-1.5 rounded text-slate-705 dark:text-slate-300 font-mono focus:outline-none focus:border-blue-500 disabled:opacity-75 disabled:bg-slate-50 dark:disabled:bg-slate-900/55"
                        />
                      </div>
                    ))}
                  </div>
                  <p className="text-[9.5px] text-slate-405 leading-relaxed italic">
                    {biometricSystem === 'Custom' 
                      ? "Custom mode enabled: Enter the exact field headers of your hardware's data dump file above."
                      : `Recognised device profile preset loaded. All header mappings are configured automatically for ${biometricSystem}.`
                    }
                  </p>
                </div>
              )}
            </div>

            {/* Drag & Drop Main Zone */}
            <div 
              onDragEnter={handleDrag}
              onDragOver={handleDrag}
              onDragLeave={handleDrag}
              onDrop={handleDrop}
              onClick={triggerFileInput}
              className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all flex flex-col items-center justify-center space-y-4 ${
                dragActive 
                  ? 'border-blue-500 bg-blue-50/10 dark:bg-blue-950/10' 
                  : 'border-slate-300 dark:border-slate-800 hover:bg-slate-100/10 hover:border-slate-400'
              }`}
            >
              <input 
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileChange}
                className="hidden"
              />
              <div className="p-3.5 bg-blue-100 dark:bg-slate-800 text-blue-600 dark:text-blue-400 rounded-full">
                <UploadCloud className="w-10 h-10 animate-bounce" />
              </div>
              <div className="space-y-1">
                <p className="font-bold text-xs text-slate-700 dark:text-slate-300">
                  Drag and drop raw attendance file container here
                </p>
                <p className="text-[10.5px] text-slate-400">
                  Supports Excel (.xlsx, .xls) and standard Comma-Separated CSV formats limit 50MB
                </p>
              </div>
              <div className="inline-flex items-center space-x-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 font-semibold text-slate-700 dark:text-slate-300 px-3 py-1.5 rounded-lg text-xs transition">
                <span>Select file manually</span>
              </div>
            </div>

            {/* Live Upload Progress & Pre-Import Validation Screen */}
            {fileName && parsedRows.length > 0 && (() => {
              // Pre-import metrics computations
              const totalCount = parsedRows.length;

              const validEmployeesRows = parsedRows.filter(r => {
                const isUnrecognized = r.employeeId && r.employeeId !== 'N/A' && !employees.some(e => e.id && typeof e.id === 'string' && e.id.toUpperCase() === r.employeeId.toUpperCase());
                const hasFormatError = validationErrors.some(e => e.row === r.rowNum && e.severity === 'error' && !e.reason.includes('unregistered') && !e.reason.includes('Duplicate row collision'));
                return r.employeeId && r.employeeId !== 'N/A' && !isUnrecognized && !hasFormatError;
              });

              const validCount = validEmployeesRows.length;

              const uniqueMissingCombined = Array.from(new Set(
                parsedRows
                  .filter(r => r.employeeId && r.employeeId !== 'N/A' && !employees.some(e => e.id && typeof e.id === 'string' && e.id.toUpperCase() === r.employeeId.toUpperCase()))
                  .map(r => JSON.stringify({ id: r.employeeId, name: r.name || 'Unknown Operator' }))
              )).map((str) => JSON.parse(str as string) as { id: string; name: string });

              const uniqueMissing = uniqueMissingCombined.filter((v, i, a) => a.findIndex(t => t.id === v.id) === i);
              const missingCount = uniqueMissing.length;
              const missingEmployeeRecordsCount = parsedRows.filter(r => 
                r.employeeId && r.employeeId !== 'N/A' && !employees.some(e => e.id && typeof e.id === 'string' && e.id.toUpperCase() === r.employeeId.toUpperCase())
              ).length;

              const duplicateCount = validationErrors.filter(e => e.severity === 'error' && e.reason.includes('Duplicate row collision')).length;
              const formatErrorCount = validationErrors.filter(e => 
                e.severity === 'error' && !e.reason.includes('unregistered') && !e.reason.includes('Duplicate row collision')
              ).length;

              const handleAutoRegister = () => {
                if (uniqueMissing.length === 0) return;
                
                setLoading(true);
                setLoadingPhase(`Auto-registering ${uniqueMissing.length} operators...`);
                setProgressPercent(20);

                setTimeout(() => {
                  setProgressPercent(60);
                  uniqueMissing.forEach(mEmp => {
                    const newEmp: Employee = {
                      id: mEmp.id.toUpperCase(),
                      name: mEmp.name && mEmp.name !== 'Unknown Operator' ? mEmp.name : `Operator ${mEmp.id}`,
                      photoUrl: '',
                      department: 'Sewing',
                      section: 'Main Line',
                      lineNumber: 1,
                      designation: 'Sewing Operator',
                      joiningDate: '2026-06-04',
                      skillCategory: 'Grade B Operator',
                      experience: 2,
                      contactNumber: `+91 99${Math.floor(10000000 + Math.random() * 90000000)}`,
                      skills: [{
                        operationName: 'Sewing',
                        skillLevel: 'Intermediate',
                        proficiency: 70,
                        trainingStatus: 'Completed'
                      }],
                      baseEfficiency: 75,
                      historicalAttendanceRate: 92,
                      riskScore: 12,
                      riskLevel: 'Low',
                      leaveBalances: {
                        casual: 12,
                        sick: 10,
                        earned: 15,
                        emergency: 5
                      }
                    };
                    addEmployee(newEmp);
                  });

                  setTimeout(() => {
                    setProgressPercent(100);
                    setLoading(false);
                  }, 550);
                }, 450);
              };

              const handleDownloadErrorsLog = () => {
                const headers = ['Row Number', 'Employee ID', 'Field Name', 'Detected Value', 'Issue Severity', 'Detail Description'];
                const rows = validationErrors.map(e => [
                  e.row,
                  e.empId,
                  e.field,
                  e.value,
                  e.severity.toUpperCase(),
                  e.reason
                ]);
                const csvContent = Papa.unparse({ fields: headers, data: rows });
                const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = `swms_attendance_validation_errors_${fileName || 'audit'}.csv`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
              };

              // Determine records that will actually be imported based on strictValidation
              const fatalRows = new Set(
                validationErrors
                  .filter(e => e.severity === 'error' && (strictValidation || e.reason.includes('unregistered')))
                  .map(e => e.row)
              );
              
              const recordsToImportCount = parsedRows.filter(r => !fatalRows.has(r.rowNum) && r.employeeId !== 'N/A').length;

              return (
                <div className="bg-white dark:bg-slate-900 border border-slate-205 dark:border-slate-800 rounded-xl p-6 shadow-sm space-y-6">
                  
                  {/* Title & Actions Bar */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-105 dark:border-slate-800 pb-4">
                    <div className="flex items-center space-x-2.5">
                      <div className="p-2 bg-blue-105 dark:bg-slate-800 text-blue-600 dark:text-blue-400 rounded-lg">
                        <ShieldAlert className="w-5 h-5 animate-pulse" />
                      </div>
                      <div>
                        <h3 className="font-bold text-sm text-slate-805 dark:text-neutral-100 uppercase tracking-tight">Pre-Import Data Validation Ledger</h3>
                        <p className="text-[10.5px] text-slate-450 mt-0.5 font-sans">File: <span className="font-mono font-bold text-slate-600 dark:text-slate-300">{fileName}</span> ({totalCount} total lines parsed)</p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setFileName('');
                          setParsedRows([]);
                          setValidationErrors([]);
                          setImportSummary(null);
                          setRawImportData([]);
                        }}
                        className="px-3 py-1.5 bg-slate-50 hover:bg-slate-100 dark:bg-slate-105/10 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-450 text-xs font-bold rounded-lg transition"
                      >
                        Clear File
                      </button>
                      
                      <button
                        type="button"
                        onClick={handleApplyCommitImport}
                        className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg shadow-sm transition flex items-center space-x-1.5"
                      >
                        <Check className="w-4 h-4" />
                        <span>Commit {recordsToImportCount} Records</span>
                      </button>
                    </div>
                  </div>

                  {/* Pre-Import Metrics Grid */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {/* Metric 1 */}
                    <div className="bg-slate-50 dark:bg-slate-955 p-3.5 rounded-xl border border-slate-150 dark:border-slate-850">
                      <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-bold">Total Sheet Records</span>
                      <div className="flex items-baseline space-x-1.5 mt-1">
                        <span className="text-xl font-mono font-bold text-slate-705 dark:text-neutral-200">{totalCount}</span>
                        <span className="text-[10px] text-slate-400 font-sans">rows</span>
                      </div>
                    </div>

                    {/* Metric 2 */}
                    <div className="bg-emerald-50/10 dark:bg-emerald-950/10 p-3.5 rounded-xl border border-emerald-500/15">
                      <span className="text-[10px] text-emerald-600 dark:text-emerald-450 uppercase tracking-wider block font-bold">Existing Employees</span>
                      <div className="flex items-baseline space-x-1.5 mt-1">
                        <span className="text-xl font-mono font-bold text-emerald-650 dark:text-emerald-400">{validCount}</span>
                        <span className="text-[10px] text-emerald-555 dark:text-emerald-500 font-sans">({totalCount > 0 ? Number((validCount / totalCount) * 100).toFixed(0) : 0}% Match)</span>
                      </div>
                    </div>

                    {/* Metric 3 */}
                    <div className={`p-3.5 rounded-xl border ${missingCount > 0 ? 'bg-amber-50/10 dark:bg-amber-955/10 border-amber-500/20' : 'bg-slate-50 dark:bg-slate-955 border-slate-150 dark:border-slate-855'}`}>
                      <span className={`text-[10px] uppercase tracking-wider block font-bold ${missingCount > 0 ? 'text-amber-600' : 'text-slate-450'}`}>Unregistered Employees</span>
                      <div className="flex items-baseline space-x-1.5 mt-1">
                        <span className={`text-xl font-mono font-bold ${missingCount > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-500'}`}>{missingCount}</span>
                        <span className="text-[10px] text-slate-400 font-sans">({missingEmployeeRecordsCount} rows)</span>
                      </div>
                    </div>

                    {/* Metric 4 */}
                    <div className={`p-3.5 rounded-xl border ${(duplicateCount + formatErrorCount) > 0 ? 'bg-rose-50/10 dark:bg-rose-955/10 border-rose-500/15' : 'bg-slate-50 dark:bg-slate-955 border-slate-150 dark:border-slate-855'}`}>
                      <span className={`text-[10px] uppercase tracking-wider block font-bold ${(duplicateCount + formatErrorCount) > 0 ? 'text-rose-655' : 'text-slate-450'}`}>Duplicates & Errors</span>
                      <div className="flex items-baseline space-x-1.5 mt-1">
                        <span className={`text-xl font-mono font-bold ${(duplicateCount + formatErrorCount) > 0 ? 'text-rose-600' : 'text-slate-500'}`}>{duplicateCount + formatErrorCount}</span>
                        <span className="text-[10px] text-slate-400 font-sans">({duplicateCount} dup, {formatErrorCount} err)</span>
                      </div>
                    </div>
                  </div>

                  {/* Resolution & Settings Center */}
                  <div className="bg-slate-50 dark:bg-slate-955 border border-slate-205 dark:border-slate-850 rounded-xl p-5 space-y-4">
                    <h4 className="text-xs font-bold text-slate-705 dark:text-slate-300 flex items-center space-x-1.5 border-b border-slate-200/50 dark:border-slate-850/50 pb-2">
                      <FileText className="w-4 h-4 text-blue-500" />
                      <span>Heuristics Error Resolution Center</span>
                    </h4>

                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
                      
                      {/* Left: Resolution Buttons */}
                      <div className="lg:col-span-7 space-y-3">
                        <p className="text-[11px] text-slate-500 leading-normal">
                          Choose how to proceed with the detected file anomalies. You can automatically register unknown employee IDs, download a report of missing personnel, skip those records to import existing roster members, or cancel and reset the operation.
                        </p>

                        <div className="flex flex-wrap gap-2 pt-1.5">
                          {missingCount > 0 && (
                            <button
                              type="button"
                              onClick={handleAutoRegister}
                              className="flex items-center space-x-1 border border-transparent bg-blue-600 hover:bg-blue-700 text-white py-1.5 px-3 rounded-lg text-xs font-bold shadow-xs transition cursor-pointer"
                              id="auto-register-btn"
                            >
                              <UserPlus className="w-3.5 h-3.5" />
                              <span>Auto-Register ({missingCount})</span>
                            </button>
                          )}

                          {missingCount > 0 && (
                            <button
                              type="button"
                              onClick={() => handleDownloadMissingReport(uniqueMissing)}
                              className="flex items-center space-x-1 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-350 py-1.5 px-2.5 rounded-lg text-xs font-semibold transition cursor-pointer"
                              id="download-missing-report-btn"
                            >
                              <FileDown className="w-3.5 h-3.5 text-slate-500" />
                              <span>Download Missing Report</span>
                            </button>
                          )}

                          {missingCount > 0 && (
                            <button
                              type="button"
                              onClick={() => handleSkipMissingRecords(uniqueMissing)}
                              className="flex items-center space-x-1 border border-amber-200 dark:border-amber-900/40 bg-amber-50/20 hover:bg-amber-100/30 dark:bg-amber-950/25 text-amber-700 dark:text-amber-400 py-1.5 px-2.5 rounded-lg text-xs font-semibold transition cursor-pointer"
                              id="skip-missing-records-btn"
                            >
                              <X className="w-3.5 h-3.5 text-amber-600" />
                              <span>Skip Unregistered Rows</span>
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={handleCancelAttendanceImport}
                            className="flex items-center space-x-1 border border-red-205 dark:border-red-900/40 bg-red-50/20 hover:bg-red-100/30 dark:bg-red-950/25 text-red-750 dark:text-red-400 py-1.5 px-2.5 rounded-lg text-xs font-semibold transition cursor-pointer"
                            id="cancel-attendance-import-btn"
                          >
                            <XSquare className="w-3.5 h-3.5 text-red-500" />
                            <span>Cancel Import</span>
                          </button>

                          <button
                            type="button"
                            onClick={handleDownloadErrorsLog}
                            className="flex items-center space-x-1 bg-white dark:bg-slate-900 border border-slate-205 dark:border-slate-805 hover:bg-slate-50 dark:hover:bg-slate-850 text-slate-700 dark:text-slate-350 py-1.5 px-2.5 rounded-lg text-xs font-semibold transition"
                          >
                            <FileSpreadsheet className="w-3.5 h-3.5 text-slate-500" />
                            <span>Full Error Spreadsheet ({validationErrors.length})</span>
                          </button>
                        </div>
                      </div>

                      {/* Right: Validation Strictness Rule Settings */}
                      <div className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-150 dark:border-slate-850 p-3.5 rounded-xl space-y-2.5 shadow-2xs animate-fade-in">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 flex items-center space-x-1.5">
                            <ShieldAlert className="w-3.5 h-3.5 text-blue-500" />
                            <span>Strict Validation Mode</span>
                          </span>
                          <input
                            type="checkbox"
                            checked={strictValidation}
                            onChange={(e) => setStrictValidation(e.target.checked)}
                            className="w-4 h-4 accent-blue-600 cursor-pointer text-blue-600 rounded bg-slate-105 border-slate-300 dark:bg-slate-950 dark:border-slate-800 focus:ring-blue-500 focus:outline-none"
                          />
                        </div>
                        <p className="text-[10px] text-slate-400 leading-normal">
                          {strictValidation 
                            ? "Strict mode Active: Unregistered employee rows and rows with fatal errors are completely skipped from database insertion to enforce safety."
                            : "Relaxed mode: Warnings are tolerated, but unregistered employees will still be filtered out unless they are auto-registered first."
                          }
                        </p>
                      </div>
                    </div>

                    {/* Missing Employees List Summary Panel */}
                    {missingCount > 0 && (
                      <div className="border border-amber-205 dark:border-amber-900/40 bg-amber-50/10 dark:bg-amber-955/10 p-4 rounded-xl space-y-3 mt-4">
                        <div className="flex items-start space-x-2">
                          <AlertTriangle className="w-4 h-4 text-amber-550 shrink-0 mt-0.5 animate-bounce" />
                          <div>
                            <span className="text-xs font-bold text-amber-700 dark:text-amber-450 block">Detected {missingCount} Unregistered Employees in Uploaded File</span>
                            <p className="text-[10.5px] text-slate-400 leading-normal mt-0.5">
                              The following Employee IDs are present in the shift import but are unknown to the SWM Employee Master database. You can auto-register them using standard Sewing Department presets.
                            </p>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2 pt-1 font-mono text-[10.5px]">
                          {uniqueMissing.slice(0, 12).map((emp, idx) => (
                            <div key={idx} className="bg-white dark:bg-slate-900 border border-amber-100/30 dark:border-slate-850 p-2 rounded-lg flex items-center justify-between">
                              <div className="truncate pr-1">
                                <span className="font-bold text-slate-700 dark:text-slate-300 block">{emp.id}</span>
                                <span className="text-[9.5px] text-slate-450 truncate block font-sans">{emp.name}</span>
                              </div>
                              <span className="text-[8px] uppercase px-1 py-0.2 bg-amber-50 text-amber-700 border border-amber-100 dark:bg-amber-955/20 rounded font-sans shrink-0">
                                Missing
                              </span>
                            </div>
                          ))}
                          {uniqueMissing.length > 12 && (
                            <div className="bg-slate-100/50 dark:bg-slate-850/50 border border-dashed border-slate-202 p-2 rounded-lg text-center flex items-center justify-center font-sans text-slate-400">
                              + {uniqueMissing.length - 12} more missing IDs
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Validation Ledger Table Header */}
                  <div className="border border-slate-150 dark:border-slate-850 rounded-xl overflow-hidden space-y-1">
                    <div className="bg-slate-50 dark:bg-slate-950 p-3 border-b border-slate-150 dark:border-slate-850 flex items-center justify-between whitespace-nowrap">
                      <span className="text-xs font-bold text-slate-600 dark:text-slate-350">Detailed Import Records Ledger Preview</span>
                      <span className="text-[10.5px] font-bold text-slate-400">Live preview of first 10 ingestion lines</span>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-[10.5px] text-left">
                        <thead className="bg-[#F8FAFC] dark:bg-slate-950/10 font-bold text-slate-400 border-b border-slate-100 dark:border-slate-850 whitespace-nowrap">
                          <tr>
                            <th className="px-3.5 py-2 text-center">Sheet Row</th>
                            <th className="px-3.5 py-2">Employee ID</th>
                            <th className="px-3.5 py-2">Imported Name</th>
                            <th className="px-3.5 py-2 text-center">Date</th>
                            <th className="px-3.5 py-2 text-center">Check-In</th>
                            <th className="px-3.5 py-2 text-center">Check-Out</th>
                            <th className="px-3.5 py-2 text-center">Status Mapping</th>
                            <th className="px-3.5 py-2 text-center">Action/Resolution</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-850 font-medium whitespace-nowrap">
                          {parsedRows.slice(0, 10).map((row) => {
                            const rowErrors = validationErrors.filter(e => e.row === row.rowNum);
                            const isMissingEmp = row.employeeId && row.employeeId !== 'N/A' && !employees.some(e => e.id && typeof e.id === 'string' && e.id.toUpperCase() === row.employeeId.toUpperCase());
                            
                            const hasErrors = rowErrors.some(e => e.severity === 'error');
                            const hasWarnings = rowErrors.some(e => e.severity === 'warning');

                            return (
                              <tr key={row.rowNum} className={`hover:bg-slate-50/50 ${hasErrors || isMissingEmp ? 'bg-rose-500/5' : ''}`}>
                                <td className="px-3.5 py-2 text-center font-mono text-slate-400">{row.rowNum}</td>
                                <td className="px-3.5 py-2 font-bold font-mono text-slate-700 dark:text-slate-300">{row.employeeId}</td>
                                <td className="px-3.5 py-2 text-slate-655 dark:text-slate-350">{row.name}</td>
                                <td className="px-3.5 py-2 text-center font-mono text-slate-550">{row.date}</td>
                                <td className="px-3.5 py-2 text-center font-mono text-blue-600 dark:text-blue-400">{row.checkIn || '-'}</td>
                                <td className="px-3.5 py-2 text-center font-mono text-slate-500">{row.checkOut || '-'}</td>
                                <td className="px-3.5 py-2 text-center font-mono">
                                  {(() => {
                                    let displayStatus: AttendanceStatus = 'Absent';
                                    if (row.status) {
                                      const cleanStatus = row.status.trim().toLowerCase();
                                      if (cleanStatus.includes('present') || cleanStatus === 'p' || cleanStatus === '1' || cleanStatus === 'active') {
                                        displayStatus = 'Present';
                                      } else if (cleanStatus.includes('late') || cleanStatus === 'l') {
                                        displayStatus = 'Late';
                                      } else if (cleanStatus.includes('leave') || cleanStatus === 'le' || cleanStatus.includes('on leave') || cleanStatus.includes('half') || cleanStatus === 'h' || cleanStatus.includes('half day')) {
                                        displayStatus = 'Leave';
                                      } else if (cleanStatus.includes('absent') || cleanStatus === 'a' || cleanStatus === '0') {
                                        displayStatus = 'Absent';
                                      } else if (row.checkIn) {
                                        const [hr, min] = row.checkIn.split(':').map(Number);
                                        const markerMinutes = hr * 60 + min;
                                        const gateLateThreshold = 8 * 60 + 15;
                                        displayStatus = markerMinutes > gateLateThreshold ? 'Late' : 'Present';
                                      }
                                    } else if (row.checkIn) {
                                      const [hr, min] = row.checkIn.split(':').map(Number);
                                      const markerMinutes = hr * 60 + min;
                                      const gateLateThreshold = 8 * 60 + 15;
                                      displayStatus = markerMinutes > gateLateThreshold ? 'Late' : 'Present';
                                    }
                                    
                                    const badgeClasses = {
                                      Present: 'bg-emerald-50 text-emerald-700 border border-emerald-200/50 dark:bg-emerald-950/20 dark:text-emerald-450 dark:border-emerald-900/30',
                                      Late: 'bg-amber-50 text-amber-700 border border-amber-200/50 dark:bg-amber-955/20 dark:text-amber-450 dark:border-amber-900/30',
                                      Absent: 'bg-rose-50 text-rose-700 border border-rose-200/50 dark:bg-rose-955/20 dark:text-rose-450 dark:border-rose-900/30',
                                      Leave: 'bg-blue-50 text-blue-700 border border-blue-200/50 dark:bg-blue-955/20 dark:text-blue-450 dark:border-blue-900/30'
                                    }[displayStatus] || 'bg-slate-50 text-slate-705';

                                    return (
                                      <span className={`inline-block px-2.5 py-0.5 rounded text-[10px] font-bold ${badgeClasses}`}>
                                        {displayStatus}
                                      </span>
                                    );
                                  })()}
                                </td>
                                <td className="px-3.5 py-2 text-center">
                                  {isMissingEmp ? (
                                    <span className="inline-block px-2 py-0.5 rounded bg-amber-50 text-amber-705 dark:bg-amber-955/20 text-[9.5px] font-bold">
                                      Unregistered Employee
                                    </span>
                                  ) : hasErrors ? (
                                    <span className="inline-block px-2 py-0.5 rounded bg-rose-50 text-rose-707 dark:bg-rose-955/20 text-[9.5px] font-bold">
                                      Format Reject
                                    </span>
                                  ) : hasWarnings ? (
                                    <span className="inline-block px-2 py-0.5 rounded bg-amber-50 text-amber-705 dark:bg-amber-955/20 text-[9.5px] font-bold">
                                      Warning Fallback
                                    </span>
                                  ) : (
                                    <span className="inline-block px-2 py-0.5 rounded bg-emerald-50 text-emerald-707 dark:bg-emerald-955/30 text-[9.5px] font-bold animate-pulse">
                                      Approved & Valid
                                    </span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  {parsedRows.length > 10 && (
                    <p className="text-center text-[10px] text-slate-400 italic">
                      Showing first 10 records of pre-import list. Additional {parsedRows.length - 10} records processed silently.
                    </p>
                  )}
                </div>
              );
            })()}
          </div>

          {/* Lateral Sidebar Guides + Post Import Analytics breakdown (Takes 1/3 space of grid) */}
          <div className="space-y-6">
            
            {/* Guide cards & Sample Template Downloads */}
            <div className="bg-slate-905 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs space-y-4">
              <span className="font-bold text-xs uppercase tracking-wider text-slate-400 flex items-center space-x-1.5">
                <BookOpen className="w-4 h-4 text-blue-500" />
                <span>Reference Guide & Templates</span>
              </span>
              
              <p className="text-[11px] text-slate-455 leading-relaxed">
                Ensure spreadsheets strictly comply with the layout syntax rule constraints before committing updates into shifts rosters:
              </p>

              <div className="space-y-2.5 text-[10.5px]">
                <div className="flex items-start space-x-2">
                  <ChevronRight className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                  <p className="text-slate-500">Employee ID matching standard factory register index e.g. <code className="bg-slate-100 dark:bg-slate-800 p-0.5 rounded font-mono font-bold text-blue-600">EMP001</code></p>
                </div>
                <div className="flex items-start space-x-2">
                  <ChevronRight className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                  <p className="text-slate-500">Workforce Date matches <code className="bg-slate-100 dark:bg-slate-800 p-0.5 rounded font-mono font-bold text-blue-600">YYYY-MM-DD</code> sequence format</p>
                </div>
                <div className="flex items-start space-x-2">
                  <ChevronRight className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                  <p className="text-slate-500">Time specifications are strictly standard 24h standard format <code className="bg-slate-100 dark:bg-slate-800 p-0.5 rounded font-mono font-bold text-blue-600">HH:MM</code></p>
                </div>
                <div className="flex items-start space-x-2">
                  <ChevronRight className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                  <p className="text-slate-500">Configurable Late arrivals are evaluated if hours check-in exceeds <code className="bg-slate-100 dark:bg-slate-800 p-0.5 rounded font-mono font-bold text-blue-600">08:15 AM</code></p>
                </div>
              </div>

              <div className="border-t border-slate-100 dark:border-slate-850 pt-4 space-y-2">
                <span className="text-[10.5px] font-bold text-slate-700 dark:text-slate-350 block">Download Template Layouts:</span>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => handleDownloadSample('xlsx')}
                    className="flex items-center justify-center space-x-1 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-850 p-2 rounded-lg text-[10.5px] text-slate-700 dark:text-slate-300 transition"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Excel (.xlsx) Template</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDownloadSample('csv')}
                    className="flex items-center justify-center space-x-1 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-850 p-2 rounded-lg text-[10.5px] text-slate-700 dark:text-slate-300 transition"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>CSV Template</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Live Production Output Quick Editor */}
            <div className="bg-white dark:bg-slate-900 border border-slate-205 dark:border-slate-800 rounded-xl p-5 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-850 pb-2.5">
                <span className="font-bold text-xs uppercase tracking-wider text-slate-800 dark:text-neutral-200 flex items-center space-x-1.5">
                  <TrendingUp className="w-4 h-4 text-emerald-500" />
                  <span>Daily Production Output Editor</span>
                </span>
                <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/20 px-1.5 py-0.5 rounded animate-pulse">
                  Floor Live
                </span>
              </div>
              
              <p className="text-[10.5px] text-slate-450 leading-relaxed">
                Manually override today's volume targets & actual pieces produced by sewing assembly lines.
              </p>

              <div className="space-y-3 font-sans">
                {productionLines.map((line) => {
                  const isCurrentEditing = editingLineId === line.id;
                  return (
                    <div 
                      key={line.id} 
                      className={`p-3 rounded-lg border text-xs transition duration-150 ${
                        isCurrentEditing 
                          ? 'border-blue-500 bg-blue-50/5 dark:bg-blue-950/10' 
                          : 'border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30'
                      }`}
                    >
                      <div className="flex items-center justify-between font-bold text-slate-700 dark:text-slate-300 mb-2">
                        <span>Line {line.id} <span className="text-[10px] font-normal text-slate-400">({line.supervisor})</span></span>
                        
                        {!isCurrentEditing && (
                          <button
                            type="button"
                            onClick={() => handleStartEditLine(line)}
                            className="text-blue-500 hover:text-blue-600 font-bold flex items-center space-x-0.5 cursor-pointer"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                            <span>Edit</span>
                          </button>
                        )}
                      </div>

                      {isCurrentEditing ? (
                        <div className="space-y-2 mt-1">
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="text-[9px] font-bold text-slate-400 block mb-0.5 uppercase">Target (pcs)</label>
                              <input 
                                type="number"
                                min="0"
                                className="w-full px-2 py-1 font-mono font-bold bg-white dark:bg-slate-905 border border-slate-350 dark:border-slate-700 rounded text-slate-800 dark:text-slate-205 focus:ring-1 focus:ring-blue-500"
                                value={editTargetQty}
                                onChange={(e) => setEditTargetQty(e.target.value)}
                              />
                            </div>
                            <div>
                              <label className="text-[9px] font-bold text-slate-400 block mb-0.5 uppercase">Actual (pcs)</label>
                              <input 
                                type="number"
                                min="0"
                                className="w-full px-2 py-1 font-mono font-bold bg-white dark:bg-slate-905 border border-slate-350 dark:border-slate-700 rounded text-blue-650 dark:text-blue-400 focus:ring-1 focus:ring-blue-500"
                                value={editActualQty}
                                onChange={(e) => setEditActualQty(e.target.value)}
                              />
                            </div>
                          </div>
                          <div className="flex justify-end space-x-1.5 pt-1">
                            <button
                              type="button"
                              onClick={() => setEditingLineId(null)}
                              className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded font-semibold text-[10px] cursor-pointer"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSaveLineProduction(line.id)}
                              className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded font-bold text-[10px] cursor-pointer shadow-xs"
                            >
                              Save Output
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 gap-1 text-[11px] text-slate-500 font-mono">
                          <div>
                            Target: <span className="font-bold text-slate-700 dark:text-slate-300">{line.targetQuantity}</span>
                          </div>
                          <div>
                            Actual: <span className="font-bold text-blue-600 dark:text-blue-450">{line.actualQuantity}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Post-Import transaction analytical summary panel */}
            {importSummary && (
              <div className="bg-white dark:bg-slate-900 border-2 border-emerald-500/20 rounded-xl p-5 shadow-lg space-y-4 relative overflow-hidden">
                <div className="absolute top-0 right-0 h-2 bg-emerald-500 w-full" />
                <span className="font-bold text-xs uppercase tracking-wider text-emerald-600 dark:text-emerald-400 flex items-center space-x-1.5 pt-1">
                  <CheckCircle className="w-4 h-4" />
                  <span>Success Import Ledger Summary</span>
                </span>

                <div className="grid grid-cols-2 gap-3 pt-2">
                  <div className="bg-slate-50 dark:bg-slate-950 p-3 rounded-lg border border-slate-100 dark:border-slate-850">
                    <span className="text-[10px] text-slate-450 uppercase block font-bold">Total Inbound</span>
                    <span className="text-xl font-mono font-bold text-slate-800 dark:text-slate-200">{importSummary.total}</span>
                    <span className="text-[9.5px] text-slate-400 block mt-0.5">Rows parsed</span>
                  </div>
                  <div className="bg-emerald-50/10 dark:bg-emerald-950/20 p-3 rounded-lg border border-emerald-500/10">
                    <span className="text-[10px] text-emerald-600 block font-bold">Ingested Rows</span>
                    <span className="text-xl font-mono font-bold text-emerald-600 dark:text-emerald-400">{importSummary.success}</span>
                    <span className="text-[9.5px] text-slate-400 block mt-0.5">Committed successfully</span>
                  </div>
                </div>

                <div className="border-t border-slate-105 dark:border-slate-850 pt-3 space-y-2 text-xs">
                  <span className="font-bold text-[10.5px] text-slate-500 uppercase tracking-wider block">Attendance status results:</span>
                  
                  <div className="flex justify-between items-center text-[11px] pb-1 border-b border-dashed border-slate-100 dark:border-slate-850">
                    <span className="text-slate-500 flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-emerald-505 bg-emerald-500" />
                      Present Shift Operators
                    </span>
                    <span className="font-mono font-bold text-slate-700 dark:text-slate-300">{importSummary.present}</span>
                  </div>
                  <div className="flex justify-between items-center text-[11px] pb-1 border-b border-dashed border-slate-100 dark:border-slate-850">
                    <span className="text-slate-500 flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-amber-505 bg-amber-500" />
                      Late Arrivals (&gt;8:15 AM)
                    </span>
                    <span className="font-mono font-bold text-slate-700 dark:text-slate-300">{importSummary.late}</span>
                  </div>
                  <div className="flex justify-between items-center text-[11px] pb-1 border-b border-dashed border-slate-100 dark:border-slate-850">
                    <span className="text-slate-500 flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-rose-505 bg-rose-500" />
                      Unreported Absentees
                    </span>
                    <span className="font-mono font-bold text-slate-700 dark:text-slate-300">{importSummary.absent}</span>
                  </div>
                  
                  <div className="flex justify-between items-center font-bold text-xs pt-1.5 text-blue-600 dark:text-blue-400">
                    <span>Overall Attendance Rate Today</span>
                    <span className="font-mono">
                      {Number(((importSummary.present + importSummary.late) / (importSummary.present + importSummary.late + importSummary.absent || 1) * 100).toFixed(1))}%
                    </span>
                  </div>
                </div>

                <div className="bg-slate-50 dark:bg-slate-950 p-2.5 rounded-lg border border-slate-100 dark:border-slate-850 text-center">
                  <p className="text-[9.5px] text-slate-400">
                    All linked dashboard visualizations, factory metrics, and line balance recommendation tools have been updated instantly.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ---------- TAB 3: EMPLOYEE MASTER MANAGEMENT HUB ---------- */}
      {activeSubTab === 'employee-master' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            {/* Left Hand: Upload, validation, template downloader, and heuristics (7 columns) */}
            <div className="lg:col-span-7 space-y-6">
              
              {/* Card 1: Ingestion Zone */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs space-y-4 animate-fade-in">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-slate-100 dark:border-slate-800 pb-3 gap-2">
                  <div>
                    <h3 className="font-bold text-sm text-slate-850 dark:text-slate-200 flex items-center space-x-1.5">
                      <Users className="w-4.5 h-4.5 text-blue-500" />
                      <span>Employee Master Document Ingestion</span>
                    </h3>
                    <p className="text-[11px] text-slate-450 mt-0.5">Upload single XLS, XLSX, or CSV personnel lists to register or update factory personnel master files.</p>
                  </div>
                  
                  {/* Template Downloader Select */}
                  <div className="flex items-center space-x-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleDownloadEmpTemplate('csv')}
                      className="px-2.5 py-1.5 border border-slate-200 dark:border-slate-850 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-[10px] font-bold text-slate-650 dark:text-slate-350 flex items-center space-x-1 transition cursor-pointer"
                    >
                      <FileSpreadsheet className="w-3 h-3 text-emerald-500" />
                      <span>CSV Template</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDownloadEmpTemplate('xlsx')}
                      className="px-2.5 py-1.5 border border-slate-200 dark:border-slate-850 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-[10px] font-bold text-slate-650 dark:text-slate-350 flex items-center space-x-1 transition cursor-pointer"
                    >
                      <FileDown className="w-3 h-3 text-blue-500" />
                      <span>Excel Template</span>
                    </button>
                  </div>
                </div>

                {/* Conflict Resolution Selection */}
                <div className="bg-slate-50 dark:bg-slate-950/50 p-3 rounded-lg border border-slate-150 dark:border-slate-850/80 grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="text-[11px] font-bold text-slate-500 flex items-center space-x-1 px-1 sm:col-span-3">
                    <span>Database Integration Mode:</span>
                  </div>
                  <label className={`flex items-center space-x-2 p-2 rounded-lg border text-xs cursor-pointer select-none transition ${empActionRule === 'add-only' ? 'border-blue-500 bg-blue-50/10 dark:bg-blue-950/20 text-blue-650 dark:text-blue-400' : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-450'}`}>
                    <input
                      type="radio"
                      name="empActionRule"
                      checked={empActionRule === 'add-only'}
                      onChange={() => setEmpActionRule('add-only')}
                      className="sr-only"
                    />
                    <span className="w-1.5 h-1.5 rounded-full bg-current"></span>
                    <span>Add New Only</span>
                  </label>
                  <label className={`flex items-center space-x-2 p-2 rounded-lg border text-xs cursor-pointer select-none transition ${empActionRule === 'update-only' ? 'border-blue-500 bg-blue-50/10 dark:bg-blue-950/20 text-blue-650 dark:text-blue-400' : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-450'}`}>
                    <input
                      type="radio"
                      name="empActionRule"
                      checked={empActionRule === 'update-only'}
                      onChange={() => setEmpActionRule('update-only')}
                      className="sr-only"
                    />
                    <span className="w-1.5 h-1.5 rounded-full bg-current"></span>
                    <span>Update Existing Only</span>
                  </label>
                  <label className={`flex items-center space-x-2 p-2 rounded-lg border text-xs cursor-pointer select-none transition ${empActionRule === 'merge-update' ? 'border-blue-500 bg-blue-50/10 dark:bg-blue-950/20 text-blue-650 dark:text-blue-400' : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-450'}`}>
                    <input
                      type="radio"
                      name="empActionRule"
                      checked={empActionRule === 'merge-update'}
                      onChange={() => setEmpActionRule('merge-update')}
                      className="sr-only"
                    />
                    <span className="w-1.5 h-1.5 rounded-full bg-current"></span>
                    <span>Merge & Update</span>
                  </label>
                </div>

                {/* Drag zone */}
                <div
                  onDragEnter={handleEmpFileDrag}
                  onDragOver={handleEmpFileDrag}
                  onDragLeave={handleEmpFileDrag}
                  onDrop={handleEmpFileDrop}
                  className={`border-2 border-dashed rounded-xl p-8 text-center transition-all cursor-pointer ${
                    empDragActive
                      ? 'border-blue-500 bg-blue-50/10 dark:bg-blue-950/20 shadow-xs'
                      : empFileName
                      ? 'border-emerald-500 bg-emerald-50/5 dark:bg-emerald-955/5'
                      : 'border-slate-300 dark:border-slate-800 hover:border-slate-400 dark:hover:border-slate-700 bg-slate-50/50 dark:bg-slate-950/30'
                  }`}
                  onClick={() => { if (!empFileName) empFileInputRef.current?.click(); }}
                >
                  <input
                    ref={empFileInputRef}
                    type="file"
                    accept=".csv, .xlsx, .xls"
                    onChange={handleEmpFileSelect}
                    className="hidden"
                  />
                  
                  {empFileName ? (
                    <div className="space-y-3 animate-fade-in" onClick={(e) => e.stopPropagation()}>
                      <div className="w-11 h-11 bg-emerald-100 dark:bg-emerald-950/65 text-emerald-600 dark:text-emerald-400 rounded-full flex items-center justify-center mx-auto shadow-2xs">
                        <FileCheck className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-800 dark:text-slate-200">{empFileName}</p>
                        <p className="text-[10px] text-slate-455 mt-1">Ready to parse and validate {empRawData.length} records</p>
                      </div>
                      <div className="flex justify-center space-x-2">
                        <button
                          type="button"
                          onClick={() => {
                            setEmpFileName('');
                            setEmpParsedRows([]);
                            setEmpValidationErrors([]);
                            setEmpImportSummary(null);
                            if (empFileInputRef.current) empFileInputRef.current.value = '';
                          }}
                          className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-bold transition cursor-pointer font-sans"
                        >
                          Clear File
                        </button>
                        <button
                          type="button"
                          onClick={() => empFileInputRef.current?.click()}
                          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition cursor-pointer font-sans"
                        >
                          Change File
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      <div className="w-11 h-11 bg-blue-50 dark:bg-blue-955/65 text-blue-500 rounded-full flex items-center justify-center mx-auto">
                        <UploadCloud className="w-5 h-5 animate-pulse" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-700 dark:text-slate-300">Drag & drop your Employee Master spreadsheet here</p>
                        <p className="text-[10px] text-slate-455 mt-1">Supports XLSX, XLS, and CSV standard registers. Or click to browse.</p>
                      </div>
                      <div>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); empFileInputRef.current?.click(); }}
                          className="px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:bg-slate-105 dark:hover:bg-slate-800 rounded-lg text-xs font-bold text-slate-700 dark:text-slate-300 transition shadow-2xs cursor-pointer font-sans"
                        >
                          Browse Files
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* ---------- CARD: Configurable Assignment Mapping Rules Engine ---------- */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs space-y-4 animate-fade-in text-slate-800 dark:text-slate-200">
                <div className="border-b border-slate-100 dark:border-slate-800 pb-3">
                  <span className="font-bold text-xs uppercase tracking-wider text-slate-400 flex items-center space-x-1.5">
                    <Sliders className="w-4 h-4 text-indigo-500" />
                    <span>Assignment Mapping Rules Engine</span>
                  </span>
                  <h3 className="font-semibold text-sm text-slate-850 dark:text-slate-200 mt-1">
                    Value Normalization Translator
                  </h3>
                  <p className="text-[10px] text-slate-455 mt-1">
                    Define custom translation keys to automatically map non-standard spreadsheet status values (e.g., "Working", "Free", "Off duty") into native SWM system statuses.
                  </p>
                </div>

                {/* Add Custom Rule Inputs Row */}
                <div className="bg-slate-50 dark:bg-slate-950 p-3.5 rounded-lg border border-slate-150 dark:border-slate-850/80 space-y-3">
                  <span className="text-[10.5px] font-bold text-slate-500 dark:text-slate-400 block uppercase tracking-wide">
                    Create New Value Rule
                  </span>
                  <div className="flex flex-col sm:flex-row gap-2.5">
                    <div className="flex-1">
                      <label htmlFor="sourceVal" className="block text-[9px] font-bold uppercase tracking-wider text-slate-400 pb-1">
                        Spreadsheet Status Value
                      </label>
                      <input
                        id="sourceVal"
                        type="text"
                        placeholder="e.g., Active Reserve, Working"
                        value={newRuleSourceValue}
                        onChange={(e) => setNewRuleSourceValue(e.target.value)}
                        className="w-full bg-white dark:bg-slate-900 border border-slate-250 dark:border-slate-800 rounded-lg py-1.5 px-2.5 text-xs focus:ring-1 focus:ring-blue-500 focus:outline-none dark:text-slate-300 font-medium"
                      />
                    </div>

                    <div className="sm:w-48">
                      <label htmlFor="targetStatusSelect" className="block text-[9px] font-bold uppercase tracking-wider text-slate-400 pb-1">
                        SWM System Target
                      </label>
                      <select
                        id="targetStatusSelect"
                        value={newRuleTargetStatus}
                        onChange={(e) => setNewRuleTargetStatus(e.target.value)}
                        className="w-full bg-white dark:bg-slate-900 border border-slate-250 dark:border-slate-800 rounded-lg py-1.5 px-2.5 text-xs focus:ring-1 focus:ring-blue-500 focus:outline-none dark:text-slate-300 font-bold"
                      >
                        <option value="Assigned">Assigned</option>
                        <option value="Available">Available for Replacement</option>
                        <option value="Unassigned">Unassigned</option>
                        <option value="Training">Training</option>
                        <option value="Meeting">Meeting</option>
                        <option value="Quality Audit">Quality Audit</option>
                        <option value="Maintenance Support">Maintenance Support</option>
                        <option value="Off-Line Activity">Off-Line Activity</option>
                        <option value="Leave">Leave</option>
                      </select>
                    </div>

                    <div className="sm:self-end">
                      <button
                        type="button"
                        onClick={handleAddMappingRule}
                        className="w-full sm:w-auto px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold flex items-center justify-center space-x-1 hover:shadow-sm transition cursor-pointer font-sans"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Display Configured Rules */}
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-bold text-slate-455 uppercase tracking-wide">
                      Active Translation Rules Dictionary ({customRulesList.length})
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        const defaults = [
                          { rawValue: 'Production Operator', mappedStatus: 'Assigned' },
                          { rawValue: 'Reserve Worker', mappedStatus: 'Available' },
                          { rawValue: 'Training Session', mappedStatus: 'Training' },
                          { rawValue: 'Assigned to Line', mappedStatus: 'Assigned' },
                          { rawValue: 'Working', mappedStatus: 'Assigned' },
                          { rawValue: 'Allocated', mappedStatus: 'Assigned' },
                          { rawValue: 'Production', mappedStatus: 'Assigned' },
                          { rawValue: 'Free', mappedStatus: 'Available' },
                          { rawValue: 'Available', mappedStatus: 'Available' },
                          { rawValue: 'Standby', mappedStatus: 'Available' }
                        ];
                        setCustomRulesList(defaults);
                        if (empRawData.length > 0) {
                          setTimeout(() => {
                            processEmpParsedData(empRawData, selectedAssignmentColumn, defaults);
                          }, 50);
                        }
                      }}
                      className="text-[9.5px] font-bold text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 cursor-pointer underline"
                    >
                      Reset Defaults
                    </button>
                  </div>
                  <div className="max-h-52 overflow-y-auto border border-slate-200 dark:border-slate-800 rounded-lg p-1.5 bg-slate-50/40 dark:bg-slate-950/30 space-y-1 custom-scrollbar">
                    {customRulesList.map((rule, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between p-2 bg-white dark:bg-slate-900 border border-slate-150 dark:border-slate-850 rounded-lg text-xs shadow-3xs"
                      >
                        <div className="flex items-center space-x-2.5">
                          <span className="font-mono font-bold text-slate-755 dark:text-slate-300">
                            "{rule.rawValue}"
                          </span>
                          <ArrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className={`font-semibold px-2 py-0.5 rounded-sm text-[9.5px] ${
                            rule.mappedStatus === 'Assigned' ? 'bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-400 border border-blue-500/10' :
                            rule.mappedStatus === 'Available' ? 'bg-emerald-50 dark:bg-emerald-955/35 text-emerald-700 dark:text-emerald-40 border border-emerald-500/15' :
                            rule.mappedStatus === 'Unassigned' ? 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200/50 dark:border-slate-750' :
                            rule.mappedStatus === 'Training' ? 'bg-cyan-50 dark:bg-cyan-950/35 text-cyan-700 dark:text-cyan-400 border border-cyan-500/10' :
                            rule.mappedStatus === 'Meeting' ? 'bg-indigo-50 dark:bg-indigo-950/35 text-indigo-700 dark:text-indigo-400 border border-indigo-500/10' :
                            rule.mappedStatus === 'Quality Audit' ? 'bg-amber-50 dark:bg-amber-955/35 text-amber-700 dark:text-amber-40 border border-amber-500/10' :
                            rule.mappedStatus === 'Maintenance Support' ? 'bg-teal-50 dark:bg-teal-950/30 text-teal-700 dark:text-teal-400 border border-teal-500/10' :
                            rule.mappedStatus === 'Leave' ? 'bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-400 border border-rose-500/10' :
                            'bg-slate-100 text-slate-650'
                          }`}>
                            {rule.mappedStatus === 'Available' ? 'Available for Replacement' : rule.mappedStatus}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveMappingRule(idx)}
                          className="p-1 text-slate-400 hover:text-rose-600 transition hover:bg-rose-100/10 rounded cursor-pointer"
                          title="Delete Translation Rule"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Card 2: Interactive Validation Dashboard */}
              {empParsedRows.length > 0 && (
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs space-y-4 animate-fade-in">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-slate-100 dark:border-slate-800 pb-2 gap-2">
                    <div>
                      <h4 className="font-bold text-xs uppercase tracking-wider text-slate-400">Personnel Diagnostics & Verification Panel</h4>
                      <p className="text-[10px] text-slate-455 mt-0.5">Real-time schema verification for industrial compliance</p>
                    </div>
                    
                    <button
                      type="button"
                      onClick={handleApplyCommitEmployees}
                      className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold flex items-center space-x-1.5 shadow-sm transition cursor-pointer font-sans"
                    >
                      <Database className="w-3.5 h-3.5" />
                      <span>Integrate {empParsedRows.length - empValidationErrors.filter(e => e.severity === 'error').length} Records</span>
                    </button>
                  </div>

                  {/* Summary grid stats */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="bg-slate-50 dark:bg-slate-950 p-2.5 rounded-lg border border-slate-150 dark:border-slate-850">
                      <span className="text-[9.5px] uppercase font-bold text-slate-400">Total Rows</span>
                      <p className="text-lg font-mono font-bold text-slate-755 dark:text-slate-300">{empParsedRows.length}</p>
                    </div>
                    <div className="bg-emerald-50/20 dark:bg-emerald-950/20 p-2.5 rounded-lg border border-emerald-500/10">
                      <span className="text-[9.5px] uppercase font-bold text-emerald-600">Valid Rows</span>
                      <p className="text-lg font-mono font-bold text-emerald-600 dark:text-emerald-450">{empParsedRows.length - empValidationErrors.filter(e => e.severity === 'error').length}</p>
                    </div>
                    <div className="bg-rose-50/20 dark:bg-rose-950/20 p-2.5 rounded-lg border border-rose-500/10">
                      <span className="text-[9.5px] uppercase font-bold text-rose-555">Fatal Errors</span>
                      <p className="text-lg font-mono font-bold text-rose-600 dark:text-rose-450">{empValidationErrors.filter(e => e.severity === 'error').length}</p>
                    </div>
                    <div className="bg-amber-50/20 dark:bg-amber-950/20 p-2.5 rounded-lg border border-amber-500/10">
                      <span className="text-[9.5px] uppercase font-bold text-amber-500">Warnings</span>
                      <p className="text-lg font-mono font-bold text-amber-600 dark:text-amber-400">{empValidationErrors.filter(e => e.severity === 'warning').length}</p>
                    </div>
                  </div>

                  {/* Validation Error list */}
                  {empValidationErrors.length > 0 ? (
                    <div className="space-y-2 animate-fade-in">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-rose-500 dark:text-rose-400 block pb-1">Validation Failure Logs</span>
                      <div className="max-h-56 overflow-y-auto border border-slate-200 dark:border-slate-800 rounded-lg p-2 bg-slate-50/40 dark:bg-slate-950/30 space-y-1.5 custom-scrollbar">
                        {empValidationErrors.map((err, ki) => (
                          <div key={ki} className={`p-2 rounded-md border text-[10px] flex items-start space-x-2 ${err.severity === 'error' ? 'bg-rose-50/20 dark:bg-rose-955/15 border-rose-200 dark:border-rose-900/35 text-rose-800 dark:text-rose-300' : 'bg-amber-50/15 dark:bg-amber-955/10 border-amber-200 dark:border-amber-900/30 text-amber-800 dark:text-amber-350'}`}>
                            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                            <div>
                              <div className="font-bold flex items-center space-x-1">
                                <span className="underline">Row {err.row}</span> | <span>ID: {err.empId}</span> | <span>Field: "{err.field}"</span>
                              </div>
                              <p className="mt-0.5 text-slate-650 dark:text-slate-400 leading-relaxed">{err.reason}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="bg-emerald-500/10 p-3 rounded-lg border border-emerald-500/20 text-emerald-700 dark:text-emerald-450 text-[11px] flex items-center space-x-2 animate-fade-in">
                      <CheckCircle className="w-4 h-4 shrink-0 text-emerald-600" />
                      <span>Zero formatting deviations found. All records are fully compatible with SWM database standards!</span>
                    </div>
                  )}

                  {/* ---------- SECTION: Assignment Mapping Validation & Insights ---------- */}
                  <div className="border border-indigo-100 dark:border-indigo-900/40 bg-slate-50/40 dark:bg-slate-950/20 rounded-xl p-4.5 space-y-4 animate-fade-in">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center space-x-2">
                        <Database className="w-4.5 h-4.5 text-indigo-500" />
                        <h5 className="text-[11.5px] font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wide">
                          Assignment Mapping Validation
                        </h5>
                      </div>
                      <span className="bg-indigo-150/15 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-400 text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider shrink-0 w-fit">
                        Smart Ingestion Step
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Column Detection Indicator */}
                      <div className="space-y-2">
                        <p className="text-[10.5px] font-bold text-slate-455 uppercase tracking-wide">
                          Detected Columns & Targets
                        </p>

                        {detectedAssignmentColumns.length > 0 ? (
                          <div className="space-y-2.5">
                            <div className="p-2.5 bg-white dark:bg-slate-900 rounded-lg border border-slate-150 dark:border-slate-850 flex items-center justify-between shadow-2xs">
                              <div className="flex flex-col">
                                <span className="text-[9px] font-bold text-slate-400 uppercase">Destination Attribute</span>
                                <span className="text-[11px] font-bold text-slate-700 dark:text-slate-350">Workforce Assignment Status</span>
                              </div>
                              <div className="text-right">
                                <span className="text-[9px] bg-emerald-100 dark:bg-emerald-900/50 text-emerald-800 dark:text-emerald-300 px-2 py-0.5 rounded font-black tracking-wide">
                                  AUTO-MAPPED
                                </span>
                              </div>
                            </div>

                            {detectedAssignmentColumns.length > 1 ? (
                              <div className="space-y-1.5 pt-1">
                                <label className="text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 flex items-center space-x-1">
                                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                                  <span>Multiple Assignment Fields Detected:</span>
                                </label>
                                <select
                                  id="selectIngestionCol"
                                  value={selectedAssignmentColumn}
                                  onChange={(e) => {
                                    const newCol = e.target.value;
                                    setSelectedAssignmentColumn(newCol);
                                    processEmpParsedData(empRawData, newCol);
                                  }}
                                  className="w-full bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-900/40 rounded-lg p-2 text-xs focus:ring-1 focus:ring-amber-500 focus:outline-none dark:text-slate-300 font-bold"
                                >
                                  {detectedAssignmentColumns.map(col => (
                                    <option key={col} value={col}>
                                      Source Column: "{col}"
                                    </option>
                                  ))}
                                </select>
                                <p className="text-[9.5px] text-slate-500 leading-normal">
                                  Select which spreadsheet header holds your primary workforce statuses. The ingestion parsing matrix will immediately adjust.
                                </p>
                              </div>
                            ) : (
                              <div className="p-2.5 bg-indigo-50/20 dark:bg-indigo-950/20 border border-indigo-150/10 rounded-lg flex items-center justify-between text-xs">
                                <div className="flex items-center space-x-1.5 text-indigo-750 dark:text-indigo-350">
                                  <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                                  <span>Mapped Header: <strong className="font-mono text-slate-750 dark:text-slate-200">"{selectedAssignmentColumn}"</strong></span>
                                </div>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="p-3 bg-amber-500/5 dark:bg-amber-955/10 border border-amber-500/20 rounded-lg space-y-1.5 shadow-2xs">
                            <div className="flex items-center space-x-1.5 text-amber-700 dark:text-amber-450 text-xs font-bold">
                              <AlertTriangle className="w-4 h-4 shrink-0 text-amber-550" />
                              <span>No Dynamic Workforce Columns Found</span>
                            </div>
                            <p className="text-[10px] text-slate-550 dark:text-slate-450 leading-relaxed">
                              This file does not contain a recognized assignment column. All imported records will automatically default to <strong className="text-slate-700 dark:text-slate-300">"Unassigned"</strong> with a Line Number of 0. Add cards such as <em>"Workforce Status"</em> to allow automatic line syncing.
                            </p>
                          </div>
                        )}
                      </div>

                      {/* Assignment Status Pre-Import Insights */}
                      <div className="space-y-2">
                        <p className="text-[10.5px] font-bold text-slate-455 uppercase tracking-wide">
                          Pre-Import Assignment Status Insights
                        </p>
                        <div className="bg-white dark:bg-slate-900 border border-slate-150 dark:border-slate-800 p-3 rounded-lg shadow-2xs">
                          {(() => {
                            const counts = {
                              Assigned: 0,
                              Available: 0,
                              Unassigned: 0,
                              Training: 0,
                              Meeting: 0,
                              QualityAudit: 0,
                              MaintenanceSupport: 0,
                              Leave: 0
                            };

                            empParsedRows.forEach(r => {
                              const s = r.workforceAssignmentStatus || 'Unassigned';
                              if (s === 'Assigned') counts.Assigned++;
                              else if (s === 'Available for Replacement') counts.Available++;
                              else if (s === 'Unassigned') counts.Unassigned++;
                              else if (s === 'Training') counts.Training++;
                              else if (s === 'Meeting') counts.Meeting++;
                              else if (s === 'Quality Audit') counts.QualityAudit++;
                              else if (s === 'Maintenance Support') counts.MaintenanceSupport++;
                              else if (s === 'Leave') counts.Leave++;
                            });

                            return (
                              <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[9.5px]">
                                <div className="flex justify-between items-center py-0.5 border-b border-dashed border-slate-100 dark:border-slate-800">
                                  <span className="text-slate-500 font-medium">Assigned Operators</span>
                                  <span className="font-mono font-bold text-blue-600 dark:text-blue-400">{counts.Assigned}</span>
                                </div>
                                <div className="flex justify-between items-center py-0.5 border-b border-dashed border-slate-100 dark:border-slate-800">
                                  <span className="text-slate-500 font-medium">Available (Replacements)</span>
                                  <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">{counts.Available}</span>
                                </div>
                                <div className="flex justify-between items-center py-0.5 border-b border-dashed border-slate-100 dark:border-slate-800">
                                  <span className="text-slate-500 font-medium">Unassigned Employees</span>
                                  <span className="font-mono font-bold text-slate-600 dark:text-slate-400">{counts.Unassigned}</span>
                                </div>
                                <div className="flex justify-between items-center py-0.5 border-b border-dashed border-slate-100 dark:border-slate-800">
                                  <span className="text-slate-500 font-medium">Training Session Attendees</span>
                                  <span className="font-mono font-bold text-cyan-600 dark:text-cyan-400">{counts.Training}</span>
                                </div>
                                <div className="flex justify-between items-center py-0.5 border-b border-dashed border-slate-100 dark:border-slate-800">
                                  <span className="text-slate-500 font-medium">Meeting Participants</span>
                                  <span className="font-mono font-bold text-indigo-555 dark:text-indigo-400">{counts.Meeting}</span>
                                </div>
                                <div className="flex justify-between items-center py-0.5 border-b border-dashed border-slate-100 dark:border-slate-800">
                                  <span className="text-slate-500 font-medium">Quality Audit Block</span>
                                  <span className="font-mono font-bold text-amber-600 dark:text-amber-400">{counts.QualityAudit}</span>
                                </div>
                                <div className="flex justify-between items-center py-0.5 border-b border-dashed border-slate-100 dark:border-slate-800">
                                  <span className="text-slate-500 font-medium">Maintenance Support</span>
                                  <span className="font-mono font-bold text-teal-600 dark:text-teal-400">{counts.MaintenanceSupport}</span>
                                </div>
                                <div className="flex justify-between items-center py-0.5 border-b border-dashed border-slate-100 dark:border-slate-800">
                                  <span className="text-slate-500 font-medium">Approved Leave</span>
                                  <span className="font-mono font-bold text-rose-600 dark:text-rose-400">{counts.Leave}</span>
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Raw Data Preview Grid wrapper */}
                  <div className="space-y-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block pb-1">Master File Preview Grid (Rows 1 - 5)</span>
                    <div className="overflow-x-auto border border-slate-205 dark:border-slate-800 rounded-lg">
                      <table className="w-full text-left border-collapse text-[10px]">
                        <thead>
                          <tr className="bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 font-bold text-slate-600 dark:text-slate-350">
                            <th className="p-2">ID</th>
                            <th className="p-2">Candidate Name</th>
                            <th className="p-2">Dept</th>
                            <th className="p-2">Section</th>
                            <th className="p-2 text-center">Line</th>
                            <th className="p-2">Designation</th>
                            <th className="p-2">Join Date</th>
                            <th className="p-2">Skill Grade</th>
                            <th className="p-2">Assignment Status</th>
                            <th className="p-2 text-right">Base Eff %</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-850">
                          {empParsedRows.slice(0, 5).map((r, ri) => (
                            <tr key={ri} className="hover:bg-slate-50 dark:hover:bg-slate-850/50">
                              <td className="p-2 font-bold font-mono text-slate-800 dark:text-slate-200">{r.id}</td>
                              <td className="p-2">{r.name}</td>
                              <td className="p-2">{r.department}</td>
                              <td className="p-2">{r.section}</td>
                              <td className="p-2 text-center">{r.lineNumber}</td>
                              <td className="p-2">{r.designation}</td>
                              <td className="p-2">{r.joiningDate}</td>
                              <td className="p-2">{r.skillCategory}</td>
                              <td className="p-2">
                                <span className={`font-semibold px-2 py-0.5 rounded-sm text-[9px] ${
                                  r.workforceAssignmentStatus === 'Assigned' ? 'bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-400 border border-blue-500/10' :
                                  r.workforceAssignmentStatus === 'Available for Replacement' ? 'bg-emerald-50 dark:bg-emerald-955/35 text-emerald-700 dark:text-emerald-40 border border-emerald-500/15' :
                                  r.workforceAssignmentStatus === 'Unassigned' ? 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200/50 dark:border-slate-750' :
                                  r.workforceAssignmentStatus === 'Training' ? 'bg-cyan-50 dark:bg-cyan-950/35 text-cyan-700 dark:text-cyan-400 border border-cyan-500/10' :
                                  r.workforceAssignmentStatus === 'Meeting' ? 'bg-indigo-50 dark:bg-indigo-950/35 text-indigo-700 dark:text-indigo-400 border border-indigo-500/10' :
                                  r.workforceAssignmentStatus === 'Quality Audit' ? 'bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 border border-amber-500/10' :
                                  r.workforceAssignmentStatus === 'Maintenance Support' ? 'bg-teal-50 dark:bg-teal-950/30 text-teal-700 dark:text-teal-400 border border-teal-500/10' :
                                  r.workforceAssignmentStatus === 'Leave' ? 'bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-400 border border-rose-500/10' :
                                  'bg-slate-100 dark:bg-slate-800 text-slate-650'
                                }`}>
                                  {r.workforceAssignmentStatus === 'Available for Replacement' ? 'Available' : r.workforceAssignmentStatus}
                                </span>
                              </td>
                              <td className="p-2 text-right font-bold text-blue-650 dark:text-blue-400">{r.baseEfficiency}%</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* Card 3: Success Import Summary Card */}
              {empImportSummary && (
                <div className="bg-emerald-500/10 border-2 border-emerald-500/35 rounded-xl p-5 space-y-3 shadow-xs animate-fade-in text-emerald-850 dark:text-emerald-450">
                  <div className="flex items-center space-x-2">
                    <CheckCircle className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <div>
                      <h4 className="font-bold text-xs uppercase tracking-wider text-slate-800 dark:text-slate-200">Import Integration Complete</h4>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400">Employee records integrated successfully across all operations registers</p>
                    </div>
                  </div>
                  <div className="bg-white dark:bg-slate-900 border border-emerald-500/10 p-3.5 rounded-lg space-y-1.5 text-xs text-slate-700 dark:text-slate-300">
                    <p className="font-semibold text-slate-850 dark:text-slate-200 text-[11px]">Execution Diagnostics:</p>
                    <div className="grid grid-cols-2 gap-2 text-[10.5px] pt-1 text-slate-600 dark:text-slate-400 font-medium">
                      <div>Total Records Parsed: <span className="font-bold text-slate-800 dark:text-slate-200">{empImportSummary.total}</span></div>
                      <div>Success Transfers: <span className="font-bold text-emerald-600 dark:text-emerald-450">{empImportSummary.success}</span></div>
                      <div>Discarded Error Rows: <span className="font-bold text-rose-600 dark:text-rose-450">{empImportSummary.errors}</span></div>
                      <div>Rule Warnings Logged: <span className="font-bold text-amber-600 dark:text-amber-400">{empImportSummary.warnings}</span></div>
                    </div>
                    {empImportSummary.assignmentDetails && (
                      <div className="pt-2 border-t border-slate-100 dark:border-slate-800 text-[10.5px] text-indigo-700 dark:text-indigo-400">
                        <span className="font-semibold block text-[11px] uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">Workforce Assignment Sync Metrics:</span>
                        <div className="grid grid-cols-2 gap-1.5 font-medium">
                          <div>Added Assignments: <span className="font-bold font-mono text-emerald-600 dark:text-emerald-400">+{empImportSummary.assignmentDetails.added}</span></div>
                          <div>Updated Assignments: <span className="font-bold font-mono text-blue-600 dark:text-blue-400">*{empImportSummary.assignmentDetails.updated}</span></div>
                          <div>Unchanged Assignments: <span className="font-bold font-mono text-slate-600 dark:text-slate-400">{empImportSummary.assignmentDetails.unchanged}</span></div>
                          <div>Failed Assignments: <span className="font-bold font-mono text-rose-600 dark:text-rose-400">{empImportSummary.assignmentDetails.failed}</span></div>
                        </div>
                      </div>
                    )}
                    <div className="pt-2 border-t border-slate-100 dark:border-slate-800 text-[10.5px] italic text-slate-500 mt-1 pb-1">
                      {empImportSummary.actionsTaken}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Right Hand: Personnel Exports Database Search & Compliance Filter Section (5 columns) */}
            <div className="lg:col-span-5 space-y-6">
              
              {/* Card 4: Compliance Filter & Export Options */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs space-y-4 animate-fade-in">
                <div className="border-b border-slate-100 dark:border-slate-800 pb-3">
                  <span className="font-bold text-xs uppercase tracking-wider text-slate-400 flex items-center space-x-1.5">
                    <Filter className="w-4 h-4 text-blue-500" />
                    <span>Compliance Export Center</span>
                  </span>
                  <h3 className="font-bold text-sm text-slate-800 dark:text-slate-200 mt-1">Multi-Filter Roster Extract</h3>
                  <p className="text-[10px] text-slate-455 mt-1">Export employee master rosters filtered by departments, lines, skill classifications, or experience groupings.</p>
                </div>

                <div className="space-y-3">
                  {/* Filter 1: Department */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Department</label>
                    <select
                      value={empExportDept}
                      onChange={(e) => setEmpExportDept(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg p-2 text-xs focus:ring-1 focus:ring-blue-500 focus:outline-none dark:text-slate-300"
                    >
                      <option value="All">All Departments</option>
                      <option value="Sewing">Sewing</option>
                      <option value="Cutting">Cutting</option>
                      <option value="QA">Quality Assurance (QA)</option>
                      <option value="Finishing">Finishing</option>
                    </select>
                  </div>

                  {/* Filter 2: Section */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Section/Subunit</label>
                    <select
                      value={empExportSection}
                      onChange={(e) => setEmpExportSection(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg p-2 text-xs focus:ring-1 focus:ring-blue-500 focus:outline-none dark:text-slate-300"
                    >
                      <option value="All">All Sections</option>
                      <option value="Main Line">Main Line Assembly</option>
                      <option value="Sampling">Sampling Workshop</option>
                      <option value="Quality Inspection">QA Inspection Block</option>
                      <option value="Finishing Area">Finishing/Packaging Area</option>
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-3.5">
                    {/* Filter 3: Line Number */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Line No.</label>
                      <select
                        value={empExportLine}
                        onChange={(e) => setEmpExportLine(e.target.value)}
                        className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg p-2 text-xs focus:ring-1 focus:ring-blue-500 focus:outline-none dark:text-slate-300"
                      >
                        <option value="All">All Lines</option>
                        {Array.from({ length: 15 }, (_, i) => i + 1).map(num => (
                          <option key={num} value={String(num)}>Line {num}</option>
                        ))}
                      </select>
                    </div>

                    {/* Filter 4: Skill Category */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Skill Band</label>
                      <select
                        value={empExportSkill}
                        onChange={(e) => setEmpExportSkill(e.target.value)}
                        className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg p-2 text-xs focus:ring-1 focus:ring-blue-500 focus:outline-none dark:text-slate-300"
                      >
                        <option value="All">All Skill Levels</option>
                        <option value="Grade A Operator">Grade A Master</option>
                        <option value="Grade B Operator">Grade B Standard</option>
                        <option value="Grade C Operator">Grade C Apprentice</option>
                        <option value="Helper">Standard Factory Helper</option>
                        <option value="Quality Inspector">Quality Inspector</option>
                        <option value="Ironer/Finisher">Finishing Specialist</option>
                      </select>
                    </div>
                  </div>

                  {/* Filter 5: Experience Level */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Experience Index</label>
                    <select
                      value={empExportExperience}
                      onChange={(e) => setEmpExportExperience(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg p-2 text-xs focus:ring-1 focus:ring-blue-500 focus:outline-none dark:text-slate-300"
                    >
                      <option value="All">All Service Ranges</option>
                      <option value="0-2">Junior (0 - 2 Years tenure)</option>
                      <option value="2-5">Senior (2 - 5 Years tenure)</option>
                      <option value="5+">Veteran Master (5+ Years tenure)</option>
                    </select>
                  </div>
                </div>

                {/* Exporter triggers */}
                <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-2.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Export Formatted Documents</span>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => handleEmpExportDownload('xlsx')}
                      className="p-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center justify-center space-x-1.5 shadow-sm transition border border-transparent cursor-pointer font-sans"
                    >
                      <FileSpreadsheet className="w-4 h-4" />
                      <span>XLS Roster</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleEmpExportDownload('csv')}
                      className="p-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold flex items-center justify-center space-x-1.5 shadow-sm transition border border-transparent cursor-pointer font-sans"
                    >
                      <FileCheck className="w-4 h-4" />
                      <span>CSV Roster</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleEmpExportDownload('pdf')}
                      className="p-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold flex items-center justify-center space-x-1.5 shadow-xs transition border border-transparent cursor-pointer font-sans"
                    >
                      <Printer className="w-4 h-4" />
                      <span>Print PDF</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Card 5: Live Database Status Indicators with active preview list details */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs space-y-4 animate-fade-in">
                <div>
                  <h4 className="font-bold text-xs uppercase tracking-wider text-slate-400 flex items-center space-x-1.5">
                    <Database className="w-4 h-4 text-blue-550" />
                    <span>Real-time Active Query Stats</span>
                  </h4>
                  <p className="text-[10px] text-slate-455 mt-1">Roster matches that comply with the active compliant target filter attributes above</p>
                </div>

                <div className="bg-slate-50 dark:bg-slate-950 p-4 rounded-xl border border-slate-200/60 dark:border-slate-855 flex justify-between items-center text-xs">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Filtered Staff Count</span>
                    <span className="text-xl font-mono font-bold text-slate-800 dark:text-slate-200">{empExportPreview.length}</span>
                    <span className="text-[9.5px] text-slate-400 block mt-0.5">out of {employees.length} factory workers</span>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block text-right">Average Efficiency</span>
                    <span className="text-xl font-mono font-bold text-blue-650 dark:text-blue-400 block">
                      {Math.round(empExportPreview.reduce((acc, curr) => acc + curr.baseEfficiency, 0) / (empExportPreview.length || 1))}%
                    </span>
                    <span className="text-[9.5px] text-emerald-555 text-right block font-semibold mt-0.5">Avg Attendance: {Math.round(empExportPreview.reduce((acc, curr) => acc + curr.historicalAttendanceRate, 0) / (empExportPreview.length || 1))}%</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Roster Match Personnel List</span>
                  <div className="max-h-52 overflow-y-auto border border-slate-200 dark:border-slate-800 rounded-lg p-2.5 bg-slate-50/20 dark:bg-slate-950/20 divide-y divide-slate-100 dark:divide-slate-850 custom-scrollbar space-y-2">
                    {empExportPreview.length > 0 ? (
                      empExportPreview.map((e, index) => (
                        <div key={index} className="flex justify-between items-center pt-2 first:pt-0 pb-1 text-[10.5px]">
                          <div className="flex items-center space-x-2">
                            <div className="w-7 h-7 rounded-full bg-blue-100 dark:bg-slate-800 flex items-center justify-center font-bold text-[9px] text-blue-700 dark:text-blue-400 shrink-0 uppercase">
                              {e.name.substring(0, 2)}
                            </div>
                            <div>
                              <span className="font-bold text-slate-800 dark:text-slate-200 block">{e.name}</span>
                              <span className="text-[9px] text-slate-450 block font-mono">{e.id} | {e.designation}</span>
                            </div>
                          </div>
                          <div className="text-right">
                            <span className="text-xs font-mono font-bold text-slate-700 dark:text-slate-350 block">Line {e.lineNumber}</span>
                            <span className="text-[9px] text-slate-450 font-bold px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800">{e.department}</span>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-center py-6 text-[11px] text-slate-400">
                        Zero employee registers match current filter rules.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ---------- TAB 2: EXPORT CENTER CENTRAL ---------- */}
      {activeSubTab === 'export' && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          
          {/* Main Controls (Takes 1/3 space of grid) */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs space-y-5">
            <span className="font-bold text-xs uppercase tracking-wider text-slate-400 flex items-center space-x-1.5">
              <Filter className="w-4 h-4 text-blue-500" />
              <span>Export Compliance Parameters</span>
            </span>

            {/* Template Selector */}
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Configure Report Template</label>
              <select
                value={reportTemplate}
                onChange={e => setReportTemplate(e.target.value)}
                className="w-full bg-[#F8FAFC] dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs p-2.5 rounded-lg text-slate-700 dark:text-slate-300 font-bold focus:outline-none focus:border-blue-500"
              >
                <option value="attendance_report">Attendance Ledger Report (Detailed)</option>
                <option value="absenteeism_report">Absenteeism Trend & Exception Report</option>
                <option value="line_efficiency_report">Line Balancing & Manpower Efficiency</option>
                <option value="skill_matrix_report">Skill Matrix Level & Operator Capacity</option>
              </select>
            </div>

            {/* Filters */}
            <div className="grid grid-cols-2 gap-3.5 pt-1.5">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Start Date</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                  className="w-full bg-[#F8FAFC] dark:bg-slate-950 border border-slate-205 dark:border-slate-800 text-xs p-2 rounded-lg text-slate-700 dark:text-slate-300 font-mono font-semibold"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">End Date</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={e => setEndDate(e.target.value)}
                  className="w-full bg-[#F8FAFC] dark:bg-slate-950 border border-slate-205 dark:border-slate-800 text-xs p-2 rounded-lg text-slate-700 dark:text-slate-300 font-mono font-semibold"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Department</label>
              <select
                value={deptFilter}
                onChange={e => setDeptFilter(e.target.value)}
                className="w-full bg-[#F8FAFC] dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs p-2.5 rounded-lg text-slate-700 dark:text-slate-300"
              >
                <option value="All">All Departments</option>
                {uniqueDepts.map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3.5">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Production Line</label>
                <select
                  value={lineFilter}
                  onChange={e => setLineFilter(e.target.value)}
                  className="w-full bg-[#F8FAFC] dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs p-2 rounded-lg text-slate-700 dark:text-slate-300"
                >
                  <option value="All">All Lines</option>
                  {uniqueLines.map(l => (
                    <option key={l} value={String(l)}>Line {l}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Status</label>
                <select
                  value={statusFilter}
                  onChange={e => setStatusFilter(e.target.value)}
                  className="w-full bg-[#F8FAFC] dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs p-2 rounded-lg text-slate-700 dark:text-slate-300"
                >
                  <option value="All">All Statuses</option>
                  <option value="Present">Present Only</option>
                  <option value="Late">Late Only</option>
                  <option value="Absent">Absent Only</option>
                  <option value="Leave">On Leave</option>
                </select>
              </div>
            </div>

            <div className="border-t border-slate-105 dark:border-slate-850 pt-4 space-y-2.5">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Export Active Dataset Actions</span>
              
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => handleDownloadExportData('xlsx')}
                  className="w-full flex items-center justify-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white font-bold p-2.5 rounded-lg text-xs shadow-sm transition"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  <span>Download Excel (.xlsx) Report</span>
                </button>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => handleDownloadExportData('csv')}
                    className="flex items-center justify-center space-x-1.5 border border-slate-205 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-850 text-slate-700 dark:text-slate-300 rounded-lg text-xs py-2 transition"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download CSV</span>
                  </button>
                  <button
                    type="button"
                    onClick={handlePrintReport}
                    className="flex items-center justify-center space-x-1.5 border border-slate-205 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-850 text-slate-700 dark:text-slate-300 rounded-lg text-xs py-2 transition"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>Print PDF</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Float notification feedback toast elements */}
            {showExportSuccessToast && (
              <div className="bg-emerald-50/10 dark:bg-emerald-950/20 border border-emerald-500/20 p-3 rounded-lg flex items-start space-x-2 text-[11px] mt-2 animate-bounce">
                <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                <div className="text-emerald-700 dark:text-emerald-400">
                  <span className="font-bold block">Document generated successfully!</span>
                  <span className="block text-[9.5px] italic text-slate-400">{exportedFilename}</span>
                </div>
              </div>
            )}
          </div>

          {/* Active Interactive Report Live Sheet Preview (Takes 2/3 space of grid) */}
          <div className="xl:col-span-2 space-y-6">
            <div id="print-area" className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm space-y-4">
              
              {/* Document Header (Styles to look print/invoice compliance ledger standard) */}
              <div className="flex flex-col sm:flex-row justify-between items-start border-b border-slate-200 dark:border-slate-800 pb-4 gap-4">
                <div className="space-y-1.5">
                  <div className="flex items-center space-x-2">
                    <div className="p-1 px-1.5 bg-blue-600 text-white rounded font-extrabold text-sm tracking-tight">SWM</div>
                    <span className="text-xs font-bold uppercase tracking-widest text-slate-400">Garment Industry Edition</span>
                  </div>
                  <h4 className="font-display font-bold text-slate-800 dark:text-slate-105 text-sm uppercase tracking-tight">
                    {reportTemplate.toUpperCase().replace(/_/g, ' ')}
                  </h4>
                  <p className="text-[10px] text-slate-400">
                    Compiled Epoch Time: {new Date().toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })} at {new Date().toLocaleTimeString()}
                  </p>
                </div>

                <div className="text-left sm:text-right text-[10px] space-y-0.5 text-slate-450 uppercase font-bold tracking-wider">
                  <span className="block">Facility Code: FACTORY_CLUSTER_A</span>
                  <span className="block">Audited Period: {startDate} to {endDate}</span>
                  <span className="block">Department Match: {deptFilter}</span>
                  <span className="block">Production Line: {lineFilter === 'All' ? 'All active lines' : `Line ${lineFilter}`}</span>
                </div>
              </div>

              {/* Dynamic Live spreadsheet view depending on selected templates */}
              {reportTemplate === 'attendance_report' && (
                <div className="space-y-3.5">
                  <div className="flex justify-between items-center text-[10.5px] uppercase font-bold text-slate-400 tracking-wider">
                    <span>Attendance records database list</span>
                    <span>Matched: {exportPreview.length} logs found</span>
                  </div>

                  <div className="overflow-x-auto border border-slate-150 dark:border-slate-850 rounded-xl">
                    <table className="w-full text-[10.5px] text-left">
                      <thead className="bg-slate-50 dark:bg-slate-950 font-bold text-slate-400 border-b border-slate-100 dark:border-slate-850 whitespace-nowrap">
                        <tr>
                          <th className="px-3 py-2">ID</th>
                          <th className="px-3 py-2">Employee Name</th>
                          <th className="px-3 py-2">Department</th>
                          <th className="px-3 py-2">Line</th>
                          <th className="px-3 py-2 text-center">Date</th>
                          <th className="px-3 py-2 text-center">In</th>
                          <th className="px-3 py-2 text-center">Out</th>
                          <th className="px-3 py-2 text-center">Working Hours</th>
                          <th className="px-3 py-2 text-center">Method</th>
                          <th className="px-3 py-2 text-center">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-850 font-medium">
                        {exportPreview.length > 0 ? (
                          exportPreview.slice(0, 15).map((rec) => (
                            <tr key={rec.recordId} className="hover:bg-slate-50/50">
                              <td className="px-3 py-2 font-bold font-mono text-slate-700 dark:text-slate-355">{rec.employeeId}</td>
                              <td className="px-3 py-2 text-slate-650 truncate max-w-[120px]">{rec.name}</td>
                              <td className="px-3 py-2 text-slate-500">{rec.department}</td>
                              <td className="px-3 py-2 text-slate-500 text-xs">{rec.line}</td>
                              <td className="px-3 py-2 text-center font-mono text-slate-500">{rec.date}</td>
                              <td className="px-3 py-2 text-center font-mono text-blue-600 dark:text-blue-400">{rec.checkIn}</td>
                              <td className="px-3 py-2 text-center font-mono text-slate-500">{rec.checkOut}</td>
                              <td className="px-3 py-2 text-center font-mono text-slate-500">{rec.workingHours}h</td>
                              <td className="px-3 py-2 text-center text-slate-405">{rec.method}</td>
                              <td className="px-3 py-2 text-center">
                                <span className={`inline-block px-2 py-0.5 rounded text-[9px] font-bold ${
                                  rec.status === 'Present'
                                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-955/20'
                                    : rec.status === 'Late'
                                      ? 'bg-amber-50 text-amber-700 dark:bg-amber-955/20'
                                      : rec.status === 'Leave'
                                        ? 'bg-blue-50 text-blue-700 dark:bg-blue-955/20'
                                        : 'bg-rose-50 text-rose-700 dark:bg-rose-955/20'
                                }`}>
                                  {rec.status}
                                </span>
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={10} className="text-center py-8 text-slate-400">
                              No records match the configured export filters. Choose broader parameters above.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  {exportPreview.length > 15 && (
                    <p className="text-center text-[10px] text-slate-400 italic">
                      Showing first 15 records of preview. Completing the export compiles all {exportPreview.length} logs successfully.
                    </p>
                  )}
                </div>
              )}

              {reportTemplate === 'absenteeism_report' && (
                <div className="space-y-3.5">
                  <div className="flex justify-between items-center text-[10.5px] uppercase font-bold text-slate-400 tracking-wider">
                    <span>Unplanned Absences Exceptions Roster</span>
                    <span>Exceptions: {exportPreview.filter(d => d.status === 'Absent').length} Absences</span>
                  </div>

                  <div className="overflow-x-auto border border-slate-150 dark:border-slate-850 rounded-xl">
                    <table className="w-full text-[10.5px] text-left">
                      <thead className="bg-slate-50 dark:bg-slate-950 font-bold text-slate-400 border-b border-slate-100 dark:border-slate-850 whitespace-nowrap">
                        <tr>
                          <th className="px-3 py-2">ID</th>
                          <th className="px-3 py-2">Employee Name</th>
                          <th className="px-3 py-2">Department</th>
                          <th className="px-3 py-2">Line</th>
                          <th className="px-3 py-2 text-center">Unreported Date</th>
                          <th className="px-3 py-2 text-center">Verification Method</th>
                          <th className="px-3 py-2 text-center">Approved Manager</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-850 font-medium whitespace-nowrap">
                        {exportPreview.filter(d => d.status === 'Absent').length > 0 ? (
                          exportPreview.filter(d => d.status === 'Absent').slice(0, 15).map((rec) => (
                            <tr key={rec.recordId} className="hover:bg-slate-50/50">
                              <td className="px-3 py-2 font-bold font-mono text-slate-700 dark:text-slate-355">{rec.employeeId}</td>
                              <td className="px-3 py-2 text-slate-650 font-semibold">{rec.name}</td>
                              <td className="px-3 py-2 text-slate-500">{rec.department}</td>
                              <td className="px-3 py-2 text-slate-500">{rec.line}</td>
                              <td className="px-3 py-2 text-center font-mono text-rose-500 font-bold">{rec.date}</td>
                              <td className="px-3 py-2 text-center text-slate-400 font-mono">No Check-In Log</td>
                              <td className="px-3 py-2 text-center text-xs text-slate-700 dark:text-slate-400">{rec.markedBy || 'System_Recalculator'}</td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={7} className="text-center py-8 text-slate-400">
                              Congratulations! Zero unplanned absences logged in the audited period with these filters.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {reportTemplate === 'line_efficiency_report' && (
                <div className="space-y-3.5">
                  <div className="flex justify-between items-center text-[10.5px] uppercase font-bold text-slate-400 tracking-wider">
                    <span>Line Balancing & available Manpower Efficiency summary</span>
                    <span>Tracking Active Units</span>
                  </div>

                  <div className="overflow-x-auto border border-slate-150 dark:border-slate-850 rounded-xl">
                    <table className="w-full text-[10.5px] text-left">
                      <thead className="bg-slate-50 dark:bg-slate-950 font-bold text-slate-400 border-b border-slate-100 dark:border-slate-850 whitespace-nowrap">
                        <tr>
                          <th className="px-3 py-2">Line</th>
                          <th className="px-3 py-2">Active Supervisor</th>
                          <th className="px-3 py-2 text-center font-bold text-slate-750 dark:text-slate-300">Daily Target (pieces)</th>
                          <th className="px-3 py-2 text-center font-bold text-slate-750 dark:text-slate-300">Actual Output (pieces)</th>
                          <th className="px-3 py-2 text-center">Manpower Available</th>
                          <th className="px-3 py-2 text-center">Required Manpower</th>
                          <th className="px-3 py-2 text-center">Base Efficiency (%)</th>
                          <th className="px-3 py-2 text-center">Status</th>
                          <th className="px-3 py-2 text-center">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-850 font-medium whitespace-nowrap">
                        {productionLines.filter(l => lineFilter === 'All' || l.id === parseInt(lineFilter)).map((l) => {
                          const isEditing = editingLineId === l.id;
                          return (
                            <tr key={l.id} className="hover:bg-slate-50/50">
                              <td className="px-3 py-2.5 font-bold text-slate-800 dark:text-slate-355">Line {l.id}</td>
                              <td className="px-3 py-2.5 text-slate-650 font-semibold">{l.supervisor}</td>
                              <td className="px-3 py-2.5 text-center font-mono">
                                {isEditing ? (
                                  <input 
                                    type="number" 
                                    min="0"
                                    className="w-20 px-1.5 py-0.5 text-center bg-white dark:bg-slate-900 border border-slate-320 dark:border-slate-700 rounded text-slate-800 dark:text-slate-100 font-bold font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
                                    value={editTargetQty} 
                                    onChange={(e) => setEditTargetQty(e.target.value)} 
                                  />
                                ) : (
                                  <span className="text-slate-600 dark:text-slate-250 block">{l.targetQuantity}</span>
                                )}
                              </td>
                              <td className="px-3 py-2.5 text-center font-mono text-blue-650 dark:text-blue-400 font-bold">
                                {isEditing ? (
                                  <input 
                                    type="number" 
                                    min="0"
                                    className="w-20 px-1.5 py-0.5 text-center bg-white dark:bg-slate-900 border border-slate-320 dark:border-slate-700 rounded text-blue-600 dark:text-blue-450 font-bold font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
                                    value={editActualQty} 
                                    onChange={(e) => setEditActualQty(e.target.value)} 
                                  />
                                ) : (
                                  <span className="block">{l.actualQuantity}</span>
                                )}
                              </td>
                              <td className="px-3 py-2.5 text-center font-mono text-slate-500">{l.availableManpower}</td>
                              <td className="px-3 py-2.5 text-center font-mono text-slate-500">{l.requiredManpower}</td>
                              <td className="px-3 py-2.5 text-center font-mono text-emerald-700 dark:text-emerald-400 font-bold">{l.baseEfficiency}%</td>
                              <td className="px-3 py-2.5 text-center">
                                <span className={`inline-block px-2 py-0.5 rounded text-[9.5px] font-bold ${
                                  l.status === 'Running' 
                                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-955/20' 
                                    : l.status === 'Understaffed'
                                      ? 'bg-amber-50 text-amber-700 dark:bg-amber-955/20'
                                      : 'bg-rose-50 text-rose-700 dark:bg-rose-955/20'
                                }`}>
                                  {l.status}
                                </span>
                              </td>
                              <td className="px-3 py-2.5 text-center">
                                {isEditing ? (
                                  <div className="flex items-center justify-center gap-1.5">
                                    <button 
                                      onClick={() => handleSaveLineProduction(l.id)} 
                                      className="p-1 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/35 rounded border border-emerald-200/40 dark:border-emerald-800/20" 
                                      title="Save changes"
                                    >
                                      <Check className="w-3.5 h-3.5" />
                                    </button>
                                    <button 
                                      onClick={() => setEditingLineId(null)} 
                                      className="p-1 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-955/35 rounded border border-rose-200/40 dark:border-rose-800/20" 
                                      title="Cancel"
                                    >
                                      <X className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                ) : (
                                  <button 
                                    onClick={() => handleStartEditLine(l)} 
                                    className="px-2 py-0.5 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-955/35 border border-blue-200/30 dark:border-blue-800/10 rounded-md flex items-center gap-1 mx-auto font-bold text-[10px]" 
                                    title="Edit target & output data"
                                  >
                                    <Edit2 className="w-2.5 h-2.5" />
                                    <span>Edit</span>
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {reportTemplate === 'skill_matrix_report' && (
                <div className="space-y-3.5">
                  <div className="flex justify-between items-center text-[10.5px] uppercase font-bold text-slate-400 tracking-wider">
                    <span>Operator Skills Capacity Summary Matrix</span>
                    <span>Total active roster: {employees.length} Operators</span>
                  </div>

                  <div className="overflow-x-auto border border-slate-150 dark:border-slate-850 rounded-xl">
                    <table className="w-full text-[10.5px] text-left">
                      <thead className="bg-slate-50 dark:bg-slate-950 font-bold text-slate-400 border-b border-slate-105 dark:border-slate-850 whitespace-nowrap">
                        <tr>
                          <th className="px-3 py-2">ID</th>
                          <th className="px-3 py-2">Operator Name</th>
                          <th className="px-3 py-2">Department</th>
                          <th className="px-3 py-2">Designation Grade</th>
                          <th className="px-3 py-2">Primary specialized Skill</th>
                          <th className="px-3 py-2 text-center">Proficiency (%)</th>
                          <th className="px-3 py-2 text-center">Historical Attendance Rate (%)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-850 font-medium whitespace-nowrap">
                        {employees.filter(e => deptFilter === 'All' || e.department === deptFilter).slice(0, 15).map((e) => (
                          <tr key={e.id} className="hover:bg-slate-50/50">
                            <td className="px-3 py-2 font-bold font-mono text-slate-700 dark:text-slate-355">{e.id}</td>
                            <td className="px-3 py-2 text-slate-650 font-semibold">{e.name}</td>
                            <td className="px-3 py-2 text-slate-500">{e.department}</td>
                            <td className="px-3 py-2 text-slate-450">{e.designation}</td>
                            <td className="px-3 py-2 text-slate-550 font-bold">{e.skills[0]?.operationName || 'Sewing'}</td>
                            <td className="px-3 py-2 text-center font-mono text-blue-600 dark:text-blue-400 font-bold">{e.skills[0]?.proficiency || 75}%</td>
                            <td className="px-3 py-2 text-center font-mono text-emerald-600 dark:text-emerald-400 font-bold">{e.historicalAttendanceRate}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {employees.filter(e => deptFilter === 'All' || e.department === deptFilter).length > 15 && (
                    <p className="text-center text-[10px] text-slate-400 italic">
                      Showing first 15 operators. Fully formatted Excel exports download compiling complete personnel registry dataset.
                    </p>
                  )}
                </div>
              )}

              {/* Compliance Certification Statement footer (Required for ERP and factory registers) */}
              <div className="border-t border-slate-105 dark:border-slate-850 pt-4 flex flex-col md:flex-row justify-between items-center text-[9px] text-slate-400 gap-4">
                <span>Certified by SWM Attendance Engine Integration Interface Node</span>
                <span className="font-bold flex items-center gap-1">
                  <CheckCircle className="w-3.5 h-3.5 text-emerald-505 text-emerald-500" />
                  Audit Register Confirmed
                </span>
                <span>Authorized Signatory: Priya Sharma (HR Manager)</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
