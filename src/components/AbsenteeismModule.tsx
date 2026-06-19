/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { useAppState } from '../contexts/StateContext';
import { RiskLevel, Employee } from '../types';
import { 
  Users, AlertOctagon, TrendingDown, Eye, HelpCircle, 
  ChevronRight, Calendar, Filter, Sparkles, AlertCircle, RefreshCw,
  ArrowRight, ShieldAlert, Zap, TrendingUp, CheckCircle, Flame, ArrowUpRight,
  UserCheck, Activity, AlertTriangle, Layers
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { EmployeeAvatar } from './EmployeeAvatar';

export const AbsenteeismModule: React.FC = () => {
  const { 
    employees, 
    attendance, 
    leaveRequests, 
    currentUser, 
    systemDate,
    productionLines,
    getLineRunningStyle,
    employeeAssignments
  } = useAppState();

  const [activeRiskTab, setActiveRiskTab] = useState<RiskLevel | 'All'>('All');
  const [selectedDept, setSelectedDept] = useState<string>('All');
  const [viewingEmployee, setViewingEmployee] = useState<Employee | null>(null);

  const [completeAttendance, setCompleteAttendance] = useState<any[]>([]);

  React.useEffect(() => {
    let active = true;
    fetch('/api/attendance')
      .then(res => res.json())
      .then(data => {
        if (active && Array.isArray(data)) {
          setCompleteAttendance(data);
        }
      })
      .catch(err => console.error("Error loading complete historical attendance:", err));
    return () => {
      active = false;
    };
  }, [attendance, systemDate]);

  // Today date
  const today = systemDate;
  const todayAttendance = attendance.filter(r => r.date === today);

  // Helper date math function to calculate next/prev days natively and safely
  const getNextDays = (baseDateStr: string, offset: number) => {
    const parts = baseDateStr.split('-');
    if (parts.length !== 3) return baseDateStr;
    const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    d.setDate(d.getDate() + offset);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const r = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${r}`;
  };

  const tomorrowStr = getNextDays(systemDate, 1);

  // Attendance helpers
  const isOperatorPresent = React.useCallback((empId: string) => {
    const record = attendance.find(
      a => a.employeeId.toUpperCase() === empId.toUpperCase() && a.date === systemDate
    );
    return record ? (record.status === 'Present' || record.status === 'Late') : false;
  }, [attendance, systemDate]);

  const isOperatorUnavailableForProduction = React.useCallback((empId: string) => {
    const asg = employeeAssignments?.find(
      a => a.employeeId.toUpperCase() === empId.toUpperCase() && a.assignmentDate === systemDate
    );
    if (!asg) return false;
    const s = asg.assignmentStatus;
    return s === 'On Leave' || s === 'Excused Absence' || s === 'General Audit Scheduled' || s === 'Training';
  }, [employeeAssignments, systemDate]);

  // Overall Statistics & Totals
  const totalCount = employees.filter(emp => {
    const dept = (emp.department || '').toLowerCase();
    return dept.includes('sewing') || dept.includes('floater') || dept.includes('finishing') || emp.lineNumber === 99;
  }).length || employees.length;

  const criticalCount = employees.filter(e => e.riskLevel === 'Critical').length;
  const highCount = employees.filter(e => e.riskLevel === 'High').length;
  const medCount = employees.filter(e => e.riskLevel === 'Medium').length;

  const todayAbsentCount = todayAttendance.filter(r => {
    if (r.status !== 'Absent') return false;
    const emp = employees.find(e => e.id.toUpperCase() === r.employeeId?.toUpperCase());
    if (!emp) return true;
    const dept = (emp.department || '').toLowerCase();
    return dept.includes('sewing') || dept.includes('floater') || dept.includes('finishing') || emp.lineNumber === 99;
  }).length;

  const activeLineIds = React.useMemo(() => productionLines.map(l => l.id), [productionLines]);

  // Calculate 9 production-aware real-time KPIs
  const metrics = React.useMemo(() => {
    // 1. Assigned Garments: count unique running styles across sewing lines
    const runningStyles = productionLines.map(line => getLineRunningStyle(line.id)).filter(Boolean);
    const uniqueRunningStylesCount = Array.from(new Set(runningStyles.map(s => s?.id))).length;

    // 2. Total Operations & 3. Required Manpower (Sum of operations counts)
    const globalTotalOperations = productionLines.reduce((sum, line) => {
      const style = getLineRunningStyle(line.id);
      return sum + (style && style.operations ? style.operations.length : 0);
    }, 0);

    const globalRequiredManpower = globalTotalOperations; // 1 to 1 model requirement

    // 4. Present Operators on sewing lines
    const activeLineOperators = employees.filter(emp => {
      const dept = (emp.department || '').toLowerCase();
      const isOperator = dept === 'sewing' || dept === 'floater' || dept.includes('finishing');
      return isOperator && activeLineIds.includes(emp.lineNumber);
    });
    const presentOperatorsCount = activeLineOperators.filter(emp => 
      isOperatorPresent(emp.id) && !isOperatorUnavailableForProduction(emp.id)
    ).length;

    // 5. Absent Operators on active lines right now
    const absentOperatorsCount = activeLineOperators.filter(emp => {
      const record = attendance.find(r => r.employeeId.toUpperCase() === emp.id.toUpperCase() && r.date === systemDate);
      return record && record.status === 'Absent';
    }).length;

    // 6. Leave Planned Today count of active line roster
    const leavePlannedTodayCount = activeLineOperators.filter(emp => {
      const record = attendance.find(r => r.employeeId.toUpperCase() === emp.id.toUpperCase() && r.date === systemDate);
      return record && record.status === 'Leave';
    }).length;

    // 7. Available Floaters / Standby present unallocated operators
    const availableFloatersCount = employees.filter(emp => {
      const dept = (emp.department || '').toLowerCase();
      const isOperator = dept === 'sewing' || dept === 'floater' || dept.includes('finishing');
      if (!isOperator) return false;
      if (!isOperatorPresent(emp.id)) return false;
      if (isOperatorUnavailableForProduction(emp.id)) return false;
      const isFloaterLine = emp.lineNumber === 0 || emp.lineNumber === 99;
      const isStatusAvailable = emp.workforceAssignmentStatus === 'Available for Replacement' || emp.workforceAssignmentStatus === 'Unassigned' || !emp.workforceAssignmentStatus;
      const hasNoActiveAssignment = !emp.operationAssignment || emp.operationAssignment.trim() === '' || emp.operationAssignment.toLowerCase() === 'unassigned';
      return isFloaterLine || isStatusAvailable || hasNoActiveAssignment;
    }).length;

    // 8. Current Manpower Gap (calculated line-wise to avoid offset canceling)
    const currentManpowerGap = productionLines.reduce((sum, line) => {
      const style = getLineRunningStyle(line.id);
      const reqOpCount = style ? style.operations.length : 0;
      const lineStaff = employees.filter(emp => {
        const dept = (emp.department || '').toLowerCase();
        return emp.lineNumber === line.id && (dept === 'sewing' || dept === 'floater' || dept.includes('finishing'));
      });
      const presCount = lineStaff.filter(emp => isOperatorPresent(emp.id) && !isOperatorUnavailableForProduction(emp.id)).length;
      return sum + Math.max(0, reqOpCount - presCount);
    }, 0);

    // 9. Predicted Next-Day Manpower Gap
    // Roster staff minus tomorrow's approved leave requests
    const tomorrowLeaves = leaveRequests.filter(lr => 
      lr.status === 'Approved' && 
      tomorrowStr >= lr.startDate && 
      tomorrowStr <= lr.endDate
    );
    const tomorrowLeaveEmpIds = new Set(tomorrowLeaves.map(lr => lr.employeeId.toUpperCase()));

    const predictedNextDayGap = productionLines.reduce((sum, line) => {
      const style = getLineRunningStyle(line.id);
      const reqOpCount = style ? style.operations.length : 0;
      const lineStaff = employees.filter(emp => {
        const dept = (emp.department || '').toLowerCase();
        return emp.lineNumber === line.id && (dept === 'sewing' || dept === 'floater' || dept.includes('finishing'));
      });
      const tomorrowPresentCount = lineStaff.filter(emp => !tomorrowLeaveEmpIds.has(emp.id.toUpperCase())).length;
      return sum + Math.max(0, reqOpCount - tomorrowPresentCount);
    }, 0);

    const totalRosterPlannedTomorrowAbsences = employees.filter(emp => {
      const dept = (emp.department || '').toLowerCase();
      const isOperator = dept === 'sewing' || dept === 'floater' || dept.includes('finishing');
      return isOperator && activeLineIds.includes(emp.lineNumber) && tomorrowLeaveEmpIds.has(emp.id.toUpperCase());
    }).length;

    return {
      assignedGarmentsCount: uniqueRunningStylesCount,
      totalOperations: globalTotalOperations,
      requiredManpower: globalRequiredManpower,
      presentOperators: presentOperatorsCount,
      absentOperators: absentOperatorsCount,
      leavePlannedToday: leavePlannedTodayCount,
      availableFloaters: availableFloatersCount,
      currentManpowerGap,
      predictedNextDayGap,
      totalRosterPlannedTomorrowAbsences
    };
  }, [productionLines, employees, attendance, leaveRequests, employeeAssignments, systemDate, isOperatorPresent, isOperatorUnavailableForProduction, tomorrowStr]);

  // Garment Impact Analysis Engine
  const garmentImpacts = React.useMemo(() => {
    return productionLines.map(line => {
      const runningStyle = getLineRunningStyle(line.id);
      if (!runningStyle) {
        return {
          lineId: line.id,
          supervisor: line.supervisor,
          styleId: null,
          styleName: "No Garment Running",
          styleType: "N/A",
          requiredManpower: 0,
          presentCount: 0,
          gap: 0,
          riskLevel: "Low" as const,
          expectedEffLoss: 0,
          productionLossPieces: 0
        };
      }

      const totalOperations = runningStyle.operations ? runningStyle.operations.length : 0;
      const lineStaff = employees.filter(emp => {
        const dept = (emp.department || '').toLowerCase();
        return emp.lineNumber === line.id && (dept === 'sewing' || dept === 'floater');
      });
      const presentCount = lineStaff.filter(emp => 
        isOperatorPresent(emp.id) && !isOperatorUnavailableForProduction(emp.id)
      ).length;
      
      const gap = Math.max(0, totalOperations - presentCount);
      
      let riskLevel: 'Low' | 'Medium' | 'High' | 'Critical' = 'Low';
      if (gap > 4) riskLevel = 'Critical';
      else if (gap > 2) riskLevel = 'High';
      else if (gap > 0) riskLevel = 'Medium';

      // Productivity Loss math model:
      // Missing staff breaks layout rhythm. We estimate loss based on bottleneck severity:
      const expectedEffLoss = gap > 0 ? Math.min(35, gap * 5.5 + 4.5) : 0;
      const plannedPieces = line.dailyPlanPieces || 450;
      const productionLossPieces = Math.round(plannedPieces * (expectedEffLoss / 100));

      return {
        lineId: line.id,
        supervisor: line.supervisor,
        styleId: runningStyle.id,
        styleName: runningStyle.name,
        styleType: runningStyle.type,
        requiredManpower: totalOperations,
        presentCount,
        gap,
        riskLevel,
        expectedEffLoss,
        productionLossPieces
      };
    });
  }, [productionLines, employees, attendance, employeeAssignments, systemDate, isOperatorPresent, isOperatorUnavailableForProduction]);

  // Proactive Planned Leaves Shortage Warning Alerts
  const proactiveLeaveAlerts = React.useMemo(() => {
    const alerts: Array<{
      lineId: number;
      styleName: string;
      shortage: number;
      causeOperators: string[];
      message: string;
    }> = [];

    const tomorrowLeaves = leaveRequests.filter(lr => 
      lr.status === 'Approved' && 
      tomorrowStr >= lr.startDate && 
      tomorrowStr <= lr.endDate
    );

    const leavesByEmpId = new Map<string, any>();
    tomorrowLeaves.forEach(lr => {
      leavesByEmpId.set(lr.employeeId.toUpperCase(), lr);
    });

    productionLines.forEach(line => {
      const runningStyle = getLineRunningStyle(line.id);
      if (!runningStyle) return;

      const reqManpower = runningStyle.operations ? runningStyle.operations.length : 0;
      const lineStaff = employees.filter(emp => {
        const dept = (emp.department || '').toLowerCase();
        return emp.lineNumber === line.id && (dept === 'sewing' || dept === 'floater');
      });
      
      const tomorrowOnLeave = lineStaff.filter(emp => leavesByEmpId.has(emp.id.toUpperCase()));
      const tomorrowPresentCount = lineStaff.length - tomorrowOnLeave.length;

      const gap = Math.max(0, reqManpower - tomorrowPresentCount);

      if (gap > 0 && tomorrowOnLeave.length > 0) {
        const names = tomorrowOnLeave.map(e => e.name);
        alerts.push({
          lineId: line.id,
          styleName: runningStyle.name,
          shortage: gap,
          causeOperators: names,
          message: `Line ${line.id} will have a shortage of ${gap} operator${gap > 1 ? 's' : ''} tomorrow for Garment Style "${runningStyle.name}" due to approved planned leave of: ${names.join(', ')}.`
        });
      } else if (gap > 0 && reqManpower > lineStaff.length) {
        alerts.push({
          lineId: line.id,
          styleName: runningStyle.name,
          shortage: gap,
          causeOperators: [],
          message: `Line ${line.id} manpower requirement cannot be met due to staffing gap (ruling ${lineStaff.length} allocated vs ${reqManpower} required operations).`
        });
      }
    });

    return alerts;
  }, [productionLines, employees, leaveRequests, systemDate, tomorrowStr]);

  // Standby Replacement Recommendations Engine (matching floater skills to vacant stations)
  const replacementRecommendations = React.useMemo(() => {
    const list: Array<{
      lineId: number;
      supervisor: string;
      vacantOperation: string;
      operationCode: string;
      isCritical: boolean;
      suggestions: Array<{
        employee: Employee;
        proficiency: number;
      }>;
    }> = [];

    // Filter present standby floaters
    const standbyOps = employees.filter(emp => {
      if (!isOperatorPresent(emp.id)) return false;
      if (isOperatorUnavailableForProduction(emp.id)) return false;

      const isFloaterLine = emp.lineNumber === 0 || emp.lineNumber === 99;
      const isStatusAvailable = emp.workforceAssignmentStatus === 'Available for Replacement' || emp.workforceAssignmentStatus === 'Unassigned' || !emp.workforceAssignmentStatus;
      const hasNoActiveAssignment = !emp.operationAssignment || emp.operationAssignment.trim() === '' || emp.operationAssignment.toLowerCase() === 'unassigned';

      return isFloaterLine || isStatusAvailable || hasNoActiveAssignment;
    });

    productionLines.forEach(line => {
      const runningStyle = getLineRunningStyle(line.id);
      if (!runningStyle || !runningStyle.operations) return;

      const lineStaff = employees.filter(emp => {
        const dept = (emp.department || '').toLowerCase();
        return emp.lineNumber === line.id && (dept === 'sewing' || dept === 'floater');
      });
      const presentLineStaff = lineStaff.filter(emp => isOperatorPresent(emp.id) && !isOperatorUnavailableForProduction(emp.id));

      // Scan each operation of the running garment
      runningStyle.operations.forEach(op => {
        // Find if this specific operation is active on the floor
        const isCovered = presentLineStaff.some(emp => 
          emp.operationAssignment && 
          emp.operationAssignment.trim().toLowerCase() === op.name.trim().toLowerCase()
        );

        if (!isCovered) {
          // Find standby operators with the correct skill
          const matchedStandby = standbyOps.map(emp => {
            const skill = emp.skills?.find(s => 
              s.operationName.toLowerCase().includes(op.name.toLowerCase()) || 
              op.name.toLowerCase().includes(s.operationName.toLowerCase())
            );
            return {
              employee: emp,
              proficiency: skill ? skill.proficiency : (emp.baseEfficiency || 65)
            };
          })
          .sort((a, b) => b.proficiency - a.proficiency)
          .slice(0, 3); // top 3 replacements for this vacant operation

          if (matchedStandby.length > 0) {
            list.push({
              lineId: line.id,
              supervisor: line.supervisor,
              vacantOperation: op.name,
              operationCode: op.operationCode || '',
              isCritical: op.skillRequired === 'High' || op.skillRequired === 'Expert',
              suggestions: matchedStandby
            });
          }
        }
      });
    });

    return list.slice(0, 5); // display top 5 most urgent vacancies needing replacement
  }, [productionLines, employees, attendance, employeeAssignments, systemDate, isOperatorPresent, isOperatorUnavailableForProduction]);

  const attendeeDatesList = React.useMemo(() => {
    const dates = new Set<string>();
    completeAttendance.forEach(r => {
      if (r.date) dates.add(r.date);
    });
    return Array.from(dates).sort();
  }, [completeAttendance]);

  // Historically tracked attendance trends
  const dailyRates = React.useMemo(() => {
    return attendeeDatesList.map(dateStr => {
      const records = completeAttendance.filter(r => r.date === dateStr);
      const sewingRecords = records.filter(r => {
        const emp = employees.find(e => e.id.toUpperCase() === r.employeeId?.toUpperCase());
        if (!emp) return true;
        const dept = (emp.department || '').toLowerCase();
        return dept.includes('sewing') || dept.includes('floater') || emp.lineNumber === 99;
      });
      const abs = sewingRecords.filter(r => r.status === 'Absent').length;
      const total = sewingRecords.length;
      return total > 0 ? (abs / total) * 100 : 0;
    });
  }, [completeAttendance, employees, attendeeDatesList]);

  const weeklyAbsenteeismPct = React.useMemo(() => {
    if (dailyRates.length === 0) return 8.4;
    const recentRates = dailyRates.slice(-7);
    const sum = recentRates.reduce((a, b) => a + b, 0);
    return Number((sum / recentRates.length).toFixed(1));
  }, [dailyRates]);

  const monthlyAbsenteeismPct = React.useMemo(() => {
    if (dailyRates.length === 0) return 6.9;
    const recentRates = dailyRates.slice(-30);
    const sum = recentRates.reduce((a, b) => a + b, 0);
    return Number((sum / recentRates.length).toFixed(1));
  }, [dailyRates]);

  // Percentage Calculations for plant
  const dailyAbsenteeismPct = totalCount > 0 
    ? Number(((todayAbsentCount / totalCount) * 100).toFixed(1)) 
    : 0;

  // Filtered high-risk employees list
  const filteredRiskEmployees = employees.filter(emp => {
    const matchesRisk = activeRiskTab === 'All' || emp.riskLevel === activeRiskTab;
    const matchesDept = selectedDept === 'All' || emp.department === selectedDept;
    return matchesRisk && matchesDept;
  });

  // Heatmap Data (Days of the week vs Sewing Lines)
  const heatmapRows = React.useMemo(() => {
    const sectors = [
      { label: 'Sewing Line 1', match: (emp: Employee) => emp.lineNumber === 1 },
      { label: 'Sewing Line 2', match: (emp: Employee) => emp.lineNumber === 2 },
      { label: 'Sewing Line 3', match: (emp: Employee) => emp.lineNumber === 3 },
      { label: 'Sewing Line 4', match: (emp: Employee) => emp.lineNumber === 4 }
    ];

    const getDayName = (dateStr: string) => {
      const parts = dateStr.split('-');
      if (parts.length !== 3) return '';
      const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
      const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      return days[d.getDay()];
    };

    const empMap = new Map<string, Employee>();
    employees.forEach(emp => {
      empMap.set(emp.id.toUpperCase(), emp);
    });

    const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    return sectors.map(sec => {
      const values = weekdays.map(dayName => {
        const matchedRecords = completeAttendance.filter(r => {
          if (!r.date || !r.employeeId) return false;
          if (getDayName(r.date) !== dayName) return false;
          const emp = empMap.get(r.employeeId.toUpperCase());
          return emp ? sec.match(emp) : false;
        });

        const totalCount = matchedRecords.length;
        const absentCount = matchedRecords.filter(r => r.status === 'Absent').length;

        if (totalCount === 0) {
          const sectorEmps = employees.filter(sec.match);
          if (sectorEmps.length === 0) return 0;
          const averageHistoricalRate = sectorEmps.reduce((sum, e) => sum + (100 - e.historicalAttendanceRate), 0) / sectorEmps.length;
          const multiplier = dayName === 'Mon' ? 1.4 : (dayName === 'Sat' ? 1.8 : 0.9);
          const computedRate = Math.round(averageHistoricalRate * multiplier);
          return Math.max(0, Math.min(45, computedRate));
        }

        return Math.round((absentCount / totalCount) * 100);
      });

      return {
        label: sec.label,
        values
      };
    });
  }, [completeAttendance, employees]);

  const weekdaysList = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const getHeatmapColor = (val: number) => {
    if (val === 0) return 'bg-slate-50 dark:bg-slate-900 border-slate-100 dark:border-slate-800 text-slate-400';
    if (val < 10) return 'bg-[#DCFCE7] text-green-800 border-green-200 font-medium';
    if (val < 15) return 'bg-[#FEF3C7] text-amber-800 border-amber-200 font-medium';
    if (val < 25) return 'bg-[#FED7AA] text-orange-955 border-orange-200 font-semibold';
    return 'bg-[#FECACA] text-red-900 border-red-200 font-bold';
  };

  return (
    <div className="space-y-6">

      {/* Head section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1 px-1.5 rounded-md bg-indigo-500 text-white text-[10px] font-bold uppercase select-none tracking-widest font-mono">SWM</span>
            <span className="text-[10px] bg-sky-100 dark:bg-sky-950/40 text-sky-800 dark:text-sky-300 font-mono px-2 py-0.5 rounded font-bold uppercase tracking-wider">Garment-Aware Roster</span>
          </div>
          <h2 className="text-xl font-extrabold text-slate-900 dark:text-neutral-100 font-display mt-1">
            Absenteeism Control & Impact Dashboard
          </h2>
          <p className="text-xs text-slate-450 mt-0.5">
            Analyzing attendance patterns against production-line garment SMV bulletins to calculate dynamic manpower shortages.
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs font-mono bg-slate-100 dark:bg-slate-850 p-2 rounded-xl text-slate-500">
          <Calendar className="w-4 h-4 text-slate-400" />
          <span>Roster Working Date: <strong>{systemDate}</strong></span>
        </div>
      </div>

      {/* 9 Production-Aware KPIs Grid */}
      <div className="space-y-1.5">
        <h3 className="text-[10.5px] font-extrabold uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
          <Activity className="w-3.5 h-3.5 text-indigo-500" />
          Realtime Garment-Aware Factory Floor KPIs
        </h3>
        
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 xl:grid-cols-9 gap-3">
          {/* 1. Assigned Garments */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-850 rounded-xl p-3 shadow-2xs flex flex-col justify-between">
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Assigned Garments</span>
            <div className="mt-2 flex items-baseline justify-between select-none">
              <span className="text-lg font-black text-indigo-600 dark:text-indigo-400">{metrics.assignedGarmentsCount}</span>
              <span className="text-[9px] bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 font-bold px-1.5 py-0.25 rounded font-mono">Styles</span>
            </div>
          </div>

          {/* 2. Total Operations */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-850 rounded-xl p-3 shadow-2xs flex flex-col justify-between">
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Total Operations</span>
            <div className="mt-2 flex items-baseline justify-between select-none">
              <span className="text-lg font-black text-slate-800 dark:text-white">{metrics.totalOperations}</span>
              <span className="text-[9px] text-slate-400 font-mono">Bulletins</span>
            </div>
          </div>

          {/* 3. Required Manpower */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-850 rounded-xl p-3 shadow-2xs flex flex-col justify-between">
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Required Manpower</span>
            <div className="mt-2 flex items-baseline justify-between select-none">
              <span className="text-lg font-black text-blue-600 dark:text-blue-400">{metrics.requiredManpower}</span>
              <span className="text-[9px] text-slate-400 font-mono">Operators</span>
            </div>
          </div>

          {/* 4. Present Operators */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-850 rounded-xl p-3 shadow-2xs flex flex-col justify-between">
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Present Operators</span>
            <div className="mt-2 flex items-baseline justify-between select-none">
              <span className="text-lg font-black text-emerald-600 dark:text-emerald-400">{metrics.presentOperators}</span>
              <span className="text-[9px] bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 font-bold px-1.5 py-0.25 rounded font-mono">On-Duty</span>
            </div>
          </div>

          {/* 5. Absent Operators */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-850 rounded-xl p-3 shadow-2xs flex flex-col justify-between">
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Absent Operators</span>
            <div className="mt-2 flex items-baseline justify-between select-none">
              <span className={`text-lg font-black ${metrics.absentOperators > 4 ? 'text-red-500 animate-pulse' : 'text-slate-700 dark:text-slate-350'}`}>{metrics.absentOperators}</span>
              <span className="text-[9px] bg-red-50 dark:bg-red-950 text-red-500 font-bold px-1.5 py-0.25 rounded font-mono">Absent</span>
            </div>
          </div>

          {/* 6. Leave Planned */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-850 rounded-xl p-3 shadow-2xs flex flex-col justify-between">
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Planned Leave today</span>
            <div className="mt-2 flex items-baseline justify-between select-none">
              <span className="text-lg font-black text-amber-500">{metrics.leavePlannedToday}</span>
              <span className="text-[9px] text-amber-500 font-mono">Approved</span>
            </div>
          </div>

          {/* 7. Available Floaters */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-850 rounded-xl p-3 shadow-2xs flex flex-col justify-between">
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Available Floaters</span>
            <div className="mt-2 flex items-baseline justify-between select-none">
              <span className="text-lg font-black text-cyan-500">{metrics.availableFloatersCount}</span>
              <span className="text-[9px] bg-cyan-50 dark:bg-cyan-950 text-cyan-600 dark:text-cyan-400 font-mono font-bold px-1 py-0.25 rounded">Standby</span>
            </div>
          </div>

          {/* 8. Current Manpower Gap */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-850 rounded-xl p-3 shadow-2xs flex flex-col justify-between ring-1 ring-red-200/50 dark:ring-red-950/20">
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Current Shortage</span>
            <div className="mt-2 flex items-baseline justify-between select-none">
              <span className={`text-lg font-bold ${metrics.currentManpowerGap > 0 ? 'text-red-500 font-black' : 'text-emerald-500'}`}>{metrics.currentManpowerGap}</span>
              <span className="text-[9px] text-rose-500 font-mono">HeadCount Deficit</span>
            </div>
          </div>

          {/* 9. Predicted Next-Day Gap */}
          <div className="bg-slate-950 text-white rounded-xl p-3 shadow-2xs flex flex-col justify-between">
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Next-Day Leave Gap</span>
            <div className="mt-2 flex items-baseline justify-between select-none">
              <span className="text-lg font-bold text-amber-400">{metrics.predictedNextDayGap}</span>
              <span className="text-[9px] text-amber-300 font-mono">Est. Gap</span>
            </div>
          </div>
        </div>
      </div>

      {/* Proactive Shortages warning alerts feed */}
      {proactiveLeaveAlerts.length > 0 && (
        <div className="bg-rose-50/50 dark:bg-rose-950/15 border border-rose-200/80 dark:border-rose-900/30 rounded-2xl p-4 space-y-3">
          <div className="flex items-center gap-2 border-b border-rose-200/50 dark:border-rose-900/30 pb-2">
            <AlertCircle className="w-4 h-4 text-rose-500 animate-bounce" />
            <span className="text-xs font-extrabold text-rose-800 dark:text-rose-400 uppercase tracking-widest font-sans">Proactive Roster Deficit Warning Alerts ({proactiveLeaveAlerts.length})</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {proactiveLeaveAlerts.map((alert, index) => (
              <div 
                key={index} 
                className="bg-white dark:bg-slate-900 border border-red-100 dark:border-red-950 rounded-xl p-3 text-[11.5px] leading-relaxed text-slate-650 dark:text-neutral-350 flex gap-2.5 shadow-2xs align-start"
              >
                <div className="mt-0.5"><ShieldAlert className="w-4.5 h-4.5 text-red-500" /></div>
                <div className="space-y-1">
                  <div className="font-bold text-slate-800 dark:text-neutral-100">
                    Line {alert.lineId} Manpower Roster shortage tomorrow:
                  </div>
                  <p className="text-[11px] text-red-600/90 dark:text-rose-400 font-sans">
                    {alert.message}
                  </p>
                  <div className="flex items-center gap-1 text-[9px] uppercase font-mono font-bold text-slate-450 mt-1">
                    <span>Target Style:</span>
                    <strong className="text-indigo-600 dark:text-indigo-400 font-mono">{alert.styleName}</strong>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Garmin Impact Analysis block */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4 shadow-3xs">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3 flex-wrap gap-2">
          <div>
            <h3 className="text-sm font-extrabold text-slate-800 dark:text-neutral-100 flex items-center gap-1.5 font-display uppercase tracking-widest">
              <Layers className="w-4.5 h-4.5 text-indigo-500" />
              Dynamic Garment Impact Analysis
            </h3>
            <p className="text-xs text-slate-450 mt-0.5">Analyses how operator shortages affect style performance, estimated losses, and bottleneck risk layers.</p>
          </div>
          <span className="text-[10px] bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-400 px-2.5 py-1 rounded-full font-bold uppercase tracking-wider font-mono">
            Roster Live Simulation
          </span>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-150 dark:border-slate-850">
          <table className="min-w-full text-xs text-left">
            <thead className="bg-slate-50 dark:bg-slate-950 text-slate-400 font-bold uppercase tracking-widest text-[9.5px] border-b border-slate-150 dark:border-slate-850 select-none">
              <tr>
                <th className="py-3 px-4">Line & Supervisor</th>
                <th className="py-3 px-4">Active Garment / Type</th>
                <th className="py-3 px-4 text-center">Required Manpower</th>
                <th className="py-3 px-4">Allocated Attendance Status</th>
                <th className="py-3 px-4 text-center">Required Operator Shortage</th>
                <th className="py-3 px-4 text-center">Bottleneck Risk</th>
                <th className="py-3 px-4 text-center">Expected Efficiency Loss</th>
                <th className="py-3 px-4 text-center">Est. Daily loss</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-805 text-slate-705 dark:text-slate-350">
              {garmentImpacts.map(impact => {
                const getAlertBadge = (risk: typeof impact.riskLevel) => {
                  switch(risk) {
                    case 'Critical': 
                      return 'bg-red-100 text-red-800 dark:bg-red-955/35 dark:text-red-400 font-extrabold border-red-200/50';
                    case 'High': 
                      return 'bg-orange-100 text-orange-800 dark:bg-orange-955/35 dark:text-orange-400 font-bold border-orange-200/50';
                    case 'Medium': 
                      return 'bg-amber-100 text-amber-800 dark:bg-amber-955/35 dark:text-amber-400 font-medium border-amber-200/50';
                    default: 
                      return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-955/35 dark:text-emerald-400 font-medium border-emerald-250/30';
                  }
                };

                return (
                  <tr key={impact.lineId} className="hover:bg-slate-50/50 dark:hover:bg-slate-950/20 transition-all">
                    <td className="py-3.5 px-4">
                      <div className="font-bold text-slate-900 dark:text-neutral-100 font-sans">Line {impact.lineId}</div>
                      <span className="text-[10px] text-slate-400 italic block">{impact.supervisor}'s Cell</span>
                    </td>

                    <td className="py-3.5 px-4 font-mono font-bold">
                      {impact.styleId ? (
                        <div>
                          <span className="text-slate-800 dark:text-neutral-100 font-mono font-bold">{impact.styleName}</span>
                          <span className="text-[9.5px] bg-slate-100 dark:bg-slate-850 px-1 rounded block w-max font-normal text-slate-400 mt-0.5">{impact.styleType}</span>
                        </div>
                      ) : (
                        <span className="text-slate-400 italic">No garment style active</span>
                      )}
                    </td>

                    <td className="py-3.5 px-4 text-center font-mono font-bold text-slate-800 dark:text-white text-sm">
                      {impact.requiredManpower > 0 ? (
                        <span>{impact.requiredManpower} <span className="text-[10px] text-slate-400 font-normal">ops</span></span>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>

                    <td className="py-3.5 px-4 space-y-1">
                      {impact.requiredManpower > 0 ? (
                        <div className="w-full">
                          <div className="flex justify-between items-center text-[10px] text-slate-500 mb-1">
                            <span>Present: <strong>{impact.presentCount}</strong> / {impact.requiredManpower}</span>
                            <span>{Math.round((impact.presentCount / impact.requiredManpower) * 100)}%</span>
                          </div>
                          <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                            <div 
                              className={`h-full rounded-full transition-all duration-500 ${
                                impact.presentCount >= impact.requiredManpower 
                                  ? 'bg-emerald-500' 
                                  : impact.presentCount >= impact.requiredManpower - 2 
                                    ? 'bg-amber-500' 
                                    : 'bg-rose-500'
                              }`}
                              style={{ width: `${Math.min(100, Math.round((impact.presentCount / impact.requiredManpower) * 100))}%` }}
                            />
                          </div>
                        </div>
                      ) : (
                        <span className="text-slate-400 italic text-[11px]">Roster inactive</span>
                      )}
                    </td>

                    <td className="py-3.5 px-4 text-center font-mono font-bold">
                      {impact.requiredManpower > 0 ? (
                        <span className={`text-base ${impact.gap > 0 ? 'text-red-500 font-black' : 'text-emerald-500'}`}>
                          {impact.gap > 0 ? `-${impact.gap}` : '0 (Covers)'}
                        </span>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>

                    <td className="py-3.5 px-4 text-center">
                      {impact.requiredManpower > 0 ? (
                        <span className={`inline-block px-2.5 py-0.5 text-[9px] uppercase tracking-wider font-bold rounded-sm border ${getAlertBadge(impact.riskLevel)}`}>
                          {impact.riskLevel}
                        </span>
                      ) : (
                        <span className="text-slate-400 font-medium">-</span>
                      )}
                    </td>

                    <td className="py-3.5 px-4 text-center font-mono font-semibold text-rose-500 text-sm">
                      {impact.requiredManpower > 0 && impact.expectedEffLoss > 0 ? (
                        <span>-{impact.expectedEffLoss}%</span>
                      ) : (
                        <span className="text-emerald-500 font-bold">0% (Nil)</span>
                      )}
                    </td>

                    <td className="py-3.5 px-4 text-center font-mono font-black text-rose-500">
                      {impact.requiredManpower > 0 && impact.productionLossPieces > 0 ? (
                        <div className="text-right inline-block">
                          <span className="text-sm">-{impact.productionLossPieces}</span>
                          <span className="text-[8px] uppercase block font-normal text-slate-400 text-center">pieces</span>
                        </div>
                      ) : (
                        <span className="text-emerald-500 font-bold">0 Pcs</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Roster Balancing Replacement recommendations engine */}
      {replacementRecommendations.length > 0 && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4 shadow-3xs">
          <div>
            <h3 className="text-sm font-extrabold text-slate-800 dark:text-neutral-100 flex items-center gap-1.5 font-display uppercase tracking-widest">
              <UserCheck className="w-4.5 h-4.5 text-indigo-500 animate-pulse" />
              Roster Replacement & Standby Floater Recommendations
            </h3>
            <p className="text-xs text-slate-450 mt-0.5">
              Standby floaters matched automatically against open vacant operations based on skill matrix certifications.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3.5">
            {replacementRecommendations.map((rec, rIdx) => (
              <div 
                key={rIdx} 
                className={`p-3.5 rounded-xl border flex flex-col justify-between space-y-3 shadow-2xs ${
                  rec.isCritical 
                    ? 'border-red-200 bg-red-50/15 dark:border-red-950 dark:bg-red-950/5' 
                    : 'border-slate-150 bg-slate-50/10 dark:border-slate-800'
                }`}
              >
                <div className="space-y-2">
                  <div className="flex justify-between items-center pb-2 border-b border-slate-100 dark:border-slate-800">
                    <span className="text-[10px] font-mono font-bold text-slate-800 dark:text-neutral-200">
                      Line {rec.lineId} Cell vacancy
                    </span>
                    {rec.isCritical && (
                      <span className="bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-400 text-[8.5px] font-bold uppercase  px-1 rounded">
                        Critical Station
                      </span>
                    )}
                  </div>

                  <div>
                    <span className="text-[10px] text-slate-400 tracking-wide uppercase">Open operation:</span>
                    <div className="font-bold text-slate-800 dark:text-neutral-200 font-sans text-[11.5px] mt-0.5 leading-tight flex items-center gap-1">
                      <span className="font-semibold text-indigo-600 dark:text-indigo-400">{rec.operationCode}</span>
                      <span>·</span>
                      <span>{rec.vacantOperation}</span>
                    </div>
                  </div>

                  <div className="space-y-1.5 pt-1.5">
                    <span className="text-[9px] uppercase font-bold text-slate-400 tracking-wider">Top Floater Candidates:</span>
                    
                    <div className="space-y-1">
                      {rec.suggestions.map((sug, sIdx) => (
                        <div 
                          key={sIdx} 
                          className="flex items-center justify-between p-1 px-1.5 rounded bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 text-[10.5px]"
                        >
                          <div className="flex items-center gap-1.5 min-w-0">
                            <EmployeeAvatar 
                              photoUrl={sug.employee.photoUrl} 
                              name={sug.employee.name} 
                              className="w-4 h-4 rounded-full" 
                            />
                            <span className="font-semibold truncate max-w-20 text-slate-750 dark:text-slate-350">{sug.employee.name}</span>
                          </div>
                          <span className="font-mono text-[9px] font-bold text-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 px-1 rounded-sm">
                            Suitability: {sug.proficiency}%
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="text-[9.5px] text-slate-400 font-medium italic border-t border-slate-100 dark:border-slate-800 pt-2 flex items-center gap-1 select-none">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-500/80 shrink-0" />
                  <span>Manual dispatch via Assignment module</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main Analysis Screen: Heatmap and Risk Matrix */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 font-sans">
        
        {/* Heatmap module */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm col-span-1 lg:col-span-7 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-display font-semibold text-slate-800 dark:text-neutral-100 text-sm flex items-center gap-2">
                <TrendingDown className="w-4 h-4 text-rose-500" />
                Line & Day-of-Week Absenteeism Heatmap
              </h3>
              <p className="text-xs text-slate-450">Color density shows absenteeism percentage ranges (Mondays and Saturdays show spikes)</p>
            </div>
          </div>

          <div className="overflow-x-auto min-w-full">
            <div className="grid grid-cols-7 gap-1.5 min-w-[500px] text-xs">
              
              {/* Row Head spacer */}
              <div className="p-1 pointer-events-none text-[10px] font-bold text-slate-400 uppercase">
                Plant Sector
              </div>
              
              {weekdaysList.map(w => (
                <div key={w} className="text-center font-bold text-slate-500 py-1 uppercase text-[10px] bg-slate-50 dark:bg-slate-950 rounded">
                  {w}
                </div>
              ))}

              {heatmapRows.map(row => (
                <React.Fragment key={row.label}>
                  <div className="p-2 bg-slate-50/50 dark:bg-slate-900/40 text-[11px] font-bold text-slate-700 dark:text-slate-300 flex items-center">
                    {row.label}
                  </div>
                  {row.values.map((val, idx) => (
                    <div 
                      key={idx}
                      title={`Absenteeism rate: ${val}%`}
                      className={`p-2.5 rounded border text-center font-mono font-bold text-[11px] flex items-center justify-center transition-all hover:scale-105 select-none ${getHeatmapColor(val)}`}
                    >
                      {val}%
                    </div>
                  ))}
                </React.Fragment>
              ))}
            </div>
          </div>

          {/* Color legend guide */}
          <div className="flex items-center justify-between flex-wrap gap-2 text-[10px] text-slate-405 border-t border-slate-100 dark:border-slate-800 pt-3">
            <span>Color Index:</span>
            <div className="flex items-center space-x-2.5">
              <span className="flex items-center space-x-1">
                <span className="inline-block w-2.5 h-2.5 bg-[#DCFCE7] border border-green-200 rounded"></span>
                <span>&lt; 10% (Low)</span>
              </span>
              <span className="flex items-center space-x-1">
                <span className="inline-block w-2.5 h-2.5 bg-[#FEF3C7] border border-amber-200 rounded"></span>
                <span>10-15% (Med)</span>
              </span>
              <span className="flex items-center space-x-1">
                <span className="inline-block w-2.5 h-2.5 bg-[#FED7AA] border border-[#CBD5E1] rounded"></span>
                <span>15-25% (High)</span>
              </span>
              <span className="flex items-center space-x-1">
                <span className="inline-block w-2.5 h-2.5 bg-[#FECACA] border border-red-200 rounded"></span>
                <span>&gt; 25% (Critical)</span>
              </span>
            </div>
          </div>
        </div>

        {/* High attendance risks analysis list */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm col-span-1 lg:col-span-5 space-y-4">
          <div>
            <h3 className="font-display font-semibold text-slate-800 dark:text-neutral-100 text-sm flex items-center gap-1.5">
              <Users className="w-4 h-4 text-indigo-500" />
              Attendance Risk Matrix
            </h3>
            <p className="text-xs text-slate-400 font-sans">Classifying roster operators based on historical attendance patterns</p>
          </div>

          <div className="grid grid-cols-4 gap-1 border-b border-slate-100 dark:border-slate-850 pb-2 flex-wrap text-[10px]">
            {[
              { id: 'All' as const, label: 'All', count: totalCount },
              { id: 'Critical' as const, label: 'Critical', count: criticalCount, color: 'text-red-500' },
              { id: 'High' as const, label: 'High', count: highCount, color: 'text-orange-500' },
              { id: 'Medium' as const, label: 'Medium', count: medCount, color: 'text-amber-500' }
            ].map(tab => (
              <button 
                key={tab.id}
                type="button" 
                onClick={() => setActiveRiskTab(tab.id)}
                className={`py-1 rounded text-center font-bold tracking-wide transition border ${
                  activeRiskTab === tab.id 
                    ? 'bg-slate-900 text-white border-slate-904 dark:bg-slate-800' 
                    : 'bg-slate-50 dark:bg-slate-950 hover:bg-slate-100 dark:hover:bg-slate-850 border-transparent'
                }`}
              >
                <div className={tab.color}>{tab.label}</div>
                <div className="text-[11px] font-mono mt-0.5">{tab.count}</div>
              </button>
            ))}
          </div>

          {/* Risk workers lists */}
          <div className="space-y-3 max-h-[220px] overflow-y-auto custom-scrollbar pr-1">
            {filteredRiskEmployees.map(emp => (
              <div 
                key={emp.id} 
                className={`p-2.5 border rounded-lg flex items-center justify-between text-xs transition hover:bg-slate-50 dark:hover:bg-slate-850 cursor-pointer ${
                  emp.riskLevel === 'Critical' 
                    ? 'border-red-100 bg-red-50/20 dark:border-red-950/20 dark:bg-red-950/5' 
                    : 'border-slate-100 dark:border-slate-800'
                }`}
                onClick={() => setViewingEmployee(emp)}
              >
                <div className="flex items-center space-x-2.5 min-w-0">
                  <EmployeeAvatar 
                    photoUrl={emp.photoUrl} 
                    name={emp.name} 
                    className="w-7 h-7 rounded-full" 
                  />
                  <div className="min-w-0">
                    <span className="font-bold text-slate-800 dark:text-slate-205 block truncate">{emp.name}</span>
                    <span className="text-[10px] text-slate-400 block truncate font-mono">
                      {emp.id} · Line {emp.lineNumber === 0 || emp.lineNumber === 99 ? 'Floater' : emp.lineNumber} · {emp.department}
                    </span>
                  </div>
                </div>

                <div className="text-right flex-shrink-0">
                  <span className={`px-2 py-0.5 text-[9px] font-bold rounded-full uppercase font-mono ${
                    emp.riskLevel === 'Critical' 
                      ? 'bg-red-50 text-red-650 dark:bg-red-950/20' 
                      : emp.riskLevel === 'High' 
                        ? 'bg-orange-50 text-orange-600 dark:bg-orange-955/20' 
                        : 'bg-amber-50 text-amber-600 dark:bg-amber-955/20'
                  }`}>
                    {emp.riskLevel}
                  </span>
                  <span className="text-[9px] text-slate-450 block mt-0.5 font-mono">Risk: {emp.riskScore}%</span>
                </div>
              </div>
            ))}

            {filteredRiskEmployees.length === 0 && (
              <div className="py-8 text-center bg-slate-50 dark:bg-slate-950 border border-transparent rounded-lg">
                <span className="text-slate-405 text-xs">No operators evaluated in this risk category.</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Pop up detailing view of employees risk profile */}
      <AnimatePresence>
        {viewingEmployee && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
            <motion.div 
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl w-full max-w-sm overflow-hidden"
            >
              <div className="p-5 space-y-4 text-xs">
                <div className="flex items-center space-x-3.5 border-b border-slate-100 dark:border-slate-800 pb-3">
                  <EmployeeAvatar 
                    photoUrl={viewingEmployee.photoUrl} 
                    name={viewingEmployee.name} 
                    className="w-10 h-10 rounded-full border border-slate-150 dark:border-slate-800" 
                  />
                  <div>
                    <h4 className="font-bold text-slate-800 dark:text-white font-display text-sm">{viewingEmployee.name}</h4>
                    <span className="text-[10px] text-slate-400 block font-mono">{viewingEmployee.id} · {viewingEmployee.designation}</span>
                  </div>
                </div>

                {/* Risk profile metrics detail */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-450 font-medium font-sans">Historical Attendance Rate:</span>
                    <span className="font-bold font-mono text-slate-805 dark:text-neutral-200">{viewingEmployee.historicalAttendanceRate}%</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-450 font-medium font-sans">Calculated Absenteeism Risk Score:</span>
                    <span className={`font-mono font-bold ${
                      viewingEmployee.riskLevel === 'Critical' ? 'text-red-500' : 'text-amber-500'
                    }`}>
                      {viewingEmployee.riskScore}%
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-450 font-medium font-sans">Assigned Line No:</span>
                    <span className="font-bold text-slate-850 dark:text-neutral-200">Line {viewingEmployee.lineNumber !== 0 && viewingEmployee.lineNumber !== 99 ? viewingEmployee.lineNumber : 'Offline support floater'}</span>
                  </div>
                  
                  {/* Attendance Risk Factor Explanations */}
                  <div className="bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-850 rounded p-3 text-[11px] text-slate-500 space-y-1">
                    <p className="font-bold text-slate-705 dark:text-slate-350">Risk Evaluation Factors:</p>
                    <ul className="list-disc pl-4 space-y-1">
                      <li>Baseline attendance rate is under threshold limits.</li>
                      {viewingEmployee.experience < 2 && <li>Operator has under 2 years floor experience.</li>}
                      <li>Saturdays show historically poor attendance patterns.</li>
                    </ul>
                  </div>
                </div>

                <div className="pt-2 flex justify-end">
                  <button 
                    type="button" 
                    onClick={() => setViewingEmployee(null)}
                    className="bg-slate-900 text-white rounded font-bold px-4 py-2 hover:bg-slate-800 transition cursor-pointer"
                  >
                    Dismiss analysis
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
