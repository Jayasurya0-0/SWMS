/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import { useAppState } from '../contexts/StateContext';
import { Employee, WorkforceAssignmentStatus, calculateQAPS } from '../types';
import { 
  Sliders, Layers, Award, Target, TrendingUp, Clock, Settings, AlertTriangle, 
  CheckCircle, Zap, ChevronRight, Info, Users, Search, Sparkles, ArrowRight, 
  Shield, BadgeInfo, X, ArrowUpRight, BarChart3, SlidersHorizontal, AlertCircle, 
  Trash2, RefreshCw, Calendar
} from 'lucide-react';
import { StyleChangeModal } from './StyleChangeModal';
import { motion, AnimatePresence } from 'motion/react';
import { EmployeeAvatar } from './EmployeeAvatar';

export const LineBalancingModule: React.FC = () => {
  const { 
    productionLines, 
    productionWorkforcePool: employees, 
    employeeAssignments, 
    attendance, 
    currentGarment, 
    garmentStyles,
    systemDate,
    setSystemDate,
    assignEmployee,
    currentUser,
    lockedLines,
    getLineRunningStyle,
    updateLineAllocation
  } = useAppState();

  const [selectedLineId, setSelectedLineId] = useState<number>(3); // Default to Line 3 (the standard problematic line for balancing study)
  const [showStyleChangeModal, setShowStyleChangeModal] = useState(false);
  const [selectedOpCode, setSelectedOpCode] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [lastActionMessage, setLastActionMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'kpi-analysis' | 'deviation-view'>('kpi-analysis');
  const [isDeploying, setIsDeploying] = useState<string | null>(null);

  // Real-time local clock
  const [systemTime, setSystemTime] = useState<Date>(new Date());
  
  useEffect(() => {
    const timer = setInterval(() => {
      setSystemTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatSystemTime = (date: Date) => {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const hh = String(date.getHours()).padStart(2, '0');
    const min = String(date.getMinutes()).padStart(2, '0');
    const ss = String(date.getSeconds()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss}`;
  };

  const isIEOrAdmin = currentUser?.role === 'Industrial Engineer' || currentUser?.role === 'Admin' || currentUser?.role === 'Production Manager';

  // 1. Identify style currently allocated to the selected line using our centralized hook
  const assignedStyle = useMemo(() => {
    return getLineRunningStyle(selectedLineId);
  }, [selectedLineId, getLineRunningStyle]);

  const activeLine = useMemo(() => {
    return productionLines.find(l => l.id === selectedLineId) || productionLines[0];
  }, [productionLines, selectedLineId]);

  // Target hourly quota (assume standard 8-hour shift)
  const lineTargetPcsHr = useMemo(() => {
    return Math.round(activeLine.targetQuantity / 8);
  }, [activeLine.targetQuantity]);

  // Target cycle time / Pitch time in seconds (takt cycle)
  const lineTargetPitchTime = useMemo(() => {
    return lineTargetPcsHr > 0 ? Math.round(3600 / lineTargetPcsHr) : 0;
  }, [lineTargetPcsHr]);

  // Attendance check helper
  const isOperatorPresent = (empId: string) => {
    const record = attendance.find(
      a => a.employeeId.toUpperCase() === empId.toUpperCase() && a.date === systemDate
    );
    return record ? (record.status === 'Present' || record.status === 'Late') : false;
  };

  // Scheduled leaves or non-sewing assignments checking
  const isOperatorUnavailableForProduction = (empId: string) => {
    const asg = employeeAssignments.find(
      a => a.employeeId.toUpperCase() === empId.toUpperCase() && a.assignmentDate === systemDate
    );
    if (!asg) return false;
    const s = asg.assignmentStatus;
    return s === 'Leave' || s === 'Training' || s === 'Meeting' || s === 'Quality Audit' || s === 'Maintenance Support';
  };

  // List of present operators physically assigned to this line right now
  const presentLineOperators = useMemo(() => {
    return employees.filter(emp => {
      if (emp.lineNumber !== selectedLineId) return false;
      if (!isOperatorPresent(emp.id)) return false;
      if (isOperatorUnavailableForProduction(emp.id)) return false;
      return true;
    });
  }, [employees, selectedLineId, attendance, employeeAssignments, systemDate]);

  // Maps each garment operation with its active staff on the floor and calculates capacity
  const operationMap = useMemo(() => {
    if (!assignedStyle || !assignedStyle.operations) return [];

    return assignedStyle.operations.map((op, idx) => {
      const assignedOperators = presentLineOperators.filter(emp => {
        const asg = employeeAssignments.find(
          a => a.employeeId.toUpperCase() === emp.id.toUpperCase() && a.assignmentDate === systemDate
        );
        
        if (asg && asg.assignedOperation) {
          const assignedOpStr = asg.assignedOperation.trim().toLowerCase();
          if (assignedOpStr === '' || assignedOpStr === 'unassigned') return false;
          
          const targetCode = op.operationCode.trim().toLowerCase();
          const targetName = op.name.trim().toLowerCase();
          return assignedOpStr === targetCode || 
                 assignedOpStr === targetName || 
                 targetName.includes(assignedOpStr) || 
                 assignedOpStr.includes(targetName);
        }
        
        return false;
      });

      const operatorsWithMetrics = assignedOperators.map(emp => {
        const opLower = op.name.toLowerCase();
        const specificSkill = emp.skills?.find(s => s.operationName.toLowerCase().includes(opLower) || opLower.includes(s.operationName.toLowerCase()));
        const opEfficiency = specificSkill ? specificSkill.proficiency : (emp.baseEfficiency || 70);
        // Each operator hour capacity in pieces = (60 mins / SMV) * operator efficiency rate %
        const capPerHour = Math.round((60 / op.smv) * (opEfficiency / 100));

        return {
          employee: emp,
          efficiency: opEfficiency,
          capacity: capPerHour
        };
      });

      const workstationActualCapacity = operatorsWithMetrics.reduce((sum, o) => sum + o.capacity, 0);
      const workstationTargetCapacity = Math.round((60 / op.smv) * (activeLine.targetEfficiency / 100));
      const workstationCycleTime = workstationActualCapacity > 0 ? Math.round(3600 / workstationActualCapacity) : 999;

      return {
        sequence: op.sequenceOrder || (idx + 1),
        code: op.operationCode,
        name: op.name,
        smv: op.smv,
        machineType: op.machineType,
        skillRequired: op.skillRequired,
        operators: operatorsWithMetrics,
        totalCapacity: workstationActualCapacity,
        targetCapacity: workstationTargetCapacity,
        cycleTime: workstationCycleTime,
        status: 'Balanced' as 'Vacant' | 'Bottleneck' | 'Overloaded' | 'Balanced' | 'Underutilized'
      };
    });
  }, [assignedStyle, presentLineOperators, employeeAssignments, systemDate, activeLine]);

  // Evaluates performance status of each operation station on the line
  const evaluatedOperations = useMemo(() => {
    if (operationMap.length === 0) return [];

    const nonVacantCaps = operationMap.filter(o => o.totalCapacity > 0).map(o => o.totalCapacity);
    const minActiveCapacity = nonVacantCaps.length > 0 ? Math.min(...nonVacantCaps) : 0;
    
    return operationMap.map(op => {
      let status: 'Vacant' | 'Bottleneck' | 'Overloaded' | 'Balanced' | 'Underutilized' = 'Balanced';
      let riskLevel: 'Low' | 'Medium' | 'High' | 'Critical' = 'Low';

      if (op.operators.length === 0) {
        status = 'Vacant';
        riskLevel = 'Critical';
      } else if (op.totalCapacity === minActiveCapacity || op.cycleTime === Math.max(...operationMap.map(o => o.cycleTime))) {
        status = 'Bottleneck';
        riskLevel = op.totalCapacity < lineTargetPcsHr ? 'Critical' : 'High';
      } else if (op.totalCapacity < lineTargetPcsHr) {
        status = 'Overloaded';
        riskLevel = op.totalCapacity < lineTargetPcsHr * 0.85 ? 'High' : 'Medium';
      } else if (op.totalCapacity > lineTargetPcsHr * 1.35) {
        status = 'Underutilized';
        riskLevel = 'Low';
      } else {
        status = 'Balanced';
        riskLevel = 'Low';
      }

      const hasHighRiskOperator = op.operators.some(o => o.employee.riskScore > 60);
      if (status === 'Balanced' && hasHighRiskOperator) {
         riskLevel = 'Medium';
      }

      return {
        ...op,
        status,
        riskLevel
      };
    });
  }, [operationMap, lineTargetPcsHr]);

  // Primary Constraint identification
  const primaryBottleneck = useMemo(() => {
    const bottlenecks = evaluatedOperations.filter(o => o.status === 'Bottleneck' || o.status === 'Vacant');
    if (bottlenecks.length === 0) return null;
    
    const vacant = bottlenecks.find(b => b.status === 'Vacant');
    if (vacant) return vacant;

    return bottlenecks.reduce((slowest, current) => 
      current.totalCapacity < slowest.totalCapacity ? current : slowest, 
      bottlenecks[0]
    );
  }, [evaluatedOperations]);

  // Handle auto code selection
  useEffect(() => {
    if (evaluatedOperations.length > 0) {
      if (!selectedOpCode || !evaluatedOperations.some(o => o.code === selectedOpCode)) {
        const fallback = primaryBottleneck || evaluatedOperations[0];
        setSelectedOpCode(fallback.code);
      }
    }
  }, [evaluatedOperations, primaryBottleneck, selectedOpCode]);

  const selectedOperation = useMemo(() => {
    return evaluatedOperations.find(o => o.code === selectedOpCode) || evaluatedOperations[0] || null;
  }, [evaluatedOperations, selectedOpCode]);

  // Helper to extract active mapped operation for a person
  const opMapForEmployee = (empId: string) => {
    const asg = employeeAssignments.find(
      a => a.employeeId.toUpperCase() === empId.toUpperCase() && a.assignmentDate === systemDate
    );
    return asg?.assignedOperation || '';
  };

  // Industrial Engineering line stats calculations
  const lineStats = useMemo(() => {
    if (evaluatedOperations.length === 0) {
      return { 
        balanceEfficiency: 0, 
        actualOutputHr: 0, 
        balancingLoss: 0, 
        smoothnessIndex: 0,
        manpowerUtilization: 0, 
        lineEfficiency: 0 
      };
    }

    const totalCycleTime = evaluatedOperations.reduce((sum, o) => {
      return sum + (o.cycleTime === 999 ? 300 : o.cycleTime);
    }, 0);
    const maxCycleTime = Math.max(...evaluatedOperations.map(o => o.cycleTime === 999 ? 300 : o.cycleTime));

    const rawBalanceEff = maxCycleTime > 0 ? (totalCycleTime / (evaluatedOperations.length * maxCycleTime)) * 100 : 0;
    const balanceEfficiency = Math.max(15, Math.min(100, Math.round(rawBalanceEff)));
    const balancingLoss = Math.max(0, 100 - balanceEfficiency);

    // Calculate Smoothness Index: Square root of Sum of (Max Cycle Time - Cycle Time)^2
    const varianceSum = evaluatedOperations.reduce((sum, o) => {
      const ct = o.cycleTime === 999 ? 300 : o.cycleTime;
      const dev = maxCycleTime - ct;
      return sum + (dev * dev);
    }, 0);
    const smoothnessIndex = Math.round(Math.sqrt(varianceSum));

    const activeStaffSet = new Set<string>();
    evaluatedOperations.forEach(op => {
      op.operators.forEach(o => {
        if (o.employee && o.employee.id) {
          activeStaffSet.add(o.employee.id.toUpperCase());
        }
      });
    });
    const deployedOperatorsCount = activeStaffSet.size;

    const nonVacantCaps = evaluatedOperations.filter(o => o.totalCapacity > 0).map(o => o.totalCapacity);
    const actualOutputHr = nonVacantCaps.length > 0 ? Math.min(...nonVacantCaps) : 0;

    const activeOperatorsCount = presentLineOperators.length;
    const averageOpEff = activeOperatorsCount > 0 
      ? presentLineOperators.reduce((sum, e) => sum + e.baseEfficiency, 0) / activeOperatorsCount 
      : 0;
    const dynamicLineEfficiency = Math.round(averageOpEff * (balanceEfficiency / 100));

    const requiredManpower = assignedStyle?.requiredManpower || activeLine.requiredManpower;
    const manpowerUtilization = Math.round((deployedOperatorsCount / requiredManpower) * 100);

    return {
      balanceEfficiency: isNaN(balanceEfficiency) ? 0 : balanceEfficiency,
      actualOutputHr: isNaN(actualOutputHr) ? 0 : actualOutputHr,
      balancingLoss,
      smoothnessIndex,
      deployedOperatorsCount,
      manpowerUtilization,
      lineEfficiency: Math.max(10, Math.min(100, Math.round(dynamicLineEfficiency || activeLine.baseEfficiency)))
    };
  }, [evaluatedOperations, presentLineOperators, assignedStyle, activeLine]);

  // Handle direct manual deployment of an operator
  const handleDeployOperator = async (empId: string, opName: string) => {
    if (!isIEOrAdmin) {
      setLastActionMessage("Permission Denied: Only Industrial Engineers and authorized supervisors can rebalance lines.");
      setTimeout(() => setLastActionMessage(null), 4000);
      return;
    }
    
    if (lockedLines.includes(selectedLineId)) {
      setLastActionMessage(`Line #${selectedLineId} is currently locked in planning. Release lock in workforce setup first.`);
      setTimeout(() => setLastActionMessage(null), 4000);
      return;
    }

    try {
      await assignEmployee(empId, selectedLineId, opName, 'Assigned', '08:00', '17:00', false, 'IE Direct Balancing Canvas');
      await updateLineAllocation(empId, selectedLineId, opName, 'Assigned', 'IE Direct Balancing Canvas');
      setLastActionMessage(`Dispatched: Assigned technician directly to seam "${opName}" on Line ${selectedLineId}. Station refreshed.`);
      setTimeout(() => setLastActionMessage(null), 4000);
    } catch (e) {
      console.error(e);
    }
  };

  // Handle clearing a workstation's assignment
  const handleClearWorkstation = async (empId: string) => {
    if (!isIEOrAdmin) {
      setLastActionMessage("Permission Denied: Unauthorized configuration modification.");
      setTimeout(() => setLastActionMessage(null), 4000);
      return;
    }

    if (lockedLines.includes(selectedLineId)) {
      setLastActionMessage(`Line #${selectedLineId} is programmatically planning-locked.`);
      setTimeout(() => setLastActionMessage(null), 4000);
      return;
    }

    try {
      await assignEmployee(empId, selectedLineId, '', 'Unassigned', '08:00', '17:00', true, 'IE Manual Clear');
      await updateLineAllocation(empId, 0, '', 'Unassigned', 'IE Manual Clear');
      setLastActionMessage("Cleared: Technologist relieved from workstation. Allocation vacant.");
      setTimeout(() => setLastActionMessage(null), 4000);
    } catch (e) {
      console.error(e);
    }
  };

  const handleApplyBalancingSuggestion = async (sug: any) => {
    setIsDeploying(sug.operatorId);
    try {
      await assignEmployee(
        sug.operatorId, 
        selectedLineId, 
        sug.operationName, 
        'Assigned', 
        '08:00', 
        '17:00', 
        false, 
        'IE Smart Balancing Advisor'
      );
      await updateLineAllocation(
        sug.operatorId, 
        selectedLineId, 
        sug.operationName, 
        'Assigned', 
        'IE Smart Balancing Advisor'
      );
      setLastActionMessage(`Successfully deployed ${sug.operatorName} to station ${sug.operationCode}. Metrics recalculated.`);
      setTimeout(() => setLastActionMessage(null), 4000);
    } catch (e) {
      console.error(e);
    } finally {
      setIsDeploying(null);
    }
  };

  // Lists present available operators or unassigned personnel
  const availableSeamstressesPool = useMemo(() => {
    return employees.filter(emp => {
      // Must be physically present at factory gates
      if (!isOperatorPresent(emp.id)) return false;
      // Must not be on personal leaves or scheduled general audits
      if (isOperatorUnavailableForProduction(emp.id)) return false;

      // Filter: must belong to Floater line (0 or 99), or have active status Unassigned/Available,
      // or simply have no active Operation assigned
      const isFloaterLine = emp.lineNumber === 0 || emp.lineNumber === 99;
      const isStatusAvailable = emp.workforceAssignmentStatus === 'Available for Replacement' || emp.workforceAssignmentStatus === 'Unassigned' || !emp.workforceAssignmentStatus;
      const hasNoActiveAssignment = !emp.operationAssignment || emp.operationAssignment.trim() === '' || emp.operationAssignment.toLowerCase() === 'unassigned';

      const meetsFloaterCriteria = isFloaterLine || isStatusAvailable || hasNoActiveAssignment;
      if (!meetsFloaterCriteria) return false;

      // Exclude operators currently clocked into standard machines on this same active line
      const alreadyOccupyingLineStation = emp.lineNumber === selectedLineId && !hasNoActiveAssignment;
      if (alreadyOccupyingLineStation) return false;

      // Search queries
      if (searchQuery.trim() !== '') {
        const query = searchQuery.toLowerCase();
        const matchesSkills = (emp.skills || []).some(s => s.operationName.toLowerCase().includes(query));
        return emp.name.toLowerCase().includes(query) || 
               emp.id.toLowerCase().includes(query) ||
               matchesSkills;
      }

      return true;
    });
  }, [employees, selectedLineId, attendance, employeeAssignments, searchQuery]);

  // Intelligent balancing simulation specifically for the selected line
  const balancingSuggestions = useMemo(() => {
    // Collect all present standby/available operators
    const standbyOps = employees.filter(emp => {
      if (!isOperatorPresent(emp.id)) return false;
      if (isOperatorUnavailableForProduction(emp.id)) return false;

      const isFloaterLine = emp.lineNumber === 0 || emp.lineNumber === 99;
      const isStatusAvailable = emp.workforceAssignmentStatus === 'Available for Replacement' || emp.workforceAssignmentStatus === 'Unassigned' || !emp.workforceAssignmentStatus;
      const hasNoActiveAssignment = !emp.operationAssignment || emp.operationAssignment.trim() === '' || emp.operationAssignment.toLowerCase() === 'unassigned';

      const meetsFloaterCriteria = isFloaterLine || isStatusAvailable || hasNoActiveAssignment;
      if (!meetsFloaterCriteria) return false;

      // Ensure they don't already occupy a workstation on the active line
      const alreadyOccupyingLineStation = emp.lineNumber === selectedLineId && !hasNoActiveAssignment;
      if (alreadyOccupyingLineStation) return false;

      return true;
    });

    const suggestions: Array<{
      operatorId: string;
      operatorName: string;
      operatorAvatarUrl?: string;
      operatorBaseEff: number;
      operationCode: string;
      operationName: string;
      originalEff: number;
      originalBal: number;
      simulatedEff: number;
      simulatedBal: number;
      effGain: number;
      balGain: number;
      isVacantRelief: boolean;
      isBottleneckRelief: boolean;
      suitabilityScore: number;
    }> = [];

    if (!assignedStyle || !assignedStyle.operations || evaluatedOperations.length === 0) return [];

    evaluatedOperations.forEach(op => {
      standbyOps.forEach(operator => {
        const opLower = op.name.toLowerCase();
        const specificSkill = operator.skills?.find(s => 
          s.operationName.toLowerCase().includes(opLower) || opLower.includes(s.operationName.toLowerCase())
        );
        const proficiency = specificSkill ? specificSkill.proficiency : (operator.baseEfficiency || 70);

        // Simulated capacity for this workstation
        const newCapPerHour = Math.round((60 / op.smv) * (proficiency / 100));
        const simulatedCapForOp = op.totalCapacity + newCapPerHour;

        // Simulated cycle times for all workstations
        const simulatedOps = evaluatedOperations.map(originalOp => {
          if (originalOp.code === op.code) {
            const cap = simulatedCapForOp;
            const ct = cap > 0 ? Math.round(3600 / cap) : 999;
            return { ...originalOp, totalCapacity: cap, cycleTime: ct };
          }
          return originalOp;
        });

        // Compute simulated balance efficiency
        const simulatedTotalCycleTime = simulatedOps.reduce((sum, o) => sum + (o.cycleTime === 999 ? 300 : o.cycleTime), 0);
        const simulatedMaxCycleTime = Math.max(...simulatedOps.map(o => o.cycleTime === 999 ? 300 : o.cycleTime));
        
        const simulatedRawBalance = simulatedMaxCycleTime > 0 
          ? (simulatedTotalCycleTime / (assignedStyle.operations.length * simulatedMaxCycleTime)) * 100 
          : 0;
        const simulatedBal = Math.max(15, Math.min(100, Math.round(simulatedRawBalance)));

        const simulatedLineOps = [...presentLineOperators, operator];
        const simulatedAvgEff = simulatedLineOps.length > 0 
          ? simulatedLineOps.reduce((sum, e) => sum + e.baseEfficiency, 0) / simulatedLineOps.length 
          : 0;
        
        const simulatedDynamicEff = Math.round(simulatedAvgEff * (simulatedBal / 100));
        const simulatedEff = Math.max(10, Math.min(100, Math.round(simulatedDynamicEff || activeLine.baseEfficiency || 50)));

        const effGain = simulatedEff - lineStats.lineEfficiency;
        const balGain = simulatedBal - lineStats.balanceEfficiency;

        const isVacantRelief = op.operators.length === 0;
        const isBottleneckRelief = op.status === 'Bottleneck';

        if (effGain > 0 || balGain > 0 || isVacantRelief) {
          suggestions.push({
            operatorId: operator.id,
            operatorName: operator.name,
            operatorAvatarUrl: operator.photoUrl,
            operatorBaseEff: operator.baseEfficiency,
            operationCode: op.code,
            operationName: op.name,
            originalEff: lineStats.lineEfficiency,
            originalBal: lineStats.balanceEfficiency,
            simulatedEff,
            simulatedBal,
            effGain,
            balGain,
            isVacantRelief,
            isBottleneckRelief,
            suitabilityScore: proficiency
          });
        }
      });
    });

    // Priority sort: vacant relief -> bottleneck relief -> total efficiency + balance gain descending
    return suggestions.sort((a, b) => {
      if (a.isVacantRelief !== b.isVacantRelief) {
        return a.isVacantRelief ? -1 : 1;
      }
      if (a.isBottleneckRelief !== b.isBottleneckRelief) {
        return a.isBottleneckRelief ? -1 : 1;
      }
      const aGain = a.effGain + a.balGain;
      const bGain = b.effGain + b.balGain;
      return bGain - aGain;
    }).slice(0, 3); // top 3 highly optimal moves
  }, [employees, isOperatorPresent, isOperatorUnavailableForProduction, selectedLineId, assignedStyle, evaluatedOperations, lineStats, presentLineOperators, activeLine]);

  return (
    <div className="flex-1 overflow-y-auto px-4 lg:px-8 py-6 space-y-6 max-h-[calc(100vh-80px)] custom-scrollbar bg-slate-50 dark:bg-[#090D16]">
      
      {/* FACTORY STYLE HERO BANNER */}
      <div className="bg-gradient-to-r from-[#0F172A] to-[#1E293B] text-white rounded-xl p-6 relative overflow-hidden shadow-lg border border-[#0F172A]">
        <div className="absolute top-0 right-0 p-8 opacity-15 pointer-events-none">
          <Sliders className="w-48 h-48 text-blue-500 rotate-12" />
        </div>
        <div className="relative z-10 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <span className="bg-blue-600/30 text-blue-300 font-mono text-[10px] px-2.5 py-1 rounded-full border border-blue-500/50 uppercase tracking-widest font-semibold">
                IE INDUSTRIAL SYSTEM CONTROLS
              </span>
              <h1 className="text-2xl md:text-3xl font-display font-bold tracking-tight text-white mt-1">
                Conveyor Line Balance Control Center
              </h1>
              <p className="text-slate-300 font-sans text-sm md:text-base italic font-medium mt-0.5">
                "Stop speculative automation. Hand control back to engineers. Build on precise real metrics."
              </p>
            </div>
            
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 self-start">
              {/* Operations Date Picker identical to Factory Dashboard */}
              <div className="bg-[#1E293B]/90 border border-blue-500/30 p-3 rounded-lg text-left font-mono min-w-[210px] shadow-sm">
                <label className="text-[10px] text-blue-400 block uppercase tracking-wider font-bold mb-1">
                  Select Operations Date
                </label>
                <div className="flex items-center space-x-2 text-slate-200">
                  <Calendar className="w-4 h-4 text-blue-400 shrink-0" />
                  <input 
                    type="date"
                    value={systemDate}
                    onChange={(e) => {
                      if (e.target.value) {
                        setSystemDate(e.target.value);
                      }
                    }}
                    className="bg-transparent border-none text-xs font-semibold focus:outline-none focus:ring-0 text-white w-full cursor-pointer dark:color-white outline-none"
                    style={{ colorScheme: 'dark' }}
                  />
                </div>
              </div>
              
              <div className="bg-[#1E293B] border border-slate-705/60 p-3 rounded-lg text-right font-mono min-w-[180px]">
                <span className="text-xs text-slate-400 block uppercase tracking-wider">System Clock (IST)</span>
                <span className="text-sm font-semibold text-emerald-400 block mt-0.5">
                  {formatSystemTime(systemTime)}
                </span>
                <span className="text-xs text-slate-500 block">Line Balancing Audit Room</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* SEWING BULLETIN META-SUMMARY SECTION */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800/60 rounded-2xl p-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-xl border border-blue-500/15">
            <Layers className="h-5.5 w-5.5" />
          </div>
          <div>
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block font-mono">BULLETINED STYLE MATRIX</span>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-slate-800 dark:text-neutral-100 text-base">
                {assignedStyle?.name || 'Cotton Interlock Polo'}
              </span>
              <span className="bg-slate-100 dark:bg-slate-800 text-slate-500 px-2 py-0.5 rounded text-[10px] font-mono leading-none">
                {assignedStyle?.id}
              </span>
            </div>
            <p className="text-xs text-slate-550 mt-0.5 font-sans">
              Line Workspace: <strong className="text-slate-700 dark:text-slate-300">Line #{selectedLineId}</strong> &middot; Style SMV: <strong className="font-mono text-slate-700 dark:text-slate-350">{assignedStyle?.smv || 1.15} min</strong> &middot; Plan Shift Target: <strong className="font-mono text-slate-700 dark:text-slate-350">{activeLine.targetQuantity} pcs</strong>
            </p>
            {isIEOrAdmin && (
              <div className="mt-1.5 flex select-none">
                <button
                  type="button"
                  id={`btn-change-style-lbl-${selectedLineId}`}
                  onClick={() => setShowStyleChangeModal(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/40 dark:hover:bg-blue-900 border border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400 text-[10px] font-bold rounded-lg transition-colors cursor-pointer"
                >
                  <RefreshCw className="h-2.5 w-2.5 text-blue-500 animate-spin-slow" />
                  <span>Manual Garment Change</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Selected Line Control dropdown & Takt metrics */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 w-full md:w-auto">
          <div className="text-left sm:text-right shrink-0">
            <span className="text-[9px] font-bold text-slate-455 uppercase block tracking-wider">Required Pitch Goal (Takt)</span>
            <strong className="text-lg font-mono font-black text-slate-800 dark:text-neutral-100 block">
              {lineTargetPcsHr} garments/hr ({lineTargetPitchTime}s / piece)
            </strong>
          </div>

          <div className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-2 rounded-xl shadow-xs w-full sm:w-auto">
            <strong className="text-[9.5px] font-mono uppercase text-slate-400 px-1 block mb-1">Audit Line Selector:</strong>
            <select
               value={selectedLineId}
               onChange={e => {
                 setSelectedLineId(Number(e.target.value));
                 setSelectedOpCode(null);
               }}
               className="py-1 px-3.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-700 dark:text-slate-300 outline-none focus:ring-1 focus:ring-blue-500 w-full sm:w-auto min-w-[200px]"
            >
              {productionLines.map(l => (
                <option key={l.id} value={l.id}>Line #{l.id} - Sup: {l.supervisor}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* TOAST ACTION ALERTS */}
      {lastActionMessage && (
        <motion.div 
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-emerald-600 text-white p-3.5 rounded-xl flex items-center gap-2.5 text-xs font-bold shadow-md"
        >
          <Sparkles className="h-4.5 w-4.5 animate-spin text-emerald-100" />
          <span>{lastActionMessage}</span>
        </motion.div>
      )}

      {/* THE PROPER IE RELEVANT METRICS GRID (5 CARDS STRUCTURED LIKE FACTORY DASHBOARD) */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {[
          { 
            label: 'Line Balance Efficiency (LBE)', 
            value: `${lineStats.balanceEfficiency}%`, 
            description: `IE Standard Loss: ${lineStats.balancingLoss}%`,
            icon: SlidersHorizontal, 
            color: 'text-blue-600 dark:text-blue-400',
            bg: 'bg-white dark:bg-slate-900',
            border: 'border-slate-200 dark:border-slate-800'
          },
          { 
            label: 'Smoothness Index (SI)', 
            value: `${lineStats.smoothnessIndex}s`, 
            description: `Cycle deviation variance`,
            icon: BarChart3, 
            color: lineStats.smoothnessIndex > 45 ? 'text-rose-500 font-extrabold' : 'text-[#2563EB] font-black',
            bg: 'bg-white dark:bg-slate-900',
            border: 'border-slate-200 dark:border-slate-800'
          },
          { 
            label: 'Hourly Bottleneck Throughput', 
            value: `${lineStats.actualOutputHr} pcs/hr`, 
            description: `Quota Gap: ${Math.max(0, lineTargetPcsHr - lineStats.actualOutputHr)} pcs/h`,
            icon: Target, 
            color: lineStats.actualOutputHr < lineTargetPcsHr ? 'text-amber-500 font-bold' : 'text-emerald-500 font-black',
            bg: 'bg-white dark:bg-slate-900',
            border: 'border-slate-200 dark:border-slate-800'
          },
          { 
            label: 'Line Operator Staffing', 
            value: `${lineStats.deployedOperatorsCount} / ${assignedStyle?.requiredManpower || activeLine.requiredManpower}`, 
            description: `Utilized: ${lineStats.manpowerUtilization}% (${presentLineOperators.length} present)`,
            icon: Users, 
            color: 'text-slate-800 dark:text-slate-200',
            bg: 'bg-white dark:bg-slate-900',
            border: 'border-slate-200 dark:border-slate-800'
          },
          { 
            label: 'Primary Line Bottleneck', 
            value: primaryBottleneck ? (primaryBottleneck.status === 'Vacant' ? 'VACANT HOLE' : primaryBottleneck.code) : 'FULLY STABLE', 
            description: primaryBottleneck ? `Capacity: ${primaryBottleneck.totalCapacity} pcs/h` : 'Balanced conveyor',
            icon: AlertCircle, 
            color: primaryBottleneck ? 'text-rose-500 font-extrabold' : 'text-emerald-500 font-bold',
            bg: primaryBottleneck ? 'bg-rose-500/5' : 'bg-white dark:bg-slate-900',
            border: primaryBottleneck ? 'border-rose-200 dark:border-rose-900/30' : 'border-slate-200 dark:border-slate-800'
          },
        ].map((met, i) => (
          <div key={i} className={`${met.bg} ${met.border} border p-4.5 rounded-2xl flex items-center justify-between shadow-xs transition hover:shadow-md`}>
            <div className="space-y-1">
              <span className="text-[9.5px] text-slate-450 font-bold tracking-wider uppercase block leading-none">{met.label}</span>
              <strong className={`text-xl font-mono block mt-1.5 leading-none ${met.color}`}>{met.value}</strong>
              <span className="text-[10px] text-slate-400 block font-mono mt-1 leading-none">{met.description}</span>
            </div>
            <met.icon className="w-5.5 h-5.5 text-slate-350 dark:text-slate-600" />
          </div>
        ))}
      </div>

      {/* MAIN LAYOUT SPLIT: LEFT AREA WORKSTATION INDEX & GRAPHS, RIGHT COMPANION INTERACTIVE MANUAL IE EDIT RAIL */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* WORKSTATION GRID FLOW MAP */}
        <div className="lg:col-span-8 space-y-6">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
              <div>
                <h2 className="font-display font-bold text-slate-800 dark:text-neutral-100 text-sm uppercase tracking-wider flex items-center gap-1.5">
                  <Layers className="h-4.5 w-4.5 text-blue-500" />
                  <span>Conveyor Workstations Flow & Machine Capacities</span>
                </h2>
                <p className="text-xs text-slate-405">Physical conveyor workstation layout sequential order. Click a station to manually deploy a technologist.</p>
              </div>

              {/* View Layout Switcher similar to Factory double graphs */}
              <div className="flex bg-slate-100 dark:bg-slate-950 p-1 rounded-xl border border-slate-200/50 w-full sm:w-auto">
                <button
                  onClick={() => setActiveTab('kpi-analysis')}
                  className={`flex-1 sm:flex-initial py-1.5 px-4 rounded-lg text-[10px] font-bold uppercase transition tracking-wider ${
                    activeTab === 'kpi-analysis' 
                      ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm' 
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Workstation Flow Rows
                </button>
                <button
                  onClick={() => setActiveTab('deviation-view')}
                  className={`flex-1 sm:flex-initial py-1.5 px-4 rounded-lg text-[10px] font-bold uppercase transition tracking-wider ${
                    activeTab === 'deviation-view' 
                      ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm' 
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Cycle Pitch deviation (Takt deviation)
                </button>
              </div>
            </div>

            {/* TAB-VIEW 1: LINE STATION LISTING WITH DETAILED IE DATA ROW */}
            {activeTab === 'kpi-analysis' && (
              <div className="space-y-3">
                {evaluatedOperations.map((op, idx) => {
                  const isSelected = op.code === selectedOpCode;
                  const capacityPercent = Math.min(100, Math.round((op.totalCapacity / (lineTargetPcsHr || 15)) * 100));

                  let statusTheme = {
                    border: 'border-slate-200 dark:border-slate-800/80 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-900',
                    badge: 'bg-slate-100 text-slate-650 dark:bg-slate-800 dark:text-slate-300 font-medium',
                    iconColor: 'text-slate-405'
                  };

                  if (isSelected) {
                    statusTheme = {
                      border: 'border-blue-650 bg-blue-50/10 dark:bg-[#1E293B]/20 ring-1 ring-blue-500/20',
                      badge: 'bg-blue-100 text-blue-705 dark:bg-blue-950 dark:text-blue-300 font-bold',
                      iconColor: 'text-blue-500'
                    };
                  } else if (op.status === 'Vacant') {
                    statusTheme = {
                      border: 'border-rose-400 bg-rose-50/15 dark:bg-rose-950/20 hover:border-rose-500',
                      badge: 'bg-rose-100 text-rose-850 dark:bg-rose-950 dark:text-rose-450 font-black',
                      iconColor: 'text-rose-500'
                    };
                  } else if (op.status === 'Bottleneck') {
                    statusTheme = {
                      border: 'border-amber-400 bg-amber-50/10 dark:bg-amber-950/10 hover:border-amber-500',
                      badge: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-400 font-bold',
                      iconColor: 'text-amber-500 animate-bounce'
                    };
                  } else if (op.status === 'Underutilized') {
                    statusTheme = {
                      border: 'border-blue-300 dark:border-blue-800/80 bg-blue-50/5 dark:bg-blue-950/10 hover:border-blue-400',
                      badge: 'bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-300 font-bold',
                      iconColor: 'text-blue-500'
                    };
                  } else if (op.status === 'Overloaded') {
                    statusTheme = {
                      border: 'border-orange-300 dark:border-orange-800 bg-orange-50/5 dark:bg-orange-950/10 hover:border-orange-400',
                      badge: 'bg-orange-100 text-orange-850 dark:bg-orange-950/50 dark:text-orange-400 font-bold',
                      iconColor: 'text-orange-500'
                    };
                  } else if (op.status === 'Balanced') {
                    statusTheme = {
                      border: 'border-slate-200 dark:border-slate-800/80 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-900',
                      badge: 'bg-emerald-105 text-emerald-805 dark:bg-emerald-950/30 dark:text-emerald-400 font-semibold',
                      iconColor: 'text-emerald-500'
                    };
                  }

                  return (
                    <div
                      key={op.code}
                      onClick={() => setSelectedOpCode(op.code)}
                      className={`relative p-4 pt-6 border rounded-2xl cursor-pointer transition-all ${statusTheme.border} ${
                        selectedOpCode === op.code 
                          ? 'ring-2 ring-blue-500 shadow-sm bg-blue-50/5 dark:bg-blue-950/20' 
                          : 'hover:bg-slate-50/80 dark:hover:bg-slate-800/40'
                      } grid grid-cols-1 md:grid-cols-12 gap-4 items-center`}
                    >
                      {/* Absolute-positioned Station Evaluation Tag over the top-left boundary border block */}
                      <div className="absolute -top-2.5 left-4 z-10">
                        <span className={`text-[8.5px] font-extrabold uppercase px-2.5 py-0.5 rounded-md border shadow-2xs ${statusTheme.badge} ${
                          op.status === 'Balanced' ? 'border-emerald-300/30' :
                          op.status === 'Bottleneck' ? 'border-amber-300/50' :
                          op.status === 'Vacant' ? 'border-rose-300/50' :
                          op.status === 'Underutilized' ? 'border-blue-300/50' :
                          op.status === 'Overloaded' ? 'border-orange-350/50' :
                          'border-slate-200/50 dark:border-slate-800/50'
                        }`}>
                          {op.status}
                        </span>
                      </div>

                      {/* Col 1-4: SEQ + Operation identity */}
                      <div className="md:col-span-4 flex items-center gap-3.5 min-w-0">
                        <span className="font-mono text-xs font-black bg-slate-100 dark:bg-slate-800 text-slate-500 px-2.5 py-1.5 rounded-lg border border-slate-200/50 shrink-0">
                          #{String(op.sequence).padStart(2, '0')}
                        </span>
                        
                        <div className="space-y-0.5 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-mono text-[10.5px] font-bold text-blue-500 dark:text-blue-400 uppercase shrink-0">{op.code}</span>
                            <span className="text-[10px] text-slate-400 font-sans truncate">({op.machineType})</span>
                          </div>
                          <strong className="block text-sm font-bold text-slate-800 dark:text-neutral-100 truncate">
                            {op.name}
                          </strong>
                        </div>
                      </div>

                      {/* Col 5-8: Active personnel assignment list */}
                      <div className="md:col-span-4 flex items-center gap-3 min-w-0">
                        <span className="text-[11px] text-slate-400 font-medium shrink-0">Technicians:</span>
                        {op.operators.length === 0 ? (
                          <div className="flex items-center gap-1 bg-rose-50 dark:bg-rose-950/30 px-2.5 py-1 rounded-lg text-rose-600 font-bold font-mono text-[10px] border border-rose-100 dark:border-rose-900/10 shrink-0">
                            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                            <span>Vacant (0)</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="flex -space-x-1.5 overflow-hidden shrink-0">
                              {op.operators.map((o, idx) => (
                                <EmployeeAvatar
                                  key={idx}
                                  photoUrl={o.employee.photoUrl}
                                  name={o.employee.name}
                                  className="w-6.5 h-6.5 rounded-full border border-white dark:border-slate-900 shadow-2xs"
                                />
                              ))}
                            </div>
                            <span className="text-xs font-mono font-bold text-slate-650 dark:text-slate-300 truncate">
                              {op.operators.map(o => o.employee.name).join(' + ')}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Col 9-12: Capacity Statistics & Output Rates (Expanded from 9-11 to 9-12 to prevent wrap overlay) */}
                      <div className="md:col-span-4 space-y-1.5 min-w-0">
                        <div className="flex justify-between font-mono text-[10.5px] leading-none mb-0.5">
                          <span className="text-slate-400 font-sans">Total output:</span>
                          <strong className="text-slate-700 dark:text-slate-200">
                            {op.totalCapacity} <span className="text-slate-400 font-normal">/ {op.targetCapacity} pcs/hr</span>
                          </strong>
                        </div>
                        
                        <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
                          <div 
                            className={`h-full rounded ${
                              op.status === 'Vacant' ? 'bg-transparent' :
                              op.status === 'Bottleneck' ? 'bg-rose-500' :
                              op.status === 'Overloaded' ? 'bg-amber-500' :
                              'bg-emerald-500'
                            }`}
                            style={{ width: `${capacityPercent}%` }} 
                          />
                        </div>

                        <div className="flex justify-between text-[9px] font-mono text-slate-400 pt-0.5">
                          <span>SMV: {op.smv.toFixed(3)}m</span>
                          <span>Cycle: <strong className="text-slate-600 dark:text-slate-350 font-black">{op.cycleTime === 999 ? '∞' : `${op.cycleTime}s`}</strong></span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* TAB-VIEW 2: CYCLE TIME DEVIATION ANALYSIS GRAPH (SVG-RENDERED) */}
            {activeTab === 'deviation-view' && (
              <div className="space-y-6 pt-2">
                <div className="bg-slate-50 dark:bg-slate-950/40 p-4.5 rounded-xl border border-slate-200/50 dark:border-slate-800/80 flex justify-between items-center text-xs">
                  <div className="flex items-center gap-2">
                    <Info className="h-4.5 w-4.5 text-blue-500 shrink-0" />
                    <span className="text-slate-700 dark:text-slate-300">
                      <strong>Conveyor Takt Line ({lineTargetPitchTime}s):</strong> Stations with cycletimes above this horizontal indicator limit represent bottle-necks and restrict the entire conveyor's throughput.
                    </span>
                  </div>
                </div>

                {/* GRAPH CONTAINER */}
                <div className="bg-slate-50 dark:bg-slate-950 p-6 rounded-2xl border border-slate-205 dark:border-slate-805/85">
                  <svg viewBox="0 0 700 240" className="w-full h-auto overflow-visible">
                    {/* Ideal Pitch takt vertical threshold guideline */}
                    {/* mapping 0s (y=210) to max 120s (y=30) */}
                    {/* let's mark lineTargetPitchTime */}
                    {(() => {
                      const taktY = Math.max(30, Math.min(210, 210 - ((lineTargetPitchTime) / 120) * 180));
                      return (
                        <g>
                          <line 
                            x1="60" y1={taktY} x2="660" y2={taktY} 
                            stroke="#EF4444" strokeWidth="2" strokeDasharray="6 4"
                          />
                          <text x="665" y={taktY + 4} className="text-[10px] font-mono fill-rose-500 font-extrabold">TAKT ({lineTargetPitchTime}s)</text>
                        </g>
                      );
                    })()}

                    {/* Horizontal helper graph lines */}
                    {[30, 75, 120, 165, 210].map((yVal, i) => (
                      <line 
                        key={i} 
                        x1="60" y1={yVal} x2="660" y2={yVal} 
                        stroke="#E2E8F0" strokeWidth="0.5" strokeDasharray="3 3"
                        className="dark:stroke-slate-800"
                      />
                    ))}

                    <text x="15" y="34" className="text-[9px] fill-slate-400 font-mono">120s</text>
                    <text x="15" y="124" className="text-[9px] fill-slate-400 font-mono">60s</text>
                    <text x="15" y="214" className="text-[9px] fill-slate-400 font-mono">0s</text>

                    {/* Columns representing cycle time of stations */}
                    {evaluatedOperations.map((op, idx) => {
                      const totalStations = evaluatedOperations.length || 1;
                      const step = 600 / totalStations;
                      const colWidth = Math.max(10, step * 0.55);
                      const colX = 65 + idx * step + (step - colWidth) / 2;

                      const cleanCycle = op.cycleTime === 999 ? 120 : op.cycleTime;
                      const colHeight = (cleanCycle / 120) * 180;
                      // cap at 180 (for 120s)
                      const clampedHeight = Math.max(5, Math.min(180, colHeight));
                      const colY = 210 - clampedHeight;

                      const isBottleneck = cleanCycle > lineTargetPitchTime;
                      const barFill = op.status === 'Vacant' 
                        ? '#F87171' 
                        : isBottleneck 
                          ? '#EF4444' 
                          : '#10B981';

                      return (
                        <g key={op.code} className="group">
                          <rect 
                            x={colX} 
                            y={colY} 
                            width={colWidth} 
                            height={clampedHeight} 
                            fill={barFill} 
                            rx="3" 
                            className="transition-all duration-300 hover:opacity-85 cursor-pointer"
                          />
                          
                          {/* Label values of cycle */}
                          <text 
                            x={colX + colWidth / 2} 
                            y={colY - 6} 
                            textAnchor="middle" 
                            className="text-[9px] font-mono font-bold fill-slate-600 dark:fill-slate-350"
                          >
                            {op.cycleTime === 999 ? '∞' : `${op.cycleTime}s`}
                          </text>

                          {/* Station label bottom index */}
                          <text 
                            x={colX + colWidth / 2} 
                            y="226" 
                            textAnchor="middle" 
                            className="text-[9px] font-mono fill-slate-400"
                          >
                            {op.code}
                          </text>
                        </g>
                      );
                    })}
                  </svg>
                </div>
              </div>
            )}
          </div>

          {/* ACTIVE ROSTER AUDIT LIST */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-4">
            <div>
              <h3 className="font-display font-semibold text-slate-800 dark:text-neutral-100 text-sm uppercase tracking-wider flex items-center gap-1.5">
                <Users className="w-4 h-4 text-slate-400" />
                <span>Present Line Personnel &amp; Stations ({presentLineOperators.length})</span>
              </h3>
              <p className="text-xs text-slate-405">Physically clocked operators inside Line #{selectedLineId}:</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[300px] overflow-y-auto pr-1">
              {presentLineOperators.map(emp => {
                const assignedOp = opMapForEmployee(emp.id);

                return (
                  <div key={emp.id} className="p-3 bg-slate-50 dark:bg-slate-950/40 border border-slate-200/60 dark:border-slate-850 rounded-xl flex items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <EmployeeAvatar photoUrl={emp.photoUrl} name={emp.name} className="w-8 h-8 rounded-full border border-slate-200 shrink-0" />
                      <div className="min-w-0">
                        <strong className="block text-slate-750 dark:text-slate-200 truncate">{emp.name}</strong>
                        <span className="text-[9.5px] font-mono text-slate-400 block">ID: {emp.id} &middot; Skill level: {emp.skillCategory}</span>
                      </div>
                    </div>
                    
                    <div className="text-right shrink-0">
                      {assignedOp ? (
                        <span className="text-[10px] font-bold font-mono text-blue-600 bg-blue-50 dark:bg-blue-950/50 px-2 py-0.5 rounded truncate max-w-[130px] block border border-blue-500/10">
                          🛠️ {assignedOp}
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold font-mono text-slate-400 bg-slate-100 dark:bg-slate-800 px-2.5 py-0.5 rounded block">
                          Unstaffed / Spare
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* COMPANION RIGHT RAIL: FULL INTERACTIVE IE WORKSTATION WORKBENCH */}
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-5">
            <div>
              <h3 className="font-display font-bold text-slate-850 dark:text-white uppercase tracking-wider text-xs flex items-center gap-1.5 pb-2 border-b border-slate-100 dark:border-slate-800">
                <Settings className="h-4.5 w-4.5 text-blue-500" />
                <span>Station Allocation &amp; Balancing Panel</span>
              </h3>
              <p className="text-[11px] text-slate-450 mt-1.5">No automatic speculative balancing. Direct human allocation console. select a sequence station to build assignments.</p>
            </div>

            {selectedOperation ? (
              <div className="space-y-6">
                {/* Station specifications */}
                <div className="bg-slate-50 dark:bg-slate-950/40 p-4 rounded-xl border border-slate-200/60 font-sans space-y-2 text-xs">
                  <div className="flex justify-between font-mono text-[9.5px] font-bold uppercase text-slate-405 leading-none">
                    <span>Workstation ID Spec</span>
                    <strong className="text-blue-500 font-mono">{selectedOperation.code}</strong>
                  </div>
                  <h4 className="font-extrabold text-slate-850 dark:text-neutral-100 text-sm leading-snug">{selectedOperation.name}</h4>
                  
                  <div className="grid grid-cols-2 gap-3 pt-2 font-mono text-[10.5px]">
                    <div>
                      <span className="text-slate-400 block leading-none">Operation SMV:</span>
                      <strong className="text-slate-700 dark:text-slate-300 block mt-1 leading-none">{selectedOperation.smv.toFixed(3)} mins</strong>
                    </div>
                    <div>
                      <span className="text-slate-400 block leading-none">Expected Output:</span>
                      <strong className="text-[#2563EB] block mt-1 leading-none">{Math.round(60 / selectedOperation.smv)} pcs/h (100%)</strong>
                    </div>
                  </div>
                </div>

                {/* Staff presently bound to station */}
                <div className="space-y-3">
                  <span className="text-[10px] font-bold text-slate-450 uppercase block tracking-wider font-mono">Present Allocated personnel:</span>
                  
                  {selectedOperation.operators.length === 0 ? (
                    <div className="p-4 rounded-xl border border-dashed border-rose-300 bg-rose-50/15 text-rose-600 dark:text-rose-450 text-xs flex items-start gap-2 leading-relaxed">
                      <AlertTriangle className="h-4.5 w-4.5 text-rose-500 shrink-0 mt-0.5" />
                      <div>
                        <strong>Station Currently Empty:</strong> No sewing operator is dispatched to this sequence. Choose a standby supervisor/floater from the personnel pool below to start flow!
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {selectedOperation.operators.map(o => (
                        <div key={o.employee.id} className="p-3 bg-slate-50 dark:bg-slate-950 border border-slate-200/50 rounded-xl flex items-center justify-between text-xs transition">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <EmployeeAvatar photoUrl={o.employee.photoUrl} name={o.employee.name} className="w-8 h-8 rounded-full shrink-0" />
                            <div className="min-w-0">
                              <strong className="block text-slate-800 dark:text-slate-205 truncate leading-none">{o.employee.name}</strong>
                              <span className="text-[9.5px] font-mono text-slate-400 mt-1 block">ID: {o.employee.id} &middot; Base Eff: {o.employee.baseEfficiency}%</span>
                            </div>
                          </div>
                          
                          {isIEOrAdmin ? (
                            <button
                              type="button"
                              onClick={() => handleClearWorkstation(o.employee.id)}
                              className="px-2.5 py-1 text-[10px] font-bold font-mono text-red-500 hover:text-red-650 border border-red-200/50 bg-red-500/5 hover:bg-red-500/10 rounded-lg transition active:scale-95 shadow-2xs"
                            >
                              Relieve
                            </button>
                          ) : (
                            <span className="text-[10px] text-slate-400 italic">Locked</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* MANUAL PILOT DIRECT ASSIGNMENT CENTER */}
                <div className="space-y-4 border-t border-slate-100 dark:border-slate-800/80 pt-4">
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold text-slate-450 uppercase block tracking-wider font-mono">DISPATCH CANDIDATES:</span>
                    <p className="text-[10.5px] text-slate-400">Filter present available standby sewers/floaters and trigger direct binding.</p>
                  </div>

                  {/* Filter custom entry bar */}
                  <div className="relative">
                    <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-400" />
                    <input 
                      type="text" 
                      placeholder="Search floaters by skill / ID / name..." 
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      className="w-full pl-8.5 pr-3 py-1.5 rounded-xl border border-slate-200 text-xs bg-slate-50 dark:bg-slate-950 dark:border-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>

                  {/* Available roster candidates card deck */}
                  <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
                    {availableSeamstressesPool.length === 0 ? (
                      <div className="text-center p-6 bg-slate-50 dark:bg-slate-950 border border-dashed border-slate-200/60 rounded-xl text-xs text-slate-400 italic">
                        No present. available floor floaters match selection criteria. Relieve operators from other stations or add general attendees.
                      </div>
                    ) : (
                      (() => {
                        const candidatesWithScores = availableSeamstressesPool.map(emp => {
                          const specificSkill = emp.skills?.find(s => s.operationName.toLowerCase().includes(selectedOperation.name.toLowerCase()));
                          const speedRating = specificSkill ? specificSkill.proficiency : (emp.baseEfficiency || 60);
                          const attendance = emp.attendanceReliability || emp.historicalAttendanceRate || 95;
                          const defectRateVal = emp.defectRate !== undefined ? emp.defectRate : 2.5;
                          const avgPcs = emp.avgPcsProducedPerDay || 100;

                          const qaps = calculateQAPS(speedRating, emp.baseEfficiency, attendance, defectRateVal, avgPcs);
                          const expectedPcsHr = Math.round((60 / selectedOperation.smv) * (speedRating / 100));

                          return { emp, speedRating, specificSkill, qaps, expectedPcsHr, attendance, defectRateVal, avgPcs };
                        });

                        // Sort candidates by Quality Adjusted Performance Score (QAPS) descending
                        candidatesWithScores.sort((a, b) => b.qaps - a.qaps);

                        return candidatesWithScores.map(({ emp, speedRating, specificSkill, qaps, expectedPcsHr, attendance, defectRateVal, avgPcs }) => {
                          return (
                            <div key={emp.id} className="p-3.5 bg-slate-50 border border-slate-200 hover:border-slate-350 dark:bg-slate-950/20 dark:border-slate-800 rounded-xl flex flex-col space-y-2 text-xs transition">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2 min-w-0">
                                  <EmployeeAvatar photoUrl={emp.photoUrl} name={emp.name} className="w-8 h-8 rounded-full border border-slate-200 shrink-0" />
                                  <div className="min-w-0">
                                    <span className="font-bold text-slate-800 dark:text-slate-100 block truncate leading-none">{emp.name}</span>
                                    <span className="text-[9px] font-mono text-slate-400 mt-1 block">
                                      ID: {emp.id} &middot; Grade: {emp.skillCategory}
                                    </span>
                                  </div>
                                </div>

                                <div className="text-right shrink-0">
                                  <span className="inline-block px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 font-mono font-bold text-[10px]">
                                    QAPS: {qaps}/100
                                  </span>
                                </div>
                              </div>

                              <div className="grid grid-cols-5 gap-1 pt-1.5 border-t border-slate-100 dark:border-slate-800/40 text-[9.5px] font-mono text-slate-400">
                                <div>
                                  <span className="block text-[8px] uppercase">Match</span>
                                  <span className="font-bold text-slate-700 dark:text-slate-300">{speedRating}%</span>
                                </div>
                                <div>
                                  <span className="block text-[8px] uppercase">Efficiency</span>
                                  <span className="font-bold text-slate-700 dark:text-slate-300">{emp.baseEfficiency}%</span>
                                </div>
                                <div>
                                  <span className="block text-[8px] uppercase">Defects</span>
                                  <span className={`font-bold ${defectRateVal > 4 ? 'text-red-500' : 'text-slate-700 dark:text-slate-300'}`}>{defectRateVal}%</span>
                                </div>
                                <div>
                                  <span className="block text-[8px] uppercase">Attendance</span>
                                  <span className="font-bold text-slate-700 dark:text-slate-300">{attendance}%</span>
                                </div>
                                <div>
                                  <span className="block text-[8px] uppercase">PCS/Day</span>
                                  <span className="font-bold text-slate-700 dark:text-slate-300">{avgPcs}</span>
                                </div>
                              </div>

                              <div className="flex items-center justify-between pt-1 text-[9.5px]">
                                <span className="text-emerald-600 dark:text-emerald-400 font-mono font-bold">
                                  Est. Yield: +{expectedPcsHr} pcs/hr
                                </span>
                                {isIEOrAdmin ? (
                                  <button
                                    type="button"
                                    onClick={() => handleDeployOperator(emp.id, selectedOperation.name)}
                                    className="px-2.5 py-1 text-[9px] font-bold uppercase text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition active:scale-95 cursor-pointer"
                                  >
                                    Deploy
                                  </button>
                                ) : (
                                  <span className="text-[9.5px] text-slate-400 italic">Locked</span>
                                )}
                              </div>
                            </div>
                          );
                        });
                      })()
                    )}
                  </div>
                </div>

              </div>
            ) : (
              <p className="text-xs text-slate-400 italic text-center py-10 bg-slate-50 dark:bg-slate-950 rounded-xl border border-dashed border-slate-200">
                Please click any sequential workstation sequence on the Conveyor Workspace Layout grid flow to display diagnostics.
              </p>
            )}
          </div>

          {/* IE SMART BALANCING & EFFICIENCY ADVISORY */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-5">
            <div>
              <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
                <h3 className="text-xs font-extrabold text-slate-850 dark:text-neutral-100 uppercase tracking-wider flex items-center gap-1.5 font-display">
                  <Sparkles className="w-4 h-4 text-blue-500 animate-pulse" />
                  Smart Balancing Suggester
                </h3>
                <span className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400 font-mono text-[9px] px-2 py-0.5 rounded-full font-bold uppercase shrink-0">
                  Live Sim
                </span>
              </div>
              <p className="text-[11px] text-slate-450 mt-1.5">
                Specially calculated optimal floater assignments to maximize Line {selectedLineId}'s balancing efficiency.
              </p>
            </div>

            <div className="p-3 bg-blue-50/50 dark:bg-blue-950/15 border border-blue-100/50 dark:border-blue-900/30 rounded-xl space-y-1.5 text-[10.5px] leading-relaxed text-slate-500">
              <div className="flex gap-1.5 font-semibold text-slate-700 dark:text-neutral-200">
                <span className="font-bold text-blue-600 dark:text-blue-400">💡 Balancing Concept:</span>
              </div>
              <div>
                • <strong className="text-slate-600 dark:text-neutral-300">Balance Efficiency (LBE)</strong>: High balance means cycle times are symmetrical. Relieving the bottleneck raises balance.
              </div>
              <div>
                • <strong className="text-slate-600 dark:text-neutral-300">Dynamic Efficiency</strong>: Average group proficiency scaled by line balance coefficient. Planners optimize this to maximize line rate.
              </div>
            </div>

            <div className="space-y-3">
              {balancingSuggestions.length === 0 ? (
                <div className="p-4 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl text-center space-y-1 bg-slate-50/50 dark:bg-slate-950/10">
                  <span className="block text-[11px] font-semibold text-slate-450">Optimal Balance Achieved</span>
                  <p className="text-[9.5px] text-slate-400">No standby floor floaters are available or can further improve balance efficiency today.</p>
                </div>
              ) : (
                balancingSuggestions.map((sug, idx) => (
                  <div 
                    key={idx} 
                    className={`p-3.5 rounded-xl border transition-all space-y-2.5 ${
                      sug.isVacantRelief 
                        ? 'bg-rose-50/25 border-rose-200/50 dark:bg-rose-950/5 dark:border-rose-900/30' 
                        : sug.isBottleneckRelief
                          ? 'bg-amber-50/30 border-amber-250/30 dark:bg-amber-950/5 dark:border-amber-900/30'
                          : 'bg-slate-50/30 border-slate-150 dark:bg-slate-950/20 dark:border-slate-850'
                    }`}
                  >
                    {/* Badge and gain information */}
                    <div className="flex items-center justify-between">
                      {sug.isVacantRelief ? (
                        <span className="bg-red-100 text-red-800 dark:bg-red-955/40 dark:text-red-400 text-[8.5px] font-mono px-2 py-0.5 rounded-sm font-bold uppercase tracking-wider">
                          🚨 Vacant Relief
                        </span>
                      ) : sug.isBottleneckRelief ? (
                        <span className="bg-amber-100 text-amber-800 dark:bg-amber-955/40 dark:text-amber-400 text-[8.5px] font-mono px-2 py-0.5 rounded-sm font-bold uppercase tracking-wider">
                          ⚠️ Bottleneck Relief
                        </span>
                      ) : (
                        <span className="bg-blue-100 text-blue-800 dark:bg-blue-955/40 dark:text-blue-400 text-[8.5px] font-mono px-2 py-0.5 rounded-sm font-bold uppercase tracking-wider">
                          📈 Capacity Gain
                        </span>
                      )}

                      <div className="text-[9px] font-mono font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 px-2 py-0.5 rounded">
                        Suitability: {sug.suitabilityScore}%
                      </div>
                    </div>

                    {/* Recommendation Sentence */}
                    <div className="text-[11px] leading-normal text-slate-700 dark:text-neutral-200">
                      Transfer <strong className="font-extrabold text-slate-850 dark:text-neutral-100">{sug.operatorName}</strong> ({sug.operatorBaseEff}% Base Eff) to station <span className="font-mono bg-slate-100 dark:bg-slate-805 px-1 py-0.5 rounded text-[10px] text-blue-600 dark:text-blue-400 font-bold">{sug.operationCode}</span> (<strong className="font-semibold">{sug.operationName}</strong>).
                    </div>

                    {/* Simulated Results preview */}
                    <div className="p-2 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-lg flex items-center justify-between text-[10px] font-mono">
                      <div>
                        <span className="text-slate-400 block text-[8px] uppercase">Line Balance</span>
                        <div className="flex items-center gap-1 text-slate-700 dark:text-neutral-300 font-extrabold">
                          <span>{sug.originalBal}%</span>
                          <ArrowRight className="w-2.5 h-2.5 text-slate-400" />
                          <span className="text-emerald-500 font-black">{sug.simulatedBal}%</span>
                          {sug.balGain > 0 && <span className="text-[9px] text-emerald-500 font-normal">(+{sug.balGain}%)</span>}
                        </div>
                      </div>

                      <div className="text-right">
                        <span className="text-slate-400 block text-[8px] uppercase">Line Efficiency</span>
                        <div className="flex items-center gap-1 justify-end text-slate-700 dark:text-neutral-300 font-extrabold">
                          <span>{sug.originalEff}%</span>
                          <ArrowRight className="w-2.5 h-2.5 text-slate-400" />
                          <span className="text-emerald-500 font-black">{sug.simulatedEff}%</span>
                          {sug.effGain > 0 && <span className="text-[9px] text-emerald-500 font-normal">(+{sug.effGain}%)</span>}
                        </div>
                      </div>
                    </div>

                    {/* Deployment button */}
                    <button
                      type="button"
                      disabled={isDeploying !== null || !isIEOrAdmin}
                      onClick={() => handleApplyBalancingSuggestion(sug)}
                      className={`w-full py-1.5 rounded-lg text-[10.5px] font-semibold flex items-center justify-center gap-1.5 transition active:scale-97 cursor-pointer ${
                        !isIEOrAdmin
                          ? 'bg-slate-200 dark:bg-slate-800 text-slate-400 cursor-not-allowed'
                          : sug.isVacantRelief
                            ? 'bg-red-500 hover:bg-red-650 text-white shadow-xs'
                            : sug.isBottleneckRelief
                              ? 'bg-amber-500 hover:bg-amber-600 text-white shadow-xs'
                              : 'bg-blue-600 hover:bg-blue-700 text-white shadow-xs'
                      } disabled:opacity-50 disabled:pointer-events-none`}
                    >
                      {isDeploying === sug.operatorId ? (
                        <>
                          <div className="w-3.5 h-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                          <span>Assigning...</span>
                        </>
                      ) : !isIEOrAdmin ? (
                        <span>Locked (IE Role Needed)</span>
                      ) : (
                        <>
                          <span>Deploy This Balancing Optimization</span>
                        </>
                      )}
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

      </div>

      <StyleChangeModal 
        isOpen={showStyleChangeModal} 
        onClose={() => setShowStyleChangeModal(false)} 
        lineNumber={selectedLineId} 
      />

    </div>
  );
};
