/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import { useAppState } from '../contexts/StateContext';
import { 
  Sparkles, Calendar, AlertOctagon, ArrowRight, ShieldAlert, 
  HelpCircle, CheckCircle, Info, ChevronRight, Zap, Users, UserCheck, 
  Plus, Search, CalendarDays, Check, AlertTriangle, RefreshCw, BarChart2, Award, FileText
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { WorkforceAssignmentStatus, Employee, RiskLevel, calculateQAPS } from '../types';
import { EmployeeAvatar } from './EmployeeAvatar';

export const PredictiveModule: React.FC = () => {
  const { 
    productionWorkforcePool: employees, 
    productionLines, 
    leaveRequests, 
    employeeAssignments, 
    systemDate, 
    assignEmployeeForDate,
    currentUser,
    getLineRunningStyle
  } = useAppState();

  // Selected date state (defaults to systemDate or systemDate + 1)
  const getTomorrowDate = (dateStr: string): string => {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '2026-06-05';
    d.setDate(d.getDate() + 1);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const tomorrowStr = getTomorrowDate(systemDate);
  const [selectedDate, setSelectedDate] = useState<string>(tomorrowStr);
  
  // Quick timeline horizon tabs: 1D, 3D, 7D, 14D, 30D
  const [timeHorizon, setTimeHorizon] = useState<number>(3); // default 3 days

  // Utility to generate dynamic list of next calendar dates starting from systemDate
  const getPrecedingForecastDatesList = (startDateStr: string, count: number = 30): string[] => {
    const dates: string[] = [];
    const baseDate = new Date(startDateStr);
    if (isNaN(baseDate.getTime())) {
      // fallback
      for (let i = 0; i < count; i++) {
        dates.push(`2026-06-0${i + 5}`);
      }
      return dates;
    }
    for (let i = 0; i < count; i++) {
      const d = new Date(baseDate);
      d.setDate(baseDate.getDate() + i);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      dates.push(`${yyyy}-${mm}-${dd}`);
    }
    return dates;
  };

  // Generate 30 days of foresight dates
  const next30DaysList = useMemo(() => {
    return getPrecedingForecastDatesList(systemDate, 30);
  }, [systemDate]);

  // Synchronize selectedDate when systemDate changes (new operations day chosen)
  useEffect(() => {
    const tomorrow = getTomorrowDate(systemDate);
    setSelectedDate(tomorrow);
  }, [systemDate]);

  // Maintain selectedDate inside chosen lookahead planning boundaries
  useEffect(() => {
    const activeDates = next30DaysList.slice(0, timeHorizon);
    if (!activeDates.includes(selectedDate) && activeDates.length > 0) {
      setSelectedDate(activeDates[0]);
    }
  }, [timeHorizon, next30DaysList]);
  
  // Search state for operation selection in Replacement Engine
  const [selectedShortageLine, setSelectedShortageLine] = useState<number | null>(1);
  const [selectedShortageOp, setSelectedShortageOp] = useState<string>('Collar Join');
  const [replacementSearch, setReplacementSearch] = useState<string>('');

  // Form states to Add Planned Non-Production Activity
  const [showPlanActivityForm, setShowPlanActivityForm] = useState(false);
  const [formEmployeeId, setFormEmployeeId] = useState('');
  const [formActivityType, setFormActivityType] = useState<WorkforceAssignmentStatus>('Training');
  const [formActivityDate, setFormActivityDate] = useState(tomorrowStr);
  const [formNotes, setFormNotes] = useState('');

  // Filter employees matching search for scheduling
  const [schedulingEmpSearch, setSchedulingEmpSearch] = useState('');
  const filteredSchedulingEmployees = useMemo(() => {
    if (!schedulingEmpSearch) return employees.slice(0, 5);
    return employees.filter(emp => 
      emp.name.toLowerCase().includes(schedulingEmpSearch.toLowerCase()) ||
      emp.id.toLowerCase().includes(schedulingEmpSearch.toLowerCase())
    ).slice(0, 8);
  }, [employees, schedulingEmpSearch]);

  // Handle scheduling activity submission
  const handleScheduleActivity = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formEmployeeId) return;
    
    const emp = employees.find(emp => emp.id === formEmployeeId);
    if (!emp) return;

    // Use Context method to assign
    assignEmployeeForDate(
      emp.id,
      0, // Line 0 represents offline/support
      formNotes || `${formActivityType} session`,
      formActivityType,
      formActivityDate
    );

    // Reset Form
    setShowPlanActivityForm(false);
    setFormNotes('');
    setSchedulingEmpSearch('');
  };

  // Core forecast compilation logic for a single target date
  const compileForecastForDate = (targetDateStr: string) => {
    const linesData = [1, 2, 3, 4].map(lineId => {
      const lineObj = productionLines.find(l => l.id === lineId);
      const requiredOperators = lineObj?.requiredManpower || 12;
      const supervisor = lineObj?.supervisor || 'N/A';
      const defaultOp = lineObj?.bottleneckOperation || 'Sewing Base';

      // Standard operators originally scheduled on lineId
      const defaultLineEmployees = employees.filter(emp => emp.lineNumber === lineId);
      const currentlyAssignedCount = defaultLineEmployees.length;

      // 1. Confirmed absences: Approved leaves covering targetDateStr
      const approvedLeavesForDate = leaveRequests.filter(l => 
        l.status === 'Approved' && 
        l.startDate <= targetDateStr && 
        targetDateStr <= l.endDate
      );
      const approvedLeaveEmployeeIds = new Set(approvedLeavesForDate.map(l => l.employeeId.toUpperCase()));

      // 2. Confirmed absences: Planned non-production assignments in employeeAssignments for targetDateStr
      // Statuses other than "Assigned" or "Unassigned" are active blockages (Training, Meeting, Quality Audit, Maintenance)
      const offlineStatusTypes = ['Training', 'Meeting', 'Quality Audit', 'Maintenance Support', 'Off-Line Activity', 'Leave'];

      const confirmedAbsencesList: Array<{ employee: Employee; type: 'Leave' | 'Training' | 'Meeting' | 'Audit' | 'Maintenance' | 'Other'; details: string }> = [];

      defaultLineEmployees.forEach(emp => {
        // Check approved leave request first
        if (approvedLeaveEmployeeIds.has(emp.id.toUpperCase())) {
          const lv = approvedLeavesForDate.find(l => l.employeeId.toUpperCase() === emp.id.toUpperCase());
          confirmedAbsencesList.push({
            employee: emp,
            type: 'Leave',
            details: `Approved Leave: ${lv?.leaveType || 'General'} (${lv?.reason || 'No comments'})`
          });
          return;
        }

        // Check if there's a scheduled offline project assignment for tomorrow or target date
        const customAsg = employeeAssignments.find(a => 
          a.employeeId.toUpperCase() === emp.id.toUpperCase() && 
          a.assignmentDate === targetDateStr &&
          offlineStatusTypes.includes(a.assignmentStatus)
        );

        if (customAsg) {
          let actType: 'Training' | 'Meeting' | 'Audit' | 'Maintenance' | 'Other' = 'Other';
          if (customAsg.assignmentStatus === 'Training') actType = 'Training';
          else if (customAsg.assignmentStatus === 'Meeting') actType = 'Meeting';
          else if (customAsg.assignmentStatus === 'Quality Audit') actType = 'Audit';
          else if (customAsg.assignmentStatus === 'Maintenance Support') actType = 'Maintenance';

          confirmedAbsencesList.push({
            employee: emp,
            type: actType,
            details: `${customAsg.assignmentStatus}: ${customAsg.assignedOperation || 'Non-production schedule'}`
          });
        }
      });

      const confirmedAbsencesCount = confirmedAbsencesList.length;

      // 3. For operators who are active and do not have confirmed leave/offline schedules, we run the secondary heuristic prediction:
      const activeRemainingEmployees = defaultLineEmployees.filter(emp => 
        !confirmedAbsencesList.some(c => c.employee.id.toUpperCase() === emp.id.toUpperCase())
      );

      const predictiveAbsencesList: Array<{ employee: Employee; probability: number; factor: string }> = [];
      let expectedPredictiveValue = 0;

      const dObj = new Date(targetDateStr);
      const dayOfWeek = dObj.getDay();
      const dayOfMonth = dObj.getDate();

      activeRemainingEmployees.forEach(emp => {
        let prob = 100 - emp.historicalAttendanceRate; // Base absence probability
        let factor = 'Historical background rate';

        // Friday and Monday are high risk days (extended weekends)
        if (dayOfWeek === 1 || dayOfWeek === 5) {
          prob += 12;
          factor = dayOfWeek === 1 ? 'Monday ramp-up proximity' : 'Friday long-weekend proximity';
        } else if (dayOfWeek === 0 || dayOfWeek === 6) {
          prob += 5;
          factor = 'Weekend shift variance';
        }

        // Salary payout window (1-7 low risk, 25+ higher risk)
        if (dayOfMonth >= 1 && dayOfMonth <= 7) {
          prob -= 5;
        } else if (dayOfMonth >= 25) {
          prob += 8;
          factor = 'End-of-month financial settlement period';
        }

        // Adjust by individual risk score
        if (emp.riskScore > 45) {
          prob += 10;
          factor = 'Elevated historical risk profile';
        }

        if (emp.skillCategory === 'Helper' || emp.skillCategory === 'Ironer/Finisher') {
          prob += 8;
        }

        // Cap appropriately
        prob = Math.min(Math.max(Math.round(prob), 4), 95);
        expectedPredictiveValue += (prob / 100);

        predictiveAbsencesList.push({
          employee: emp,
          probability: prob,
          factor
        });
      });

      // expected round values of predictive absences
      const predictedAbsencesCount = Math.ceil(expectedPredictiveValue);

      // 4. Expected available operators = currently assigned operators - confirmed - predicted
      const expectedAvailable = Math.max(0, currentlyAssignedCount - confirmedAbsencesCount - predictedAbsencesCount);

      // Shortage
      const shortage = Math.max(0, requiredOperators - expectedAvailable);

      // Utilization %
      const utilizationPercent = requiredOperators > 0 
        ? Math.min(100, Math.round((expectedAvailable / requiredOperators) * 100))
        : 100;

      // Risk level mapping
      let riskLevel: 'Low' | 'Medium' | 'High' | 'Critical' = 'Low';
      if (shortage >= 4) riskLevel = 'Critical';
      else if (shortage >= 2) riskLevel = 'High';
      else if (shortage >= 1) riskLevel = 'Medium';

      return {
        lineId,
        supervisor,
        defaultOp,
        requiredOperators,
        currentlyAssignedCount,
        confirmedAbsencesCount,
        confirmedAbsencesList,
        predictedAbsencesCount,
        predictiveAbsencesList,
        expectedAvailable,
        shortage,
        utilizationPercent,
        riskLevel
      };
    });

    const totalRequired = linesData.reduce((acc, l) => acc + l.requiredOperators, 0);
    const totalAvailable = linesData.reduce((acc, l) => acc + l.expectedAvailable, 0);
    const totalShortage = linesData.reduce((acc, l) => acc + l.shortage, 0);
    const totalConfirmedAbs = linesData.reduce((acc, l) => acc + l.confirmedAbsencesCount, 0);
    const totalPredictedAbs = linesData.reduce((acc, l) => acc + l.predictedAbsencesCount, 0);
    const overallUtilization = totalRequired > 0 ? Math.round((totalAvailable / totalRequired) * 100) : 100;

    return {
      targetDateStr,
      linesData,
      totalRequired,
      totalAvailable,
      totalShortage,
      totalConfirmedAbs,
      totalPredictedAbs,
      overallUtilization
    };
  };

  // Compile detailed forecast for currently selected calendar date
  const activeForecast = useMemo(() => {
    return compileForecastForDate(selectedDate);
  }, [selectedDate, employees, leaveRequests, employeeAssignments, productionLines]);

  // Compile aggregate timeline summaries for the forecast cards (1D to 30D depending on tab selection)
  const timelineForecastList = useMemo(() => {
    const datesToForecast = next30DaysList.slice(0, timeHorizon);
    return datesToForecast.map(dStr => compileForecastForDate(dStr));
  }, [next30DaysList, timeHorizon, employees, leaveRequests, employeeAssignments, productionLines]);

  // Automatic Alerts generator based on current dynamic calculations
  const safetyAlerts = useMemo(() => {
    const alerts: Array<{ lineId: number; title: string; desc: string; severity: 'Critical' | 'Warning' }> = [];
    activeForecast.linesData.forEach(line => {
      if (line.shortage >= 4) {
        alerts.push({
          lineId: line.lineId,
          title: `Severe Operator Shortage on Line ${line.lineId}`,
          desc: `Critical Alert: Expected availability is ${line.expectedAvailable}/${line.requiredOperators} (Shortage: ${line.shortage} operators). Approved Leaves: ${line.confirmedAbsencesCount}, Forecasted: ${line.predictedAbsencesCount}.`,
          severity: 'Critical'
        });
      } else if (line.shortage >= 1) {
        alerts.push({
          lineId: line.lineId,
          title: `Manpower Deficit on Line ${line.lineId}`,
          desc: `Warning: Proactive planning required. expected shortage of ${line.shortage} skill operators for operation '${line.defaultOp}'.`,
          severity: 'Warning'
        });
      }
    });
    return alerts;
  }, [activeForecast]);

  // Get active selected line details for replacement suggestions
  const activeLineDetail = useMemo(() => {
    return activeForecast.linesData.find(l => l.lineId === selectedShortageLine) || activeForecast.linesData[0];
  }, [activeForecast, selectedShortageLine]);

  // PROACTIVE REPLACEMENT ENGINE
  // Search and rank floating, multi-skilled, and cross-trained workers who are not busy on the selected date
  const recommendedReplacements = useMemo(() => {
    if (!selectedShortageOp) return [];

    // Filter candidate lists
    const candidates = employees.filter(emp => {
      // 1. Filter out employees who are absent on approved leave for selected date
      const hasApprovedLeave = leaveRequests.some(l => 
        l.employeeId === emp.id && 
        l.status === 'Approved' && 
        l.startDate <= selectedDate && 
        selectedDate <= l.endDate
      );
      if (hasApprovedLeave) return false;

      // 2. Filter out employees scheduled for offline blockages (Training, Meeting, etc.) on selected date
      const isOfflineScheduled = employeeAssignments.some(a => 
        a.employeeId.toUpperCase() === emp.id.toUpperCase() && 
        a.assignmentDate === selectedDate && 
        ['Training', 'Meeting', 'Quality Audit', 'Maintenance Support', 'Leave'].includes(a.assignmentStatus)
      );
      if (isOfflineScheduled) return false;

      // 3. Must have a skill in selectedShortageOp
      return emp.skills.some(sk => sk.operationName.toLowerCase().includes(selectedShortageOp.toLowerCase()));
    });

    const evaluated = candidates.map(emp => {
      const skillDetails = emp.skills.find(sk => sk.operationName.toLowerCase().includes(selectedShortageOp.toLowerCase()));
      const proficiency = skillDetails ? skillDetails.proficiency : 40;

      const attendance = emp.attendanceReliability || emp.historicalAttendanceRate || 95;
      const defectRateVal = emp.defectRate !== undefined ? emp.defectRate : 2.5;
      const avgPcs = emp.avgPcsProducedPerDay || 100;
      
      const qapsBase = calculateQAPS(proficiency, emp.baseEfficiency, attendance, defectRateVal, avgPcs);

      let statusBonus = 0;
      let warningText = '';
      let isDisruptive = false;

      // Check selectedDate assignment status to see if they are a Floater or assigned elsewhere
      const assignmentOnSelectedDate = employeeAssignments.find(a => 
        a.employeeId.toUpperCase() === emp.id.toUpperCase() && 
        a.assignmentDate === selectedDate
      );

      if (emp.department === 'Floater' || emp.lineNumber === 0) {
        statusBonus += 15; // floaters get premium recommendation score
        warningText = 'Floater Department (Zero line disruption)';
      } else if (assignmentOnSelectedDate && assignmentOnSelectedDate.assignedLine === selectedShortageLine) {
        statusBonus += 5;
        warningText = 'Already assigned on this line';
      } else if (assignmentOnSelectedDate && assignmentOnSelectedDate.assignedLine !== selectedShortageLine) {
        statusBonus -= 25; // severe penalty for breaking line balance of another line
        warningText = `Assigned to Line ${assignmentOnSelectedDate.assignedLine} (Reassignment will cause secondary disruption)`;
        isDisruptive = true;
      } else {
        statusBonus += 10;
        warningText = 'Unassigned/Supporting on this date';
      }

      // bonus for multi-skilled operators (> 1 skill listed)
      if (emp.skills.length >= 2) {
        statusBonus += 10;
      }

      // Final scoring merges QAPS under balanced criteria
      const overallScore = Math.max(10, Math.min(99, Math.round(
        qapsBase + (statusBonus * 0.4)
      )));

      return {
        employee: emp,
        overallScore,
        skillLevel: `${proficiency}%`,
        proficiency,
        qapsBase,
        warningText,
        isDisruptive
      };
    });

    // Sort by overall score descending
    return evaluated.sort((a, b) => b.overallScore - a.overallScore);
  }, [employees, employeeAssignments, leaveRequests, selectedShortageOp, selectedDate, selectedShortageLine]);

  // Fast allocation of recommended player to cover shortage
  const handleAssignReplacement = (empId: string) => {
    if (!selectedShortageLine) return;
    
    // Assign replacement operator securely in future dates
    assignEmployeeForDate(
      empId,
      selectedShortageLine,
      selectedShortageOp,
      'Assigned',
      selectedDate
    );
  };

  return (
    <div className="space-y-6">

      {/* HEADER SECTION */}
      <div className="bg-gradient-to-r from-indigo-700 via-blue-600 to-indigo-600 text-white rounded-xl p-5 md:p-6 relative overflow-hidden shadow-lg border border-indigo-500/30">
        <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
          <Sparkles className="w-48 h-48 text-indigo-100 rotate-12" />
        </div>
        <div className="relative z-10 space-y-2">
          <span className="bg-white/10 text-white font-mono text-[9px] px-2.5 py-1 rounded-full border border-white/20 uppercase tracking-widest font-semibold inline-flex items-center space-x-1">
            <Sparkles className="w-3 h-3 mr-1 text-yellow-300 animate-pulse" />
            <span>Industrial Engineering Forecast Core V2.4</span>
          </span>
          <h2 className="text-xl md:text-2xl font-display font-bold text-white mt-1">
            Manpower Forecasting & Operator Shortage System
          </h2>
          <p className="text-indigo-100 text-xs md:text-sm font-sans max-w-3xl leading-relaxed">
            Prioritizes actual operational data (approved leave requests, planned training, and scheduled meetings) before running secondary machine learning models to identify future line-wise shortages.
          </p>
        </div>
      </div>

      {/* LIVE ALERTS AND SHORTAGE BANNER */}
      {safetyAlerts.length > 0 && (
        <div className="bg-rose-50 dark:bg-rose-950/20 border border-rose-250 dark:border-rose-900/30 rounded-xl p-4 flex items-start space-x-3">
          <AlertOctagon className="w-5 h-5 text-rose-500 flex-shrink-0 mt-0.5" />
          <div className="space-y-1 min-w-0">
            <span className="text-xs font-bold text-rose-700 dark:text-rose-450 block">Proactive Action Required: {safetyAlerts.length} Shortages Detected</span>
            <div className="space-y-1">
              {safetyAlerts.map((al, idx) => (
                <p key={idx} className="text-[11px] text-slate-650 dark:text-slate-400">
                  • <strong>{al.title}</strong>: {al.desc}
                </p>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* HORIZON SELECTOR AND CALENDAR */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

        {/* TIME HORIZON AND PLANNING CALENDAR CARD */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm col-span-1 lg:col-span-12 space-y-5">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
            <div>
              <h3 className="font-display font-semibold text-slate-800 dark:text-neutral-100 text-sm flex items-center">
                <CalendarDays className="w-4.5 h-4.5 mr-2 text-indigo-500" />
                Workforce Planning Calendar & Foresight Grid
              </h3>
              <p className="text-xs text-slate-450">Select a date below to view detailed sewing line availability metrics</p>
            </div>
            
            <div className="flex items-center space-x-2">
              <span className="text-xs text-slate-400 mr-1 font-medium font-sans">Look-ahead:</span>
              <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-800 p-0.5 bg-slate-50 dark:bg-slate-950">
                {[
                  { label: 'Today+1 Day', limit: 2 },
                  { label: '3 Days', limit: 3 },
                  { label: '7 Days', limit: 7 },
                  { label: '14 Days', limit: 14 },
                  { label: '30 Days', limit: 30 }
                ].map(tab => (
                  <button
                    key={tab.limit}
                    onClick={() => {
                      setTimeHorizon(tab.limit);
                    }}
                    className={`px-3 py-1 text-[11px] rounded-md font-medium transition-all ${
                      timeHorizon === tab.limit
                        ? 'bg-white dark:bg-slate-805 text-indigo-600 dark:text-indigo-400 shadow-sm'
                        : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* DYNAMIC SCROLLABLE DAY FORECASES CARDS */}
          <div className="flex space-x-3 overflow-x-auto pb-3 custom-scrollbar">
            {next30DaysList.slice(0, timeHorizon).map(dateStr => {
              const forecast = compileForecastForDate(dateStr);
              const dateObj = new Date(dateStr);
              const dayNum = dateObj.getDate();
              const dayLabel = dateObj.toLocaleDateString('en-US', { weekday: 'short' });
              const monthLabel = dateObj.toLocaleDateString('en-US', { month: 'short' });
              
              const isSelected = selectedDate === dateStr;
              const isSystemDate = dateStr === systemDate;

              // Color indicators base on shortage size
              let ringColor = 'border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900';
              let badgeColor = 'bg-slate-50 text-slate-500 dark:bg-slate-950';

              if (forecast.totalShortage >= 6) {
                ringColor = isSelected 
                  ? 'border-red-500 ring-2 ring-red-450 bg-red-50/10 dark:bg-red-950/10' 
                  : 'border-red-200 hover:border-red-400 bg-red-50/10 dark:bg-red-950/5';
                badgeColor = 'bg-red-500 text-white animate-pulse';
              } else if (forecast.totalShortage >= 3) {
                ringColor = isSelected 
                  ? 'border-orange-500 ring-2 ring-orange-450 bg-orange-50/10 dark:bg-orange-950/10' 
                  : 'border-orange-200 hover:border-orange-400 bg-orange-50/10 dark:outline-orange-950/5';
                badgeColor = 'bg-orange-500 text-white';
              } else if (forecast.totalShortage >= 1) {
                ringColor = isSelected 
                  ? 'border-yellow-450 ring-2 ring-yellow-400 bg-yellow-50/10 dark:bg-yellow-950/10' 
                  : 'border-yellow-250 hover:border-yellow-400 bg-yellow-50/5 dark:bg-yellow-950/5';
                badgeColor = 'bg-yellow-450 text-slate-900';
              } else {
                ringColor = isSelected 
                  ? 'border-emerald-500 ring-2 ring-emerald-400 bg-emerald-50/5 dark:bg-emerald-950/10' 
                  : 'border-slate-208 hover:border-emerald-300';
                badgeColor = 'bg-emerald-500 text-white';
              }

              return (
                <button
                  key={dateStr}
                  onClick={() => setSelectedDate(dateStr)}
                  className={`flex-shrink-0 w-[84px] py-2.5 rounded-xl border text-center transition-all cursor-pointer ${ringColor} ${
                    isSelected ? 'shadow-md scale-102 transform' : 'shadow-xs hover:bg-slate-50 dark:hover:bg-slate-850/30'
                  }`}
                >
                  <span className="text-[10px] text-slate-400 dark:text-slate-500 uppercase font-bold tracking-wider block leading-none">
                    {dayLabel} {monthLabel}
                  </span>
                  <span className="text-xl font-mono font-black text-slate-800 dark:text-white block pt-1.5 pb-2">
                    {dayNum}
                  </span>
                  <div className="px-1.5">
                    <span className={`text-[8.5px] font-bold px-1.5 py-0.5 rounded-full block truncate ${badgeColor}`}>
                      {forecast.totalShortage > 0 ? `-${forecast.totalShortage} Ops` : '100% OK'}
                    </span>
                  </div>
                  {isSystemDate && (
                    <span className="text-[7.5px] text-indigo-500 dark:text-indigo-400 font-bold block mt-1 uppercase font-mono">Today</span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-4 text-[10.5px] font-sans text-slate-500 bg-slate-50 dark:bg-slate-950/50 p-3 rounded-lg border border-slate-100 dark:border-slate-800/80">
            <span className="font-semibold text-slate-705 dark:text-slate-300">Shortage Severity Legend:</span>
            <span className="inline-flex items-center"><span className="w-2.5 h-2.5 rounded-full bg-emerald-505 mr-1.5 border border-emerald-600"></span>Green: No shortages</span>
            <span className="inline-flex items-center"><span className="w-2.5 h-2.5 rounded-full bg-yellow-450 mr-1.5 border border-yellow-500"></span>Yellow: Minor (1-2)</span>
            <span className="inline-flex items-center"><span className="w-2.5 h-2.5 rounded-full bg-orange-500 mr-1.5 border border-orange-600"></span>Orange: Moderate (3-4)</span>
            <span className="inline-flex items-center"><span className="w-2.5 h-2.5 rounded-full bg-red-500 mr-1.5 border border-red-650 animate-pulse"></span>Red: Critical (5+ deficiency)</span>
            
            <button 
              onClick={() => {
                setShowPlanActivityForm(true);
                setFormActivityDate(selectedDate);
              }}
              className="ml-auto inline-flex items-center space-x-1 px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white text-[10.5px] font-bold rounded-md shadow-xs transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Schedule Non-Production Task</span>
            </button>
          </div>
        </div>
      </div>

      {/* RE-USABLE SCHEDULE NON-PRODUCTION MODAL / FORM */}
      <AnimatePresence>
        {showPlanActivityForm && (
          <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-xs flex items-center justify-center p-4 z-55">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl max-w-md w-full shadow-2xl p-5 overflow-hidden text-sm"
            >
              <div className="flex justify-between items-start pb-3 border-b border-slate-100 dark:border-slate-805">
                <div>
                  <h4 className="font-display font-semibold text-slate-800 dark:text-neutral-100 text-sm">Schedule Planned Non-Production Activity</h4>
                  <p className="text-xs text-slate-400">Restricts operators from lines to reflect automatically in future forecasts</p>
                </div>
                <button 
                  onClick={() => setShowPlanActivityForm(false)} 
                  className="text-slate-400 hover:text-slate-655"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleScheduleActivity} className="space-y-4 pt-4">
                <div className="space-y-1">
                  <label className="text-[10.5px] font-bold uppercase text-slate-500 block">Select Target Date</label>
                  <input
                    type="date"
                    value={formActivityDate}
                    onChange={(e) => setFormActivityDate(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-203 dark:border-slate-800 rounded-lg px-3 py-1.5 font-mono text-xs text-slate-800 dark:text-white"
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex justify-between">
                    <label className="text-[10.5px] font-bold uppercase text-slate-500 block">Search & Select Employee</label>
                    <span className="text-[9.5px] text-indigo-505 font-mono font-semibold">Required</span>
                  </div>
                  <div className="flex items-center bg-slate-50 dark:bg-slate-955 border border-slate-202 dark:border-slate-800 rounded-lg px-2 text-xs">
                    <Search className="w-3.5 h-3.5 text-slate-400 mr-1.5" />
                    <input
                      type="text"
                      placeholder="Type name or code (e.g., IN203)..."
                      value={schedulingEmpSearch}
                      onChange={(e) => setSchedulingEmpSearch(e.target.value)}
                      className="w-full bg-transparent border-0 focus:ring-0 py-1.5 outline-none font-sans text-xs text-slate-800 dark:text-white"
                    />
                  </div>

                  <div className="border border-slate-100 dark:border-slate-805/80 rounded-lg max-h-36 overflow-y-auto space-y-1 p-1.5 bg-slate-50/50 dark:bg-slate-950/20">
                    {filteredSchedulingEmployees.map(emp => (
                      <button
                        type="button"
                        key={emp.id}
                        onClick={() => {
                          setFormEmployeeId(emp.id);
                          setSchedulingEmpSearch(`${emp.name} (${emp.id})`);
                        }}
                        className={`w-full text-left p-1.5 rounded-md flex items-center justify-between text-xs transition-colors cursor-pointer ${
                          formEmployeeId === emp.id 
                            ? 'bg-indigo-600 text-white' 
                            : 'hover:bg-slate-102 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        <div className="flex items-center space-x-2 min-w-0">
                          <EmployeeAvatar 
                            photoUrl={emp.photoUrl} 
                            name={emp.name} 
                            className="w-5 h-5 rounded-full" 
                          />
                          <div className="truncate">
                            <span className="font-bold">{emp.name}</span>
                            <span className="text-[9.5px] opacity-80 block">{emp.designation} · Line {emp.lineNumber === 0 ? 'Floater' : emp.lineNumber}</span>
                          </div>
                        </div>
                        {formEmployeeId === emp.id && <Check className="w-3.5 h-3.5 text-white flex-shrink-0" />}
                      </button>
                    ))}
                    {filteredSchedulingEmployees.length === 0 && (
                      <span className="text-[11px] text-slate-400 block text-center py-2">No matching employees</span>
                    )}
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10.5px] font-bold uppercase text-slate-500 block">Activity / Blockage Type</label>
                  <select
                    value={formActivityType}
                    onChange={(e) => setFormActivityType(e.target.value as WorkforceAssignmentStatus)}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-203 dark:border-slate-850 rounded-lg px-3 py-1.5 text-xs text-slate-800 dark:text-white outline-none"
                  >
                    <option value="Training">Training Session</option>
                    <option value="Meeting">Strategic Plant Meeting</option>
                    <option value="Quality Audit">Quality Audit Duty</option>
                    <option value="Maintenance Support">Maintenance Support Desk</option>
                    <option value="Off-Line Activity">Other Approved Off-Line Plan</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10.5px] font-bold uppercase text-slate-500 block">Activity / Assignment Notes</label>
                  <input
                    type="text"
                    placeholder="Enter notes (e.g. ISO 9001 internal training)"
                    value={formNotes}
                    onChange={(e) => setFormNotes(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-203 dark:border-slate-850 rounded-lg px-3 py-1.5 text-xs text-slate-800 dark:text-white outline-none"
                  />
                </div>

                <div className="flex space-x-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowPlanActivityForm(false)}
                    className="flex-1 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-350 hover:bg-slate-50 dark:hover:bg-slate-850 p-2 rounded-lg text-xs font-semibold cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white p-2 rounded-lg text-xs font-bold transition-all shadow-sm cursor-pointer"
                  >
                    Confirm & Plan
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* CHOSEN DATE DISPLAY & HIGHLIGHT CARD */}
      <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800/80 rounded-xl p-5 flex flex-col md:flex-row justify-between items-start md:items-center shadow-sm gap-5">
        <div className="space-y-1">
          <span className="font-mono text-[10.5px] font-bold text-indigo-600 dark:text-indigo-400 tracking-wider block uppercase">ACTIVE FORECAST WINDOW</span>
          <div className="flex items-center space-x-2">
            <h4 className="text-lg font-display font-black text-slate-800 dark:text-white">
              Confirmed and Forecasted Workforce Availability
            </h4>
            <span className="bg-indigo-100 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-900/30 font-mono text-[11px] font-bold px-2.5 py-0.5 rounded-full">
              {selectedDate}
            </span>
          </div>
          <p className="text-xs text-slate-450 leading-relaxed max-w-2xl">
            This dashboard segments direct sewing floor headcount into approved blockages and remaining heuristic attendance predictions for exact accuracy.
          </p>
        </div>

        {/* FACTORY LEVEL SUMMARY METRIC BULLETS */}
        <div className="flex items-center space-x-4 bg-white dark:bg-slate-950 border border-slate-100 dark:border-slate-850 p-3.5 rounded-xl flex-shrink-0 shadow-xs">
          <div className="text-center px-2 border-r border-slate-100 dark:border-slate-850">
            <span className="text-slate-400 block text-[9.5px] font-bold uppercase">Overall Util %</span>
            <span className="text-xl font-mono font-black text-slate-800 dark:text-white">{activeForecast.overallUtilization}%</span>
          </div>
          <div className="text-center px-2 border-r border-slate-100 dark:border-slate-850">
            <span className="text-rose-455 block text-[9.5px] font-bold uppercase">Total Shortage</span>
            <span className="text-xl font-mono font-black text-rose-500">{activeForecast.totalShortage} Ops</span>
          </div>
          <div className="text-center px-2">
            <span className="text-indigo-505 block text-[9.5px] font-bold uppercase">Absences (Acc. + Pred.)</span>
            <span className="text-xl font-mono font-black text-slate-705 dark:text-indigo-450">
              {activeForecast.totalConfirmedAbs + activeForecast.totalPredictedAbs}
            </span>
          </div>
        </div>
      </div>

      {/* BODY SEGMENTS - LINE FORECASTS CARDS */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

        {/* LIST OF LINE CARDS WITH DETAILED METRICS GRID */}
        <div className="col-span-1 lg:col-span-8 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-display font-semibold text-slate-850 dark:text-neutral-100 text-sm">
              Sewing Module Line-wise Forecaster Details
            </h3>
            <span className="text-[10px] text-slate-400 font-bold uppercase">Live Compiled Status</span>
          </div>

          <div className="space-y-4">
            {activeForecast.linesData.map(line => {
              const riskColor = line.riskLevel === 'Critical' 
                ? 'text-red-500 bg-red-50 dark:bg-red-950/20 border-red-105 dark:border-red-900/30' 
                : line.riskLevel === 'High' 
                  ? 'text-orange-500 bg-orange-50 dark:bg-orange-955/20 border-orange-105 dark:border-orange-900/30' 
                  : line.riskLevel === 'Medium' 
                    ? 'text-amber-500 bg-amber-50 dark:bg-amber-955/20 border-amber-105 dark:border-amber-950/30' 
                    : 'text-emerald-500 bg-emerald-50/50 border-emerald-100 dark:border-emerald-900/20';

              const riskBadgeColor = line.riskLevel === 'Critical' 
                ? 'bg-red-500 text-white' 
                : line.riskLevel === 'High' 
                  ? 'bg-orange-500 text-white' 
                  : line.riskLevel === 'Medium' 
                    ? 'bg-amber-500 text-slate-900' 
                    : 'bg-emerald-500 text-white';

              const isShortageSelected = selectedShortageLine === line.lineId;

              const lineRecommAction = () => {
                if (line.shortage >= 4) {
                  return `ACTION REQUIRED: Extremely high disruption risk. Arrange ${line.shortage} qualified cross-trained replacements from buffers.`;
                }
                if (line.shortage >= 1) {
                  return `RECOMMENDED: High bottleneck probability. Use the Replacement Engine on the right to proactively pre-assign floats.`;
                }
                return `STABILIZED: Operational capacity is healthy. General maintenance and normal buffers checked.`;
              };

              // EXTRACT METRICS FOR THE ASSIGNED STYLE, ALLOCATED STAFF, AND FUTURE LEAVES
              const lineStaff = employees.filter(emp => emp.lineNumber === line.lineId);
              const runningStyle = getLineRunningStyle(line.lineId);
              const operationsCount = runningStyle ? runningStyle.operations.length : 0;
              const runningStyleName = runningStyle ? runningStyle.name : 'Unassigned Style';

              // Filter approved or pending leaves for staff of this line that are upcoming (ends on or after systemDate)
              const upcomingLineLeaves = leaveRequests.filter(lr => 
                lineStaff.some(emp => emp.id.toUpperCase() === lr.employeeId.toUpperCase()) &&
                lr.endDate >= systemDate
              ).map(lr => {
                const emp = lineStaff.find(e => e.id.toUpperCase() === lr.employeeId.toUpperCase());
                return {
                  ...lr,
                  employeeName: emp ? emp.name : 'Unknown'
                };
              }).sort((a, b) => a.startDate.localeCompare(b.startDate));

              return (
                <div 
                  key={line.lineId}
                  onClick={() => {
                    setSelectedShortageLine(line.lineId);
                    setSelectedShortageOp(line.defaultOp);
                  }}
                  className={`border rounded-xl p-4 md:p-5 flex flex-col space-y-4 bg-white dark:bg-slate-900 transition-all cursor-pointer ${
                    isShortageSelected 
                      ? 'border-indigo-500 ring-1 ring-indigo-500/20 dark:ring-indigo-400/20 shadow-md transform scale-[1.005]' 
                      : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 shadow-xs'
                  }`}
                >
                  {/* Top line info */}
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="font-bold text-slate-800 dark:text-slate-200">Sewing Line {line.lineId}</span>
                        <span className="text-[10px] text-slate-400 font-mono">Supervisor: {line.supervisor}</span>
                      </div>
                      <span className="text-[10px] text-slate-400 block pt-0.5">Primary Bottleneck Op: <strong>{line.defaultOp}</strong></span>
                    </div>
                    <span className={`px-2 py-0.5 rounded text-[8.5px] font-bold uppercase tracking-wider ${riskBadgeColor}`}>
                      {line.riskLevel} RISK SHORTAGE
                    </span>
                  </div>

                  {/* Running Style Info Strip */}
                  <div className="flex items-center justify-between text-[11px] bg-slate-50 dark:bg-slate-950 border border-slate-150 dark:border-slate-850 px-3 py-1.5 rounded-lg">
                    <span className="text-slate-600 dark:text-slate-400">
                      Running Style: <strong className="text-slate-800 dark:text-slate-200">{runningStyleName}</strong>
                    </span>
                    <span className="font-mono text-indigo-600 dark:text-indigo-400 font-bold bg-white dark:bg-slate-900 px-2.5 py-0.5 rounded border border-slate-200 dark:border-slate-800 text-[10.5px]">
                      {operationsCount} Operations
                    </span>
                  </div>

                  {/* Core Metrics grid */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 border-y border-slate-100 dark:border-slate-805 py-3">
                    <div className="space-y-1">
                      <span className="text-[10px] text-slate-400 uppercase tracking-tight block">Required Operators</span>
                      <span className="text-lg font-mono font-black text-slate-800 dark:text-white">
                        {line.requiredOperators} <span className="text-[10px] font-normal text-slate-400">headcount</span>
                      </span>
                    </div>

                    <div className="space-y-1">
                      <span className="text-[10px] text-slate-400 uppercase tracking-tight block">Normally Assigned</span>
                      <span className="text-lg font-mono font-semibold text-slate-700 dark:text-slate-300">
                        {line.currentlyAssignedCount} <span className="text-[10.5px] font-normal text-slate-400">operators</span>
                      </span>
                    </div>

                    <div className="space-y-1">
                      <span className="text-[10px] text-slate-450 uppercase tracking-tight block">Confirmed Future Abs.</span>
                      <span className="text-lg font-mono font-bold text-indigo-600 dark:text-indigo-400">
                        {line.confirmedAbsencesCount} <span className="text-[10.5px] font-normal text-slate-400">planned</span>
                      </span>
                    </div>

                    <div className="space-y-1">
                      <span className="text-[10px] text-slate-400 uppercase tracking-tight block">Forecasted (Predictive) absences</span>
                      <span className="text-lg font-mono font-bold text-amber-500">
                        {line.predictedAbsencesCount} <span className="text-[10.5px] font-normal text-slate-405">probabilistic</span>
                      </span>
                    </div>
                  </div>

                  {/* Operational availability and forecast shortage */}
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4 bg-slate-50 dark:bg-slate-950 p-3 rounded-lg border border-slate-100 dark:border-slate-805/80 text-xs">
                    <div>
                      <span className="text-[9.5px] text-slate-400 uppercase tracking-wider block font-bold">Planned Availability</span>
                      <span className="text-base font-mono font-black text-emerald-500">
                        {line.expectedAvailable} <span className="text-[10px] font-normal text-slate-400">operators</span>
                      </span>
                    </div>

                    <div>
                      <span className="text-[9.5px] text-slate-400 uppercase tracking-wider block font-bold">Expected Shortage</span>
                      <span className={`text-base font-mono font-black ${line.shortage > 0 ? 'text-red-500 font-bold' : 'text-slate-500'}`}>
                        {line.shortage > 0 ? `-${line.shortage} defic.` : 'OK (0)'}
                      </span>
                    </div>

                    <div>
                      <span className="text-[9.5px] text-slate-400 uppercase tracking-wider block font-bold">Workforce Util. %</span>
                      <span className={`text-base font-mono font-black ${line.utilizationPercent < 85 ? 'text-red-505' : 'text-slate-800 dark:text-white'}`}>
                        {line.utilizationPercent}%
                      </span>
                    </div>
                  </div>

                  {/* Upcoming Leaves section */}
                  <div className="p-3 bg-slate-50 dark:bg-slate-950/40 rounded-xl border border-slate-200/50 dark:border-slate-800/80 space-y-3 test-card text-xs">
                    {/* Upcoming Leaves display and mapping */}
                    <div className="select-none space-y-1.5">
                      <span className="text-[10.5px] font-extrabold text-slate-650 dark:text-slate-400 block flex items-center gap-1 font-sans">
                        <Calendar className="w-3.5 h-3.5 text-indigo-500" />
                        Upcoming Leaves & Holiday Forecast ({upcomingLineLeaves.length})
                      </span>
                      {upcomingLineLeaves.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-0.5">
                          {upcomingLineLeaves.map((leave, li) => {
                            const isApproved = leave.status === 'Approved';
                            const statusColor = isApproved 
                              ? 'text-emerald-700 dark:text-emerald-400 bg-emerald-50/60 dark:bg-emerald-955/15 border-emerald-100/50 dark:border-emerald-900/20' 
                              : 'text-amber-700 dark:text-amber-400 bg-amber-50/60 dark:bg-amber-955/15 border-amber-100/50 dark:border-amber-900/20';
                            
                            return (
                              <div 
                                key={li} 
                                className={`p-2 rounded-lg border flex flex-col space-y-0.5 text-[10.5px] ${statusColor}`}
                              >
                                <div className="flex justify-between items-center font-bold">
                                  <span className="text-slate-850 dark:text-neutral-100 truncate max-w-[124px]">{leave.employeeName}</span>
                                  <span className="text-[8.5px] px-1.5 py-0.25 rounded-md font-bold uppercase tracking-wider border">
                                    {leave.status}
                                  </span>
                                </div>
                                <div className="text-[9.5px] text-slate-500 dark:text-slate-400 font-mono">
                                  Date: <strong className="text-slate-700 dark:text-neutral-300">{leave.startDate}</strong> to <strong className="text-slate-700 dark:text-neutral-300">{leave.endDate}</strong>
                                </div>
                                {leave.reason && (
                                  <div className="text-[9.5px] italic text-slate-450 truncate">
                                    Reason: "{leave.reason}"
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-[10px] text-slate-400 italic">No future or ongoing leaves registered for this line's staff.</p>
                      )}
                    </div>
                  </div>

                  {/* Confirmed absence breakdowns */}
                  {line.confirmedAbsencesCount > 0 && (
                    <div className="p-2 border border-indigo-100/30 bg-indigo-500/5 rounded-lg text-[10px] space-y-1 text-slate-658 dark:text-slate-400">
                      <span className="font-bold text-indigo-600 dark:text-indigo-400 uppercase">Confirmed Future Absences Breakdowns:</span>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5 pt-0.5">
                        {line.confirmedAbsencesList.map((cab, ci) => (
                          <div key={ci} className="flex items-center space-x-1.5 font-sans">
                            <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full flex-shrink-0"></span>
                            <span className="truncate"><strong>{cab.employee.name}</strong> · {cab.details}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Recommendation action and Selection status indicator */}
                  <div className="flex flex-col md:flex-row md:items-center justify-between text-[11px] pt-1 gap-2">
                    <span className={`flex-1 font-semibold leading-relaxed ${riskColor} px-2.5 py-1.5 rounded-lg border`}>
                      {lineRecommAction()}
                    </span>
                    
                    {isShortageSelected ? (
                      <span className="text-[10px] text-indigo-650 dark:text-indigo-405 font-black uppercase text-right tracking-wider animate-pulse inline-flex items-center space-x-1 pl-2 font-mono flex-shrink-0">
                        <span>Selected for replacements</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </span>
                    ) : (
                      <span className="text-[10px] text-slate-400 uppercase text-right font-bold hover:text-indigo-500 tracking-wider flex-shrink-0 transition-colors">
                        Click to plan replacements
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* PROACTIVE REPLACEMENT ENGINE CONTROLS PANEL */}
        <div className="col-span-1 lg:col-span-4 space-y-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-205 dark:border-slate-800 rounded-xl p-4 shadow-sm space-y-4">
            <div>
              <span className="bg-indigo-50 text-indigo-705 dark:bg-indigo-950/40 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-900/30 text-[9px] font-sans font-bold uppercase tracking-wider px-2 py-0.5 rounded-md">
                Proactive Replacements
              </span>
              <h3 className="font-display font-semibold text-slate-805 dark:text-neutral-100 text-sm mt-1.5">
                Proactive Replacement Engine
              </h3>
              <p className="text-[11px] text-slate-450 mt-0.5">Looks up operators qualified for candidate reallocations before shortages affect productivity</p>
            </div>

            {/* Selecting line bottleneck info */}
            <div className="p-3 bg-slate-50 dark:bg-slate-950 rounded-lg text-xs space-y-2 border border-slate-100 dark:border-slate-805">
              <div className="flex justify-between font-bold">
                <span>Selected Shortage:</span>
                <span className="text-indigo-600 dark:text-indigo-400">Sewing Line {selectedShortageLine}</span>
              </div>
              <div className="space-y-1">
                <label className="text-[9.5px] font-black uppercase text-slate-400 block pt-1">Shortage Target Operation</label>
                <select
                  value={selectedShortageOp}
                  onChange={(e) => setSelectedShortageOp(e.target.value)}
                  className="w-full bg-white dark:bg-slate-900 border border-slate-205 dark:border-slate-800 p-1.5 rounded text-xs text-slate-800 dark:text-white outline-none"
                >
                  <option value="Collar Join">Collar Join</option>
                  <option value="Sleeve Attach">Sleeve Attach</option>
                  <option value="Cuff Attach">Cuff Attach</option>
                  <option value="Hemming">Hemming</option>
                  <option value="Button Hole Stitch">Button Hole Stitch</option>
                  <option value="Side Seam Stitch">Side Seam Stitch</option>
                  <option value="Pocket Attach">Pocket Attach</option>
                  <option value="Sewing Base">General Sewing Base</option>
                </select>
              </div>
            </div>

            {/* Search filter candidate */}
            <div className="flex items-center bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-2 text-xs">
              <Search className="w-3.5 h-3.5 text-slate-400 mr-1.5" />
              <input
                type="text"
                placeholder="Search candidates list..."
                value={replacementSearch}
                onChange={(e) => setReplacementSearch(e.target.value)}
                className="w-full bg-transparent border-0 focus:ring-0 py-1.5 outline-none font-sans text-xs text-slate-800"
              />
            </div>

            {/* List of candidates with evaluated scoreboard */}
            <div className="space-y-3 max-h-[360px] overflow-y-auto custom-scrollbar pr-1 pt-1">
              {recommendedReplacements
                .filter(rec => !replacementSearch || rec.employee.name.toLowerCase().includes(replacementSearch.toLowerCase()))
                .map(cand => {
                  let scoreColor = 'text-green-500 bg-green-500/10 border-green-500/25';
                  if (cand.overallScore < 50) scoreColor = 'text-amber-500 bg-amber-500/10 border-amber-500/25';
                  else if (cand.isDisruptive) scoreColor = 'text-orange-500 bg-orange-500/10 border-orange-500/25';

                  return (
                    <div
                      key={cand.employee.id}
                      className="border border-slate-105 dark:border-slate-800/80 rounded-lg p-3 hover:bg-slate-50 dark:hover:bg-slate-950/20 text-xs flex flex-col space-y-2 transition-colors"
                    >
                      <div className="flex items-start justify-between min-w-0">
                        <div className="flex items-center space-x-2 min-w-0">
                          <EmployeeAvatar 
                            photoUrl={cand.employee.photoUrl} 
                            name={cand.employee.name} 
                            className="w-8 h-8 rounded-full" 
                          />
                          <div className="min-w-0">
                            <span className="font-bold text-slate-800 dark:text-slate-200 block truncate">{cand.employee.name}</span>
                            <span className="text-[9.5px] text-slate-400 block font-mono">
                              {cand.employee.id} · Line {cand.employee.lineNumber === 0 ? 'Floater' : cand.employee.lineNumber}
                            </span>
                          </div>
                        </div>

                        <div className={`px-2 py-1 select-none text-center rounded border font-mono font-bold flex-shrink-0 text-[11px] ${scoreColor}`}>
                          {cand.overallScore} <span className="block text-[7px] font-sans uppercase font-bold leading-none pt-0.5">Score</span>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-y-2 gap-x-1.5 border-t border-slate-100 dark:border-slate-850/60 pt-2 text-[9.5px] text-slate-450 font-mono">
                        <div>
                          <span className="block text-slate-400 text-[8px] uppercase">Skill Match</span>
                          <span className="font-bold text-slate-700 dark:text-slate-300">{cand.proficiency}%</span>
                        </div>
                        <div>
                          <span className="block text-slate-400 text-[8px] uppercase">Efficiency</span>
                          <span className="font-bold text-slate-700 dark:text-slate-300">{cand.employee.baseEfficiency}%</span>
                        </div>
                        <div>
                          <span className="block text-slate-400 text-[8px] uppercase">Pcs/Day</span>
                          <span className="font-bold text-slate-700 dark:text-slate-300">{cand.employee.avgPcsProducedPerDay || 100} pcs</span>
                        </div>
                        <div>
                          <span className="block text-slate-400 text-[8px] uppercase">Attendance</span>
                          <span className="font-bold text-slate-700 dark:text-slate-300">{cand.employee.attendanceReliability || cand.employee.historicalAttendanceRate || 95}%</span>
                        </div>
                        <div>
                          <span className="block text-slate-400 text-[8px] uppercase">Defect Rate</span>
                          <span className={`font-bold ${(cand.employee.defectRate || 0) > 4 ? 'text-red-500' : 'text-slate-750'}`}>{cand.employee.defectRate || 2.5}%</span>
                        </div>
                        <div>
                          <span className="block text-slate-404 text-[8px] uppercase font-bold text-indigo-500">QAPS Score</span>
                          <span className="font-extrabold text-indigo-600 dark:text-indigo-400">{cand.qapsBase}/100</span>
                        </div>
                      </div>

                      {cand.warningText && (
                        <div className={`text-[9px] font-sans p-1 rounded font-medium ${
                          cand.isDisruptive 
                            ? 'bg-rose-50 text-rose-600 dark:bg-rose-950/20' 
                            : 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950/20'
                        }`}>
                          • {cand.warningText}
                        </div>
                      )}

                      <button
                        onClick={() => handleAssignReplacement(cand.employee.id)}
                        className={`w-full py-1.5 rounded text-[10px] font-sans tracking-wide font-black transition-all flex items-center justify-center space-x-1 cursor-pointer ${
                          cand.isDisruptive
                            ? 'bg-amber-500 hover:bg-amber-600 text-slate-900'
                            : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                        }`}
                      >
                        <UserCheck className="w-3.5 h-3.5 mr-0.5" />
                        <span>Plan Proactive Replacement</span>
                      </button>
                    </div>
                  );
                })}

              {recommendedReplacements.length === 0 && (
                <div className="py-12 border border-dashed border-slate-200 dark:border-slate-800 text-center rounded-lg">
                  <AlertTriangle className="w-5 h-5 text-amber-500 mx-auto mb-2" />
                  <span className="text-slate-400 text-xs">No operators are currently available having skill in "{selectedShortageOp}" for {selectedDate}.</span>
                </div>
              )}
            </div>
          </div>

          <div className="bg-indigo-950 text-indigo-200 border border-indigo-900 rounded-xl p-4 space-y-2.5 text-xs">
            <span className="font-black text-indigo-400 block tracking-wider uppercase font-sans flex items-center">
              <Zap className="w-4 h-4 text-yellow-400 mr-1 animate-pulse" />
              Foresight Planning Strategy
            </span>
            <p className="text-[11px] leading-relaxed opacity-90">
              When a future shortage alert rings, it is optimal to reallocate standard operators <strong>at least 48 hours prior</strong> to prevent disruptions of line output rates. Pre-planned reallocations automatically populate corresponding check-in lists dynamically.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
