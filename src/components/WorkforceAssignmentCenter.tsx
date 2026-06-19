/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { useAppState } from '../contexts/StateContext';
import { Employee, EmployeeAssignment, WorkforceAssignmentStatus, calculateQAPS } from '../types';
import { 
  Users, CheckCircle2, AlertCircle, Shuffle, UserCheck, ArrowRight,
  TrendingUp, Clock, HelpCircle, Briefcase, Zap, Star, Shield, Play,
  Settings, Layers, Search, RefreshCw, Sparkles, Sliders, CalendarDays, Check, X,
  Lock, Unlock, ArrowBigUpDash, Award, Info
} from 'lucide-react';
import { StyleChangeModal } from './StyleChangeModal';
import { motion, AnimatePresence } from 'motion/react';
import { EmployeeAvatar } from './EmployeeAvatar';

const getStatusTheme = (status: WorkforceAssignmentStatus, emp?: Employee) => {
  switch (status) {
    case 'Assigned':
      return {
        bg: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-400',
        badge: 'bg-emerald-500 text-white',
        bullet: 'bg-emerald-500',
        label: 'Assigned & Productive'
      };
    case 'Available for Replacement':
      return {
        bg: 'bg-blue-500/10 border-blue-500/30 text-blue-700 dark:text-blue-400',
        badge: 'bg-blue-500 text-white',
        bullet: 'bg-blue-500',
        label: 'Available for Replacement'
      };
    case 'Training':
    case 'Meeting':
      return {
        bg: 'bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-400',
        badge: 'bg-amber-500 text-neutral-900',
        bullet: 'bg-amber-500',
        label: status
      };
    case 'Quality Audit':
    case 'Maintenance Support':
    case 'Off-Line Activity':
      return {
        bg: 'bg-orange-500/10 border-orange-500/30 text-orange-700 dark:text-orange-400',
        badge: 'bg-orange-500 text-white',
        bullet: 'bg-orange-500',
        label: status
      };
    case 'Unassigned':
    default:
      const isCritical = emp?.skillCategory === 'Grade A Operator' || emp?.skills?.some(s => s.skillLevel === 'Expert');
      if (isCritical) {
        return {
          bg: 'bg-rose-500/10 border-rose-500/30 text-rose-700 dark:text-rose-400 animate-pulse',
          badge: 'bg-rose-500 text-white font-black',
          bullet: 'bg-rose-500',
          label: 'Unassigned Critical Skill'
        };
      }
      return {
        bg: 'bg-slate-500/10 border-slate-500/20 text-slate-600 dark:text-slate-400',
        badge: 'bg-slate-400 text-white',
        bullet: 'bg-slate-400',
        label: 'Unassigned'
      };
  }
};

