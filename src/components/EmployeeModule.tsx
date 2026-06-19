/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { useAppState } from '../contexts/StateContext';
import { Employee, SkillCategory, WorkerSkill, SkillLevel, TrainingStatus, RiskLevel } from '../types';
import { 
  Search, Plus, Eye, Edit2, Trash2, SlidersHorizontal, 
  X, Briefcase, Calendar, Phone, Award, User, RefreshCw, Download,
  UploadCloud, FileSpreadsheet, FileDown, Database, Sliders, ArrowRight,
  AlertTriangle, CheckCircle, FileCheck, Check, AlertCircle, Info
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { EmployeeAvatar } from './EmployeeAvatar';
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

export const EmployeeModule: React.FC = () => {
  const { 
    employees, addEmployee, updateEmployee, deleteEmployee, currentUser, 
    cleanImportedEmployees, importBulkEmployees, clearAllEmployees 
  } = useAppState();
  
  const [activeSubTab, setActiveSubTab] = useState<'directory' | 'bulk-import'>('directory');
  const [showCleanConfirm, setShowCleanConfirm] = useState(false);
  const [showClearAllConfirm, setShowClearAllConfirm] = useState(false);

  const defaultEmployeeIds = new Set(['EMP101', 'EMP102', 'EMP103', 'EMP104', 'EMP105', 'EMP106', 'EMP107', 'EMP108', 'EMP109', 'EMP110', 'EMP111', 'EMP112', 'EMP113']);
  const bulkEmployeesCount = employees.filter(emp => !defaultEmployeeIds.has(emp.id.toUpperCase())).length;

  // Filter and search states
  const [searchTerm, setSearchTerm] = useState('');
  const [deptFilter, setDeptFilter] = useState('All');
  const [skillCategoryFilter, setSkillCategoryFilter] = useState('All');
  const [showFilters, setShowFilters] = useState(false);

  // Server-side database pagination states
  const [paginatedEmployees, setPaginatedEmployees] = useState<Employee[]>([]);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [isPageLoading, setIsPageLoading] = useState(false);
  const [loadingPhase, setLoadingPhase] = useState('');
  const [progressPercent, setProgressPercent] = useState(0);

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
  const empFileInputRef = React.useRef<HTMLInputElement>(null);

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

  const handleEmpFile = (file: File) => {
    setEmpFileName(file.name);
    setIsLoading(true);
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
            setIsLoading(false);
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
          setIsLoading(false);
        }
      };
      fileReader.readAsArrayBuffer(file);
    }
  };

  const processEmpParsedData = (rawJson: any[], overrideCol?: string, customRulesOverride?: { rawValue: string; mappedStatus: string }[]) => {
    setIsLoading(true);
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
          contactNumber = '+91 99999 88888';
        }

        // 9. Base Efficiency Verification
        let baseEfficiency = 70;
        if (baseEfficiencyRaw !== undefined && baseEfficiencyRaw !== '') {
          const parsedEff = parseInt(String(baseEfficiencyRaw).replace(/[^\d]/g, ''), 10);
          if (isNaN(parsedEff) || parsedEff < 10 || parsedEff > 100) {
            errors.push({
              row: rowNum, empId: empId || 'N/A', field: 'Base Efficiency', value: String(baseEfficiencyRaw),
              reason: 'Base target efficiency must be a percentage value between 10% and 100%. Fallback to 70%.', severity: 'warning'
            });
          } else {
            baseEfficiency = parsedEff;
          }
        }

        // 10. Attendance rate serialization check
        let historicalAttendanceRate = 90;
        if (historicalAttendanceRaw !== undefined && historicalAttendanceRaw !== '') {
          const parsedAtt = parseInt(String(historicalAttendanceRaw).replace(/[^\d]/g, ''), 10);
          if (isNaN(parsedAtt) || parsedAtt < 10 || parsedAtt > 100) {
            errors.push({
              row: rowNum, empId: empId || 'N/A', field: 'Historical Attendance Rate', value: String(historicalAttendanceRaw),
              reason: 'Historical attendance rate must be a percentage value between 10% and 100%. Fallback to 90%.', severity: 'warning'
            });
          } else {
            historicalAttendanceRate = parsedAtt;
          }
        }

        // Heuristics mapping for workforceAssignmentStatus
        const rawStatusValue = currentSelectedCol ? String(raw[currentSelectedCol] || '') : '';
        const targetAssignmentStatus = normalizeAssignmentStatus(rawStatusValue, rulesMap);

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
      setIsLoading(false);
    }, 500);
  };

  const handleApplyCommitEmployees = () => {
    const fatalRows = new Set(empValidationErrors.filter(e => e.severity === 'error').map(e => e.row));
    const cleanEmpData = empParsedRows.filter(r => !fatalRows.has(r.rowNum) && r.id);

    if (cleanEmpData.length === 0) {
      alert('Cannot perform Employee Master Import. Zero records passed validation checks.');
      return;
    }

    setIsLoading(true);
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
      setIsLoading(false);
    }, 800);
  };

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

  // Modal states
  const [isAddEditModalOpen, setIsAddEditModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [deleteConfirmEmp, setDeleteConfirmEmp] = useState<Employee | null>(null);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  // Form states
  const [formId, setFormId] = useState('');
  const [formName, setFormName] = useState('');
  const [formDept, setFormDept] = useState('Sewing');
  const [formSection, setFormSection] = useState('Main Line');
  const [formLine, setFormLine] = useState<number>(1);
  const [formDesignation, setFormDesignation] = useState('Sewing Operator');
  const [formJoinDate, setFormJoinDate] = useState('2026-06-04');
  const [formSkillCat, setFormSkillCat] = useState<SkillCategory>('Grade B Operator');
  const [formExp, setFormExp] = useState<number>(3);
  const [formContact, setFormContact] = useState('');
  const [formEff, setFormEff] = useState<number>(75);
  const [formHistAtt, setFormHistAtt] = useState<number>(90);

  // Dynamic Page Fetching Effect
  useEffect(() => {
    let active = true;
    const fetchPage = async () => {
      setIsPageLoading(true);
      try {
        const queryParams = new URLSearchParams({
          page: String(page),
          limit: String(limit),
          search: searchTerm,
          department: deptFilter,
          skillCategory: skillCategoryFilter
        });
        const res = await fetch(`/api/employees?${queryParams.toString()}`);
        if (res.ok && active) {
          const result = await res.json();
          setPaginatedEmployees(result.data);
          setTotalCount(result.total);
          setTotalPages(result.pages);
        }
      } catch (e) {
        console.error("Error loading paginated database floor workers:", e);
      } finally {
        if (active) setIsPageLoading(false);
      }
    };

    fetchPage();
    return () => {
      active = false;
    };
  }, [page, limit, searchTerm, deptFilter, skillCategoryFilter, employees]);

  // Reset page marker when keys change
  useEffect(() => {
    setPage(1);
  }, [searchTerm, deptFilter, skillCategoryFilter]);

  // Open modal for adding
  const handleOpenAdd = () => {
    setIsEditing(false);
    setSelectedEmployee(null);
    setFormId(`EMP${Math.floor(114 + Math.random() * 800)}`); // simple randomized safe ID
    setFormName('');
    setFormDept('Sewing');
    setFormSection('Main Line');
    setFormLine(1);
    setFormDesignation('Sewing Operator');
    setFormJoinDate('2026-06-04');
    setFormSkillCat('Grade B Operator');
    setFormExp(3);
    setFormContact('');
    setFormEff(75);
    setFormHistAtt(92);
    setIsAddEditModalOpen(true);
  };

  // Open modal for editing
  const handleOpenEdit = (emp: Employee) => {
    setIsEditing(true);
    setSelectedEmployee(emp);
    setFormId(emp.id);
    setFormName(emp.name);
    setFormDept(emp.department);
    setFormSection(emp.section);
    setFormLine(emp.lineNumber);
    setFormDesignation(emp.designation);
    setFormJoinDate(emp.joiningDate);
    setFormSkillCat(emp.skillCategory);
    setFormExp(emp.experience);
    setFormContact(emp.contactNumber);
    setFormEff(emp.baseEfficiency);
    setFormHistAtt(emp.historicalAttendanceRate);
    setIsAddEditModalOpen(true);
  };

  // Save employee
  const handleSaveEmployee = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formName.trim()) return;

    const baseSkills = [
      { operationName: 'Pocket Attaching', skillLevel: 'Intermediate' as const, proficiency: 70, trainingStatus: 'Completed' as const }
    ];

    const empData: Employee = {
      id: formId,
      name: formName,
      photoUrl: selectedEmployee?.photoUrl || '',
      department: formDept,
      section: formSection,
      lineNumber: Number(formLine),
      designation: formDesignation,
      joiningDate: formJoinDate,
      skillCategory: formSkillCat,
      experience: Number(formExp),
      contactNumber: formContact || '+91 99999 88888',
      skills: selectedEmployee?.skills || baseSkills,
      baseEfficiency: Number(formEff),
      historicalAttendanceRate: Number(formHistAtt),
      riskScore: selectedEmployee?.riskScore || 20,
      riskLevel: selectedEmployee?.riskLevel || 'Low',
      leaveBalances: selectedEmployee?.leaveBalances || { casual: 4, sick: 6, earned: 10, emergency: 2 }
    };

    if (isEditing) {
      updateEmployee(empData);
    } else {
      addEmployee(empData);
    }

    setIsAddEditModalOpen(false);
  };

  // View details modal
  const handleOpenView = (emp: Employee) => {
    setSelectedEmployee(emp);
    setIsViewModalOpen(true);
  };

  // Delete employee
  const handleDelete = (emp: Employee) => {
    setDeleteConfirmEmp(emp);
  };

  // Export Data to CSV helper
  const handleExportCSV = async () => {
    try {
      // Fetch fully filtered list from DB without small client bounds for clean exports
      const queryParams = new URLSearchParams({
        page: '1',
        limit: '2000',
        search: searchTerm,
        department: deptFilter,
        skillCategory: skillCategoryFilter
      });
      const res = await fetch(`/api/employees?${queryParams.toString()}`);
      if (!res.ok) return;
      const result = await res.json();
      const exportSet: Employee[] = result.data;

      const headers = ['Employee ID', 'Name', 'Department', 'Section', 'Line', 'Designation', 'Skill Category', 'Exp', 'Efficiency', 'Attendance Rate'];
      const rows = exportSet.map(emp => [
        emp.id,
        emp.name,
        emp.department,
        emp.section,
        emp.lineNumber === 0 ? 'N/A' : `Line ${emp.lineNumber}`,
        emp.designation,
        emp.skillCategory,
        `${emp.experience} yrs`,
        `${emp.baseEfficiency}%`,
        `${emp.historicalAttendanceRate}%`
      ]);

      const csvContent = "data:text/csv;charset=utf-8," 
        + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
      
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", `SWM_Employee_Roster_${new Date().toISOString().slice(0,10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Title & Action Head */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800 dark:text-neutral-100 font-display flex items-center gap-2">
            <span>Employee Master Hub</span>
            {isPageLoading && (
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-blue-50 dark:bg-blue-950/20 text-blue-600 dark:text-blue-400 text-[10px] font-semibold font-mono rounded-full animate-pulse border border-blue-200/50">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-ping" />
                Updating...
              </span>
            )}
          </h2>
          <p className="text-xs text-slate-500">Manage, search, check competency index, and upload roster records directly</p>
        </div>

        <div className="flex items-center space-x-3">
          {bulkEmployeesCount > 0 && currentUser.role !== 'Supervisor' && (
            <button 
              type="button"
              onClick={() => setShowCleanConfirm(true)}
              className="flex items-center space-x-1.5 px-3 py-1.5 bg-amber-50 dark:bg-amber-955/10 border border-amber-200 dark:border-amber-900/30 text-amber-700 dark:text-amber-400 rounded-lg text-xs font-semibold hover:bg-amber-100 dark:hover:bg-amber-900/20 transition shadow-xs animate-pulse"
              title={`Clean recent ${bulkEmployeesCount} imported bulk employees`}
              id="clean-bulk-employees-btn"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Clean {bulkEmployeesCount} Bulk Operators</span>
            </button>
          )}

          {employees.length > 0 && currentUser.role !== 'Supervisor' && (
            <button 
              type="button"
              onClick={() => setShowClearAllConfirm(true)}
              className="flex items-center space-x-1.5 px-3 py-1.5 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/30 text-red-700 dark:text-red-400 rounded-lg text-xs font-semibold hover:bg-red-100 dark:hover:bg-red-900/40 transition shadow-xs"
              title="Delete all employee data permanently"
              id="all-delete-btn"
            >
              <Trash2 className="w-3.5 h-3.5 text-red-500" />
              <span>All Delete</span>
            </button>
          )}

          <button 
            type="button"
            onClick={handleExportCSV}
            className="flex items-center space-x-1.5 px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-semibold hover:bg-slate-50 transition"
          >
            <Download className="w-4 h-4" />
            <span>Export Roster</span>
          </button>
          
          {currentUser.role !== 'Supervisor' && (
            <button 
              type="button"
              onClick={handleOpenAdd}
              className="flex items-center space-x-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700 shadow transition"
            >
              <Plus className="w-4 h-4" />
              <span>Add Operator</span>
            </button>
          )}
        </div>
      </div>

      {/* Subtab Switcher Option Panel */}
      <div className="flex border-b border-slate-200 dark:border-slate-800">
        <button
          type="button"
          onClick={() => setActiveSubTab('directory')}
          className={`py-2.5 px-4 text-xs font-bold font-display border-b-2 transition flex items-center space-x-2 ${
            activeSubTab === 'directory'
              ? 'border-blue-600 text-blue-600 dark:text-blue-400 font-extrabold'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <User className="w-3.5 h-3.5" />
          <span>Operator Directory Register</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveSubTab('bulk-import')}
          className={`py-2.5 px-4 text-xs font-bold font-display border-b-2 transition flex items-center space-x-2 ${
            activeSubTab === 'bulk-import'
              ? 'border-blue-600 text-blue-600 dark:text-blue-400 font-extrabold'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <UploadCloud className="w-3.5 h-3.5" />
          <span>Bulk Ingest & Translation Hub</span>
        </button>
      </div>

      {isLoading && (
        <div className="py-24 text-center bg-white dark:bg-slate-900 border border-slate-201 dark:border-slate-800 rounded-xl space-y-4 animate-fade-in shadow-xs">
          <div className="w-10 h-10 border-4 border-slate-200 border-t-blue-600 rounded-full animate-spin mx-auto" />
          <div>
            <p className="text-xs font-bold text-slate-705 dark:text-slate-300 font-display">Processing Operator Data Ingestion...</p>
            <p className="text-[11px] text-slate-400 font-mono mt-1">{loadingPhase || "Aligning pipeline cells..."}</p>
            {progressPercent > 0 && (
              <div className="w-56 bg-slate-150 dark:bg-slate-950 h-1.5 rounded-full mx-auto mt-3 overflow-hidden">
                <div className="bg-blue-600 h-full transition-all duration-300" style={{ width: `${progressPercent}%` }} />
              </div>
            )}
          </div>
        </div>
      )}

      {!isLoading && activeSubTab === 'directory' && (
        <>
          {/* Search and Filters Segment */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm space-y-3">
            <div className="flex flex-col md:flex-row md:items-center gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-2.5 h-4.5 w-4.5 text-slate-400 pointer-events-none" />
                <input 
                  type="text" 
                  placeholder="Search by worker name, ID, designation..." 
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-neutral-100 border border-slate-200 dark:border-slate-800 rounded-lg text-xs focus:ring-1 focus:ring-slate-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center space-x-2">
                <button 
                  type="button"
                  onClick={() => setShowFilters(!showFilters)}
                  className="flex items-center space-x-1.5 px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 rounded-lg text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-900 transition"
                >
                  <SlidersHorizontal className="w-4 h-4" />
                  <span>Advanced Filters</span>
                </button>
              </div>
            </div>

            {/* Expandable filters panel */}
            {showFilters && (
              <motion.div 
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 pt-3 border-t border-slate-100 dark:border-slate-800"
              >
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Department</label>
                  <select 
                    value={deptFilter} 
                    onChange={e => setDeptFilter(e.target.value)}
                    className="w-full py-1.5 px-3 bg-slate-50 dark:bg-slate-955 text-slate-700 dark:text-neutral-200 border border-slate-200 dark:border-slate-808 rounded-lg text-xs focus:outline-none"
                  >
                    <option value="All">All Plants/Depts</option>
                    <option value="Sewing">Sewing Department</option>
                    <option value="Cutting">Cutting department</option>
                    <option value="QA">Quality Assurance</option>
                    <option value="Finishing & Packing">Finishing & Packing</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Skill Category Classification</label>
                  <select 
                    value={skillCategoryFilter} 
                    onChange={e => setSkillCategoryFilter(e.target.value)}
                    className="w-full py-1.5 px-3 bg-slate-50 dark:bg-slate-955 text-slate-700 dark:text-neutral-200 border border-slate-200 dark:border-slate-808 rounded-lg text-xs focus:outline-none"
                  >
                    <option value="All">All Grades</option>
                    <option value="Grade A Operator">Grade A Operator (High SMV)</option>
                    <option value="Grade B Operator">Grade B Operator</option>
                    <option value="Grade C Operator">Grade C / Training Operator</option>
                    <option value="Helper">Floor Helper</option>
                    <option value="Quality Inspector">QA Auditor</option>
                    <option value="Ironer/Finisher">Presser / Ironer</option>
                  </select>
                </div>

                <div className="flex items-end">
                  <button 
                    type="button"
                    onClick={() => {
                      setDeptFilter('All');
                      setSkillCategoryFilter('All');
                      setSearchTerm('');
                    }}
                    className="w-full py-1.5 px-3 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-lg text-xs font-semibold hover:bg-slate-200 hover:text-slate-700 transition"
                  >
                    Reset All Filters
                  </button>
                </div>
              </motion.div>
            )}
          </div>

          {/* Employee List Grid Card View */}
          {paginatedEmployees.length === 0 ? (
            <div className="py-24 text-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl">
              <User className="w-10 h-10 text-slate-300 mx-auto mb-2" />
              <h3 className="text-sm font-semibold text-slate-800 dark:text-neutral-200">No matching operators found</h3>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">Modify your search query or check custom filter constraints to find floor workers.</p>
            </div>
          ) : (
            <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 transition duration-200 ${isPageLoading ? 'opacity-65 pointer-events-none' : ''}`}>
              {paginatedEmployees.map(emp => (
                <motion.div 
                  key={emp.id}
                  layout
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className={`bg-white dark:bg-slate-900 border ${
                    emp.riskLevel === 'Critical' 
                      ? 'border-red-300 dark:border-red-950/70' 
                      : 'border-slate-200 dark:border-slate-800'
                  } rounded-xl p-4 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow relative overflow-hidden`}
                >
                  {/* Risk flag indicator */}
                  {emp.riskLevel === 'Critical' && (
                    <div className="absolute top-0 right-0 bg-red-500 text-white text-[8px] font-bold px-2.5 py-0.5 rounded-bl uppercase tracking-wider animate-pulse">
                      Critical Leave Risk
                    </div>
                  )}
                  {emp.riskLevel === 'High' && (
                    <div className="absolute top-0 right-0 bg-amber-500 text-white text-[8px] font-bold px-2.5 py-0.5 rounded-bl uppercase tracking-wider">
                      High Risk
                    </div>
                  )}

                  <div className="flex items-start space-x-3">
                    <EmployeeAvatar 
                      photoUrl={emp.photoUrl} 
                      name={emp.name} 
                      className="w-12 h-12 rounded-lg" 
                    />
                    <div className="space-y-0.5 flex-1 min-w-0">
                      <span className="text-[10px] text-slate-400 font-bold tracking-wider uppercase font-mono block">
                        {emp.id}
                      </span>
                      <h3 className="font-semibold text-slate-800 dark:text-neutral-100 text-sm truncate font-display">
                        {emp.name}
                      </h3>
                      <span className="text-xs text-slate-500 dark:text-slate-400 block truncate font-sans">
                        {emp.designation}
                      </span>
                    </div>
                  </div>

                  {/* Middle parameters list */}
                  <div className="my-3 py-2.5 border-t border-b border-dashed border-slate-150 dark:border-slate-800 grid grid-cols-2 gap-y-2 text-xs">
                    <div>
                      <span className="text-[10px] text-slate-400 block font-medium">Department</span>
                      <span className="font-semibold text-slate-700 dark:text-slate-300">{emp.department}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block font-medium">Line allocation</span>
                      <span className="font-semibold text-slate-700 dark:text-slate-300 font-mono text-[11px]">
                        {emp.lineNumber === 0 ? 'Off Line' : emp.lineNumber === 99 ? 'Floater Pool' : `Line ${emp.lineNumber}`}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block font-medium">Avg Operator Eff.</span>
                      <span className="font-mono font-bold text-slate-800 dark:text-white">{emp.baseEfficiency}%</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block font-medium">Attendance history</span>
                      <span className="font-mono font-bold text-slate-700 dark:text-slate-300">{emp.historicalAttendanceRate}%</span>
                    </div>
                  </div>

                  {/* Card Action Control Tray */}
                  <div className="flex items-center justify-between pt-1">
                    <span className={`px-2 py-0.5 text-[9px] font-bold rounded-full font-mono ${
                      emp.skillCategory.startsWith('Grade A')
                        ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/20'
                        : emp.skillCategory.startsWith('Grade B')
                          ? 'bg-blue-50 text-blue-600 dark:bg-blue-950/20'
                          : 'bg-slate-100 text-slate-600 dark:bg-slate-800'
                    }`}>
                      {emp.skillCategory}
                    </span>

                    <div className="flex items-center space-x-1">
                      <button 
                        type="button"
                        title="View worker details"
                        onClick={() => handleOpenView(emp)}
                        className="p-1 px-2 border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 hover:bg-slate-100 rounded text-slate-600 dark:text-slate-300 transition"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                      {currentUser.role !== 'Supervisor' && (
                        <>
                          <button 
                            type="button"
                            title="Edit worker record"
                            onClick={() => handleOpenEdit(emp)}
                            className="p-1 px-2 border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 hover:bg-slate-100 rounded text-blue-600 transition"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button 
                            type="button"
                            title="De-register Worker"
                            onClick={() => handleDelete(emp)}
                            className="p-1 px-2 border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 hover:bg-rose-50 text-rose-600 transition"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </motion.div>
              ))}

              {paginatedEmployees.length === 0 && (
                <div className="col-span-full py-12 text-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-2">
                  <Search className="w-8 h-8 text-slate-300 mx-auto" />
                  <h4 className="font-semibold text-slate-700 dark:text-slate-300">No Roster Records Found</h4>
                  <p className="text-xs text-slate-404 font-mono">No matching records on our system</p>
                </div>
              )}
            </div>
          )}

          {/* Pagination Controls Index Bar */}
          {!isLoading && totalCount > 0 && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="text-xs text-slate-500 font-mono">
                Showing <span className="font-semibold text-slate-700 dark:text-slate-300">{Math.min(totalCount, (page - 1) * limit + 1)}-{Math.min(totalCount, page * limit)}</span> of <span className="font-semibold text-slate-700 dark:text-slate-300">{totalCount}</span> records.
              </div>

              <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-1.5 text-xs text-slate-700 dark:text-slate-300">
                  <span className="font-medium">Page Size:</span>
                  <select
                    value={limit}
                    onChange={e => {
                      setLimit(Number(e.target.value));
                      setPage(1);
                    }}
                    className="py-1 px-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded text-xs text-slate-700 dark:text-slate-300 focus:outline-none cursor-pointer"
                  >
                    <option value={25}>25 per page</option>
                    <option value={50}>50 per page</option>
                    <option value={100}>100 per page</option>
                  </select>
                </div>

                <div className="flex items-center space-x-1">
                  <button
                    type="button"
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="px-2.5 py-1 text-xs border border-slate-200 dark:border-slate-800 rounded bg-slate-50 dark:bg-slate-955 text-slate-700 dark:text-slate-300 disabled:opacity-40 transition-opacity"
                  >
                    Prev
                  </button>
                  <span className="text-xs font-mono px-3 text-slate-650 dark:text-slate-400">
                    Page <strong className="text-slate-800 dark:text-white">{page}</strong> of {totalPages}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="px-2.5 py-1 text-xs border border-slate-200 dark:border-slate-800 rounded bg-slate-50 dark:bg-slate-955 text-slate-700 dark:text-slate-300 disabled:opacity-40 transition-opacity"
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {!isLoading && activeSubTab === 'bulk-import' && (
        <div className="space-y-6 animate-fade-in text-slate-800 dark:text-slate-200">
          
          {/* Template Download Section */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-bold text-slate-800 dark:text-neutral-100 font-display flex items-center space-x-2">
                <FileSpreadsheet className="w-4 h-4 text-emerald-555" />
                <span>Spreadsheet Upload Specifications Template</span>
              </h3>
              <p className="text-xs text-slate-500 mt-1">Acquire pre-structured CSV or Excel guidelines with standard parameters and columns required for automatic mapping</p>
            </div>
            <div className="flex space-x-2">
              <button
                type="button"
                onClick={() => handleDownloadEmpTemplate('xlsx')}
                className="flex items-center space-x-1.5 px-3.5 py-2 bg-emerald-50 dark:bg-emerald-950/25 border border-emerald-250 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 rounded-lg text-xs font-bold hover:bg-emerald-100 transition shadow-2xs cursor-pointer"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>EXCEL Template (.xlsx)</span>
              </button>
              <button
                type="button"
                onClick={() => handleDownloadEmpTemplate('csv')}
                className="flex items-center space-x-1.5 px-3.5 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-350 rounded-lg text-xs font-bold hover:bg-slate-100 transition cursor-pointer"
              >
                <FileDown className="w-3.5 h-3.5" />
                <span>CSV Template (.csv)</span>
              </button>
            </div>
          </div>

          {/* Import Stats Summary Banner if completed */}
          {empImportSummary && (
            <div className="bg-emerald-50/40 dark:bg-emerald-950/20 border border-emerald-400/30 rounded-xl p-5 shadow-xs space-y-4">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-emerald-100 dark:bg-emerald-950/50 rounded-full text-emerald-700">
                  <CheckCircle className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-bold text-sm text-emerald-850 dark:text-emerald-400 font-display">Personnel Records Integration Complete</h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{empImportSummary.actionsTaken}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                <div className="bg-white dark:bg-slate-900 border border-slate-150 dark:border-slate-850 p-2.5 rounded-lg shadow-3xs">
                  <span className="text-[10px] uppercase font-bold text-slate-405 tracking-wide block">Total Processed</span>
                  <p className="text-lg font-mono font-bold text-slate-800 dark:text-white mt-1">{empImportSummary.total}</p>
                </div>
                <div className="bg-white dark:bg-slate-900 border border-slate-150 dark:border-slate-850 p-2.5 rounded-lg shadow-3xs">
                  <span className="text-[10px] uppercase font-bold text-emerald-600 tracking-wide block font-sans">Integrated</span>
                  <p className="text-lg font-mono font-bold text-emerald-600 mt-1">+{empImportSummary.success}</p>
                </div>
                <div className="bg-white dark:bg-slate-900 border border-slate-150 dark:border-slate-850 p-2.5 rounded-lg shadow-3xs">
                  <span className="text-[10px] uppercase font-bold text-rose-600 tracking-wide block">Fatal Errors</span>
                  <p className="text-lg font-mono font-bold text-rose-600 mt-1">{empImportSummary.errors}</p>
                </div>
                {empImportSummary.assignmentDetails && (
                  <div className="bg-white dark:bg-slate-900 border border-slate-150 dark:border-slate-850 p-2.5 rounded-lg shadow-3xs">
                    <span className="text-[10px] uppercase font-bold text-indigo-500 tracking-wide tracking-tight block">Status Assigned</span>
                    <p className="text-lg font-mono font-bold text-indigo-555 mt-1">
                      {empImportSummary.assignmentDetails.added + empImportSummary.assignmentDetails.updated}
                    </p>
                  </div>
                )}
              </div>

              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  onClick={() => setEmpImportSummary(null)}
                  className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-750 rounded-lg text-xs font-semibold text-slate-650 dark:text-slate-300 transition cursor-pointer"
                >
                  Clear Summary Banner
                </button>
              </div>
            </div>
          )}

          {/* Core drop section & normalizer list split */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            
            {/* Left side: Upload and Configuration panel */}
            <div className="lg:col-span-7 space-y-6">
              
              {/* File Upload Zone */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-808 rounded-xl p-5 shadow-xs space-y-4">
                <div className="flex justify-between items-center pb-2 border-b border-slate-100 dark:border-slate-800">
                  <span className="font-bold text-xs uppercase tracking-wider text-slate-405 flex items-center space-x-1.5 font-display">
                    <Database className="w-3.5 h-3.5 text-blue-500" />
                    <span>File Ingestion desk</span>
                  </span>
                  
                  {/* Mode Select */}
                  <div className="flex items-center space-x-3 text-xs">
                    <span className="font-medium text-slate-500">Integration Mode:</span>
                    <select
                      value={empActionRule}
                      onChange={(e: any) => setEmpActionRule(e.target.value)}
                      className="py-1 px-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded text-xs text-slate-700 dark:text-slate-300 focus:outline-none font-bold cursor-pointer"
                    >
                      <option value="merge-update">Merge & Update (Sync All)</option>
                      <option value="add-only">Add-Only (Skip Existing)</option>
                      <option value="update-only">Update-Only (Don't Create)</option>
                    </select>
                  </div>
                </div>

                <div 
                  onDragEnter={handleEmpFileDrag} 
                  onDragOver={handleEmpFileDrag} 
                  onDragLeave={handleEmpFileDrag} 
                  onDrop={handleEmpFileDrop}
                  className={`border-2 border-dashed rounded-xl p-8 text-center transition flex flex-col justify-center items-center h-52 relative ${
                    empDragActive 
                      ? 'border-blue-500 bg-blue-50/20 dark:bg-blue-950/10' 
                      : 'border-slate-250 dark:border-slate-800 hover:border-slate-400'
                  }`}
                >
                  <input
                    ref={empFileInputRef}
                    type="file"
                    className="hidden"
                    accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
                    onChange={handleEmpFileSelect}
                  />

                  {empFileName ? (
                    <div className="space-y-3">
                      <div className="w-12 h-12 bg-blue-50 dark:bg-blue-950/40 rounded-xl flex items-center justify-center text-blue-600 mx-auto border border-blue-500/10 shadow-3xs">
                        <FileCheck className="w-6 h-6 animate-bounce" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-700 dark:text-slate-300 max-w-sm truncate mx-auto font-mono">
                          {empFileName}
                        </p>
                        <p className="text-[10px] text-slate-400 mt-1">File uploaded and queued for processing</p>
                      </div>
                      <div className="flex space-x-2.5 justify-center">
                        <button
                          type="button"
                          onClick={() => {
                            setEmpFileName('');
                            setEmpParsedRows([]);
                            setEmpValidationErrors([]);
                            setEmpRawData([]);
                          }}
                          className="px-3 py-1 bg-rose-50 hover:bg-rose-100 text-rose-650 rounded text-[11px] font-bold transition cursor-pointer"
                        >
                          Remove File
                        </button>
                        <button
                          type="button"
                          onClick={() => empFileInputRef.current?.click()}
                          className="px-3 py-1 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-300 rounded text-[11px] font-bold transition border border-slate-200 dark:border-slate-700 cursor-pointer"
                        >
                          Replace File
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3 cursor-pointer select-none w-full h-full flex flex-col justify-center items-center" onClick={() => empFileInputRef.current?.click()}>
                      <div className="w-12 h-12 bg-slate-50 dark:bg-slate-950 text-slate-400 rounded-xl flex items-center justify-center mx-auto border border-slate-150 dark:border-slate-850">
                        <UploadCloud className="w-6 h-6 text-slate-400" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-700 dark:text-slate-300">
                          Drag and drop your spreadsheet here, or <span className="text-blue-600 underline">browse files</span>
                        </p>
                        <p className="text-[10.5px] text-slate-400 mt-1">Accepts CSV or Microsoft Excel spreadsheet records (.csv, .xlsx)</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Assignment Mapping Rules Engine card */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-808 rounded-xl p-5 shadow-xs space-y-4">
                <div className="border-b border-slate-105 dark:border-slate-800 pb-3">
                  <span className="font-bold text-xs uppercase tracking-wider text-slate-400 flex items-center space-x-1.5 font-display">
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

                {/* Create rule inputs key */}
                <div className="bg-slate-50 dark:bg-slate-950 p-3.5 rounded-lg border border-slate-150 dark:border-slate-850 space-y-3">
                  <span className="text-[10.5px] font-bold text-slate-500 dark:text-slate-400 block uppercase tracking-wide font-display">
                    Create New Value Rule
                  </span>
                  <div className="flex flex-col sm:flex-row gap-2.5">
                    <div className="flex-1">
                      <label htmlFor="sourceVal" className="block text-[9px] font-bold uppercase tracking-wider text-slate-400 pb-1 font-sans">
                        Spreadsheet Status Value
                      </label>
                      <input
                        id="sourceVal"
                        type="text"
                        placeholder="e.g., Active Reserve, Working"
                        value={newRuleSourceValue}
                        onChange={(e) => setNewRuleSourceValue(e.target.value)}
                        className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-805 rounded-lg py-1.5 px-2.5 text-xs focus:outline-none dark:text-slate-350 font-medium"
                      />
                    </div>

                    <div className="sm:w-48">
                      <label htmlFor="targetStatusSelect" className="block text-[9px] font-bold uppercase tracking-wider text-slate-400 pb-1 font-sans">
                        SWM System Target
                      </label>
                      <select
                        id="targetStatusSelect"
                        value={newRuleTargetStatus}
                        onChange={(e) => setNewRuleTargetStatus(e.target.value)}
                        className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-805 rounded-lg py-1.5 px-2.5 text-xs focus:outline-none dark:text-slate-300 font-bold cursor-pointer"
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
                      className="text-[9.5px] font-bold text-indigo-600 hover:text-indigo-805 dark:text-indigo-400 underline cursor-pointer"
                    >
                      Reset Defaults
                    </button>
                  </div>
                  <div className="max-h-52 overflow-y-auto border border-slate-200 dark:border-slate-800 rounded-lg p-1.5 bg-slate-50/45 dark:bg-slate-950/30 space-y-1">
                    {customRulesList.map((rule, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between p-2 bg-white dark:bg-slate-900 border border-slate-150 dark:border-slate-850 rounded-lg text-xs shadow-3xs hover:border-slate-300 transition-colors"
                      >
                        <div className="flex items-center space-x-2.5">
                          <span className="font-mono font-bold text-slate-700 dark:text-slate-300">
                            "{rule.rawValue}"
                          </span>
                          <ArrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className={`font-semibold px-2 py-0.5 rounded-sm text-[9.5px] ${
                            rule.mappedStatus === 'Assigned' ? 'bg-blue-50 dark:bg-blue-95/25 text-blue-700 dark:text-blue-400 border border-blue-500/10' :
                            rule.mappedStatus === 'Available' ? 'bg-emerald-50 dark:bg-emerald-95/25 text-emerald-700 dark:text-emerald-40 border border-emerald-500/15' :
                            rule.mappedStatus === 'Unassigned' ? 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-450 border border-slate-200/50' :
                            rule.mappedStatus === 'Training' ? 'bg-cyan-50 dark:bg-cyan-95/25 text-cyan-700 dark:text-cyan-400 border border-cyan-500/10' :
                            rule.mappedStatus === 'Meeting' ? 'bg-indigo-50 dark:bg-indigo-95/25 text-indigo-700 dark:text-indigo-400 border border-indigo-500/10' :
                            rule.mappedStatus === 'Quality Audit' ? 'bg-amber-50 dark:bg-amber-95/25 text-amber-700 dark:text-amber-40 border border-amber-500/10' :
                            rule.mappedStatus === 'Maintenance Support' ? 'bg-teal-50 dark:bg-teal-95/20 text-teal-700 dark:text-teal-400 border border-teal-500/10' :
                            rule.mappedStatus === 'Leave' ? 'bg-rose-50 dark:bg-rose-95/20 text-rose-700 dark:text-rose-400 border border-rose-500/10' :
                            'bg-slate-100 text-slate-605'
                          }`}>
                            {rule.mappedStatus === 'Available' ? 'Available for Replacement' : rule.mappedStatus}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveMappingRule(idx)}
                          className="p-1 text-slate-400 hover:text-rose-600 transition hover:bg-rose-100/15 rounded cursor-pointer"
                          title="Delete Translation Rule"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Right side: Verification & Processing Desk */}
            <div className="lg:col-span-5 space-y-6">
              
              {/* Interactive Validation Dashboard */}
              {empParsedRows.length > 0 ? (
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-808 rounded-xl p-5 shadow-xs space-y-4 animate-fade-in text-slate-800 dark:text-slate-200">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-slate-100 dark:border-slate-805 pb-2 gap-2">
                    <div>
                      <h4 className="font-bold text-xs uppercase tracking-wider text-slate-405 font-display">Personnel Diagnostics Desk</h4>
                      <p className="text-[10px] text-slate-455 mt-0.5">Real-time schema verification for floor roster</p>
                    </div>
                    
                    <button
                      type="button"
                      onClick={handleApplyCommitEmployees}
                      className="px-3.5 py-1.5 bg-blue-605 hover:bg-blue-700 text-white rounded-lg text-xs font-bold flex items-center space-x-1.5 shadow-sm transition cursor-pointer font-sans"
                    >
                      <Database className="w-3.5 h-3.5 text-blue-100" />
                      <span>Sync {empParsedRows.length - empValidationErrors.filter(e => e.severity === 'error').length} Records</span>
                    </button>
                  </div>

                  {/* Summary grid stats */}
                  <div className="grid grid-cols-2 gap-3 text-center">
                    <div className="bg-slate-50 dark:bg-slate-950 p-2.5 rounded-lg border border-slate-150 dark:border-slate-850">
                      <span className="text-[9px] uppercase font-bold text-slate-400 block font-sans">Total Rows</span>
                      <p className="text-lg font-mono font-bold text-slate-700 dark:text-slate-300 mt-1">{empParsedRows.length}</p>
                    </div>
                    <div className="bg-emerald-50/20 dark:bg-emerald-950/20 p-2.5 rounded-lg border border-emerald-505/10">
                      <span className="text-[9px] uppercase font-bold text-emerald-600 tracking-wider block font-sans">Valid Rows</span>
                      <p className="text-lg font-mono font-bold text-emerald-600 mt-1">{empParsedRows.length - empValidationErrors.filter(e => e.severity === 'error').length}</p>
                    </div>
                    <div className="bg-rose-50/20 dark:bg-rose-950/20 p-2.5 rounded-lg border border-rose-505/10">
                      <span className="text-[9px] uppercase font-bold text-rose-500 tracking-wider block font-sans">Fatal Errors</span>
                      <p className="text-lg font-mono font-bold text-rose-600 mt-1">{empValidationErrors.filter(e => e.severity === 'error').length}</p>
                    </div>
                    <div className="bg-amber-50/20 dark:bg-amber-950/20 p-2.5 rounded-lg border border-amber-505/10">
                      <span className="text-[9px] uppercase font-bold text-amber-500 tracking-wider block font-sans">Warnings</span>
                      <p className="text-lg font-mono font-bold text-amber-600 mt-1">{empValidationErrors.filter(e => e.severity === 'warning').length}</p>
                    </div>
                  </div>

                  {/* Column mapping selectors */}
                  {detectedAssignmentColumns.length > 0 && (
                    <div className="bg-blue-50/20 dark:bg-blue-950/20 border border-blue-500/10 rounded-lg p-3 space-y-2">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide block font-sans">
                        Assignment Map Column Detection
                      </span>
                      <div className="flex items-center space-x-2">
                        <select
                          value={selectedAssignmentColumn}
                          onChange={(e) => {
                            setSelectedAssignmentColumn(e.target.value);
                            processEmpParsedData(empRawData, e.target.value);
                          }}
                          className="w-full bg-white dark:bg-slate-900 border border-blue-200 dark:border-blue-900/30 rounded-md py-1 px-2 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 text-slate-700 dark:text-slate-300 font-mono font-bold cursor-pointer"
                        >
                          <option value="">-- No Status Column (Default Unassigned) --</option>
                          {detectedAssignmentColumns.map((col, cidx) => (
                            <option key={cidx} value={col}>Column: {col}</option>
                          ))}
                        </select>
                      </div>
                      <p className="text-[9.5px] text-slate-450">
                        Select the spreadsheet column containing assignment states to parse daily shift allocations.
                      </p>
                    </div>
                  )}

                  {/* Validation Error list */}
                  {empValidationErrors.length > 0 ? (
                    <div className="space-y-2">
                      <span className="text-[10px] font-bold text-slate-455 uppercase tracking-wide block">
                        Ingestion Log Diagnostics
                      </span>
                      <div className="max-h-72 overflow-y-auto border border-slate-200 dark:border-slate-800 rounded-lg p-2 bg-slate-50/30 dark:bg-slate-950/30 space-y-2">
                        {empValidationErrors.map((err, errIdx) => (
                          <div 
                            key={errIdx}
                            className={`p-2 rounded border text-xs flex items-start space-x-2.5 shadow-3xs ${
                              err.severity === 'error' 
                                ? 'bg-rose-50/50 dark:bg-rose-955/20 border-rose-200 dark:border-rose-900/30' 
                                : 'bg-amber-50/40 dark:bg-amber-955/20 border-amber-205 dark:border-amber-900/30'
                            }`}
                          >
                            <div className="shrink-0 mt-0.5">
                              {err.severity === 'error' ? (
                                <AlertCircle className="w-3.5 h-3.5 text-rose-500" />
                              ) : (
                                <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                              )}
                            </div>
                            <div className="space-y-0.5 flex-1">
                              <span className="font-bold text-[9px] font-mono select-none text-slate-405 dark:text-slate-400 block">
                                ROW {err.row} | EMP ID: {err.empId || 'N/A'}
                              </span>
                              <p className="font-semibold text-slate-750 dark:text-slate-300">
                                {err.reason}
                              </p>
                              {err.value && (
                                <div className="text-[10px] font-mono text-slate-450 dark:text-slate-500 mt-1">
                                  Captured Input: <span className="bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded font-bold text-slate-650">"{err.value}"</span>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="border border-dashed border-emerald-500/20 bg-emerald-500/5 p-4 rounded-lg text-center space-y-2">
                      <CheckCircle className="w-6 h-6 text-emerald-500 mx-auto" strokeWidth={2.5} />
                      <div>
                        <p className="text-xs font-bold text-slate-700 dark:text-slate-300">Pristine Document Schema</p>
                        <p className="text-[10px] text-slate-455 mt-0.5">All columns aligned successfully with zero structural anomalies detected in the parser queue.</p>
                      </div>
                    </div>
                  )}

                  {/* Raw records list preview */}
                  <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                    <span className="text-[10px] font-bold text-slate-455 uppercase tracking-wide block">
                      Roster Allocation Preview ({empParsedRows.length} operators parsed)
                    </span>
                    <div className="max-h-56 overflow-y-auto border border-slate-200 dark:border-slate-808 rounded-lg divide-y divide-slate-100 dark:divide-slate-800">
                      {empParsedRows.map((r, pIdx) => {
                        const hasError = empValidationErrors.some(e => e.row === r.rowNum && e.severity === 'error');
                        return (
                          <div 
                            key={pIdx} 
                            className={`p-2 flex justify-between items-center text-xs ${
                              hasError ? 'bg-rose-505/5 opacity-60' : 'bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-850/30'
                            }`}
                          >
                            <div className="min-w-0">
                              <span className="text-[9.5px] font-mono text-slate-400 font-bold block">{r.id}</span>
                              <h5 className="font-semibold text-slate-800 dark:text-slate-200 truncate">{r.name}</h5>
                              <p className="text-[10px] text-slate-500 truncate">{r.designation} ({r.department})</p>
                            </div>
                            <div className="text-right shrink-0">
                              <span className={`px-2 py-0.5 rounded-full text-[9px] font-mono font-bold ${
                                r.workforceAssignmentStatus === 'Assigned' ? 'bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-400' :
                                r.workforceAssignmentStatus === 'Available for Replacement' ? 'bg-emerald-50 dark:bg-emerald-955/35 text-emerald-700 dark:text-emerald-40' :
                                'bg-slate-100 dark:bg-slate-850 text-slate-500'
                              }`}>
                                {r.workforceAssignmentStatus === 'Available for Replacement' ? 'Available' : r.workforceAssignmentStatus}
                              </span>
                              <p className="text-[10.5px] font-mono text-slate-400 font-bold mt-1">Eff: {r.baseEfficiency}%</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-slate-50 dark:bg-slate-950 border border-dashed border-slate-250 dark:border-slate-800 rounded-xl p-8 text-center h-full flex flex-col justify-center items-center py-20">
                  <div className="p-3 bg-white dark:bg-slate-900 border border-slate-150 dark:border-slate-850 rounded-full text-slate-400 shadow-3xs mb-3">
                    <Info className="w-5 h-5 text-slate-400" />
                  </div>
                  <h4 className="font-bold text-xs uppercase tracking-wider text-slate-400">Diagnostic Monitor inactive</h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm font-sans">
                    Upload a CSV or Microsoft Excel personnel master file to load automatic compliance mapping and status normalizations.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 4. CRUD Modals with overlay portal simulation */}

      {/* Add & Edit Modal */}
      <AnimatePresence>
        {isAddEditModalOpen && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 15 }}
              className="bg-white dark:bg-slate-900 rounded-xl shadow-xl w-full max-w-xl border border-slate-200 dark:border-slate-800 overflow-hidden"
            >
              {/* Header */}
              <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between">
                <h3 className="font-display font-bold text-sm tracking-wide uppercase">
                  {isEditing ? 'Modify Operator Register' : 'Register New Floor Operator'}
                </h3>
                <button type="button" onClick={() => setIsAddEditModalOpen(false)} className="text-slate-400 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Form Content */}
              <form onSubmit={handleSaveEmployee} className="p-5 space-y-4 max-h-[70vh] overflow-y-auto custom-scrollbar">
                
                {/* ID & Name fields row */}
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="block text-slate-400 font-semibold mb-1">Employee ID code</label>
                    <input 
                      type="text" 
                      value={formId}
                      disabled
                      className="w-full p-2 bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded text-slate-500 font-mono focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-700 dark:text-neutral-200 font-semibold mb-1">Worker full Name</label>
                    <input 
                      type="text" 
                      placeholder="e.g. Ramesh Patel"
                      value={formName}
                      onChange={e => setFormName(e.target.value)}
                      required
                      className="w-full p-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-neutral-200 rounded focus:ring-1 focus:ring-slate-500 focus:outline-none"
                    />
                  </div>
                </div>

                {/* Dept & Designation row */}
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="block text-slate-700 dark:text-neutral-200 font-semibold mb-1">Department</label>
                    <select 
                      value={formDept} 
                      onChange={e => setFormDept(e.target.value)}
                      className="w-full p-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-neutral-200 rounded focus:outline-none"
                    >
                      <option value="Sewing">Sewing Department</option>
                      <option value="Cutting">Cutting department</option>
                      <option value="QA">Quality Assurance</option>
                      <option value="Finishing & Packing">Finishing & Packing</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-700 dark:text-neutral-200 font-semibold mb-1">Designation Label</label>
                    <input 
                      type="text" 
                      placeholder="e.g. Sewing Machine Operator"
                      value={formDesignation}
                      onChange={e => setFormDesignation(e.target.value)}
                      className="w-full p-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-neutral-200 rounded focus:outline-none"
                    />
                  </div>
                </div>

                {/* Section & Production Line allocation */}
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="block text-slate-700 dark:text-neutral-200 font-semibold mb-1">Section</label>
                    <input 
                      type="text" 
                      value={formSection}
                      onChange={e => setFormSection(e.target.value)}
                      className="w-full p-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-neutral-200 rounded focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-700 dark:text-neutral-200 font-semibold mb-1">Line number allocation</label>
                    <select 
                      value={formLine} 
                      onChange={e => setFormLine(Number(e.target.value))}
                      className="w-full p-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-neutral-200 rounded focus:outline-none"
                    >
                      <option value={0}>Offline workers (0)</option>
                      <option value={1}>Modul sewing 1</option>
                      <option value={2}>Modul sewing 2</option>
                      <option value={3}>Modul sewing 3</option>
                      <option value={4}>Modul sewing 4</option>
                    </select>
                  </div>
                </div>

                {/* Skill category & Experience selection */}
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="block text-slate-700 dark:text-neutral-200 font-semibold mb-1">Skill Category Classification</label>
                    <select 
                      value={formSkillCat} 
                      onChange={e => setFormSkillCat(e.target.value as SkillCategory)}
                      className="w-full p-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-neutral-200 rounded focus:outline-none"
                    >
                      <option value="Grade A Operator">Grade A Operator</option>
                      <option value="Grade B Operator">Grade B Operator</option>
                      <option value="Grade C Operator">Grade C / Training Operator</option>
                      <option value="Helper">Floor Helper</option>
                      <option value="Quality Inspector">QA Auditor</option>
                      <option value="Ironer/Finisher">Presser / Ironer</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-700 dark:text-neutral-200 font-semibold mb-1">Experience (Years)</label>
                    <input 
                      type="number" 
                      step="0.5"
                      value={formExp}
                      onChange={e => setFormExp(Number(e.target.value))}
                      className="w-full p-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-neutral-200 rounded focus:outline-none"
                    />
                  </div>
                </div>

                {/* Efficiency metrics fields */}
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="block text-slate-700 dark:text-neutral-200 font-semibold mb-1">Base Target Efficiency %</label>
                    <input 
                      type="number" 
                      min="10" max="100"
                      value={formEff}
                      onChange={e => setFormEff(Number(e.target.value))}
                      className="w-full p-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-neutral-200 rounded focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-700 dark:text-neutral-200 font-semibold mb-1">Attendance rate %</label>
                    <input 
                      type="number" 
                      min="10" max="100"
                      value={formHistAtt}
                      onChange={e => setFormHistAtt(Number(e.target.value))}
                      className="w-full p-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-neutral-200 rounded focus:outline-none"
                    />
                  </div>
                </div>

                {/* Phone contact input block */}
                <div className="text-xs">
                  <label className="block text-slate-700 dark:text-neutral-200 font-semibold mb-1">Contact Number</label>
                  <input 
                    type="text" 
                    placeholder="+91 XXXXX XXXXX"
                    value={formContact}
                    onChange={e => setFormContact(e.target.value)}
                    className="w-full p-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-neutral-200 rounded focus:outline-none"
                  />
                </div>

                <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex justify-end space-x-3 text-xs">
                  <button 
                    type="button" 
                    onClick={() => setIsAddEditModalOpen(false)}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded font-semibold"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit" 
                    className="px-5 py-2 bg-blue-600 text-white rounded font-bold hover:bg-blue-700 transition"
                  >
                    Save operator details
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* View Modal */}
      <AnimatePresence>
        {isViewModalOpen && selectedEmployee && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 15 }}
              className="bg-white dark:bg-slate-900 rounded-xl shadow-xl w-full max-w-lg border border-slate-200 dark:border-slate-800 overflow-hidden"
            >
              {/* Header */}
              <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between">
                <h3 className="font-display font-semibold text-sm uppercase">
                  Worker File: {selectedEmployee.id}
                </h3>
                <button type="button" onClick={() => setIsViewModalOpen(false)} className="text-slate-400 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Profile Card details */}
              <div className="p-5 space-y-4">
                
                <div className="flex items-center space-x-4">
                  <EmployeeAvatar 
                    photoUrl={selectedEmployee.photoUrl} 
                    name={selectedEmployee.name} 
                    className="w-16 h-16 rounded-xl border border-slate-200 dark:border-slate-800" 
                  />
                  <div>
                    <h4 className="text-base font-bold text-slate-800 dark:text-white font-display">
                      {selectedEmployee.name}
                    </h4>
                    <p className="text-xs text-slate-500">{selectedEmployee.designation}</p>
                    <span className="inline-block mt-1 px-2 py-0.5 text-[9px] bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded">
                      {selectedEmployee.skillCategory}
                    </span>
                  </div>
                </div>

                {/* Data Grid list */}
                <div className="grid grid-cols-2 gap-3 text-xs bg-slate-50 dark:bg-slate-950 p-4 rounded-xl border border-slate-100 dark:border-slate-800">
                  <div className="space-y-0.5">
                    <span className="text-slate-400">Department</span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200 block">{selectedEmployee.department}</span>
                  </div>
                  <div className="space-y-0.5">
                    <span className="text-slate-400">Section Allocation</span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200 block">{selectedEmployee.section}</span>
                  </div>
                  <div className="space-y-0.5">
                    <span className="text-slate-400">Assembly Line</span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200 block">
                      {selectedEmployee.lineNumber === 0 ? 'Modular Off-Line' : `Line ${selectedEmployee.lineNumber}`}
                    </span>
                  </div>
                  <div className="space-y-0.5">
                    <span className="text-slate-400">Joining Date</span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200 block font-mono">{selectedEmployee.joiningDate}</span>
                  </div>
                  <div className="space-y-0.5">
                    <span className="text-slate-400">Contact detail</span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200 block font-mono">{selectedEmployee.contactNumber}</span>
                  </div>
                  <div className="space-y-0.5">
                    <span className="text-slate-400">Experience Year</span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200 block">{selectedEmployee.experience} Years</span>
                  </div>
                </div>

                {/* Skill Matrix subsegment inside details */}
                <div className="space-y-2">
                  <h5 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">
                    Operation Competency
                  </h5>
                  <div className="space-y-2">
                    {selectedEmployee.skills.map(s => (
                      <div key={s.operationName} className="p-2 border border-slate-100 dark:border-slate-800 rounded bg-slate-50/50 dark:bg-slate-900/30 flex justify-between items-center text-xs">
                        <div>
                          <p className="font-semibold text-slate-800 dark:text-slate-200">{s.operationName}</p>
                          <span className="text-[10px] text-slate-400">Status: {s.trainingStatus}</span>
                        </div>
                        <div className="text-right">
                          <span className="font-semibold block font-mono text-blue-600 dark:text-blue-400">{s.proficiency}% PROFICIENCY</span>
                          <span className="text-[10px] text-slate-500 font-bold">{s.skillLevel}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Close Panel */}
                <div className="pt-2 flex justify-end">
                  <button 
                    type="button" 
                    onClick={() => setIsViewModalOpen(false)}
                    className="w-full sm:w-auto px-5 py-2 bg-slate-900 text-white text-xs font-bold rounded hover:bg-slate-800 transition"
                  >
                    Close Worker file
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {deleteConfirmEmp && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white dark:bg-slate-900 rounded-xl shadow-xl w-full max-w-sm border border-slate-200 dark:border-slate-800 overflow-hidden"
            >
              {/* Header */}
              <div className="px-5 py-4 bg-[#EF4444] text-white flex items-center justify-between">
                <h3 className="font-display font-bold text-xs tracking-wide uppercase flex items-center gap-2">
                  <span>Confirm Operator Removal</span>
                </h3>
                <button type="button" onClick={() => setDeleteConfirmEmp(null)} className="text-white hover:opacity-80">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Content */}
              <div className="p-5 space-y-4">
                <div className="flex items-center space-x-3 p-3 bg-red-50/50 dark:bg-red-950/10 border border-red-100/30 dark:border-slate-850 rounded-lg">
                  <EmployeeAvatar 
                    photoUrl={deleteConfirmEmp.photoUrl} 
                    name={deleteConfirmEmp.name} 
                    className="w-12 h-12 rounded-lg" 
                  />
                  <div>
                    <span className="text-[9px] text-slate-405 dark:text-slate-500 font-mono font-bold block">{deleteConfirmEmp.id}</span>
                    <h4 className="font-bold text-slate-800 dark:text-neutral-100 text-sm">{deleteConfirmEmp.name}</h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{deleteConfirmEmp.designation} · {deleteConfirmEmp.department}</p>
                  </div>
                </div>

                <div className="text-xs text-slate-650 dark:text-slate-400 space-y-2 leading-relaxed">
                  <p>
                    Are you sure you want to shift this operator's status to inactive/archived?
                  </p>
                  <p className="bg-slate-50 dark:bg-slate-955 p-2.5 rounded border border-slate-150 dark:border-slate-850 font-mono text-[9.5px] text-slate-450 dark:text-slate-500 leading-normal">
                    Warning: This will cleanly de-register them from active factory rosters, predictive line balancing algorithms, and today's shift lists.
                  </p>
                </div>

                {/* Actions */}
                <div className="pt-2 flex justify-end space-x-3 text-xs">
                  <button 
                    type="button" 
                    onClick={() => setDeleteConfirmEmp(null)}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded font-semibold"
                  >
                    Cancel
                  </button>
                  <button 
                    type="button" 
                    onClick={() => {
                      deleteEmployee(deleteConfirmEmp.id);
                      setDeleteConfirmEmp(null);
                    }}
                    className="px-5 py-2 bg-red-600 text-white rounded font-bold hover:bg-red-700 transition"
                  >
                    Archive Operator
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {/* Clean Bulk Data Confirmation Modal */}
        {showCleanConfirm && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden max-w-md w-full shadow-2xl"
              id="clean-bulk-confirm-modal"
            >
              {/* Header */}
              <div className="px-5 py-4 bg-amber-600 text-white flex items-center justify-between">
                <h3 className="font-display font-bold text-xs tracking-wide uppercase flex items-center gap-2">
                  <Trash2 className="w-4 h-4" />
                  <span>Clean Simulated Employee Register</span>
                </h3>
                <button type="button" onClick={() => setShowCleanConfirm(false)} className="text-white hover:opacity-85">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Content */}
              <div className="p-5 space-y-4">
                <div className="text-xs text-slate-650 dark:text-slate-400 space-y-2 leading-relaxed">
                  <p className="font-semibold text-slate-800 dark:text-neutral-100">
                    Are you sure you want to clean recent bulk employee data?
                  </p>
                  <p>
                    This will remove the <strong>{bulkEmployeesCount}</strong> additional operators registered via bulk uploads or shift data generators. Only the 13 default master operators will remain in the system.
                  </p>
                  <p className="bg-amber-50 dark:bg-amber-955/40 p-2.5 rounded border border-amber-200/50 dark:border-amber-900/10 text-amber-700 dark:text-amber-500 text-[10px] leading-normal font-medium">
                    Note: This operation also purges any attendance and leave history corresponding to the cleaned employees to keep all analytics, line-balancing rosters, and heatmaps in a pristine, synchronized state.
                  </p>
                </div>

                {/* Actions */}
                <div className="pt-2 flex justify-end space-x-3 text-xs">
                  <button 
                    type="button" 
                    onClick={() => setShowCleanConfirm(false)}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded font-semibold"
                  >
                    Cancel
                  </button>
                  <button 
                    type="button" 
                    onClick={() => {
                      cleanImportedEmployees();
                      setShowCleanConfirm(false);
                    }}
                    className="px-5 py-2 bg-amber-600 text-white rounded font-bold hover:bg-amber-700 transition"
                  >
                    Clean Operators
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {/* Delete All Employees Confirmation Modal */}
        {showClearAllConfirm && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden max-w-md w-full shadow-2xl"
              id="clear-all-confirm-modal"
            >
              {/* Header */}
              <div className="px-5 py-4 bg-red-600 text-white flex items-center justify-between">
                <h3 className="font-display font-bold text-xs tracking-wide uppercase flex items-center gap-2">
                  <Trash2 className="w-4 h-4" />
                  <span>Erase All Employee Data</span>
                </h3>
                <button type="button" onClick={() => setShowClearAllConfirm(false)} className="text-white hover:opacity-85">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Content */}
              <div className="p-5 space-y-4">
                <div className="text-xs text-slate-650 dark:text-slate-400 space-y-2 leading-relaxed">
                  <p className="font-semibold text-slate-800 dark:text-neutral-100">
                    Are you absolutely sure you want to erase all employees?
                  </p>
                  <p>
                    This will permanently delete all <strong>{employees.length}</strong> operator records currently registered in the database. 
                  </p>
                  <p className="bg-red-50 dark:bg-red-955/40 p-2.5 rounded border border-red-200/50 dark:border-red-900/10 text-red-700 dark:text-red-400 text-[10px] leading-normal font-medium">
                    Warning: This action is irreversible. All employee registers will be completely wiped, allowing you to upload your custom roster data from scratch.
                  </p>
                </div>

                {/* Actions */}
                <div className="pt-2 flex justify-end space-x-3 text-xs">
                  <button 
                    type="button" 
                    onClick={() => setShowClearAllConfirm(false)}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded font-semibold"
                  >
                    Cancel
                  </button>
                  <button 
                    type="button" 
                    onClick={async () => {
                      await clearAllEmployees();
                      setShowClearAllConfirm(false);
                    }}
                    className="px-5 py-2 bg-red-600 text-white rounded font-bold hover:bg-red-700 transition"
                  >
                    All Delete
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
};
