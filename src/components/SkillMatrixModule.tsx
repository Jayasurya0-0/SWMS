/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * SWM - Advanced Operation-Wise Skill Competency Matrix Dashboard
 * Dedicated module for Industrial Engineers to certify, inspect, analyze, and upload
 * worker competency scores (0% - 100%) across sewing operations.
 */

import React, { useState, useRef, useMemo } from 'react';
import { useAppState } from '../contexts/StateContext';
import { Employee, WorkerSkill, SkillLevel, calculateQAPS } from '../types';
import { 
  Search, HelpCircle, Eye, CheckCircle2, AlertCircle, 
  ChevronRight, RefreshCw, Layers, Award, Sparkles, UserCheck, ShieldAlert,
  UploadCloud, FileSpreadsheet, Download, Check, X, Sliders, Filter, BarChart3, TrendingUp, Sparkle, Loader2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import * as XLSX from 'xlsx';

export const SkillMatrixModule: React.FC = () => {
  const { 
    employees, attendance, reallocateOperator, currentUser, updateBulkSkills, employeeAssignments, systemDate, operations: masterOperations, productionLines
  } = useAppState();

  // Filter for Sewing, Floaters, and Finishing (IE portal is restricted to these production roles/departments)
  const ieWorkforce = useMemo(() => {
    return employees.filter(emp => {
      const dept = (emp.department || '').toLowerCase();
      const desig = (emp.designation || '').toLowerCase();
      return (
        dept.includes('sewing') || 
        dept.includes('floater') || 
        dept.includes('finishing') || 
        emp.lineNumber === 99 || 
        emp.lineNumber === 0 || 
        desig.includes('sewing') || 
        desig.includes('floater') ||
        desig.includes('finishing')
      );
    });
  }, [employees]);

  // Search/Filter states for Dashboard and Grid
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedOperation, setSelectedOperation] = useState('All');
  const [selectedLine, setSelectedLine] = useState('All');
  const [selectedDepartment, setSelectedDepartment] = useState('All');
  const [minCompetency, setMinCompetency] = useState(0);
  const [maxCompetency, setMaxCompetency] = useState(100);

  // Replacement Engine states
  const [replAbsentEmpId, setReplAbsentEmpId] = useState('');
  const [replOperation, setReplOperation] = useState('');
  const [replResultMsg, setReplResultMsg] = useState('');
  const [reallocationSuccess, setReallocationSuccess] = useState(false);

  // File Upload state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importModeOption, setImportModeOption] = useState<'update' | 'erase'>('update');
  const [importStatus, setImportStatus] = useState<{
    success: boolean;
    message: string;
    errors: string[];
  } | null>(null);

  // Upload summary stats
  const [uploadSummary, setUploadSummary] = useState<{
    total: number;
    updated: number;
    failures: number;
    detectedCols: string[];
  } | null>(null);

  // Dynamic lists support
  const standardOperations = useMemo(() => {
    return [
      'Collar Join', 'Sleeve Attach', 'Side Seam', 'Shoulder Join', 'Pocket Attach', 
      'Neck Binding', 'Placket Attach', 'Cuff Attach', 'Waist Band Attach', 'Bottom Hemming', 
      'Label Attach', 'Button Attach', 'Button Hole', 'Final Inspection'
    ];
  }, []);

  // Compute actual unique operation names present anywhere in employees' skills or standard list
  const allDetectedOperations = useMemo(() => {
    const opsSet = new Set<string>();
    standardOperations.forEach(op => opsSet.add(op));
    
    ieWorkforce.forEach(emp => {
      emp.skills?.forEach(s => {
        if (s.operationName && s.operationName.trim()) {
          opsSet.add(s.operationName.trim());
        }
      });
    });
    return Array.from(opsSet).sort();
  }, [ieWorkforce, standardOperations]);

  // Compute list of unique departments
  const allDepartments = useMemo(() => {
    const depts = new Set<string>();
    ieWorkforce.forEach(emp => {
      if (emp.department) depts.add(emp.department);
    });
    return Array.from(depts).sort();
  }, [ieWorkforce]);

  // Calculate live Attendance Reliability % from context logs
  const calculateAttendanceReliability = (empId: string): number => {
    const records = attendance.filter(r => r.employeeId.toUpperCase() === empId.toUpperCase());
    if (records.length === 0) {
      // Return historical baseline if there are no live records
      const emp = ieWorkforce.find(e => e.id.toUpperCase() === empId.toUpperCase());
      return emp?.attendanceReliability || emp?.historicalAttendanceRate || 94;
    }
    const attended = records.filter(r => r.status === 'Present' || r.status === 'Late').length;
    return Math.round((attended / records.length) * 100);
  };

  // Live calculation of present line operators today to prevent selecting offline workers
  const presentOperatorIdsToday = useMemo(() => {
    return attendance
      .filter(r => r.date === systemDate && (r.status === 'Present' || r.status === 'Late'))
      .map(r => r.employeeId.toUpperCase());
  }, [attendance, systemDate]);

  // Excel Action: Download current live matrix database with percentage columns
  const handleDownloadTemplate = () => {
    const rows = ieWorkforce.map(emp => {
      const rowObj: any = {
        'Employee ID': emp.id,
        'Employee Name': emp.name,
        'Department': emp.department || 'Sewing',
        'Assigned Line': emp.lineNumber || 0
      };

      // Populate percentage values for all detected operations
      allDetectedOperations.forEach(op => {
        const matchingSkill = emp.skills?.find(s => s.operationName.toLowerCase() === op.toLowerCase());
        rowObj[`${op} %`] = matchingSkill ? matchingSkill.proficiency : 0;
      });

      // Supporting metrics
      rowObj['Average PCS Produced Per Day'] = emp.avgPcsProducedPerDay || Math.round(emp.baseEfficiency * 4.6);
      rowObj['Overall Efficiency %'] = emp.baseEfficiency || 70;
      rowObj['Attendance Reliability %'] = calculateAttendanceReliability(emp.id);
      rowObj['Defect Rate %'] = emp.defectRate !== undefined ? emp.defectRate : 2.5;

      return rowObj;
    });

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'SkillMatrixTemplate');

    XLSX.writeFile(workbook, `SWM_Skill_Matrix_Frictionless_${systemDate}.xlsx`);
  };

  // Excel/CSV Upload and Import Validation Center
  const handleUploadExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportStatus(null);
    setUploadSummary(null);

    const fileReader = new FileReader();
    fileReader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[firstSheetName];
        const json = XLSX.utils.sheet_to_json(sheet) as any[];

        if (!json || json.length === 0) {
          setImportStatus({
            success: false,
            message: 'Validation Failure: The uploaded file is empty or has an invalid sheet structure.',
            errors: ['Format error: No data found inside the active worksheet.']
          });
          return;
        }

        const errorsList: string[] = [];
        const detectedOpColumns: string[] = [];
        const firstRow = json[0];
        const headers = Object.keys(firstRow);

        // Detect operation columns ending in '%' or '% '
        headers.forEach(header => {
          const norm = header.trim().toLowerCase();
          if (norm.endsWith('%')) {
            // Exclude supporting metrics
            if (!norm.includes('efficiency') && !norm.includes('attendance') && !norm.includes('reliability')) {
              detectedOpColumns.push(header);
            }
          }
        });

        if (detectedOpColumns.length === 0) {
          setImportStatus({
            success: false,
            message: 'Validation Failure: No operation-wise columns ending with "%" were detected.',
            errors: ['Header structure invalid. Make sure operation columns follow the "Operation Name %" structure (e.g., "Collar Join %").']
          });
          return;
        }

        let totalRecordsProcessed = 0;
        let recordsUpdated = 0;
        let validationFailures = 0;
        const updatesList: any[] = [];
        const uniqueSet = new Set<string>();

        json.forEach((row, idx) => {
          const rowNum = idx + 2;
          totalRecordsProcessed++;

          const rawId = row['Employee ID'] || row['employeeId'] || row['ID'] || row['Employee ID %'] || '';
          const empId = String(rawId).trim().toUpperCase();

          if (!empId) {
            errorsList.push(`Row ${rowNum}: Missing mandatory Employee ID field.`);
            validationFailures++;
            return;
          }

          // Duplicate checker
          if (uniqueSet.has(empId)) {
            errorsList.push(`Row ${rowNum} (${empId}): Duplicate entry ignored. Employee ID exists multiple times in this spreadsheet.`);
            validationFailures++;
            return;
          }
          uniqueSet.add(empId);

          // Validate against Employee Master Data
          const employeeExists = employees.find(e => e.id.toUpperCase() === empId);
          if (!employeeExists) {
            errorsList.push(`Row ${rowNum} (${empId}): Employee ID does not exist in Employee Master Database. Auto-creation is strictly forbidden.`);
            validationFailures++;
            return;
          }

          let rowHasError = false;
          const skillsList: WorkerSkill[] = [];

          // Translate columns to percentage values
          detectedOpColumns.forEach(col => {
            const rawVal = row[col];
            if (rawVal === undefined || rawVal === null || rawVal === '') return;

            const floatVal = parseFloat(rawVal);
            if (isNaN(floatVal) || floatVal < 0 || floatVal > 100) {
              errorsList.push(`Row ${rowNum} (${empId}): Value for "${col}" (${rawVal}) is out-of-bounds. Enter a numeric value between 0 and 100.`);
              rowHasError = true;
            } else {
              const cleanedOpName = col.replace(/%\s*$/, '').trim();
              skillsList.push({
                operationName: cleanedOpName,
                proficiency: Math.round(floatVal)
              });
            }
          });

          // Overall Efficiency % parsing
          let overallEfficiency = row['Overall Efficiency %'] !== undefined ? parseFloat(row['Overall Efficiency %']) : undefined;
          if (overallEfficiency !== undefined && (isNaN(overallEfficiency) || overallEfficiency < 0 || overallEfficiency > 100)) {
            errorsList.push(`Row ${rowNum} (${empId}): Overall Efficiency % must be between 0 and 100.`);
            rowHasError = true;
          }

          // Attendance Reliability % parsing
          let attendanceReliability = row['Attendance Reliability %'] !== undefined ? parseFloat(row['Attendance Reliability %']) : undefined;
          if (attendanceReliability !== undefined && (isNaN(attendanceReliability) || attendanceReliability < 0 || attendanceReliability > 100)) {
            errorsList.push(`Row ${rowNum} (${empId}): Attendance Reliability % must be between 0 and 100.`);
            rowHasError = true;
          }

          // Defect Rate % parsing and validation (0 to 100)
          let defectRate = row['Defect Rate %'] !== undefined ? parseFloat(row['Defect Rate %']) : undefined;
          if (defectRate !== undefined) {
            if (isNaN(defectRate) || defectRate < 0 || defectRate > 100) {
              errorsList.push(`Row ${rowNum} (${empId}): Defect Rate % must be between 0 and 100.`);
              rowHasError = true;
            }
          }

          // Avg PCS Produced Per Day parsing
          const avgPcs = row['Average PCS Produced Per Day'] !== undefined ? parseInt(row['Average PCS Produced Per Day'], 10) : undefined;

          if (rowHasError) {
            validationFailures++;
            return;
          }

          recordsUpdated++;
          updatesList.push({
            employeeId: empId,
            skills: skillsList,
            baseEfficiency: overallEfficiency,
            attendanceReliability: attendanceReliability,
            avgPcsProducedPerDay: avgPcs,
            defectRate: defectRate
          });
        });

        if (recordsUpdated === 0) {
          setImportStatus({
            success: false,
            message: 'Import Aborted: Zero operational records passed validation.',
            errors: errorsList
          });
          return;
        }

        const isErase = importModeOption === 'erase';
        updateBulkSkills(updatesList, isErase);

        setImportStatus({
          success: true,
          message: `Double-entry validation completed. ${recordsUpdated} operator competencies updated successfully!`,
          errors: errorsList
        });

        setUploadSummary({
          total: totalRecordsProcessed,
          updated: recordsUpdated,
          failures: validationFailures,
          detectedCols: detectedOpColumns.map(c => c.replace(/%\s*$/, '').trim())
        });

        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }

      } catch (ex: any) {
        setImportStatus({
          success: false,
          message: `Parsing Exception occurs: Failed to parse excel binary.`,
          errors: [ex.toString()]
        });
      }
    };

    fileReader.readAsArrayBuffer(file);
  };

  // Replacement recommendations calculator: Purely percentage-oriented
  const calculateReplacementScores = (absentId: string, operation: string) => {
    if (!absentId || !operation) return [];

    const absentEmp = ieWorkforce.find(e => e.id === absentId);
    if (!absentEmp) return [];

    // Filter available alternatives: MUST be on the present today and NOT be the absent sewer
    const candidates = ieWorkforce.filter(emp => {
      const isPresent = presentOperatorIdsToday.includes(emp.id.toUpperCase());
      const isNotSelf = emp.id !== absentId;
      return isPresent && isNotSelf;
    });

    const evaluated = candidates.map(emp => {
      // Find exact percentage scale for this operation
      const skillDetails = emp.skills?.find(s => s.operationName.toLowerCase() === operation.toLowerCase());
      const skillMatchPercent = skillDetails ? skillDetails.proficiency : 0;

      // Skip candidates with literally 0% proficiency for critical jobs
      if (skillMatchPercent === 0) return null;

      // Advanced scorecard breakdown:
      // A. Skill competency weight (0 to 100 proficiency drives score heavily (70%))
      const competencyScore = skillMatchPercent * 0.7;

      // B. Overall attendance reliability (max 15 points)
      const reliability = calculateAttendanceReliability(emp.id);
      const attendanceWeight = (reliability / 100) * 15;

      // C. Base productivity/efficiency (max 10 points)
      const baseEff = emp.baseEfficiency || 70;
      const efficiencyWeight = (baseEff / 100) * 10;

      // D. Multi-skill factor (max 5 points)
      const multiSkillBonus = emp.skills && emp.skills.length >= 3 ? 5 : 2;

      // E. Secondary Line Disruption Assessment
      let penaltyOffset = 0;
      let warningText = 'Directly relocatable';
      let warningLevel: 'none' | 'low' | 'high' = 'none';

      const assignmentStatus = emp.workforceAssignmentStatus || 'Unassigned';

      if (emp.lineNumber === 0) {
        penaltyOffset += 5; // Floater or floater pool yields zero disruption
        warningText = 'Floater Pool Operator';
      } else if (emp.lineNumber === absentEmp.lineNumber) {
        penaltyOffset += 2; // Same-line relocations are easy
        warningText = 'Same production line';
      } else {
        // Different active sewing line
        penaltyOffset -= 15;
        warningText = `Disruptive reassignment (Will draw from Line ${emp.lineNumber})`;
        warningLevel = 'low';
      }

      if (assignmentStatus === 'Assigned') {
        penaltyOffset -= 15;
        warningText = `Assigned to Line ${emp.lineNumber}. Reallocation is highly disruptive.`;
        warningLevel = 'high';
      } else if (assignmentStatus === 'Available for Replacement') {
        penaltyOffset += 8;
        warningText = 'Explicitly available backup';
        warningLevel = 'none';
      }

      const averagePcs = emp.avgPcsProducedPerDay || Math.round(emp.baseEfficiency * 4.6);
      const qapsVal = calculateQAPS(
        skillMatchPercent,
        emp.baseEfficiency,
        reliability,
        emp.defectRate !== undefined ? emp.defectRate : 2.5,
        averagePcs
      );

      const matchScore = Math.max(10, Math.min(99, Math.round(
        qapsVal + (penaltyOffset * 0.4)
      )));

      // Expected productivity impact - compare candidate vs absent employee
      const absentSkill = absentEmp.skills?.find(s => s.operationName.toLowerCase() === operation.toLowerCase());
      const absentSkillVal = absentSkill ? absentSkill.proficiency : 75;
      const diff = skillMatchPercent - absentSkillVal;
      
      let expectedImpactLabel = 'Stable Impact (0%)';
      let impactClass = 'text-slate-500';

      if (diff > 10) {
        expectedImpactLabel = `Positive Gain (+${diff}%)`;
        impactClass = 'text-emerald-500 font-bold';
      } else if (diff < -15) {
        expectedImpactLabel = `High Loss (${diff}%)`;
        impactClass = 'text-rose-500 font-bold';
      } else if (diff < 0) {
        expectedImpactLabel = `Slight Drop (${diff}%)`;
        impactClass = 'text-amber-500';
      }

      return {
        employee: emp,
        skillMatchPercent,
        historicalEfficiency: emp.baseEfficiency,
        averagePcs,
        attendanceReliability: reliability,
        qaps: qapsVal,
        defectRate: emp.defectRate !== undefined ? emp.defectRate : 2.5,
        expectedImpactLabel,
        impactClass,
        matchScore,
        warningText,
        warningLevel
      };
    });

    return (evaluated.filter(Boolean) as any[]).sort((a, b) => b.matchScore - a.matchScore);
  };

  const activeReplacementSuggestions = calculateReplacementScores(replAbsentEmpId, replOperation);

  const handleApplyReallocation = (replacementId: string) => {
    const fromEmp = ieWorkforce.find(e => e.id === replAbsentEmpId);
    const toEmp = ieWorkforce.find(e => e.id === replacementId);
    if (!fromEmp || !toEmp) return;

    reallocateOperator(fromEmp.lineNumber, fromEmp.id, toEmp.id, replOperation);
    setReallocationSuccess(true);
    setReplResultMsg(`Operator ${toEmp.name} has been reassigned to Line ${fromEmp.lineNumber} for '${replOperation}'. Matrix updated.`);

    setTimeout(() => {
      setReallocationSuccess(false);
      setReplResultMsg('');
      setReplAbsentEmpId('');
      setReplOperation('');
    }, 5000);
  };

  // Real-time live analytics for the dedicated Dashboard
  const dashboardStats = useMemo(() => {
    // 1. Highest skilled operators mapped per operation (competency >= 85%)
    const opLeaders: Record<string, { employeeName: string; score: number; line: number }[]> = {};
    // 2. Skill coverage levels (count of operators with proficiency >= 50%)
    const coverageLevels: Record<string, number> = {};
    // 3. Average competency score per operation
    const competencySums: Record<string, number> = {};
    const competencyCounts: Record<string, number> = {};

    allDetectedOperations.forEach(op => {
      opLeaders[op] = [];
      coverageLevels[op] = 0;
      competencySums[op] = 0;
      competencyCounts[op] = 0;
    });

    ieWorkforce.forEach(emp => {
      emp.skills?.forEach(s => {
        const op = s.operationName;
        if (opLeaders[op]) {
          competencySums[op] += s.proficiency;
          competencyCounts[op]++;

          if (s.proficiency >= 50) {
            coverageLevels[op]++;
          }

          if (s.proficiency >= 85) {
            opLeaders[op].push({
              employeeName: emp.name,
              score: s.proficiency,
              line: emp.lineNumber
            });
          }
        }
      });
    });

    // Sort leaders to put highest skills first
    allDetectedOperations.forEach(op => {
      opLeaders[op] = opLeaders[op].sort((a, b) => b.score - a.score).slice(0, 3);
    });

    // 4. Identify critical shortages (where coverage of >= 50% operators is low < 3)
    const severeShortages = allDetectedOperations.filter(op => coverageLevels[op] < 3);

    // 5. Cross-training opportunities (Operators with competency between 40%-65%)
    const crossTrainCandidates: { name: string; id: string; operation: string; score: number }[] = [];
    ieWorkforce.forEach(emp => {
      emp.skills?.forEach(s => {
        if (s.proficiency >= 40 && s.proficiency <= 65) {
          crossTrainCandidates.push({
            name: emp.name,
            id: emp.id,
            operation: s.operationName,
            score: s.proficiency
          });
        }
      });
    });

    return {
      opLeaders,
      coverageLevels,
      competencyAverages: allDetectedOperations.reduce((acc, op) => {
        acc[op] = competencyCounts[op] > 0 ? Math.round(competencySums[op] / competencyCounts[op]) : 0;
        return acc;
      }, {} as Record<string, number>),
      severeShortages,
      crossTrainCandidates: crossTrainCandidates.slice(0, 10)
    };
  }, [ieWorkforce, allDetectedOperations]);

  // Absent workers list
  const absentOperatorsList = ieWorkforce.filter(emp => {
    const record = attendance.find(r => r.date === systemDate && r.employeeId === emp.id);
    return record?.status === 'Absent' || record?.status === 'Leave';
  });

  // Filter Table Roster Grid
  const filteredGridEmployees = ieWorkforce.filter(emp => {
    const matchesSearch = emp.name.toLowerCase().includes(searchTerm.toLowerCase()) || emp.id.toLowerCase().includes(searchTerm.toLowerCase());
    
    // Line Filter
    let matchesLine = true;
    if (selectedLine !== 'All') {
      const targetLineNum = parseInt(selectedLine, 10);
      matchesLine = emp.lineNumber === targetLineNum;
    }

    // Department Filter
    let matchesDept = true;
    if (selectedDepartment !== 'All') {
      matchesDept = emp.department === selectedDepartment;
    }

    // Skill & Competency Match Range Check
    let matchesSkills = true;
    if (selectedOperation !== 'All') {
      const matchSkill = emp.skills?.find(s => s.operationName === selectedOperation);
      if (!matchSkill) {
        matchesSkills = false;
      } else {
        matchesSkills = matchSkill.proficiency >= minCompetency && matchSkill.proficiency <= maxCompetency;
      }
    } else {
      // General match: operator must possess at least one skill inside the current min/max range
      if (minCompetency > 0 || maxCompetency < 100) {
        matchesSkills = emp.skills.some(s => s.proficiency >= minCompetency && s.proficiency <= maxCompetency);
      }
    }

    return matchesSearch && matchesLine && matchesDept && matchesSkills;
  });

  return (
    <div className="space-y-6">

      {/* Hero Header bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-linear-to-r from-slate-900 to-indigo-950 p-6 rounded-2xl text-white shadow-xl relative overflow-hidden">
        <div className="space-y-1 z-10">
          <div className="flex items-center gap-2">
            <span className="bg-blue-500/25 border border-blue-400/40 text-blue-100 font-mono text-[9px] px-2.5 py-0.5 rounded-full uppercase tracking-wider font-bold">
              IE Framework 2.0
            </span>
            <span className="bg-indigo-500/25 border border-indigo-400/40 text-indigo-100 font-mono text-[9px] px-2.5 py-0.5 rounded-full uppercase tracking-wider font-bold">
              Quantitative Competency
            </span>
          </div>
          <h2 className="text-xl md:text-2xl font-black text-white font-display uppercase tracking-wide">
            Operation-Wise Skill Matrix Cockpit
          </h2>
          <p className="text-xs text-slate-300 max-w-xl">
            Surgical workforce placement database tracking real competency scores in percentage (0-100%) for each sewing workstation. Excludes static, vague tags.
          </p>
        </div>
        <div className="flex gap-2.5 z-10">
          <button
            onClick={handleDownloadTemplate}
            className="text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 hover:scale-103 py-2.5 px-4 rounded-xl flex items-center gap-2 transition cursor-pointer shadow-md"
            title="Download full matrix template"
          >
            <Download className="w-4 h-4" />
            <span>Generate Database Sheet</span>
          </button>
        </div>
        <div className="absolute top-0 right-0 w-80 h-40 bg-radial from-blue-500/10 to-transparent rounded-full blur-2xl -mr-20 -mt-10"></div>
      </div>

      {/* THE DEDICATED INDUSTRIAL ENGINEER DISCOVER DASHBOARD */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
        
        {/* Metric A: Severe Skill Shortages (< 3 operators certified) */}
        <div className="md:col-span-4 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-850 p-5 rounded-2xl shadow-xs flex flex-col justify-between">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Critical Coverages</span>
              <span className="p-1 rounded bg-rose-50 text-rose-600 dark:bg-rose-950/20 dark:text-rose-450 text-[10px] font-bold">Alert Level</span>
            </div>
            <h4 className="text-xl font-black font-display text-slate-900 dark:text-neutral-100">
              {dashboardStats.severeShortages.length} Operations Need Backup
            </h4>
            <p className="text-[11px] text-slate-500 leading-normal">
              Workstations with less than 3 qualified operators (≥50% competency) present on the production floor.
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-50 dark:border-slate-900 space-y-1.5">
            {dashboardStats.severeShortages.slice(0, 3).map(op => {
              const count = dashboardStats.coverageLevels[op];
              return (
                <div key={op} className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-700 dark:text-slate-300">{op}</span>
                  <span className="font-mono text-rose-500 font-bold bg-rose-50 dark:bg-rose-950/20 px-1.5 py-0.5 rounded text-[10px]">
                    {count} operators
                  </span>
                </div>
              );
            })}
            {dashboardStats.severeShortages.length > 3 && (
              <span className="text-[10px] text-slate-400 block pt-1 hover:underline cursor-pointer">
                + {dashboardStats.severeShortages.length - 3} other shortages detected
              </span>
            )}
          </div>
        </div>

        {/* Metric B: High Precision Certifications (>= 85% score count) */}
        <div className="md:col-span-4 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-850 p-5 rounded-2xl shadow-xs flex flex-col justify-between">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Elite Operators</span>
              <span className="p-1 rounded bg-emerald-50 text-emerald-600 dark:bg-emerald-950/20 dark:text-emerald-400 text-[10px] font-bold">Gold Tier</span>
            </div>
            <h4 className="text-xl font-black font-display text-slate-900 dark:text-neutral-100">
              {ieWorkforce.filter(e => e.skills.some(s => s.proficiency >= 85)).length} Active Specialists
            </h4>
            <p className="text-[11px] text-slate-500 leading-normal">
              Operators who possess at least one operation certified at 85% or greater proficiency score.
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-50 dark:border-slate-900 grid grid-cols-2 gap-2">
            <div className="bg-slate-50 dark:bg-slate-900 p-2 rounded-xl text-center">
              <span className="text-[10px] text-slate-400 block uppercase font-bold">Average Avg</span>
              <span className="text-sm font-bold font-mono text-blue-600 dark:text-blue-400">
                {Math.round(ieWorkforce.reduce((sum, e) => sum + (e.baseEfficiency || 70), 0) / Math.max(1, ieWorkforce.length))}% Eff.
              </span>
            </div>
            <div className="bg-slate-50 dark:bg-slate-900 p-2 rounded-xl text-center">
              <span className="text-[10px] text-slate-400 block uppercase font-bold">Total Operations</span>
              <span className="text-sm font-bold font-mono text-indigo-600 dark:text-indigo-400">
                {allDetectedOperations.length} Unique
              </span>
            </div>
          </div>
        </div>

        {/* Metric C: Cross-Training Opportunities (40% to 65%) */}
        <div className="md:col-span-4 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-850 p-5 rounded-2xl shadow-xs flex flex-col justify-between">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Skill Growth</span>
              <span className="p-1 rounded bg-amber-50 text-amber-600 dark:bg-amber-950/20 dark:text-amber-400 text-[10px] font-bold">Upgrade list</span>
            </div>
            <h4 className="text-xl font-black font-display text-slate-900 dark:text-neutral-100">
              {dashboardStats.crossTrainCandidates.length} Active Candidates
            </h4>
            <p className="text-[11px] text-slate-500 leading-normal">
              Operators with a skill level score between 40%-65% who are ready for fast-track training.
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-50 dark:border-slate-900 space-y-2">
            <div className="flex flex-wrap gap-1.5 max-h-[64px] overflow-hidden">
              {dashboardStats.crossTrainCandidates.slice(0, 4).map((c, i) => (
                <span 
                  key={i} 
                  className="bg-slate-100 dark:bg-slate-900 text-[10px] px-2 py-0.5 rounded-md text-slate-600 dark:text-slate-300 font-medium truncate max-w-[120px]"
                  title={`${c.name} - ${c.operation} (${c.score}%)`}
                >
                  {c.name}: {c.score}%
                </span>
              ))}
            </div>
          </div>
        </div>

      </div>

      {/* CORE UTILITIES SECTION: LEFT (PLACEMENT ENGINE) & RIGHT (UPLOAD SYNC CENTER) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

        {/* SECTION A: THE QUANTITATIVE ABSENTEE REPLACER ENGINE */}
        <div className="bg-white dark:bg-slate-900 border border-slate-205 dark:border-slate-800 rounded-2xl p-5 shadow-sm col-span-1 lg:col-span-5 flex flex-col justify-between space-y-4">
          <div>
            <div className="border-b border-slate-100 dark:border-slate-800 pb-3">
              <span className="bg-slate-900 text-white font-mono text-[9px] px-2.5 py-0.5 rounded-full uppercase tracking-wider font-bold">
                Deploy Analytics
              </span>
              <h3 className="font-display font-semibold text-slate-800 dark:text-neutral-200 text-sm mt-1.5">
                Absentee Operator Quantitative Placement
              </h3>
              <p className="text-xs text-slate-500">
                Identify present candidates. Compares exact competency values to minimize workstation output drops.
              </p>
            </div>

            <div className="space-y-3.5 text-xs pt-3">
              {/* Absent Select */}
              <div className="space-y-1">
                <label className="block font-bold text-slate-600 dark:text-slate-300">1. Selected Absent Operator Today</label>
                <select
                  value={replAbsentEmpId}
                  onChange={e => {
                    setReplAbsentEmpId(e.target.value);
                    const emp = ieWorkforce.find(x => x.id === e.target.value);
                    if (emp && emp.skills.length > 0) {
                      setReplOperation(emp.skills[0].operationName);
                    } else {
                      setReplOperation('');
                    }
                  }}
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-950 text-slate-705 dark:text-neutral-200 border border-slate-200 dark:border-slate-800 rounded-lg focus:outline-none focus:border-blue-500 font-semibold cursor-pointer"
                >
                  <option value="">-- Choose Absent Operator --</option>
                  {absentOperatorsList.map(emp => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name} (ID: {emp.id}) · Line {emp.lineNumber === 0 ? 'Floater' : emp.lineNumber}
                    </option>
                  ))}
                </select>
              </div>

              {/* Operation Select */}
              {replAbsentEmpId && (
                <div className="space-y-1">
                  <label className="block font-bold text-slate-600 dark:text-slate-300">2. Select Operation To Fill</label>
                  <select
                    value={replOperation}
                    onChange={e => setReplOperation(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 dark:bg-slate-950 text-slate-705 dark:text-neutral-200 border border-slate-200 dark:border-slate-800 rounded-lg focus:outline-none cursor-pointer"
                  >
                    <option value="">-- Choose Operation --</option>
                    {ieWorkforce.find(e => e.id === replAbsentEmpId)?.skills.map(skill => (
                      <option key={skill.operationName} value={skill.operationName}>
                        {skill.operationName} ({skill.proficiency}% competency)
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Results Roster */}
            <div className="pt-3">
              {reallocationSuccess && (
                <div className="p-3 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-450 border border-emerald-100 dark:border-emerald-900/30 rounded-xl text-xs leading-relaxed flex items-start space-x-2 animate-pulse mb-3">
                  <UserCheck className="w-5 h-5 flex-shrink-0 text-emerald-500" />
                  <span>{replResultMsg}</span>
                </div>
              )}

              {!replAbsentEmpId && (
                <div className="py-12 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl text-center text-xs text-slate-400 space-y-1 bg-slate-50/50 dark:bg-slate-905/20">
                  <ShieldAlert className="w-6 h-6 mx-auto text-slate-300" />
                  <p className="font-semibold text-slate-500">No Absent Operator Selected</p>
                  <p className="text-[10px] text-slate-400">Choose an absent worker to calculate ranked competency alternatives.</p>
                </div>
              )}

              {replAbsentEmpId && replOperation && activeReplacementSuggestions.length === 0 && (
                <div className="p-4 border border-dashed border-red-200 bg-red-50/20 dark:border-red-950/20 rounded-xl text-center text-xs text-red-500 italic">
                  No present floor operators have a certified score for "{replOperation}"! Consider pulling a general operator or manual cross-training.
                </div>
              )}

              {replAbsentEmpId && replOperation && activeReplacementSuggestions.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-[11px] uppercase font-bold text-slate-400 tracking-wider">
                    <span>Ranked Qualified Alternatives</span>
                    <span className="text-blue-600 dark:text-blue-400">{activeReplacementSuggestions.length} Found</span>
                  </div>

                  <div className="space-y-2.5 max-h-[220px] overflow-y-auto custom-scrollbar pr-1">
                    {activeReplacementSuggestions.map((cand, idx) => {
                      const isBest = idx === 0;

                      return (
                        <div 
                          key={cand.employee.id} 
                          className={`p-3 border rounded-xl flex flex-col text-xs transition relative ${
                            isBest 
                              ? 'border-blue-400 bg-blue-50/20 dark:border-blue-950/30 ring-1 ring-blue-300 dark:ring-blue-900' 
                              : 'border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-850'
                          }`}
                        >
                          {isBest && (
                            <span className="absolute top-0 right-0 bg-blue-600 text-white text-[8px] font-bold px-2 py-0.5 rounded-bl uppercase tracking-wider">
                              Rank 1 Match (Score {cand.matchScore}%)
                            </span>
                          )}

                          <div className="flex justify-between items-start">
                            <div className="space-y-0.5">
                              <span className="font-black text-slate-800 dark:text-slate-200">{cand.employee.name}</span>
                              <span className="block text-[10px] text-slate-400 font-mono">
                                ID: {cand.employee.id} · Line {cand.employee.lineNumber === 0 ? 'Floater' : cand.employee.lineNumber}
                              </span>
                            </div>
                            <div className="text-right">
                              <span className="block font-black text-blue-600 dark:text-blue-400 text-sm font-mono">{cand.skillMatchPercent}%</span>
                              <span className="text-[9px] text-slate-400 block font-semibold leading-none">Skill Match</span>
                            </div>
                          </div>

                          <div className="grid grid-cols-5 gap-1 border-t border-b border-slate-55 dark:border-slate-800/60 my-2 py-1.5 text-[9px] text-slate-500 font-mono">
                            <div>
                              <span className="block text-slate-400 text-[8px] uppercase">Match</span>
                              <span className="font-bold text-slate-700 dark:text-slate-350">{cand.skillMatchPercent}%</span>
                            </div>
                            <div>
                              <span className="block text-slate-400 text-[8px] uppercase">Eff</span>
                              <span className="font-bold text-slate-700 dark:text-slate-350">{cand.historicalEfficiency}%</span>
                            </div>
                            <div>
                              <span className="block text-slate-400 text-[8px] uppercase text-red-450">Defect</span>
                              <span className={`font-bold ${cand.defectRate > 4 ? 'text-red-500' : 'text-slate-700 dark:text-slate-350'}`}>{cand.defectRate}%</span>
                            </div>
                            <div>
                              <span className="block text-slate-400 text-[8px] uppercase">Attendance</span>
                              <span className="font-bold text-slate-700 dark:text-slate-350">{cand.attendanceReliability}%</span>
                            </div>
                            <div>
                              <span className="block text-slate-400 text-[8px] uppercase">Pcs/Day</span>
                              <span className="font-bold text-slate-705 dark:text-slate-350">{cand.averagePcs}</span>
                            </div>
                          </div>

                          <div className="flex justify-between items-center mt-1">
                            <div className="text-[10px] space-y-0.5 min-w-0 flex-1">
                              <span className="text-slate-450 block truncate font-semibold">
                                Expected Output impact: <span className={cand.impactClass}>{cand.expectedImpactLabel}</span>
                              </span>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-[9px] text-slate-400 truncate italic font-medium">
                                  status: {cand.warningText}
                                </span>
                                <span className="text-[9.5px] font-bold text-indigo-500 font-mono">
                                  · QAPS: {cand.qaps}/100
                                </span>
                              </div>
                            </div>
                            <button 
                              type="button"
                              onClick={() => handleApplyReallocation(cand.employee.id)}
                              className={`px-3 py-1.5 rounded-md text-[9.5px] font-bold shadow-xs transition cursor-pointer self-end ${
                                isBest 
                                  ? 'bg-blue-600 text-white hover:bg-blue-700' 
                                  : 'bg-slate-100 text-slate-705 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                              }`}
                            >
                              Reallocate
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
          <div></div>
        </div>

        {/* SECTION B: EXCEL COMPETENCY DATABASE SYNCHRONIZER & VALIDATION CENTER */}
        <div className="bg-white dark:bg-slate-900 border border-slate-205 dark:border-slate-800 rounded-2xl p-5 shadow-sm col-span-1 lg:col-span-7 flex flex-col justify-between space-y-4">
          <div className="space-y-4">
            <div className="border-b border-slate-100 dark:border-slate-800 pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <span className="bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 font-mono text-[9px] px-2.5 py-0.5 rounded-full uppercase tracking-wider font-bold">
                  Validation Center
                </span>
                <h3 className="font-display font-semibold text-slate-800 dark:text-neutral-100 text-sm mt-1.5 flex items-center gap-1.5">
                  <FileSpreadsheet className="w-4 h-4 text-emerald-500" />
                  <span>Competent Database Bulk Synchronizer</span>
                </h3>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-center">
              <div className="md:col-span-6 space-y-3.5">
                <p className="text-xs text-slate-500 leading-relaxed font-semibold">
                  Update multi-operation competencies at once. Upload a database sheet. Unregistered operators are rejected; existing profiles are upgraded.
                </p>
                <div className="text-[10px] text-slate-400 space-y-1.5 font-mono bg-slate-50/50 dark:bg-slate-900/40 p-3 rounded-xl border border-slate-200/50 dark:border-slate-800/40">
                  <div className="flex items-center gap-1 text-slate-650 font-bold uppercase pb-1 border-b border-slate-100 dark:border-slate-800/40 text-[9px]">
                    <span>Excel Column Validation Rules:</span>
                  </div>
                  <div>• <b className="text-slate-600 dark:text-slate-300">Employee ID</b> (ID verified in Master Roster)</div>
                  <div>• <b className="text-slate-600 dark:text-slate-300">Operation Name %</b> (e.g. Collar Join %, 0 to 100)</div>
                  <div>• <b className="text-slate-600 dark:text-slate-300">Average PCS Produced Per Day</b> (Supporting quantity)</div>
                  <div>• <b className="text-slate-600 dark:text-slate-300">Overall Efficiency %</b> (General production output)</div>
                  <div>• <b className="text-slate-600 dark:text-slate-300">Attendance Reliability %</b> (Present metric, 0 to 100)</div>
                </div>

                {/* Import Action Mode Selection */}
                <div className="bg-slate-55 dark:bg-slate-850 border border-slate-100 dark:border-slate-800 rounded-xl p-3 space-y-2">
                  <span className="block text-[9px] uppercase font-bold text-slate-550 dark:text-slate-450 tracking-wider">
                    Upload Merging Strategy
                  </span>
                  <div className="flex flex-col sm:flex-row gap-2.5 sm:gap-4 pt-1">
                    <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-700 dark:text-slate-200">
                      <input
                        type="radio"
                        name="skillImportStrategy"
                        value="update"
                        checked={importModeOption === 'update'}
                        onChange={() => setImportModeOption('update')}
                        className="accent-emerald-500 h-4 w-4"
                      />
                      <span>Update Skills (Merge)</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-700 dark:text-slate-200">
                      <input
                        type="radio"
                        name="skillImportStrategy"
                        value="erase"
                        checked={importModeOption === 'erase'}
                        onChange={() => setImportModeOption('erase')}
                        className="accent-rose-500 h-4 w-4"
                      />
                      <span className="text-rose-600 dark:text-rose-400">Erase & Overwrite</span>
                    </label>
                  </div>
                  <p className="text-[10px] leading-relaxed text-slate-450 dark:text-slate-400 border-t border-slate-100 dark:border-slate-800/60 pt-1.5 mt-1.5 italic font-medium">
                    {importModeOption === 'update' 
                      ? 'Merge mode: merges uploaded operation values, preserving prior skills untouched.' 
                      : 'Overwrite mode: wipes out all skills from target master accounts and overwrites them with spreadsheet metrics.'}
                  </p>
                </div>
              </div>

              <div className="md:col-span-6 flex flex-col justify-center">
                {/* Drag zone */}
                <label className="border-3 border-dashed border-slate-200 dark:border-slate-800 hover:border-emerald-400/80 dark:hover:border-emerald-600/60 rounded-2xl p-6 text-center cursor-pointer block transition relative bg-slate-50/40 dark:bg-slate-950/20 py-10 shadow-xs">
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleUploadExcel}
                    accept=".xlsx, .xls, .csv"
                    className="hidden"
                  />
                  <UploadCloud className="w-12 h-12 mx-auto text-slate-400 mb-3 hover:scale-110 transition duration-300" />
                  <span className="block font-black text-sm text-slate-700 dark:text-slate-200">
                    Click to upload database file
                  </span>
                  <span className="block text-xs text-slate-400 mt-1.5">
                    Supports Excel (.xlsx, .xls) and standard .csv up to 10MB
                  </span>
                </label>
              </div>
            </div>
          </div>

          {/* SPREADSHEET VALIDATION STATUS CONSOLE */}
          <AnimatePresence>
            {importStatus && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className={`p-4 rounded-xl border text-xs gap-3 flex flex-col ${
                  importStatus.success
                    ? 'bg-emerald-50/50 dark:bg-emerald-950/10 border-emerald-500/20 text-slate-700 dark:text-slate-300'
                    : 'bg-rose-50/50 dark:bg-rose-950/10 border-rose-500/20 text-rose-600'
                }`}
              >
                <div className="flex items-start gap-3">
                  {importStatus.success ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5 animate-bounce" />
                  ) : (
                    <AlertCircle className="w-5 h-5 text-rose-500 flex-shrink-0 mt-0.5 animate-pulse" />
                  )}
                  <div className="flex-1">
                    <p className={`font-black text-sm uppercase tracking-wide ${importStatus.success ? 'text-emerald-750 dark:text-emerald-400' : 'text-rose-750 dark:text-rose-400'}`}>
                      {importStatus.success ? 'Database Update Successful!' : 'Validation Failure Blocked Import!'}
                    </p>
                    <p className="text-[11px] mt-1 leading-relaxed">{importStatus.message}</p>
                    
                    {/* Summary statistics display */}
                    {uploadSummary && (
                      <div className="mt-2.5 grid grid-cols-4 gap-2 bg-slate-100/40 dark:bg-slate-900/60 p-2.5 rounded-lg border border-slate-200/50 dark:border-slate-800/40 font-mono text-[10px]">
                        <div>
                          <span className="block text-slate-400 text-[8.5px] uppercase font-bold">Processed</span>
                          <span className="font-extrabold text-slate-700 dark:text-slate-300">{uploadSummary.total} rows</span>
                        </div>
                        <div>
                          <span className="block text-slate-400 text-[8.5px] uppercase font-bold">Updated</span>
                          <span className="font-extrabold text-emerald-600 dark:text-emerald-400">{uploadSummary.updated} rows</span>
                        </div>
                        <div>
                          <span className="block text-slate-400 text-[8.5px] uppercase font-bold">Rejected</span>
                          <span className="font-extrabold text-rose-500">{uploadSummary.failures} rows</span>
                        </div>
                        <div>
                          <span className="block text-slate-400 text-[8.5px] uppercase font-bold">Operations</span>
                          <span className="font-extrabold text-indigo-500">{uploadSummary.detectedCols.length} found</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {importStatus.errors.length > 0 && (
                  <div className="border-t border-slate-100 dark:border-slate-800/60 pt-2.5 mt-1">
                    <p className="font-mono text-[9px] font-black text-slate-450 mb-1 leading-none uppercase tracking-wider">
                      Validation and Error logs:
                    </p>
                    <div className="max-h-24 overflow-y-auto font-mono text-[9px] space-y-1 text-slate-500 custom-scrollbar">
                      {importStatus.errors.map((err, i) => (
                        <div key={i} className="flex gap-2 items-start">
                          <span className="text-[8.5px] px-1 py-0.2 bg-slate-100 dark:bg-slate-800 text-slate-400 rounded-sm font-bold">WARN</span>
                          <span className="break-all">{err}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

      </div>

      {/* THREE: INTERACTIVE SKILL MATRIX GRID COCKPIT (THE HUGE HEATMAP DATABASE) */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-4">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
          <div>
            <h3 className="font-display font-black text-slate-900 dark:text-neutral-100 text-sm uppercase tracking-wider">
              Workforce Skill Matrix Grid Database
            </h3>
            <p className="text-xs text-slate-500">Live quantitative heatmap of operational capabilities. Filter, inspect, and evaluate anomalies.</p>
          </div>

          {/* MULTI-VARIABLE COCKPIT FILTER LAYERS */}
          <div className="flex flex-wrap gap-2 text-xs">
            {/* Search */}
            <input 
              type="text" 
              placeholder="Search ID/Name..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="py-1.5 px-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg focus:outline-none placeholder-slate-400 font-medium"
            />

            {/* Target Operation filter */}
            <select
              value={selectedOperation}
              onChange={e => setSelectedOperation(e.target.value)}
              className="py-1.5 px-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-700 dark:text-neutral-200 focus:outline-none font-medium cursor-pointer"
            >
              <option value="All">All Operations Matrix</option>
              {allDetectedOperations.map(op => (
                <option key={op} value={op}>{op}</option>
              ))}
            </select>

            {/* Department filter */}
            <select
              value={selectedDepartment}
              onChange={e => setSelectedDepartment(e.target.value)}
              className="py-1.5 px-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-700 dark:text-neutral-200 focus:outline-none font-medium cursor-pointer"
            >
              <option value="All">All Departments</option>
              {allDepartments.map(dept => (
                <option key={dept} value={dept}>{dept}</option>
              ))}
            </select>

            {/* Line filter */}
            <select
              value={selectedLine}
              onChange={e => setSelectedLine(e.target.value)}
              className="py-1.5 px-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-700 dark:text-neutral-200 focus:outline-none font-medium cursor-pointer"
            >
              <option value="All">All Lines</option>
              <option value="0">Offline/Floaters</option>
              {productionLines.map(line => (
                <option key={line.id} value={String(line.id)}>Line {line.id < 10 ? `0${line.id}` : line.id}</option>
              ))}
            </select>

            {/* Competency min slider */}
            <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-950 border border-slate-205 dark:border-slate-800 rounded-lg px-2.5 py-1">
              <span className="text-[10px] uppercase font-bold text-slate-400">Min Skill:</span>
              <input 
                type="range"
                min="0"
                max="100"
                value={minCompetency}
                onChange={e => setMinCompetency(parseInt(e.target.value, 10))}
                className="w-16 accent-indigo-500 cursor-pointer h-1.5"
              />
              <span className="font-mono text-[10px] font-bold text-indigo-600 dark:text-indigo-400">{minCompetency}%</span>
            </div>
            
            {/* Clear filters trigger */}
            {(searchTerm || selectedOperation !== 'All' || selectedLine !== 'All' || selectedDepartment !== 'All' || minCompetency > 0) && (
              <button
                onClick={() => {
                  setSearchTerm('');
                  setSelectedOperation('All');
                  setSelectedLine('All');
                  setSelectedDepartment('All');
                  setMinCompetency(0);
                  setMaxCompetency(100);
                }}
                className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 text-slate-500 rounded-lg font-bold flex items-center gap-1 cursor-pointer transition"
              >
                <X className="w-3.5 h-3.5" />
                <span>Reset</span>
              </button>
            )}
          </div>
        </div>

        {/* HEATMAP SPREADSHEET TABLE GRID CONTAINER */}
        <div className="overflow-x-auto rounded-xl border border-slate-150 dark:border-slate-800 custom-scrollbar">
          <table className="w-full text-xs text-left border-collapse">
            <thead className="text-[9px] uppercase font-bold text-slate-400 bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 tracking-wider">
              <tr>
                <th className="px-4 py-3 min-w-[180px] sticky left-0 z-20 bg-slate-50 dark:bg-slate-950 border-r border-slate-200 dark:border-slate-850">
                  Worker Master Identity
                </th>
                <th className="px-4 py-3 text-center border-r border-slate-200 dark:border-slate-850">Line Location</th>
                <th className="px-4 py-3 text-center border-r border-slate-200 dark:border-slate-850">Overall Eff.</th>
                <th className="px-4 py-3 text-center border-r border-slate-200 dark:border-slate-850">Attendance Reliab.</th>
                
                {/* Dynamically render detected operation headers */}
                {allDetectedOperations.map(op => {
                  const isFocus = selectedOperation === op;
                  return (
                    <th 
                      key={op} 
                      className={`px-3 py-3 text-center truncate select-none text-[9.5px] max-w-[120px] font-black ${
                        isFocus ? 'bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-200' : ''
                      }`}
                    >
                      {op}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-850">
              {filteredGridEmployees.length === 0 ? (
                <tr>
                  <td colSpan={allDetectedOperations.length + 4} className="py-12 text-center text-slate-405 italic">
                    No active operator records match the selected multi-variable cockpit filters.
                  </td>
                </tr>
              ) : (
                filteredGridEmployees.map(emp => {
                  const liveReliability = calculateAttendanceReliability(emp.id);

                  return (
                    <tr key={emp.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/40 divide-x divide-slate-100 dark:divide-slate-850 transition">
                      {/* Worker Identity Cell Sticky Column */}
                      <td className="px-4 py-2.5 font-bold text-slate-800 dark:text-slate-200 sticky left-0 z-10 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-850 shadow-[2px_0_5px_rgba(0,0,0,0.05)]">
                        <div className="truncate max-w-[160px] text-[11px] font-black">{emp.name}</div>
                        <div className="text-[9px] text-slate-400 font-mono tracking-tight">
                          {emp.id} · <span className="font-semibold text-slate-500">{emp.department}</span>
                        </div>
                      </td>

                      {/* Line location */}
                      <td className="px-3 py-2 text-center font-bold text-slate-600 dark:text-slate-400 font-mono">
                        {emp.lineNumber === 0 ? (
                          <span className="bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded text-[9px]">Floater</span>
                        ) : (
                          `Line ${emp.lineNumber}`
                        )}
                      </td>

                      {/* Overall Efficiency */}
                      <td className="px-3 py-2 text-center font-mono font-bold text-slate-700 dark:text-slate-300">
                        {emp.baseEfficiency}%
                      </td>

                      {/* Attendance Reliability */}
                      <td className="px-3 py-2 text-center font-mono font-bold">
                        <span className={liveReliability < 85 ? 'text-rose-500' : 'text-slate-700 dark:text-slate-300'}>
                          {liveReliability}%
                        </span>
                      </td>

                      {/* Dynamically mapped heat-mapped sewing skill percentages */}
                      {allDetectedOperations.map(op => {
                        const matchingSkill = emp.skills?.find(s => s.operationName.toLowerCase() === op.toLowerCase());
                        const isFocus = selectedOperation === op;
                        
                        // Heatmap cell backgrounds based on Quantitative Competency Percentage
                        let bgClass = 'bg-white dark:bg-slate-900 text-slate-300 dark:text-slate-700';
                        let percentageText = '-';

                        if (matchingSkill) {
                          const prof = matchingSkill.proficiency;
                          percentageText = `${prof}%`;

                          if (prof >= 85) {
                            // Gold specialist
                            bgClass = 'bg-emerald-500 text-white font-black';
                          } else if (prof >= 70) {
                            // Silver Qualified
                            bgClass = 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 font-bold';
                          } else if (prof >= 50) {
                            // Competent
                            bgClass = 'bg-amber-100 text-amber-800 dark:bg-amber-950/45 dark:text-amber-300 font-medium';
                          } else {
                            // Apprentice / Aux
                            bgClass = 'bg-slate-100 text-slate-600 dark:bg-slate-800/80 dark:text-slate-400';
                          }
                        }

                        return (
                          <td 
                            key={op} 
                            className={`px-3 py-2.5 text-center font-mono text-[10.5px] transition-all cursor-default select-none ${bgClass} ${
                              isFocus ? 'ring-2 ring-blue-400 ring-inset' : ''
                            }`}
                          >
                            {percentageText}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* FOOTER LEGEND AND EXOTIC SYNC INFO */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-slate-100 dark:border-slate-800 font-mono text-[9px] text-slate-400">
          <div className="flex flex-wrap gap-4 items-center">
            <span className="font-bold uppercase">Heatmap Legend:</span>
            <div className="flex items-center gap-1.5"><div className="w-3 h-3 bg-emerald-500 rounded-sm"></div> <span className="text-[10px] font-bold">≥ 85% Expert Match</span></div>
            <div className="flex items-center gap-1.5"><div className="w-3 h-3 bg-emerald-100 dark:bg-emerald-950/40 rounded-sm"></div><span className="text-[10px] font-bold">70%-84% Certified</span></div>
            <div className="flex items-center gap-1.5"><div className="w-3 h-3 bg-amber-100 dark:bg-amber-950/45 rounded-sm"></div><span className="text-[10px] font-bold">50%-69% Competent</span></div>
            <div className="flex items-center gap-1.5"><div className="w-3 h-3 bg-slate-100 dark:bg-slate-800 rounded-sm"></div><span className="text-[10px] font-bold">&lt; 50% Apprentice</span></div>
          </div>
          <p className="italic text-slate-500 font-medium select-none">
            Click "Generate Database Sheet" to obtain the live, customizable spreadsheet ledger.
          </p>
        </div>

      </div>

    </div>
  );
};