export const WorkforceAssignmentCenter: React.FC = () => {
  const { 
    employees, 
    attendance, 
    productionLines, 
    employeeAssignments, 
    assignEmployee, 
    currentUser, 
    systemDate,
    assignmentConflicts, 
    preventCalculations, 
    resolveAssignmentConflicts,
    lockedLines, 
    toggleLineLock,
    currentGarment,
    updateLineAllocation,
    lineAllocations,
    garmentStyles,
    getLineRunningStyle
  } = useAppState();

  const today = systemDate;
  const isIEOrAdmin = currentUser?.role === 'Industrial Engineer' || currentUser?.role === 'Admin' || currentUser?.role === 'Production Manager';

  // Core Stages: 'stage1' (Line Allocations & Replacements) | 'stage2' (Operations Assignment)
  const [activeStage, setActiveStage] = useState<'stage1' | 'stage2'>('stage1');
  const [stage2Line, setStage2Line] = useState<number>(1);
  const [showStyleChangeModal, setShowStyleChangeModal] = useState(false);

  // Identify style currently allocated to stage2Line using our centralized hook
  const stage2GarmentStyle = useMemo(() => {
    return getLineRunningStyle(stage2Line);
  }, [stage2Line, getLineRunningStyle]);

  // UI state
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [lineFilter, setLineFilter] = useState<string>('All');
  const [selectedEmpForAssignment, setSelectedEmpForAssignment] = useState<Employee | null>(null);
  const [isManualAssignOpen, setIsManualAssignOpen] = useState(false);
  const [manualAssignLine, setManualAssignLine] = useState<number>(1);
  const [manualAssignOp, setManualAssignOp] = useState<string>('');
  
  // Quick assignment form state
  const [formLine, setFormLine] = useState<number>(1);
  const [formOperation, setFormOperation] = useState<string>('');
  const [formStatus, setFormStatus] = useState<WorkforceAssignmentStatus>('Assigned');
  const [formStartTime, setFormStartTime] = useState('08:00');
  const [formEndTime, setFormEndTime] = useState('17:00');
  const [formAvailableFlag, setFormAvailableFlag] = useState(false);

  // Today's attendance list
  const todayAttendance = useMemo(() => {
    return attendance.filter(r => r.date === today);
  }, [attendance, today]);

  // Filters present employees today based on HR Gate logging (Layer 2)
  const presentEmployees = useMemo(() => {
    const presentIds = new Set(
      todayAttendance
        .filter(r => r.status === 'Present' || r.status === 'Late')
        .map(r => r.employeeId.toUpperCase())
    );
    return employees.filter(emp => {
      if (!presentIds.has(emp.id.toUpperCase())) return false;
      const dept = (emp.department || '').toLowerCase();
      // Only include Sewing, Floater, and Finishing departments for active operational mapping
      return dept === 'sewing' || dept === 'floater' || dept.includes('finishing') || emp.lineNumber === 99 || emp.productionWorkforceEligible;
    });
  }, [employees, todayAttendance]);

  // Aggregate Metrics variables:
  const stats = useMemo(() => {
    const totalPresent = presentEmployees.length;
    const assignedWithOp = presentEmployees.filter(e => e.workforceAssignmentStatus === 'Assigned' && e.operationAssignment).length;
    const available = presentEmployees.filter(
      e => e.workforceAssignmentStatus === 'Unassigned' || e.workforceAssignmentStatus === 'Available for Replacement' || !e.operationAssignment
    ).length;

    let totalShortage = 0;
    productionLines.forEach(line => {
      // Find how many operators are officially assigned to this line and present
      const count = presentEmployees.filter(e => e.lineNumber === line.id && e.workforceAssignmentStatus === 'Assigned').length;
      const deficiency = line.requiredManpower - count;
      if (deficiency > 0) {
        totalShortage += deficiency;
      }
    });

    const utilizationRate = totalPresent > 0 ? Math.round((assignedWithOp / totalPresent) * 100) : 0;

    return {
      totalPresent,
      assigned: assignedWithOp,
      available,
      totalShortage,
      utilizationRate
    };
  }, [presentEmployees, productionLines]);

  // Filtered Present Employees registry for search
  const filteredEmployeesList = useMemo(() => {
    return presentEmployees.filter(emp => {
      const matchesSearch = emp.id.toLowerCase().includes(searchTerm.toLowerCase()) || 
                            emp.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                            emp.department.toLowerCase().includes(searchTerm.toLowerCase()) ||
                            emp.skills.some(s => s.operationName.toLowerCase().includes(searchTerm.toLowerCase()));
      
      const currentStatus = emp.workforceAssignmentStatus || 'Unassigned';
      const matchesStatus = statusFilter === 'All' || currentStatus === statusFilter;
      
      const matchesLine = lineFilter === 'All' || emp.lineNumber.toString() === lineFilter;

      return matchesSearch && matchesStatus && matchesLine;
    });
  }, [presentEmployees, searchTerm, statusFilter, lineFilter]);

  // Drag and drop handler to map replacement
  const handleDragStart = (e: React.DragEvent, id: string) => {
    if (!isIEOrAdmin) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.setData('text/plain', id);
  };

  const handleDropToLine = (e: React.DragEvent, lineId: number) => {
    e.preventDefault();
    if (!isIEOrAdmin) return;
    if (lockedLines.includes(lineId)) return;

    const empId = e.dataTransfer.getData('text/plain');
    if (!empId) return;

    const emp = presentEmployees.find(o => o.id.toUpperCase() === empId.toUpperCase());
    if (emp) {
      // Prompt quick deployment without assuming operation
      setSelectedEmpForAssignment(emp);
      setFormLine(lineId);
      setFormOperation('');
      setFormStatus('Assigned');
    }
  };

  const handleSelectEmpForAssignment = (emp: Employee) => {
    if (!isIEOrAdmin) return;
    const todayAsg = employeeAssignments.find(
      a => a.employeeId.toUpperCase() === emp.id.toUpperCase() && a.assignmentDate === today
    );

    setSelectedEmpForAssignment(emp);
    setFormLine(emp.lineNumber || 1);
    setFormOperation(todayAsg?.assignedOperation || '');
    setFormStatus(emp.workforceAssignmentStatus || 'Assigned');
  };

  const handleConfirmAssignment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmpForAssignment) return;

    assignEmployee(
      selectedEmpForAssignment.id,
      formLine,
      formOperation, // Controlled strictly by input
      formStatus,
      formStartTime,
      formEndTime,
      formAvailableFlag,
      'IE Manual Center'
    );

    // Also synchronise to our persistent line allocations
    updateLineAllocation(
      selectedEmpForAssignment.id,
      formLine,
      formOperation,
      formStatus,
      'IE manual reassignment'
    );

    setSelectedEmpForAssignment(null);
  };

  // Stage 1 Replacement Candidate suggestions with 5 required supporting metrics
  const getLineReplacementCandidatesList = (lineId: number, bottleneckOp: string) => {
    const availablePool = presentEmployees.filter(emp => {
      // Filter out those already assigned on lines
      return emp.lineNumber === 99 || emp.lineNumber === 0 || emp.workforceAssignmentStatus === 'Available for Replacement';
    });

    return availablePool.map(emp => {
      const skillDetail = emp.skills.find(s => s.operationName.toLowerCase() === bottleneckOp.toLowerCase());
      const hasDirectSkill = !!skillDetail;
      const bestSkill = skillDetail || emp.skills[0];

      const proficiency = bestSkill ? bestSkill.proficiency : 40;
      const historicalEff = emp.baseEfficiency || 72;
      const attendanceReliability = emp.attendanceReliability || emp.historicalAttendanceRate || 94;
      const defectRateVal = emp.defectRate !== undefined ? emp.defectRate : 2.5;

      const lineGarment = getLineRunningStyle(lineId);
      const avgPcsProduced = emp.avgPcsProducedPerDay || Math.round((60 / (lineGarment?.smv || 1.15)) * (historicalEff / 100) * 8 * 0.85);

      const qaps = calculateQAPS(proficiency, historicalEff, attendanceReliability, defectRateVal, avgPcsProduced);
      const matchScore = qaps;

      const expectedProdGain = hasDirectSkill ? Math.round((historicalEff - 60) / 4) : 0;

      return {
        employee: emp,
        skillDetail: bestSkill,
        score: matchScore,
        metrics: {
          skillMatch: proficiency,
          historicalEfficiency: historicalEff,
          avgPcsProduced,
          attendanceReliability,
          defectRate: defectRateVal,
          expectedProdGain
        }
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
  };

  // Suggestion Engine for Manual Operation Assignment
  const getOperatorsByEfficiencyForOp = (lineNum: number, opName: string) => {
    if (!opName) return [];
    
    // Filter present operators across all lines / pools,
    // excluding those who are already assigned to any active operation (except empty or Unassigned)
    const eligibleOperators = presentEmployees.filter(emp => {
      const hasActiveAssignment = emp.operationAssignment && 
                                  emp.operationAssignment.trim() !== '' && 
                                  emp.operationAssignment.toLowerCase() !== 'unassigned';
      return !hasActiveAssignment;
    });
    
    const candidates = eligibleOperators.map(emp => {
      const isCorrectLine = emp.lineNumber === lineNum;
      const opLower = opName.toLowerCase();
      // Find direct matches in their skill matrix
      const directSkill = emp.skills.find(s => s.operationName.toLowerCase() === opLower);
      let efficiency = 0;
      let matchType: 'Direct Match' | 'Partial Match' | 'Baseline Dynamic' = 'Baseline Dynamic';
      let skillDetail = directSkill;

      if (directSkill) {
        efficiency = directSkill.proficiency;
        matchType = 'Direct Match';
      } else {
        // Look for partial matches (e.g. "Collar Stitch" and "Collar Join")
        const partialSkill = emp.skills.find(s => {
          const sName = s.operationName.toLowerCase();
          return sName.includes(opLower) || opLower.includes(sName);
        });
        if (partialSkill) {
          efficiency = Math.round(partialSkill.proficiency * 0.9); // Small 10% penalty
          matchType = 'Partial Match';
          skillDetail = partialSkill;
        } else {
          // Fallback to operator's general base efficiency with a learning curve deduction
          efficiency = Math.round((emp.baseEfficiency || 54) * 0.7);
          matchType = 'Baseline Dynamic';
        }
      }

      const isAssignedElsewhere = !!emp.operationAssignment && emp.operationAssignment !== opName;

      const attendance = emp.attendanceReliability || emp.historicalAttendanceRate || 95;
      const defectRateVal = emp.defectRate !== undefined ? emp.defectRate : 2.5;
      const avgPcs = emp.avgPcsProducedPerDay || 100;
      const qaps = calculateQAPS(efficiency, emp.baseEfficiency || 70, attendance, defectRateVal, avgPcs);

      return {
        employee: emp,
        efficiency,
        matchType,
        skillDetail,
        isAssignedElsewhere,
        currentAssignment: emp.operationAssignment,
        qaps,
        defectRate: defectRateVal,
        isFromOtherLine: !isCorrectLine
      };
    });

    // Rank candidates by Quality-Adjusted Performance Score (QAPS) descending
    return candidates.sort((a, b) => b.qaps - a.qaps);
  };

  // Stage 1: Line Cards computations
  const lineDeficiencies = useMemo(() => {
    return productionLines.map(line => {
      const activeOpsOnLine = presentEmployees.filter(emp => emp.lineNumber === line.id && emp.workforceAssignmentStatus === 'Assigned');
      const count = activeOpsOnLine.length;
      const deficiency = line.requiredManpower - count;
      const bottleneckOp = line.bottleneckOperation || 'Sewing';

      return {
        line,
        activeCount: count,
        deficiency,
        bottleneckOp
      };
    });
  }, [productionLines, presentEmployees]);

  return (
    <div className="flex-1 overflow-y-auto px-4 lg:px-8 py-6 space-y-6 max-h-[calc(100vh-80px)] custom-scrollbar bg-slate-50 dark:bg-slate-905">
      
      {/* SECTION HEADER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200/50 dark:border-slate-800/60 pb-5">
        <div>
          <span className="bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-400 font-mono text-[9px] px-2.5 py-0.5 rounded-full uppercase tracking-wider font-bold">
            IE WORKFORCE DEPLOYMENT CENTER
          </span>
          <h1 className="font-display font-black text-2xl text-slate-800 dark:text-neutral-100 flex items-center gap-2 mt-1">
            <Shuffle className="w-6 h-6 text-blue-500 animate-spin-slow" />
            <span>Workforce Assignment Center</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Authoratative Industrial Engineering platform. Control employee line ownership, replacements, and manually map operators to operations.
          </p>
        </div>
        <div className="flex items-center gap-1.5 self-end md:self-center font-mono text-[10px] text-slate-400 px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 shadow-sm">
          <Clock className="w-3.5 h-3.5 text-blue-500" />
          <span>Active Shift Date: <strong className="text-slate-700 dark:text-slate-300">{systemDate}</strong></span>
        </div>
      </div>

      {/* CORE DUAL-STAGE TAB SWITCHER */}
      <div className="flex border-b border-slate-200 dark:border-slate-800 pb-px">
        <div className="flex gap-4">
          <button
            type="button"
            onClick={() => setActiveStage('stage1')}
            className={`pb-3 text-xs font-bold relative transition ${activeStage === 'stage1' ? 'text-blue-500 border-b-2 border-blue-500' : 'text-slate-450 hover:text-slate-750'}`}
          >
            Stage 1: Line Deployment & Replacement Pool
          </button>
          <button
            type="button"
            onClick={() => setActiveStage('stage2')}
            className={`pb-3 text-xs font-bold relative transition ${activeStage === 'stage2' ? 'text-blue-500 border-b-2 border-blue-500' : 'text-slate-450 hover:text-slate-750'}`}
          >
            Stage 2: Operation Assignment Management (IE Controlled)
          </button>
        </div>
      </div>

      {/* SUB-HEADER AGGREGATE METRICS SUMMARY BAR */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {[
          { label: 'Present Today', value: stats.totalPresent, desc: 'attendance roster list', icon: Users, color: 'text-slate-500 dark:text-slate-400' },
          { label: 'Currently Assigned', value: stats.assigned, desc: 'active on machines', icon: CheckCircle2, color: 'text-emerald-500' },
          { label: 'Floaters & Standby', value: stats.available, desc: 'unassigned available pool', icon: Briefcase, color: 'text-blue-500' },
          { label: 'Active Deficiencies', value: stats.totalShortage, desc: 'across all production lines', icon: AlertCircle, color: stats.totalShortage > 0 ? 'text-amber-500 animate-pulse' : 'text-slate-400' },
          { label: 'Deployment Yield', value: `${stats.utilizationRate}%`, desc: 'assigned efficiency yield', icon: TrendingUp, color: 'text-slate-900 dark:text-neutral-200 font-bold' }
        ].map((m, i) => (
          <div key={i} className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-4 rounded-2xl flex items-center justify-between shadow-sm">
            <div className="space-y-1">
              <span className="text-[10px] text-slate-400 font-bold tracking-tight uppercase block leading-none">{m.label}</span>
              <strong className={`text-xl font-black block leading-none ${m.color}`}>{m.value}</strong>
              <span className="text-[9px] text-slate-400 block font-mono">{m.desc}</span>
            </div>
            <m.icon className="w-5 h-5 text-slate-300" />
          </div>
        ))}
      </div>

      {/* ========================================================
          STAGE 1: PRESENT OPERATORS REGISTER
          ======================================================== */}
      {activeStage === 'stage1' && (
        <div className="space-y-6 max-w-4xl mx-auto w-full">
          {/* Stage 1: Active Replacement Registry & Search */}
          <div className="space-y-4 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl p-6 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-5">
              <div className="space-y-1">
                <div className="flex items-center gap-1.5">
                  <Users className="w-4.5 h-4.5 text-blue-500 animate-pulse" />
                  <h2 className="font-display font-bold text-slate-800 dark:text-neutral-100 text-sm">Present Operators Database</h2>
                </div>
                <p className="text-xs text-slate-400">
                  Real-time register of deployed and available line operations personnel. Click an operator to manually adjust assignments.
                </p>
              </div>

              <div className="flex gap-2 items-center">
                <div className="relative w-64">
                  <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-slate-400" />
                  <input 
                    type="text" 
                    placeholder="Search and filter..." 
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 rounded-xl text-xs bg-slate-50 dark:bg-slate-950 border border-slate-205 text-slate-700 dark:text-slate-300 focus:outline-none"
                  />
                </div>
                
                <select
                  value={statusFilter}
                  onChange={e => setStatusFilter(e.target.value)}
                  className="text-xs bg-slate-50 dark:bg-slate-950 border border-slate-205 pl-2 pr-6 py-1.5 rounded-xl text-slate-600 dark:text-slate-400 focus:outline-none"
                >
                  <option value="All">All statuses</option>
                  <option value="Assigned">Assigned</option>
                  <option value="Unassigned">Unassigned</option>
                  <option value="Available for Replacement">Available</option>
                </select>
              </div>
            </div>

            {/* Register container list */}
            <div className="max-h-[600px] overflow-y-auto space-y-2 pr-1">
              {filteredEmployeesList.length === 0 ? (
                <div className="text-center p-8 text-slate-400">
                  No present operators matched search filter.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {filteredEmployeesList.map(emp => {
                    const theme = getStatusTheme(emp.workforceAssignmentStatus || 'Unassigned', emp);
                    
                    return (
                      <div
                        key={emp.id}
                        draggable={isIEOrAdmin}
                        onDragStart={e => handleDragStart(e, emp.id)}
                        onClick={() => handleSelectEmpForAssignment(emp)}
                        className={`p-3.5 rounded-2xl border flex items-center justify-between gap-3 text-left transition ${
                          isIEOrAdmin ? 'cursor-pointer active:cursor-grabbing hover:shadow-md hover:border-slate-300' : ''
                        } ${theme.bg}`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <EmployeeAvatar photoUrl={emp.photoUrl} name={emp.name} className="w-9 h-9 rounded-full flex-shrink-0" />
                          <div className="min-w-0">
                            <strong className="block text-xs font-bold text-slate-850 dark:text-neutral-200 truncate">{emp.name}</strong>
                            <span className="text-[9.5px] font-mono block text-slate-400 mt-0.5">
                              ID: {emp.id} · {emp.department} · {emp.lineNumber === 99 ? 'Floater' : emp.lineNumber > 0 ? `Line 0${emp.lineNumber}` : 'Unassigned'}
                            </span>
                          </div>
                        </div>

                        <div className="flex flex-col items-end gap-1 flex-shrink-0">
                          <span className={`px-2 py-0.5 rounded-full text-[8.5px] font-bold font-mono ${theme.badge}`}>
                            {theme.label}
                          </span>
                          {emp.operationAssignment && (
                            <span className="text-[8.5px] font-bold font-mono text-orange-655 max-w-[90px] truncate block text-amber-600">
                              🛠️ {emp.operationAssignment}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          STAGE 2: AUTHORITATIVE OPERATION ASSIGNMENT MANAGEMENT
          ======================================================== */}
      {activeStage === 'stage2' && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl p-6 space-y-6">
            
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-5">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400 font-mono text-[9px] px-2.5 py-0.5 rounded-full uppercase tracking-wider font-bold">
                    Authoritative Deployment Matching
                  </span>
                </div>
                <h2 className="font-display font-bold text-slate-800 dark:text-neutral-100 text-base">
                  Manual Operation Assignments: {productionLines.find(l => l.id === stage2Line)?.name || `Line 0${stage2Line}`}
                </h2>
                <p className="text-[11.5px] text-slate-400 max-w-xl">
                  Select a Production Line below. For every sequence operation in the active style, you must manually associate an operator. Operations with no IE assignments are set as <strong className="text-red-500">Vacant</strong>.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                {/* Manual Assign Button with Suggestions */}
                <button
                  type="button"
                  onClick={() => {
                    setManualAssignLine(stage2Line);
                    setManualAssignOp('');
                    setIsManualAssignOpen(true);
                  }}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs rounded-xl flex items-center gap-2 transition active:scale-95 shadow-md shadow-blue-500/10 cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5 text-white animate-pulse" />
                  <span>Manual Assign Wizard</span>
                </button>

                {/* Line Selector Buttons */}
                <div className="flex flex-wrap gap-1.5 bg-slate-50 dark:bg-slate-950 p-1.5 rounded-xl border border-slate-150">
                  {productionLines.map(line => (
                    <button
                      key={line.id}
                      type="button"
                      onClick={() => setStage2Line(line.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition active:scale-95 ${stage2Line === line.id ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-850'}`}
                    >
                      Line {line.id < 10 ? `0${line.id}` : line.id}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Style Details */}
            <div className="flex bg-slate-50 dark:bg-slate-950/20 p-4 rounded-2xl gap-4 items-center justify-between flex-wrap sm:flex-nowrap border border-slate-150 w-full animate-fade-in mb-2">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-blue-500/10 text-blue-600 rounded-xl">
                  <Award className="w-7 h-7" />
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] text-slate-400 font-mono tracking-tight uppercase">Currently Assembled Garment Style:</span>
                  <strong className="block text-sm font-black text-slate-800 dark:text-slate-100">
                    {stage2GarmentStyle?.id || 'STY-POLO-001'} · {stage2GarmentStyle?.name || 'Standard Cotton Polo'}
                  </strong>
                  <p className="text-xs text-slate-400">
                    Total SMV: <strong className="text-slate-650 dark:text-slate-350 font-mono">{stage2GarmentStyle?.smv || 1.15} mins</strong> · Target Manpower count: <strong className="text-slate-650 dark:text-slate-350 font-mono">{stage2GarmentStyle?.requiredManpower || 30} Specialists</strong>
                  </p>
                </div>
              </div>
              {isIEOrAdmin && (
                <div className="shrink-0 select-none">
                  <button
                    type="button"
                    onClick={() => setShowStyleChangeModal(true)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs rounded-xl shadow-md shadow-blue-500/15 transition-all cursor-pointer hover:-translate-y-0.5 active:translate-y-0"
                  >
                    <RefreshCw className="h-3 w-3 animate-spin-slow text-white" />
                    <span>Change Garment Style</span>
                  </button>
                </div>
              )}
            </div>

            {/* List of active line operators as per the official imported file */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              
              {/* Left Column: List of operators INGESTED for this specific Line */}
              <div className="md:col-span-1 space-y-3.5 border-r border-slate-100 dark:border-slate-800 pr-6">
                <div>
                  <h3 className="font-display font-semibold text-slate-800 dark:text-neutral-200 text-xs flex items-center gap-1.5">
                    <Users className="w-4 h-4 text-slate-400" />
                    <span>Allocated Line Operators (Present)</span>
                  </h3>
                  <p className="text-[10px] text-slate-400 mt-0.5">Ingested from the official line layout spreadsheet:</p>
                </div>

                <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
                  {presentEmployees
                    .filter(emp => emp.lineNumber === stage2Line)
                    .map(emp => {
                      const isMapped = !!emp.operationAssignment;
                      return (
                        <div 
                          key={emp.id} 
                          className={`p-2.5 rounded-xl border flex items-center justify-between text-xs transition ${
                            isMapped ? 'bg-slate-50/50 dark:bg-slate-900 border-slate-150 text-slate-450 dark:border-slate-850' : 'bg-white dark:bg-slate-900 border-slate-205 shadow-xs'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <EmployeeAvatar photoUrl={emp.photoUrl} name={emp.name} className="w-7- h-7 rounded-full flex-shrink-0" />
                            <div className="min-w-0">
                              <strong className="block font-bold text-slate-800 truncate dark:text-slate-200 leading-tight">{emp.name}</strong>
                              <span className="text-[9px] font-mono text-slate-400">ID: {emp.id} · Skill: {emp.skills[0]?.skillLevel || 'Advanced'}</span>
                            </div>
                          </div>
                          <div>
                            {isMapped ? (
                              <span className="text-[8.5px] font-mono font-bold text-purple-600 bg-purple-50 dark:bg-purple-950/20 px-2 py-0.5 rounded-md truncate max-w-[80px] block">
                                {emp.operationAssignment}
                              </span>
                            ) : (
                              <span className="text-[8.5px] font-mono font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md block">
                                Idle
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>

              {/* Right Column: Garment Style Operation cards and manual line deployment dropdown mapping */}
              <div className="md:col-span-2 space-y-4">
                <div>
                  <h3 className="font-display font-semibold text-slate-800 dark:text-neutral-200 text-xs">
                    Garment Operation Assembly Tree
                  </h3>
                  <p className="text-[10px] text-slate-400 mt-0.5">Directly map personnel to operations manually. Blank allocations represent vacancy:</p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-h-[450px] overflow-y-auto pr-2">
                  {(stage2GarmentStyle?.operations || []).map((op, idx) => {
                    // Find actual staff mapped to this operation on this line for today
                    const assignedStaff = presentEmployees.find(
                      emp => emp.lineNumber === stage2Line && 
                             emp.operationAssignment === op.name
                    );

                    // List of eligible staff on this line who aren't currently mapped
                    const unmappedLineStaff = presentEmployees.filter(
                      emp => emp.lineNumber === stage2Line && 
                             (!emp.operationAssignment || emp.operationAssignment === op.name)
                    );

                    return (
                      <div 
                        key={idx} 
                        className={`p-4 rounded-2xl border transition flex flex-col justify-between gap-3.5 ${
                          assignedStaff 
                            ? 'bg-white border-slate-205 dark:bg-slate-900 shadow-sm' 
                            : 'bg-rose-50/20 border-rose-205 dark:bg-rose-950/5'
                        }`}
                      >
                        {/* Operation Details */}
                        <div className="space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="font-mono text-[9px] font-extrabold text-blue-500">{op.operationCode}</span>
                            <span className="font-mono text-[9.5px] text-slate-400">SMV: {op.smv}m</span>
                          </div>
                          <strong className="block text-xs font-black text-slate-800 dark:text-slate-100">{op.name}</strong>
                          <div className="flex items-center justify-between text-[9.5px] font-mono">
                            <span className="text-slate-400">Machine: {op.machineType || 'Manual Stitch'}</span>
                            <button
                              type="button"
                              onClick={() => {
                                setManualAssignLine(stage2Line);
                                setManualAssignOp(op.name);
                                setIsManualAssignOpen(true);
                              }}
                              className="text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 font-bold flex items-center gap-1 transition-colors cursor-pointer"
                            >
                              <Sparkles className="w-3 h-3" />
                              <span>Suggest Operator</span>
                            </button>
                          </div>
                        </div>

                        {/* Assigned Staff or Vacant indicator */}
                        <div className="bg-slate-50/50 p-2.5 rounded-xl border border-slate-150/40 dark:bg-slate-950/20">
                          {assignedStaff ? (
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2 min-w-0">
                                <EmployeeAvatar photoUrl={assignedStaff.photoUrl} name={assignedStaff.name} className="w-8 h-8 rounded-full" />
                                <div className="min-w-0">
                                  <strong className="block text-[11px] font-bold text-slate-800 dark:text-neutral-200 truncate">{assignedStaff.name}</strong>
                                  <span className="text-[8.5px] font-mono text-slate-400">ID: {assignedStaff.id} · Exp: {assignedStaff.experience}y</span>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => assignEmployee(assignedStaff.id, stage2Line, '', 'Unassigned', '08:00', '17:00', true, 'IE Operation Vacated')}
                                className="p-1 px-2 hover:bg-red-50 text-red-500 rounded font-mono text-[9px] font-bold transition active:scale-95 hover:border hover:border-red-200"
                              >
                                Clear
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center justify-between">
                              <span className="text-rose-505 dark:text-rose-400 font-extrabold text-[10px] px-2 py-0.5 rounded bg-rose-500/10 text-rose-500 font-mono">
                                🔒 Vacant Operation
                              </span>
                              
                              {/* Option selection box */}
                              <select
                                value=""
                                onChange={e => {
                                  if (e.target.value) {
                                    assignEmployee(e.target.value, stage2Line, op.name, 'Assigned', '08:00', '17:00', false, 'IE Explicit Matching');
                                  }
                                }}
                                className="text-[10px] bg-white border border-slate-205 pl-2 pr-6 py-1 rounded focus:outline-none max-w-[130px]"
                              >
                                <option value="">Deploy Operator</option>
                                {unmappedLineStaff.map(emp => (
                                  <option key={emp.id} value={emp.id}>{emp.name}</option>
                                ))}
                              </select>
                            </div>
                          )}
                        </div>

                      </div>
                    );
                  })}
                </div>
              </div>

            </div>

          </div>
        </div>
      )}

      {/* DYNAMIC FORM DRAWER MODAL COMPONENT */}
      <AnimatePresence>
        {selectedEmpForAssignment && (
          <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40 backdrop-blur-xs">
            {/* Modal backdrop filler click triggers close */}
            <div 
              className="absolute inset-0" 
              onClick={() => setSelectedEmpForAssignment(null)} 
            />

            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'tween', duration: 0.25 }}
              className="relative w-full max-w-sm h-full bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 shadow-2xl p-6 overflow-y-auto flex flex-col justify-between"
            >
              <div className="space-y-6">
                
                {/* Form header */}
                <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800/80 pb-4">
                  <div>
                    <h3 className="font-display font-bold text-slate-850 dark:text-neutral-100 text-sm">Deploy Operator manually</h3>
                    <p className="text-[10.5px] text-slate-400 mt-0.5">Authoritative IE staffing deployment</p>
                  </div>
                  <button 
                    type="button" 
                    onClick={() => setSelectedEmpForAssignment(null)}
                    className="p-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-805 transition text-slate-400"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Short employee info template */}
                <div className="bg-slate-50 dark:bg-slate-850 p-4 rounded-2xl border border-slate-100 dark:border-slate-750/30 flex items-center gap-3">
                  <EmployeeAvatar 
                    photoUrl={selectedEmpForAssignment.photoUrl} 
                    name={selectedEmpForAssignment.name} 
                    className="w-11 h-11 rounded-full" 
                  />
                  <div className="min-w-0 flex-1">
                    <strong className="block text-xs font-bold text-slate-800 dark:text-slate-101 truncate">{selectedEmpForAssignment.name}</strong>
                    <span className="text-[10px] text-slate-400 font-mono font-medium">ID: {selectedEmpForAssignment.id} · {selectedEmpForAssignment.department}</span>
                  </div>
                </div>

                {/* Form fields */}
                <form onSubmit={handleConfirmAssignment} className="space-y-4 text-xs">
                  
                  {/* Select line */}
                  <div className="space-y-1">
                    <label className="font-bold text-slate-700 dark:text-slate-350">Target Production Line</label>
                    <select
                      value={formLine}
                      onChange={e => {
                        const val = parseInt(e.target.value);
                        setFormLine(val);
                        if (val === 0) setFormStatus('Unassigned');
                      }}
                      className="w-full bg-white dark:bg-slate-850 border border-slate-205 dark:border-slate-800 p-2.5 rounded-xl text-slate-700 dark:text-slate-200 focus:ring-1 focus:ring-blue-500 text-xs"
                    >
                      <option value="0">Offline / Stand-By Utility</option>
                      {productionLines.map(line => (
                        <option key={line.id} value={line.id}>Line {line.id < 10 ? `0${line.id}` : line.id} - {line.supervisor}'s Cell</option>
                      ))}
                    </select>
                  </div>

                  {/* Operation manual input */}
                  <div className="space-y-1">
                    <label className="font-bold text-slate-700 dark:text-slate-350">Assembly Operation (No fallback defaults)</label>
                    <input 
                      type="text" 
                      list="ops_helper"
                      value={formOperation}
                      onChange={e => setFormOperation(e.target.value)}
                      placeholder="e.g. Collar Join (Will be Vacant if empty)"
                      className="w-full bg-white dark:bg-slate-850 border border-slate-205 dark:border-slate-800 p-2.5 rounded-xl text-slate-700 dark:text-slate-200 focus:ring-1 focus:ring-blue-500 text-xs font-mono"
                    />
                    <datalist id="ops_helper">
                      {(() => {
                        const formLineStyle = getLineRunningStyle(formLine);
                        return (formLineStyle?.operations || []).map((o, i) => (
                          <option key={i} value={o.name} />
                        ));
                      })()}
                    </datalist>
                  </div>

                  {/* Deployment status dropdown */}
                  <div className="space-y-1">
                    <label className="font-bold text-slate-700 dark:text-slate-350">Workforce Assignment Status</label>
                    <select
                      value={formStatus}
                      onChange={e => setFormStatus(e.target.value as WorkforceAssignmentStatus)}
                      className="w-full bg-white dark:bg-slate-850 border border-slate-205 dark:border-slate-800 p-2.5 rounded-xl text-slate-700 dark:text-slate-200 focus:ring-1 focus:ring-blue-500 text-xs"
                    >
                      <option value="Assigned">Assigned & Productive</option>
                      <option value="Available for Replacement">Available for Replacement</option>
                      <option value="Training">Training</option>
                      <option value="Meeting">Meeting</option>
                      <option value="Unassigned">Unassigned</option>
                    </select>
                  </div>

                  {/* Submit / Cancel Buttons */}
                  <div className="flex gap-2 pt-4">
                    <button
                      type="button"
                      onClick={() => setSelectedEmpForAssignment(null)}
                      className="flex-1 py-3 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 text-slate-500 rounded-xl font-bold transition active:scale-95"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-md transition active:scale-95"
                    >
                      Confirm Mapping
                    </button>
                  </div>

                </form>
              </div>

            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* DYNAMIC MANUAL MATCH SUGGESTION WIZARD COMPONENT */}
      <AnimatePresence>
        {isManualAssignOpen && (
          <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40 backdrop-blur-xs">
            <div 
              className="absolute inset-0" 
              onClick={() => setIsManualAssignOpen(false)} 
            />

            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'tween', duration: 0.25 }}
              className="relative w-full max-w-md h-full bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 shadow-2xl p-6 overflow-y-auto flex flex-col justify-between"
            >
              <div className="space-y-6">
                
                {/* Form header */}
                <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800/80 pb-4">
                  <div>
                    <h3 className="font-display font-black text-slate-850 dark:text-neutral-100 text-sm">IE Manual Operation Matcher</h3>
                    <p className="text-[10.5px] text-slate-400 mt-0.5">Deploy best matching on-line workers based on skill efficiency</p>
                  </div>
                  <button 
                    type="button" 
                    onClick={() => setIsManualAssignOpen(false)}
                    className="p-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-805 transition text-slate-400"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="space-y-4 text-xs">
                  {/* Select line */}
                  <div className="space-y-1">
                    <label className="font-bold text-slate-700 dark:text-slate-350">Production Line</label>
                    <select
                      value={manualAssignLine}
                      onChange={e => {
                        const lineVal = parseInt(e.target.value);
                        setManualAssignLine(lineVal);
                      }}
                      className="w-full bg-white dark:bg-slate-850 border border-slate-205 dark:border-slate-800 p-2.5 rounded-xl text-slate-700 dark:text-slate-200 focus:ring-1 focus:ring-blue-500 text-xs font-semibold"
                    >
                      {productionLines.map(line => (
                        <option key={line.id} value={line.id}>Line {line.id < 10 ? `0${line.id}` : line.id} - {line.supervisor}'s Cell</option>
                      ))}
                    </select>
                  </div>

                  {/* Operation select */}
                  <div className="space-y-1">
                    <label className="font-bold text-slate-700 dark:text-slate-350">Garment Operation to Staff</label>
                    <select
                      value={manualAssignOp}
                      onChange={e => setManualAssignOp(e.target.value)}
                      className="w-full bg-white dark:bg-slate-850 border border-slate-205 dark:border-slate-800 p-2.5 rounded-xl text-slate-700 dark:text-slate-200 focus:ring-1 focus:ring-blue-500 text-xs font-semibold"
                    >
                      <option value="">-- Click to choose style operation --</option>
                      {(() => {
                        const manualAssignLineStyle = getLineRunningStyle(manualAssignLine);
                        return (manualAssignLineStyle?.operations || []).map((o, i) => (
                          <option key={i} value={o.name}>{o.operationCode} - {o.name} (SMV: {o.smv}m)</option>
                        ));
                      })()}
                    </select>
                  </div>

                  {/* Suggestion Engine Output */}
                  {manualAssignOp && (
                    <div className="space-y-4 pt-2">
                      <div className="flex items-center justify-between border-t border-slate-100 dark:border-slate-850 pt-3">
                        <span className="text-[10px] font-bold text-slate-450 uppercase tracking-tight block">🧠 Efficiency Matching Suggestions</span>
                        <span className="text-[9.5px] text-blue-500 font-mono font-bold">Line 0{manualAssignLine}</span>
                      </div>

                      {(() => {
                        const candidates = getOperatorsByEfficiencyForOp(manualAssignLine, manualAssignOp);
                        if (candidates.length === 0) {
                          return (
                            <div className="text-center p-6 bg-slate-50 dark:bg-slate-950/40 border border-dashed border-slate-200 dark:border-slate-850 rounded-2xl text-[11px] text-slate-400 italic">
                              No present operators are currently allocated to Line 0{manualAssignLine} today. Please assign rosters first in Stage 1.
                            </div>
                          );
                        }

                        const bestCandidate = candidates[0];
                        const alternateCandidates = candidates.slice(1);

                        const getLineLabel = (lineNo: number) => {
                          if (lineNo === 99) return 'Floater Pool';
                          if (lineNo === 0) return 'Unassigned';
                          return `Line 0${lineNo}`;
                        };

                        return (
                          <div className="space-y-4">
                            {/* Best Rec Banner Layout */}
                            <div className="bg-blue-50/40 dark:bg-blue-950/20 border border-blue-200/50 dark:border-blue-800/40 p-4 rounded-2xl space-y-3 shadow-xs relative">
                              <span className="absolute top-0 right-0 bg-blue-600 text-white text-[8px] font-mono font-black uppercase px-2 py-0.5 rounded-bl-xl rounded-tr-none">
                                Suggested Best Match
                              </span>

                              <div className="flex items-start gap-3">
                                <EmployeeAvatar photoUrl={bestCandidate.employee.photoUrl} name={bestCandidate.employee.name} className="w-10 h-10 rounded-full border border-blue-200 border-solid" />
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <strong className="block text-xs font-black text-slate-850 dark:text-neutral-100 truncate">{bestCandidate.employee.name}</strong>
                                    {bestCandidate.isFromOtherLine && (
                                      <span className="inline-block text-[8px] font-extrabold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 px-1.5 py-0.2 rounded font-mono">
                                        {getLineLabel(bestCandidate.employee.lineNumber)}
                                      </span>
                                    )}
                                  </div>
                                  <span className="text-[10px] text-slate-400 block mt-0.5">
                                    Grade: {bestCandidate.employee.skillCategory} · Experience: {bestCandidate.employee.experience} yrs
                                  </span>
                                  
                                  {/* Efficiency type match indicators */}
                                  <div className="flex flex-wrap gap-1 mt-1.5">
                                    <span className={`inline-block text-[9px] font-mono font-bold px-2 py-0.5 rounded-full ${
                                      bestCandidate.matchType === 'Direct Match' 
                                        ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400' 
                                        : bestCandidate.matchType === 'Partial Match' 
                                          ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400' 
                                          : 'bg-slate-100 text-slate-650 dark:bg-slate-900 dark:text-slate-400'
                                    }`}>
                                      {bestCandidate.matchType} ({bestCandidate.efficiency}% Skill Match)
                                    </span>
                                    <span className="inline-block text-[9px] font-mono font-extrabold bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-400 px-2 py-0.5 rounded-full">
                                      QAPS: {bestCandidate.qaps}/100
                                    </span>
                                    <span className={`inline-block text-[9px] font-mono font-bold px-2 py-0.5 rounded-full ${
                                      bestCandidate.defectRate > 4 ? 'bg-rose-55/10 text-rose-600' : 'bg-slate-100 text-slate-600 dark:bg-slate-900'
                                    }`}>
                                      Defects: {bestCandidate.defectRate}%
                                    </span>
                                  </div>
                                </div>

                                <div className="text-right">
                                  <span className="text-[10px] text-slate-455 block font-mono">Simulated QAPS</span>
                                  <strong className="text-lg font-black text-blue-600 dark:text-blue-400">{bestCandidate.qaps}/100</strong>
                                </div>
                              </div>

                              {/* Warning if already deployed to another operation on this shift */}
                              {bestCandidate.isAssignedElsewhere && (
                                <div className="bg-amber-500/10 text-amber-600 dark:text-amber-400 rounded-lg p-2 text-[10px] flex items-center gap-1.5 font-semibold leading-relaxed">
                                  <AlertCircle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                                  <span>Operator is currently mapped to <strong className="text-amber-700 dark:text-amber-300">{bestCandidate.currentAssignment}</strong></span>
                                </div>
                              )}

                              <button
                                type="button"
                                onClick={() => {
                                  assignEmployee(bestCandidate.employee.id, manualAssignLine, manualAssignOp, 'Assigned', '08:00', '17:00', false, 'IE Best Suggestion Matching');
                                  updateLineAllocation(bestCandidate.employee.id, manualAssignLine, manualAssignOp, 'Assigned', 'IE best suggestion');
                                  setIsManualAssignOpen(false);
                                }}
                                className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black transition active:scale-95 shadow-sm cursor-pointer border border-transparent"
                              >
                                Deploy Suggested Worker
                              </button>
                            </div>

                            {/* Alternates list */}
                            {alternateCandidates.length > 0 && (
                              <div className="space-y-2 pt-1">
                                <span className="text-[9.5px] font-bold text-slate-455 uppercase block">Alternative Eligible Personnel (Intelligent Pool):</span>
                                <div className="space-y-1.5 max-h-[220px] overflow-y-auto pr-1">
                                  {alternateCandidates.map(cand2 => (
                                    <div key={cand2.employee.id} className="bg-slate-50 dark:bg-slate-850 p-2.5 rounded-xl border border-slate-150 flex items-center justify-between gap-3 text-left">
                                      <div className="flex items-center gap-2 min-w-0">
                                        <EmployeeAvatar photoUrl={cand2.employee.photoUrl} name={cand2.employee.name} className="w-7 h-7 rounded-full" />
                                        <div className="min-w-0">
                                          <div className="flex items-center gap-1 flex-wrap">
                                            <strong className="block text-xs font-bold text-slate-800 dark:text-neutral-200 truncate">{cand2.employee.name}</strong>
                                            {cand2.isFromOtherLine && (
                                              <span className="inline-block text-[7.5px] font-bold bg-amber-50 text-amber-700 dark:bg-amber-955/40 dark:text-amber-400 px-1 py-0.1 rounded font-mono">
                                                {cand2.employee.lineNumber === 99 ? 'Floater' : `Line 0${cand2.employee.lineNumber}`}
                                              </span>
                                            )}
                                          </div>
                                          <span className="text-[9.5px] font-mono block text-slate-400">
                                            Skill: <strong className="text-slate-650 dark:text-slate-350">{cand2.efficiency}%</strong> · Defect: <strong className={cand2.defectRate > 4 ? 'text-red-500 font-bold' : 'text-slate-650 dark:text-slate-350'}>{cand2.defectRate}%</strong> · QAPS: <strong className="text-indigo-600 dark:text-indigo-400">{cand2.qaps}/100</strong>
                                          </span>
                                        </div>
                                      </div>

                                      <button
                                        type="button"
                                        onClick={() => {
                                          assignEmployee(cand2.employee.id, manualAssignLine, manualAssignOp, 'Assigned', '08:00', '17:00', false, 'IE Manual Alternate Match');
                                          updateLineAllocation(cand2.employee.id, manualAssignLine, manualAssignOp, 'Assigned', 'IE manual alternate list selection');
                                          setIsManualAssignOpen(false);
                                        }}
                                        className="px-2.5 py-1 rounded-lg bg-slate-850 hover:bg-slate-800 text-slate-200 text-[10px] font-bold transition active:scale-95 cursor-pointer"
                                      >
                                        Deploy
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                          </div>
                        );
                      })()}
                    </div>
                  )}

                  {!manualAssignOp && (
                    <div className="text-center p-8 text-slate-400 italic bg-slate-50 dark:bg-slate-950/20 rounded-2xl border border-dashed border-slate-150">
                      <Zap className="w-8 h-8 mx-auto mb-2 text-slate-350 animate-bounce" />
                      Please select a garment operation above to view intelligent operator matching suggestions for Line 0{manualAssignLine}.
                    </div>
                  )}

                </div>

              </div>

              <div className="border-t border-slate-100 dark:border-slate-800 pt-4 mt-6">
                <button
                  type="button"
                  onClick={() => setIsManualAssignOpen(false)}
                  className="w-full py-3 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-750 text-slate-500 dark:text-slate-400 rounded-xl font-bold transition cursor-pointer"
                >
                  Close Match Panel
                </button>
              </div>

            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <StyleChangeModal 
        isOpen={showStyleChangeModal} 
        onClose={() => setShowStyleChangeModal(false)} 
        lineNumber={stage2Line} 
      />

    </div>
  );
};
