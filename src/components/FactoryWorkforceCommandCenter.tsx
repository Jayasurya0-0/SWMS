/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { useAppState } from '../contexts/StateContext';
import { Employee, ProductionLine, EmployeeAssignment, LeaveRequest, calculateQAPS } from '../types';
import { 
  Users, TrendingDown, TrendingUp, AlertTriangle, Sparkles, Clock, 
  UserCheck, Sliders, Award, ShieldAlert, Activity, ArrowRight,
  UserX, CheckCircle, Flame, Footprints, AlertCircle, Map,
  Edit2, Check, X
} from 'lucide-react';
import { EmployeeAvatar } from './EmployeeAvatar';

interface FactoryWorkforceCommandCenterProps {
  setActiveTab: (tab: string) => void;
}

export function FactoryWorkforceCommandCenter({ setActiveTab }: FactoryWorkforceCommandCenterProps) {
  const {
    employees,
    productionWorkforcePool,
    attendance,
    leaveRequests,
    productionLines,
    employeeAssignments,
    systemDate,
    currentGarment,
    departments,
    notifications,
    garmentStyles,
    getLineRunningStyle,
    updateProductionLine,
    assignEmployee,
    updateLineAllocation
  } = useAppState();

  const [hoveredStation, setHoveredStation] = useState<{lineId: number, opCode: string} | null>(null);
  const [editingLineId, setEditingLineId] = useState<number | null>(null);
  const [editActualQty, setEditActualQty] = useState<string>('');
  const [isDeploying, setIsDeploying] = useState<string | null>(null);

  const handleApplyAdvisory = async (sug: any) => {
    setIsDeploying(sug.operatorId);
    try {
      await updateLineAllocation(
        sug.operatorId, 
        sug.lineId, 
        sug.operationName, 
        'Assigned', 
        'IE Smart Advisor Optimization'
      );
    } catch (e) {
      console.error(e);
    } finally {
      setIsDeploying(null);
    }
  };

  // 1. Attendance checks
  const isOperatorPresent = (empId: string) => {
    const record = attendance.find(
      a => a.employeeId.toUpperCase() === empId.toUpperCase() && a.date === systemDate
    );
    return record ? (record.status === 'Present' || record.status === 'Late') : false;
  };

  const isOperatorOnLeave = (empId: string) => {
    const asg = employeeAssignments.find(
      a => a.employeeId.toUpperCase() === empId.toUpperCase() && a.assignmentDate === systemDate
    );
    return asg ? asg.assignmentStatus === 'Leave' : false;
  };

  const isOperatorUnavailableForProduction = (empId: string) => {
    const asg = employeeAssignments.find(
      a => a.employeeId.toUpperCase() === empId.toUpperCase() && a.assignmentDate === systemDate
    );
    if (!asg) return false;
    const s = asg.assignmentStatus;
    return s === 'Leave' || s === 'Training' || s === 'Meeting' || s === 'Quality Audit' || s === 'Maintenance Support';
  };

  // 2. Process metrics per production line
  const linesDetailedData = useMemo(() => {
    if (!productionLines) return [];

    return productionLines.map(line => {
      // Find the specific garment style assigned to this line, or fallback to currentGarment
      const lineGarmentStyle = getLineRunningStyle(line.id);

      if (!lineGarmentStyle || !lineGarmentStyle.operations) {
        return {
          line,
          presentOperators: productionWorkforcePool.filter(e => e.lineNumber === line.id && isOperatorPresent(e.id)),
          evaluatedOps: [],
          stats: {
            balanceEfficiency: 0,
            actualOutputHr: 0,
            deployedOperatorsCount: 0,
            manpowerUtilization: 0,
            lineEfficiency: line.baseEfficiency || 50,
          },
          vacantCount: 0,
          bottleneckCount: 0,
          leaveShortages: 0
        };
      }

      const tPcsHr = lineGarmentStyle.targetPcsHr || 80;

      // Filter standard operators assigned to this line
      const presentLineOps = productionWorkforcePool.filter(emp => {
        return emp.lineNumber === line.id && 
               isOperatorPresent(emp.id) && 
               !isOperatorUnavailableForProduction(emp.id);
      });

      // Match each operation with assigned operators
      const opsWithMetrics = lineGarmentStyle.operations.map((op, idx) => {
        const assigned = presentLineOps.filter(emp => {
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

        const activeWithPerformances = assigned.map(emp => {
          const opLower = op.name.toLowerCase();
          const specificSkill = emp.skills?.find(s => s.operationName.toLowerCase().includes(opLower) || opLower.includes(s.operationName.toLowerCase()));
          const proficiency = specificSkill ? specificSkill.proficiency : (emp.baseEfficiency || 70);
          const capPerHour = Math.round((60 / op.smv) * (proficiency / 100));

          return {
            employee: emp,
            efficiency: proficiency,
            capacity: capPerHour
          };
        });

        const totalCapacity = activeWithPerformances.reduce((sum, o) => sum + o.capacity, 0);
        const cycleTime = totalCapacity > 0 ? Math.round(3600 / totalCapacity) : 999;

        return {
          sequence: op.sequenceOrder || (idx + 1),
          code: op.operationCode,
          name: op.name,
          smv: op.smv,
          machineType: op.machineType,
          skillRequired: op.skillRequired,
          operators: activeWithPerformances,
          totalCapacity,
          cycleTime,
          status: 'Balanced' as 'Vacant' | 'Bottleneck' | 'Overloaded' | 'Balanced' | 'Underutilized'
        };
      });

      // Calculate status classifications
      const activeOpsCapList = opsWithMetrics.filter(o => o.totalCapacity > 0).map(o => o.totalCapacity);
      const minActiveCapacity = activeOpsCapList.length > 0 ? Math.min(...activeOpsCapList) : 0;
      const maxCt = Math.max(...opsWithMetrics.map(o => o.cycleTime));

      const evaluatedOps = opsWithMetrics.map(op => {
        let status: 'Vacant' | 'Bottleneck' | 'Overloaded' | 'Balanced' | 'Underutilized' = 'Balanced';
        if (op.operators.length === 0) {
          status = 'Vacant';
        } else if (op.totalCapacity === minActiveCapacity || op.cycleTime === maxCt) {
          status = 'Bottleneck';
        } else if (op.totalCapacity < tPcsHr) {
          status = 'Overloaded';
        } else if (op.totalCapacity > tPcsHr * 1.35) {
          status = 'Underutilized';
        } else {
          status = 'Balanced';
        }
        return { ...op, status };
      });

      // Calculate line metrics
      const totalCycleTime = evaluatedOps.reduce((sum, o) => sum + (o.cycleTime === 999 ? 300 : o.cycleTime), 0);
      const maxCycleTime = Math.max(...evaluatedOps.map(o => o.cycleTime === 999 ? 300 : o.cycleTime));
      const rawBalanceEff = maxCycleTime > 0 ? (totalCycleTime / (evaluatedOps.length * maxCycleTime)) * 100 : 0;
      const balanceEfficiency = Math.max(15, Math.min(100, Math.round(rawBalanceEff)));

      const activeStaffSet = new Set<string>();
      evaluatedOps.forEach(op => {
        op.operators.forEach(o => {
          if (o.employee && o.employee.id) {
            activeStaffSet.add(o.employee.id.toUpperCase());
          }
        });
      });
      const deployedOperatorsCount = activeStaffSet.size;

      const nonVacantCaps = evaluatedOps.filter(o => o.totalCapacity > 0).map(o => o.totalCapacity);
      const actualOutputHr = nonVacantCaps.length > 0 ? Math.min(...nonVacantCaps) : 0;

      const averageOpEff = presentLineOps.length > 0 
        ? presentLineOps.reduce((sum, e) => sum + e.baseEfficiency, 0) / presentLineOps.length 
        : 0;
      const dynamicLineEfficiency = Math.round(averageOpEff * (balanceEfficiency / 100));

      const requiredManpower = lineGarmentStyle.requiredManpower || line.requiredManpower;
      const manpowerUtilization = Math.round((deployedOperatorsCount / requiredManpower) * 100);

      // Find tomorrow's approved leaves for operators on this specific line
      const tomorrowStr = new Date();
      tomorrowStr.setDate(tomorrowStr.getDate() + 1);
      const leaveShortages = leaveRequests.filter(req => {
        if (req.status !== 'Approved') return false;
        // Verify if startDate <= tomorrow <= endDate
        const tTime = tomorrowStr.getTime();
        const sTime = new Date(req.startDate).getTime();
        const eTime = new Date(req.endDate).getTime();
        if (tTime >= sTime && tTime <= eTime) {
          const employee = productionWorkforcePool.find(e => e.id.toUpperCase() === req.employeeId.toUpperCase());
          return employee?.lineNumber === line.id;
        }
        return false;
      }).length;

      const vacantCount = evaluatedOps.filter(o => o.status === 'Vacant').length;
      const bottleneckCount = evaluatedOps.filter(o => o.status === 'Bottleneck').length;

      return {
        line,
        presentOperators: presentLineOps,
        evaluatedOps,
        stats: {
          balanceEfficiency: isNaN(balanceEfficiency) ? 0 : balanceEfficiency,
          actualOutputHr: isNaN(actualOutputHr) ? 0 : actualOutputHr,
          deployedOperatorsCount,
          manpowerUtilization: isNaN(manpowerUtilization) ? 0 : manpowerUtilization,
          lineEfficiency: Math.max(10, Math.min(100, Math.round(dynamicLineEfficiency || line.baseEfficiency || 50)))
        },
        vacantCount,
        bottleneckCount,
        leaveShortages
      };
    });
  }, [productionLines, currentGarment, garmentStyles, productionWorkforcePool, attendance, employeeAssignments, systemDate, leaveRequests]);

  // 3. Consolidated top-level KPIs
  const kpis = useMemo(() => {
    // Only count employees in 'sewing' or 'floater' departments or whose line matches active lines/floaters (or any production line)
    const activePool = productionWorkforcePool.filter(emp => {
      const dept = (emp.department || '').toLowerCase();
      return dept === 'sewing' || dept === 'floater' || dept.includes('finishing') || emp.lineNumber === 99 || emp.lineNumber > 0;
    });

    const totalWorkforce = activePool.length;
    
    const presentOperators = activePool.filter(emp => isOperatorPresent(emp.id)).length;
    
    const absentOperators = activePool.filter(emp => {
      const rec = attendance.find(a => a.employeeId.toUpperCase() === emp.id.toUpperCase() && a.date === systemDate);
      return rec?.status === 'Absent';
    }).length;

    const onLeaveOrOffline = activePool.filter(emp => {
      if (isOperatorOnLeave(emp.id)) return true;
      // also check if they are absent with a leave request approved
      const hasApprovedLeave = leaveRequests.some(l => 
        l.employeeId.toUpperCase() === emp.id.toUpperCase() && 
        l.status === 'Approved' &&
        new Date(systemDate) >= new Date(l.startDate) &&
        new Date(systemDate) <= new Date(l.endDate)
      );
      return hasApprovedLeave && !isOperatorPresent(emp.id);
    }).length;

    // Available floaters: present, and registered to floater department / line 99, and having no active line assignment
    const availableFloaters = activePool.filter(emp => {
      if (!isOperatorPresent(emp.id)) return false;
      
      const isFloaterLine = emp.lineNumber === 99 || emp.department.toLowerCase().includes('floater');
      if (!isFloaterLine) return false;

      // Ensure they don't have an active workstation binding on an operations line right now
      const asg = employeeAssignments.find(
        a => a.employeeId.toUpperCase() === emp.id.toUpperCase() && a.assignmentDate === systemDate
      );
      if (!asg) return true;
      return asg.assignmentStatus === 'Unassigned' || asg.assignmentStatus === 'Available for Replacement';
    }).length;

    const activeLinesCount = productionLines.length;

    // Overall Factory Efficiency: average of running line efficiencies
    const validLines = linesDetailedData.filter(d => d.stats.lineEfficiency > 0);
    const overallEfficiency = validLines.length > 0
      ? Math.round(validLines.reduce((sum, d) => sum + d.stats.lineEfficiency, 0) / validLines.length)
      : 60;

    // Expected Production Output: Sum of projected outputs
    // Projected Daily pieces = Sum on all lines (Line actual output/hr * 8 hours)
    const expectedOutput = linesDetailedData.reduce((sum, d) => {
      return sum + Math.round(d.stats.actualOutputHr * 8);
    }, 0);

    return {
      totalWorkforce,
      presentOperators,
      absentOperators,
      onLeaveOrOffline,
      availableFloaters,
      activeLines: activeLinesCount,
      overallEfficiency,
      expectedOutput
    };
  }, [productionWorkforcePool, attendance, employeeAssignments, systemDate, leaveRequests, linesDetailedData, productionLines]);

  const isFloater = (emp: Employee) => {
    const dept = (emp.department || '').toLowerCase();
    const desg = (emp.designation || '').toLowerCase();
    return dept.includes('floater') || desg.includes('floater') || emp.lineNumber === 99;
  };

  const totalPresentOperatorsCount = useMemo(() => {
    return productionWorkforcePool.filter(emp => isOperatorPresent(emp.id) && !isFloater(emp)).length;
  }, [productionWorkforcePool, attendance, systemDate]);

  const totalPresentFloatersCount = useMemo(() => {
    return productionWorkforcePool.filter(emp => isOperatorPresent(emp.id) && isFloater(emp)).length;
  }, [productionWorkforcePool, attendance, systemDate]);

  // 4b. Intelligent Line Balancing & Efficiency Optimization Advisory Recommendations
  const advisorySuggestions = useMemo(() => {
    // Collect all present, available (unassigned / standby floaters) operators
    const availableStandbyOperators = productionWorkforcePool.filter(emp => {
      if (!isOperatorPresent(emp.id)) return false;
      const isFloaterLine = emp.lineNumber === 99 || 
                            (emp.lineNumber === 0 && (emp.department.toLowerCase().includes('sewing') || emp.department.toLowerCase().includes('floater')));
      
      const asg = employeeAssignments.find(
        a => a.employeeId.toUpperCase() === emp.id.toUpperCase() && a.assignmentDate === systemDate
      );
      const isUnassigned = !asg || asg.assignmentStatus === 'Unassigned' || asg.assignmentStatus === 'Available for Replacement';
      return isFloaterLine || isUnassigned;
    });

    const suggestions: Array<{
      lineId: number;
      lineName: string;
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

    linesDetailedData.forEach(({ line, evaluatedOps, stats: originalStats }) => {
      const lineGarmentStyle = getLineRunningStyle(line.id);
      if (!lineGarmentStyle || !lineGarmentStyle.operations) return;

      evaluatedOps.forEach(op => {
        availableStandbyOperators.forEach(operator => {
          const opLower = op.name.toLowerCase();
          const specificSkill = operator.skills?.find(s => 
            s.operationName.toLowerCase().includes(opLower) || opLower.includes(s.operationName.toLowerCase())
          );
          const proficiency = specificSkill ? specificSkill.proficiency : (operator.baseEfficiency || 70);

          const simulatedOperatorsForOp = [...op.operators, {
            employee: operator,
            efficiency: proficiency,
            capacity: Math.round((60 / op.smv) * (proficiency / 100))
          }];

          const simulatedCapForOp = simulatedOperatorsForOp.reduce((sum, o) => sum + o.capacity, 0);
          
          const simulatedOps = evaluatedOps.map(originalOp => {
            if (originalOp.code === op.code) {
              const cap = simulatedCapForOp;
              const ct = cap > 0 ? Math.round(3600 / cap) : 999;
              return { ...originalOp, totalCapacity: cap, cycleTime: ct, isModified: true };
            }
            return { ...originalOp, isModified: false };
          });

          const simulatedTotalCycleTime = simulatedOps.reduce((sum, o) => sum + (o.cycleTime === 999 ? 300 : o.cycleTime), 0);
          const simulatedMaxCycleTime = Math.max(...simulatedOps.map(o => o.cycleTime === 999 ? 300 : o.cycleTime));
          
          const simulatedRawBalance = simulatedMaxCycleTime > 0 
            ? (simulatedTotalCycleTime / (lineGarmentStyle.operations.length * simulatedMaxCycleTime)) * 100 
            : 0;
          const simulatedBal = Math.max(15, Math.min(100, Math.round(simulatedRawBalance)));

          const simulatedLineOps = [...productionWorkforcePool.filter(emp => emp.lineNumber === line.id && isOperatorPresent(emp.id) && !isOperatorUnavailableForProduction(emp.id)), operator];
          const simulatedAvgEff = simulatedLineOps.length > 0 
            ? simulatedLineOps.reduce((sum, e) => sum + e.baseEfficiency, 0) / simulatedLineOps.length 
            : 0;
          
          const simulatedDynamicEff = Math.round(simulatedAvgEff * (simulatedBal / 100));
          const simulatedEff = Math.max(10, Math.min(100, Math.round(simulatedDynamicEff || line.baseEfficiency || 50)));

          const effGain = simulatedEff - originalStats.lineEfficiency;
          const balGain = simulatedBal - originalStats.balanceEfficiency;

          const isVacantRelief = op.status === 'Vacant';
          const isBottleneckRelief = op.status === 'Bottleneck';

          if (effGain > 0 || balGain > 0 || isVacantRelief) {
            suggestions.push({
              lineId: line.id,
              lineName: line.name || `Line #${line.id}`,
              operatorId: operator.id,
              operatorName: operator.name,
              operatorAvatarUrl: operator.photoUrl,
              operatorBaseEff: operator.baseEfficiency,
              operationCode: op.code,
              operationName: op.name,
              originalEff: originalStats.lineEfficiency,
              originalBal: originalStats.balanceEfficiency,
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
    });

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
    }).slice(0, 4);
  }, [productionWorkforcePool, attendance, employeeAssignments, systemDate, linesDetailedData, getLineRunningStyle]);

  const handleStartEditLine = (lineId: number, actual: number) => {
    setEditingLineId(lineId);
    setEditActualQty(String(actual));
  };

  const handleSaveLineProduction = (lineId: number, target: number) => {
    const actual = parseInt(editActualQty, 10);
    const cleanActual = isNaN(actual) ? 0 : actual;
    updateProductionLine(lineId, target, cleanActual);
    setEditingLineId(null);
  };

  // 4. Smart Alerts generation
  const smartAlerts = useMemo(() => {
    const alerts: Array<{
      id: string;
      title: string;
      description: string;
      type: 'critical' | 'warning' | 'info';
      actionTab: string;
    }> = [];

    linesDetailedData.forEach(d => {
      const lineNo = d.line.id;
      const reqS = currentGarment?.requiredManpower || d.line.requiredManpower;
      
      // Shortage alert
      if (d.stats.deployedOperatorsCount < reqS) {
        alerts.push({
          id: `shortage-L${lineNo}`,
          title: `Operator Shortage on Line #${lineNo}`,
          description: `Line #${lineNo} has only ${d.stats.deployedOperatorsCount} operators active out of ${reqS} required. Deficit: ${reqS - d.stats.deployedOperatorsCount} crew.`,
          type: 'critical',
          actionTab: 'assignment'
        });
      }

      // Vacant operations alert
      if (d.vacantCount > 0) {
        const vacantOps = d.evaluatedOps.filter(o => o.status === 'Vacant');
        alerts.push({
          id: `vacant-L${lineNo}`,
          title: `${d.vacantCount} Vacant Station(s) on Line #${lineNo}`,
          description: `Critical sewing operations [${vacantOps.map(o => o.code).join(', ')}] have zero operators stationed! Conveyor flow is disrupted.`,
          type: 'critical',
          actionTab: 'balancing'
        });
      }

      // Bottleneck alert
      if (d.bottleneckCount > 0) {
        const bottlenecks = d.evaluatedOps.filter(o => o.status === 'Bottleneck');
        bottlenecks.forEach(b => {
          if (b.totalCapacity < (currentGarment?.targetPcsHr || 80)) {
            alerts.push({
              id: `bottleneck-L${lineNo}-${b.code}`,
              title: `Critical Bottleneck: "${b.name}" (L#${lineNo})`,
              description: `Workstation ${b.code} is restricting entire line flow to ${b.totalCapacity} garments/hr. Target pitch is ${currentGarment?.targetPcsHr || 80} garments/hr.`,
              type: 'warning',
              actionTab: 'balancing'
            });
          }
        });
      }

      // Leave risks
      if (d.leaveShortages > 0) {
        alerts.push({
          id: `leave-risk-L${lineNo}`,
          title: `Absenteeism Risk Tomorrow: Line #${lineNo}`,
          description: `${d.leaveShortages} operator(s) on Line #${lineNo} have approved leave requests starting tomorrow. Prepare standby floaters.`,
          type: 'info',
          actionTab: 'predictive'
        });
      }
    });

    // General high absenteeism risks
    const criticalAttendanceRisks = productionWorkforcePool.filter(e => isOperatorPresent(e.id) && e.riskScore > 75).slice(0, 3);
    criticalAttendanceRisks.forEach(cr => {
      alerts.push({
        id: `absent-risk-${cr.id}`,
        title: `Absentee Risk: ${cr.name} (ID: ${cr.id})`,
        description: `Operator stationed on Line #${cr.lineNumber || 'unassigned'} presents a ${cr.riskScore}% absenteeism risk.`,
        type: 'info',
        actionTab: 'predictive'
      });
    });

    return alerts.slice(0, 6); // Max 6 alerts
  }, [linesDetailedData, currentGarment, productionWorkforcePool, attendance, systemDate]);

  // 5. Operator Rankings
  const rankings = useMemo(() => {
    const getQaps = (emp: Employee) => {
      const attendance = emp.attendanceReliability || emp.historicalAttendanceRate || 95;
      const defects = emp.defectRate !== undefined ? emp.defectRate : 2.5;
      const avgPcs = emp.avgPcsProducedPerDay || Math.round((emp.baseEfficiency || 70) * 4.6);
      const avgProficiency = emp.skills && emp.skills.length > 0 
        ? emp.skills.reduce((sum, s) => sum + s.proficiency, 0) / emp.skills.length 
        : (emp.baseEfficiency || 70);
        
      return calculateQAPS(avgProficiency, emp.baseEfficiency || 70, attendance, defects, avgPcs);
    };

    // Top Performers: Sort present operators by base efficiency or specific skill rating
    const presentEmps = productionWorkforcePool.filter(emp => isOperatorPresent(emp.id) && !isOperatorUnavailableForProduction(emp.id));
    
    const topPerforming = [...presentEmps]
      .sort((a, b) => getQaps(b) - getQaps(a))
      .slice(0, 5);

    // Underutilized: Present operators that are either unassigned, or assigned to an operation classified as "Underutilized" (capacity > 135% of target)
    const underutilized: Array<{ employee: Employee; currentAssignment: string; line: number }> = [];
    presentEmps.forEach(emp => {
      const asg = employeeAssignments.find(
        a => a.employeeId.toUpperCase() === emp.id.toUpperCase() && a.assignmentDate === systemDate
      );
      const isUn = !asg || asg.assignmentStatus === 'Unassigned' || asg.assignmentStatus === 'Available for Replacement';
      const assignedOp = asg?.assignedOperation || 'None';

      if (isUn) {
        underutilized.push({ employee: emp, currentAssignment: 'Unassigned/Standby', line: emp.lineNumber || 0 });
      } else {
        // Check if assigned operation is deemed underutilized on their active line
        const lineData = linesDetailedData.find(l => l.line.id === asg.assignedLine);
        if (lineData) {
          const opData = lineData.evaluatedOps.find(o => o.code === asg.assignedOperation || o.name === asg.assignedOperation);
          if (opData && opData.status === 'Underutilized') {
            underutilized.push({ employee: emp, currentAssignment: opData.name, line: asg.assignedLine });
          }
        }
      }
    });

    // Available Standby Floaters: floaters who are present, unassigned/ready for placement
    const floatersList = productionWorkforcePool.filter(emp => {
      if (!isOperatorPresent(emp.id)) return false;
      
      const isFloaterLine = emp.lineNumber === 99 || 
                            (emp.lineNumber === 0 && (emp.department.toLowerCase().includes('sewing') || emp.department.toLowerCase().includes('floater'))) ||
                            emp.department.toLowerCase().includes('floater');
      if (!isFloaterLine) return false;
      
      const asg = employeeAssignments.find(
        a => a.employeeId.toUpperCase() === emp.id.toUpperCase() && a.assignmentDate === systemDate
      );
      return !asg || asg.assignmentStatus === 'Unassigned' || asg.assignmentStatus === 'Available for Replacement';
    });

    const standbyFloaters = floatersList
      .sort((a, b) => getQaps(b) - getQaps(a))
      .slice(0, 5);

    return {
      topPerforming,
      underutilized: underutilized.slice(0, 5),
      standbyFloaters
    };
  }, [productionWorkforcePool, employeeAssignments, systemDate, linesDetailedData]);

  // 6. Color classes for different operation states
  const getStatusColor = (status: 'Vacant' | 'Bottleneck' | 'Overloaded' | 'Balanced' | 'Underutilized') => {
    switch (status) {
      case 'Vacant':
        return 'bg-red-500 border-red-650 text-white';
      case 'Bottleneck':
        return 'bg-amber-500 border-amber-600 text-white animate-pulse';
      case 'Overloaded':
        return 'bg-orange-400 border-orange-500 text-white';
      case 'Underutilized':
        return 'bg-blue-400 border-blue-500 text-white';
      case 'Balanced':
      default:
        return 'bg-emerald-500 border-emerald-600 text-white';
    }
  };

  return (
    <div id="factory-workforce-command-center" className="space-y-6">
      {/* SECTION 1: HEADER BANNER */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-6 rounded-3xl shadow-xs relative overflow-hidden flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Decorative vector background */}
        <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-gradient-to-l from-blue-50/20 dark:from-blue-950/20 to-transparent pointer-events-none rounded-r-3xl" />
        
        <div className="space-y-2 relative z-10">
          <div className="flex items-center gap-2">
            <span className="p-1 px-2 text-[9px] font-extrabold uppercase bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-300 rounded border border-blue-200/50">
              MES Control Panel - Live
            </span>
            <span className="p-1 px-2 text-[9px] font-mono text-slate-400 font-semibold bg-slate-50 dark:bg-slate-950 rounded border border-slate-200/40">
              Shift Calendar: {systemDate}
            </span>
          </div>
          <h1 className="text-3xl font-black font-display text-slate-900 dark:text-neutral-100 tracking-tight">
            Workforce Command Center
          </h1>
          <p className="text-sm text-slate-500 dark:text-neutral-400 max-w-2xl font-sans">
            Real-time industrial surveillance tower coordinating sewing production line allocations, gate scan registers, 
            skill matrices, and active balancing limits from a unified screen.
          </p>
        </div>


      </div>

      {/* SECTION 2: TOP KPI ROW */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* KPI 1 */}
        <div className="bg-white dark:bg-slate-900 border border-slate-205 dark:border-slate-800 p-4 rounded-2xl flex items-center gap-4 shadow-2xs">
          <div className="p-3 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-100 dark:border-slate-800 text-slate-500 dark:text-slate-400 shrink-0">
            <Users className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <span className="text-[10px] font-bold text-slate-400 uppercase block tracking-wider font-sans">Total Workforce</span>
            <strong className="text-2xl font-black font-mono text-slate-800 dark:text-neutral-100 block">
              {kpis.totalWorkforce}
            </strong>
            <span className="text-[10px] text-slate-400 block truncate">Registered personnel</span>
          </div>
        </div>

        {/* KPI 2 & 3 Combined Breakdown */}
        <div className="bg-white dark:bg-slate-900 border border-slate-205 dark:border-slate-800 p-4 rounded-2xl flex items-center gap-4 shadow-2xs">
          <div className="p-3 bg-emerald-50 dark:bg-emerald-950/20 rounded-xl border border-emerald-100 dark:border-emerald-950 text-emerald-505 dark:text-emerald-400 shrink-0">
            <CheckCircle className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase block tracking-wider font-sans">Present / Absent</span>
            <div className="flex items-baseline gap-1.5">
              <strong className="text-2xl font-black font-mono text-slate-800 dark:text-neutral-100">
                {kpis.presentOperators}
              </strong>
              <span className="text-xs text-slate-400">/</span>
              <span className="text-sm font-bold text-rose-500 font-mono">
                {kpis.absentOperators} abs
              </span>
            </div>
            <span className="text-[10.5px] text-emerald-600 dark:text-emerald-400 font-semibold block truncate">
              {Math.round((kpis.presentOperators / kpis.totalWorkforce) * 100) || 100}% attendance rate
            </span>
          </div>
        </div>

        {/* KPI 4 & 5 Leaves and Floaters */}
        <div className="bg-white dark:bg-slate-900 border border-slate-205 dark:border-slate-800 p-4 rounded-2xl flex items-center gap-4 shadow-2xs">
          <div className="p-3 bg-blue-50 dark:bg-blue-950/20 rounded-xl border border-blue-105 dark:border-blue-950 text-blue-505 dark:text-blue-400 shrink-0">
            <Footprints className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase block tracking-wider font-sans">Offline / Floaters</span>
            <div className="flex items-baseline gap-1.5">
              <strong className="text-2xl font-black font-mono text-slate-800 dark:text-neutral-100">
                {kpis.onLeaveOrOffline}
              </strong>
              <span className="text-xs text-slate-400">on leave</span>
              <span className="text-slate-400">·</span>
              <span className="text-sm font-bold text-blue-500 font-mono">
                {kpis.availableFloaters} standby
              </span>
            </div>
            <span className="text-[10.5px] text-slate-400 block truncate">
              Floaters ready for hot deployment
            </span>
          </div>
        </div>

        {/* KPI 6, 7 & 8 Outputs */}
        <div className="bg-white dark:bg-slate-900 border border-slate-250 dark:border-slate-805 p-4 rounded-2xl flex items-center gap-4 shadow-2xs">
          <div className="p-3 bg-purple-50 dark:bg-purple-950/20 rounded-xl border border-purple-100 dark:border-purple-950 text-purple-650 dark:text-purple-400 shrink-0">
            <Activity className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase block tracking-wider font-sans">Projected Factory Yield</span>
            <strong className="text-xl font-black font-mono text-slate-800 dark:text-neutral-100 block">
              {kpis.expectedOutput.toLocaleString()} pcs/shift
            </strong>
            <span className="text-[10.5px] text-purple-600 dark:text-purple-400 font-bold block">
              Overall Efficiency: {kpis.overallEfficiency}%
            </span>
          </div>
        </div>
      </div>

      {/* SECTION 3: CENTER LAYOUT split in 2 columns: Active Line Cards & Smart Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* COLUMN 1 & 2: SEWING LINES DETAILED OVERVIEW */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-800 dark:text-neutral-200 uppercase font-display tracking-wide block">
              Sewing Lines Live Watch
            </h2>
            <span className="text-xs text-slate-400 font-mono">
              Projections updated today at shift clock
            </span>
          </div>          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {linesDetailedData.map(({ line, stats, vacantCount, bottleneckCount, leaveShortages, presentOperators }) => {
              const reqManpower = currentGarment?.requiredManpower || line.requiredManpower;
              
              return (
                <div 
                  key={line.id} 
                  className={`bg-white dark:bg-slate-900 border rounded-2xl p-5 shadow-2xs transition-all relative overflow-hidden flex flex-col justify-between ${
                    vacantCount > 0 
                      ? 'border-red-400/40 dark:border-red-950 bg-red-50/5 dark:bg-red-950/5' 
                      : bottleneckCount > 0 && stats.lineEfficiency < 65
                        ? 'border-amber-400/40 bg-amber-50/5' 
                        : 'border-slate-200 dark:border-slate-800/80 hover:border-slate-250 dark:hover:border-slate-750'
                  }`}
                >
                  {/* Decorative line number stamp */}
                  <span className="absolute right-3.5 top-2.5 font-mono text-5xl font-black text-slate-100/70 dark:text-slate-800/20 select-none pointer-events-none">
                    L0{line.id}
                  </span>

                  <div>
                    {/* Card Title */}
                    <div className="flex items-center justify-between mb-3.5 z-10 relative">
                      <div>
                        <strong className="text-sm font-extrabold text-slate-800 dark:text-white block">
                          Line #0{line.id}
                        </strong>
                        <span className="text-xs text-slate-400 font-mono block mb-1">
                          Supervisor: {line.supervisor}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className={`px-2 py-0.5 rounded text-[8.5px] font-extrabold uppercase ${
                          stats.lineEfficiency >= 75 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400' :
                          stats.lineEfficiency >= 60 ? 'bg-blue-105 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300' :
                          'bg-amber-105 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400'
                        }`}>
                          {stats.lineEfficiency}% Efficiency
                        </span>
                      </div>
                    </div>

                    {/* Stats Grids */}
                    <div className="grid grid-cols-2 gap-3 mb-4 text-xs font-sans">
                      <div className="bg-slate-50 dark:bg-slate-950/50 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800/40">
                        <span className="text-[10px] text-slate-400 uppercase block font-bold tracking-wider mb-2">Workforce Allocated</span>
                        <div className="space-y-2">
                          <div>
                            <div className="flex items-center justify-between text-[10px]">
                              <span className="font-semibold text-slate-500 dark:text-slate-400">Operators</span>
                              <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                                {presentOperators.filter(emp => !isFloater(emp)).length} <span className="text-[9px] font-light text-slate-400">/{totalPresentOperatorsCount}</span>
                              </span>
                            </div>
                            <div className="w-full bg-slate-200 dark:bg-slate-800 h-1 mt-0.5 rounded-full overflow-hidden">
                              <div 
                                className="bg-emerald-500 h-full rounded-full transition-all" 
                                style={{ width: `${Math.min(100, Math.round(((presentOperators.filter(emp => !isFloater(emp)).length) / Math.max(1, totalPresentOperatorsCount)) * 100))}%` }}
                              />
                            </div>
                          </div>
                          <div>
                            <div className="flex items-center justify-between text-[10px]">
                              <span className="font-semibold text-slate-500 dark:text-slate-400">Floaters</span>
                              <span className="font-mono font-bold text-blue-600 dark:text-blue-400">
                                {presentOperators.filter(emp => isFloater(emp)).length} <span className="text-[9px] font-light text-slate-400">/{totalPresentFloatersCount}</span>
                              </span>
                            </div>
                            <div className="w-full bg-slate-200 dark:bg-slate-800 h-1 mt-0.5 rounded-full overflow-hidden">
                              <div 
                                className="bg-blue-500 h-full rounded-full transition-all" 
                                style={{ width: `${Math.min(100, Math.round(((presentOperators.filter(emp => isFloater(emp)).length) / Math.max(1, totalPresentFloatersCount)) * 100))}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="bg-slate-50 dark:bg-slate-950/50 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800/40">
                        <span className="text-[10px] text-slate-400 uppercase block font-bold tracking-wider mb-0.5">Expected Yield</span>
                        <div className="text-sm font-bold text-slate-700 dark:text-slate-205 font-mono">
                          {Math.round(stats.actualOutputHr * 8)} pcs/day
                        </div>
                        <span className="text-[9.5px] text-slate-400 font-mono block">
                          Output: {stats.actualOutputHr} pcs/hr
                        </span>
                      </div>
                    </div>

                    {/* Status Highlights */}
                    <div className="space-y-1.5 text-[10.5px]">
                      {vacantCount > 0 ? (
                        <div className="flex items-center gap-1.5 text-red-655 dark:text-red-400 font-bold bg-red-105/20 px-2 py-1 rounded">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          <span>{vacantCount} Vacant Flow Station(s)!</span>
                        </div>
                      ) : null}

                      {bottleneckCount > 0 ? (
                        <div className="flex items-center gap-1.5 text-amber-705 dark:text-amber-400 font-bold bg-amber-105/20 px-2 py-1 rounded">
                          <Flame className="w-3.5 h-3.5" />
                          <span>{bottleneckCount} Bottleneck machine(s) detected</span>
                        </div>
                      ) : null}

                      {/* Leaves shortages */}
                      {leaveShortages > 0 ? (
                        <div className="flex items-center gap-1.5 text-blue-650 dark:text-blue-300 bg-blue-50/20 px-2 py-1 rounded border border-blue-500/10 font-bold">
                          <UserX className="w-3.5 h-3.5" />
                          <span>Tomorrow shortage: {leaveShortages} operator approved leave</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-medium">
                          <CheckCircle className="w-3.5 h-3.5" />
                          <span>Zero upcoming absenteeism risks tomorrow</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Button Action */}
                  <div className="border-t border-slate-100 dark:border-slate-800/80 pt-3.5 mt-4 flex items-center justify-between">
                    <span className="text-[10px] font-mono text-slate-400">
                      Balance: {stats.balanceEfficiency}%
                    </span>
                    <button 
                      onClick={() => setActiveTab('balancing')} 
                      className="text-xs font-extrabold text-blue-600 dark:text-blue-400 flex items-center gap-1 hover:underline cursor-pointer"
                    >
                      <span>Open IE balancer</span>
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* COLUMN 3: LINE PRODUCTION TARGET VS ACTUAL CONTROL PANEL */}
        <div className="space-y-4">
          <div className="flex flex-col space-y-1">
            <h2 className="text-lg font-bold text-slate-805 dark:text-neutral-200 uppercase font-display tracking-wide block">
              Line Production Target vs Actual Volume
            </h2>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 px-2 py-0.5 font-bold uppercase rounded-sm border border-blue-200/40 tracking-wider">
                Authorized: IE & Supervisor inputs
              </span>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-205 dark:border-slate-800 rounded-2xl p-4 shadow-2xs space-y-3.5">
            <div className="space-y-3 max-h-[460px] overflow-y-auto custom-scrollbar pr-1">
              {linesDetailedData.map(({ line, stats }) => {
                const targetVol = Math.round(stats.actualOutputHr * 8);
                const actualVol = line.actualQuantity || 0;
                const actualPct = targetVol > 0 ? Math.min(100, Math.round((actualVol / targetVol) * 100)) : 0;
                const lineStatusColor = line.status === 'Critical' 
                  ? 'bg-red-500' 
                  : line.status === 'Understaffed' 
                    ? 'bg-amber-500' 
                    : 'bg-emerald-500';

                return (
                  <div key={line.id} className="p-3 bg-slate-50 dark:bg-slate-950/30 rounded-xl border border-slate-100 dark:border-slate-850 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <span className={`inline-block w-2 h-2 rounded-full ${lineStatusColor}`} />
                        <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Line #0{line.id}</span>
                        <span className="text-[10px] text-slate-400 font-mono">({Math.round(stats.lineEfficiency)}% Eff)</span>
                      </div>

                      {editingLineId === line.id ? (
                        <div className="flex items-center gap-1 text-xs">
                          <input 
                            type="number"
                            min="0"
                            className="w-16 px-1.5 py-0.5 font-bold font-mono text-center text-blue-600 dark:text-blue-400 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded focus:outline-none"
                            value={editActualQty}
                            onChange={(e) => setEditActualQty(e.target.value)}
                          />
                          <button
                            onClick={() => handleSaveLineProduction(line.id, targetVol)}
                            className="p-0.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded transition cursor-pointer"
                            title="Save"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setEditingLineId(null)}
                            className="p-0.5 bg-slate-400 dark:bg-slate-750 hover:bg-slate-500 text-white rounded transition cursor-pointer"
                            title="Cancel"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center space-x-1.5 text-xs">
                          <div className="text-right">
                            <span className="font-mono font-bold text-slate-800 dark:text-white">{actualVol}</span>
                            <span className="text-slate-400 text-[10px]"> / {targetVol} Pcs</span>
                          </div>
                          <button
                            onClick={() => handleStartEditLine(line.id, actualVol)}
                            className="p-1 text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-950/40 rounded border border-slate-200/45 dark:border-slate-800 cursor-pointer"
                            title="Edit actual pieces"
                          >
                            <Edit2 className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-12 gap-2 items-center">
                      <div className="col-span-10 bg-slate-200 dark:bg-slate-800 h-2.5 rounded overflow-hidden relative">
                        <div className="absolute right-0 top-0 bottom-0 border-l border-dashed border-red-450/40 z-10" />
                        <div 
                          className={`h-full rounded transition-all duration-300 ${actualPct > 85 ? 'bg-emerald-500' : (actualPct > 70 ? 'bg-blue-600' : 'bg-red-500')}`}
                          style={{ width: `${actualPct}%` }}
                        />
                      </div>
                      <div className="col-span-2 text-right">
                        <span className={`text-[10px] font-bold font-mono ${actualPct > 85 ? 'text-emerald-500' : (actualPct > 70 ? 'text-blue-500' : 'text-red-500')}`}>
                          {actualPct}%
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* IE SMART BALANCING & EFFICIENCY ADVISORY */}
          <div className="bg-white dark:bg-slate-900 border border-slate-205 dark:border-slate-800 rounded-2xl p-5 shadow-2xs space-y-4">
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <h2 className="text-[13px] font-extrabold text-slate-850 dark:text-neutral-100 uppercase tracking-wider flex items-center gap-1.5 font-display">
                  <Sparkles className="w-4 h-4 text-blue-500 animate-pulse" />
                  IE Live Balancing Optimizer
                </h2>
                <span className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400 font-mono text-[9px] px-2 py-0.5 rounded-full font-bold uppercase">
                  Active Simulation
                </span>
              </div>
              <p className="text-[10.5px] text-slate-400 leading-relaxed">
                Appointing operators to specific tasks changes the line's key metrics. Select high-gain recommendations below to enact live operational changes.
              </p>
            </div>

            <div className="p-3 bg-blue-50/50 dark:bg-blue-950/15 border border-blue-100/50 dark:border-blue-900/30 rounded-xl space-y-1.5 text-[10.5px] leading-relaxed text-slate-500">
              <div className="flex gap-1.5 font-semibold text-slate-700 dark:text-neutral-200">
                <span className="font-bold text-blue-600 dark:text-blue-400">💡 Concept Guide:</span>
              </div>
              <div>
                • <strong className="text-slate-600 dark:text-neutral-300">Line Balance</strong>: Measures capacity symmetry across workstations. Perfect match of capacities across stations gets 100%. Relieving bottlenecks raises balance.
              </div>
              <div>
                • <strong className="text-slate-600 dark:text-neutral-300">Line Efficiency</strong>: Relies on average group proficiency scaled by the balance coefficient. Matching high-skilled personnel directly increases line yield.
              </div>
            </div>

            <div className="space-y-3">
              {advisorySuggestions.length === 0 ? (
                <div className="p-4 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl text-center space-y-1 bg-slate-50/50 dark:bg-slate-950/10">
                  <span className="block text-[11px] font-semibold text-slate-450">Optimal Balance Achieved</span>
                  <p className="text-[9.5px] text-slate-400">No redundant standby floaters are currently available or additional staffing gains can be simulated today.</p>
                </div>
              ) : (
                advisorySuggestions.map((sug, idx) => (
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
                          🚨 Vacancy Relief
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

                      <div className="flex items-center gap-1.5 text-[9px] font-mono font-black text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 px-2 py-0.5 rounded">
                        <TrendingUp className="w-3 h-3" />
                        <span>Suitability: {sug.suitabilityScore}%</span>
                      </div>
                    </div>

                    {/* Recommendation Sentence */}
                    <div className="text-[11px] leading-normal text-slate-700 dark:text-neutral-200">
                      Transfer <strong className="font-extrabold text-slate-850 dark:text-neutral-100">{sug.operatorName}</strong> (Floater, {sug.operatorBaseEff}% Base Eff) to 
                      <strong> {sug.lineName}</strong> for station <span className="font-mono bg-slate-100 dark:bg-slate-805 px-1 py-0.5 rounded text-[10px] text-blue-600 dark:text-blue-400 font-bold">{sug.operationCode}</span> (<strong className="font-semibold">{sug.operationName}</strong>).
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
                      disabled={isDeploying !== null}
                      onClick={() => handleApplyAdvisory(sug)}
                      className={`w-full py-1.5 rounded-lg text-[10.5px] font-semibold flex items-center justify-center gap-1.5 transition active:scale-97 cursor-pointer ${
                        sug.isVacantRelief
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
                      ) : (
                        <>
                          <UserCheck className="w-3.5 h-3.5" />
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

      {/* SECTION 4: WORKFORCE HEAT MAP */}
      <div className="bg-white dark:bg-slate-900 border border-slate-205 dark:border-slate-800 rounded-3xl p-6 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-4">
          <div className="space-y-1">
            <h2 className="text-base font-bold text-slate-800 dark:text-neutral-200 flex items-center gap-2">
              <Map className="w-5 h-5 text-blue-500" />
              Workforce Concentration &amp; Capacity Heat Map
            </h2>
            <p className="text-xs text-slate-450 dark:text-neutral-400">
              Visualizes real-time staffing concentrations and workstation status codes sequentially order along conveyor conveyor lines.
            </p>
          </div>
          
          {/* Legend */}
          <div className="flex items-center gap-3.5 flex-wrap text-[10px] font-mono text-slate-450">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 bg-red-500 rounded-xs border border-red-650" />
              <span>Vacant</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 bg-amber-500 rounded-xs border border-amber-600" />
              <span>Bottleneck</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 bg-orange-400 rounded-xs border border-orange-500" />
              <span>Overloaded</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 bg-emerald-500 rounded-xs border border-emerald-600" />
              <span>Balanced</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 bg-blue-400 rounded-xs border border-blue-500" />
              <span>Underutilized</span>
            </div>
          </div>
        </div>

        {/* Heat Map Grid */}
        <div className="overflow-x-auto custom-scrollbar pt-2">
          <div className="min-w-[800px] space-y-4 pb-2">
            
            {linesDetailedData.map((d) => (
              <div key={d.line.id} className="grid grid-cols-12 gap-3 items-center">
                {/* Line Identification Row header */}
                <div className="col-span-2 text-xs font-extrabold pr-2 text-slate-700 dark:text-slate-300">
                  Line #0{d.line.id}
                  <span className="text-[10px] text-slate-400 block font-normal font-mono">
                    Ops: {d.presentOperators.filter(emp => !isFloater(emp)).length} · Flt: {d.presentOperators.filter(emp => isFloater(emp)).length}
                  </span>
                </div>

                {/* Consecutive workstation cells */}
                <div className="col-span-10 flex gap-2 flex-nowrap">
                  {d.evaluatedOps.map((op) => {
                    const isHovered = hoveredStation?.lineId === d.line.id && hoveredStation?.opCode === op.code;
                    
                    return (
                      <div
                        key={op.code}
                        onMouseEnter={() => setHoveredStation({ lineId: d.line.id, opCode: op.code })}
                        onMouseLeave={() => setHoveredStation(null)}
                        className={`flex-1 py-3 px-2 border rounded-xl relative transition-all duration-150 text-center select-none cursor-help ${getStatusColor(op.status)} shadow-3xs hover:scale-105 hover:z-20`}
                      >
                        <span className="font-mono text-[10.5px] font-black block tracking-tight">
                          {op.code}
                        </span>
                        <span className="text-[8.5px] uppercase font-bold tracking-tight block truncate opacity-90 max-w-[80px] mx-auto">
                          {op.name}
                        </span>

                        <div className="mt-1 font-mono text-[9px] font-semibold opacity-95">
                          {op.operators.length} Operator(s)
                        </div>

                        {/* Interactive Hover Tooltip */}
                        {isHovered && (
                          <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 bg-slate-950 text-white rounded-xl p-3.5 shadow-2xl border border-slate-800 w-52 z-50 text-left text-[10.5px] font-sans leading-relaxed pointer-events-none animate-fade">
                            <strong className="text-xs text-blue-400 font-extrabold block mb-1">
                              Line #{d.line.id} · Station {op.code}
                            </strong>
                            <p className="font-bold text-white mb-1.5">{op.name}</p>
                            
                            <div className="border-t border-slate-800 pt-1.5 space-y-1 font-mono text-[9.5px]">
                              <div>State: <span className="font-sans font-bold capitalize">{op.status}</span></div>
                              <div>Target: <strong>{op.targetCapacity} pcs/hr</strong></div>
                              <div>Actual Capacity: <strong>{op.totalCapacity} pcs/hr</strong></div>
                              <div>Cycle Time: <strong>{op.cycleTime === 999 ? '∞' : `${op.cycleTime}s`}</strong></div>
                              {op.operators.length > 0 ? (
                                <div className="border-t border-slate-900 mt-1.5 pt-1 font-sans">
                                  <span className="text-slate-400 text-[8px] block uppercase font-bold">Operators:</span>
                                  {op.operators.map(o => (
                                    <div key={o.employee.id} className="text-slate-200 truncate font-semibold">
                                      · {o.employee.name} ({o.efficiency}%)
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div className="text-red-400 font-sans font-semibold mt-1">
                                  ⚠️ Critical Deficit: Unstaffed Empty station!
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {d.evaluatedOps.length === 0 && (
                    <div className="w-full text-center py-3 bg-slate-50 dark:bg-slate-950 text-slate-404 font-mono text-xs rounded-xl border border-dashed border-slate-200 dark:border-slate-800">
                      No active Garment Style sequence loaded. Use the top bar to configure a template.
                    </div>
                  )}
                </div>
              </div>
            ))}

          </div>
        </div>
      </div>

      {/* SECTION 5: OPERATOR RANKINGS GRID */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* PANEL 1: TOP PERFORMING PRESENT OPERATORS */}
        <div className="bg-white dark:bg-slate-900 border border-slate-205 dark:border-slate-800 rounded-3xl p-5 shadow-xs space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-105 dark:border-slate-800 pb-2.5">
            <span className="p-1 px-1.5 bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 rounded-lg border border-emerald-500/10 shrink-0">
              <TrendingUp className="w-4 h-4" />
            </span>
            <strong className="text-sm font-bold text-slate-800 dark:text-white uppercase font-display tracking-wider block">
              Top Efficient Operators
            </strong>
          </div>

          <div className="space-y-3.5 max-h-[300px] overflow-y-auto custom-scrollbar">
            {rankings.topPerforming.map((emp, idx) => (
              <div key={emp.id} className="flex items-center justify-between gap-2.5">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="font-mono text-xs font-black text-slate-400 w-5">
                    #{idx + 1}
                  </div>
                  <EmployeeAvatar 
                    photoUrl={emp.photoUrl} 
                    name={emp.name} 
                    className="w-8.5 h-8.5 rounded-full shrink-0 border border-slate-100" 
                  />
                  <div className="min-w-0">
                    <span className="font-extrabold text-xs text-slate-800 dark:text-slate-200 block truncate">
                      {emp.name}
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">
                      ID: {emp.id} · Line {emp.lineNumber === 99 || emp.lineNumber === 0 ? 'Floater' : `0${emp.lineNumber}`}
                    </span>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <span className="font-mono font-black text-xs text-emerald-600 dark:text-emerald-400 block">
                    {emp.baseEfficiency}%
                  </span>
                  <span className="text-[9px] text-slate-400 block uppercase font-mono">
                    {emp.avgPcsProducedPerDay ? `${emp.avgPcsProducedPerDay} pcs/d` : 'IE Grade A'}
                  </span>
                </div>
              </div>
            ))}

            {rankings.topPerforming.length === 0 && (
              <p className="text-center py-8 text-xs text-slate-400 font-mono">
                No active present operators registered.
              </p>
            )}
          </div>
        </div>

        {/* PANEL 2: UNDERUTILIZED PRESENT OPERATORS */}
        <div className="bg-white dark:bg-slate-900 border border-slate-205 dark:border-slate-800 rounded-3xl p-5 shadow-xs space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-105 dark:border-slate-800 pb-2.5">
            <span className="p-1 px-1.5 bg-orange-50 dark:bg-orange-950 text-orange-655 dark:text-orange-400 rounded-lg border border-orange-500/10 shrink-0">
              <TrendingDown className="w-4 h-4" />
            </span>
            <strong className="text-sm font-bold text-slate-800 dark:text-white uppercase font-display tracking-wider block">
              Underutilized Operators
            </strong>
          </div>

          <div className="space-y-3.5 max-h-[300px] overflow-y-auto custom-scrollbar">
            {rankings.underutilized.map(({ employee, currentAssignment, line }) => (
              <div key={employee.id} className="flex items-center justify-between gap-2.5">
                <div className="flex items-center gap-2.5 min-w-0">
                  <EmployeeAvatar 
                    photoUrl={employee.photoUrl} 
                    name={employee.name} 
                    className="w-8.5 h-8.5 rounded-full shrink-0 border border-slate-100" 
                  />
                  <div className="min-w-0">
                    <span className="font-extrabold text-xs text-slate-800 dark:text-slate-200 block truncate">
                      {employee.name}
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono block">
                      ID: {employee.id} · Line {line === 99 || line === 0 ? 'Floater' : `0${line}`}
                    </span>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-extrabold uppercase bg-orange-50 dark:bg-orange-950 text-orange-700 dark:text-orange-400 block text-center mb-0.5">
                    {currentAssignment.length > 14 ? `${currentAssignment.substring(0, 11)}..` : currentAssignment}
                  </span>
                  <span className="text-[9.5px] text-slate-400 block font-mono">
                    Eff: {employee.baseEfficiency}%
                  </span>
                </div>
              </div>
            ))}

            {rankings.underutilized.length === 0 && (
              <p className="text-center py-8 text-xs text-slate-400 font-mono">
                No underutilized operators active today.
              </p>
            )}
          </div>
        </div>

        {/* PANEL 3: AVAILABLE STANDBY FLOATER CANDIDATES */}
        <div className="bg-white dark:bg-slate-900 border border-slate-205 dark:border-slate-800 rounded-3xl p-5 shadow-xs space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-105 dark:border-slate-800 pb-2.5">
            <span className="p-1 px-1.5 bg-blue-50 dark:bg-blue-950 text-blue-650 dark:text-blue-400 rounded-lg border border-blue-500/10 shrink-0">
              <Award className="w-4 h-4" />
            </span>
            <strong className="text-sm font-bold text-slate-800 dark:text-white uppercase font-display tracking-wider block">
              Standby Floater Pool
            </strong>
          </div>

          <div className="space-y-3.5 max-h-[300px] overflow-y-auto custom-scrollbar">
            {rankings.standbyFloaters.map((emp) => {
              // Find their top proficiency skill
              const topSkill = emp.skills && emp.skills.length > 0 
                ? emp.skills.reduce((max, s) => s.proficiency > max.proficiency ? s : max, emp.skills[0]) 
                : null;

              return (
                <div key={emp.id} className="flex items-center justify-between gap-2.5">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <EmployeeAvatar 
                      photoUrl={emp.photoUrl} 
                      name={emp.name} 
                      className="w-8.5 h-8.5 rounded-full shrink-0 border border-slate-100" 
                    />
                    <div className="min-w-0">
                      <span className="font-extrabold text-xs text-slate-800 dark:text-slate-200 block truncate">
                        {emp.name}
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono block">
                        ID: {emp.id} · {emp.designation || 'Floater Worker'}
                      </span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="font-mono font-black text-xs text-blue-600 dark:text-blue-400 block">
                      {emp.baseEfficiency}% Eff
                    </span>
                    <span className="text-[9.5px] text-slate-400 block font-sans truncate max-w-[80px]">
                      {topSkill ? topSkill.operationName : 'Multi-skills'}
                    </span>
                  </div>
                </div>
              );
            })}

            {rankings.standbyFloaters.length === 0 && (
              <p className="text-center py-8 text-xs text-slate-400 font-mono">
                No available present floaters in standby.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* SECTION 6: QUICK DEPLOYMENT ACTION BUTTONS */}
      <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 rounded-3xl space-y-3">
        <div className="space-y-0.5">
          <strong className="text-xs font-mono text-slate-400 uppercase tracking-widest block font-bold">Industrial Engineering Panel Quick Actions</strong>
          <h3 className="text-sm font-extrabold text-slate-800 dark:text-white uppercase font-display tracking-wider">
            Operator Hot-deployment Router
          </h3>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 pt-1">
          <button
            onClick={() => setActiveTab('balancing')}
            className="flex items-center gap-3 p-3.5 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-805 hover:bg-slate-50 dark:hover:bg-slate-900 rounded-2xl cursor-pointer text-left transition-all hover:-translate-y-0.5"
          >
            <span className="p-2 bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 rounded-xl border border-blue-500/10">
              <Sliders className="w-4.5 h-4.5" />
            </span>
            <div className="min-w-0">
              <strong className="text-xs font-extrabold text-slate-850 dark:text-slate-200 block truncate">
                Line Balance Assist
              </strong>
              <span className="text-[10px] text-slate-400 block">
                Manage pitch deviations
              </span>
            </div>
          </button>

          <button
            onClick={() => setActiveTab('assignment')}
            className="flex items-center gap-3 p-3.5 bg-white dark:bg-slate-950 border border-slate-205 dark:border-slate-805 hover:bg-slate-50 dark:hover:bg-slate-900 rounded-2xl cursor-pointer text-left transition-all hover:-translate-y-0.5"
          >
            <span className="p-2 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 rounded-xl border border-emerald-500/10">
              <UserCheck className="w-4.5 h-4.5" />
            </span>
            <div className="min-w-0">
              <strong className="text-xs font-extrabold text-slate-850 dark:text-slate-200 block truncate">
                Workforce Assignment
              </strong>
              <span className="text-[10px] text-slate-400 block">
                Deploy operators on lines
              </span>
            </div>
          </button>

          <button
            onClick={() => setActiveTab('skills')}
            className="flex items-center gap-3 p-3.5 bg-white dark:bg-slate-950 border border-slate-205 dark:border-slate-805 hover:bg-slate-50 dark:hover:bg-slate-900 rounded-2xl cursor-pointer text-left transition-all hover:-translate-y-0.5"
          >
            <span className="p-2 bg-purple-50 dark:bg-purple-950/40 text-purple-650 dark:text-purple-400 rounded-xl border border-purple-500/10">
              <Award className="w-4.5 h-4.5" />
            </span>
            <div className="min-w-0">
              <strong className="text-xs font-extrabold text-slate-850 dark:text-slate-200 block truncate">
                Skill Matrix Grade
              </strong>
              <span className="text-[10px] text-slate-400 block">
                Review operator proficiencies
              </span>
            </div>
          </button>

          <button
            onClick={() => setActiveTab('predictive')}
            className="flex items-center gap-3 p-3.5 bg-white dark:bg-slate-950 border border-slate-205 dark:border-slate-805 hover:bg-slate-50 dark:hover:bg-slate-900 rounded-2xl cursor-pointer text-left transition-all hover:-translate-y-0.5"
          >
            <span className="p-2 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-505 dark:text-indigo-400 rounded-xl border border-indigo-500/10">
              <Sparkles className="w-4.5 h-4.5" />
            </span>
            <div className="min-w-0">
              <strong className="text-xs font-extrabold text-slate-850 dark:text-slate-200 block truncate">
                Manpower Forecasting
              </strong>
              <span className="text-[10px] text-slate-400 block">
                Absences recommendations
              </span>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
