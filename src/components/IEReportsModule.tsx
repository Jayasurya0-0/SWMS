import React, { useState, useEffect, useMemo } from 'react';
import { useAppState } from '../contexts/StateContext';
import { 
  FileDown, Download, Calendar, Filter, Users, Shield, 
  Clock, BarChart4, ClipboardList, CheckCircle2, AlertTriangle, 
  History, ToggleLeft, Activity, Info, Loader2, ArrowRightLeft,
  Settings, Award, RefreshCw, Layers
} from 'lucide-react';
import * as XLSX from 'xlsx';
import Papa from 'papaparse';

// Type declarations for local structures
interface ExportLog {
  id: string;
  username: string;
  role: string;
  reportType: string;
  exportFormat: string;
  dateRange: string;
  timestamp: string;
  recordsCount: number;
}

export function IEReportsModule() {
  const {
    employees,
    attendance,
    leaveRequests,
    productionLines,
    garmentStyles,
    lineStyleAssignments,
    garmentStyleHistory,
    systemDate,
    currentUser,
    departments,
    operations,
    getLineRunningStyle
  } = useAppState();

  // Role authorization gates
  const authorizedRoles = ['Industrial Engineer', 'Production Manager', 'Factory Manager', 'Admin'];
  const isAuthorizedToExport = authorizedRoles.includes(currentUser?.role || '');

  // Filter conditions states
  const [startDate, setStartDate] = useState<string>(systemDate);
  const [endDate, setEndDate] = useState<string>(systemDate);
  const [selectedDept, setSelectedDept] = useState<string>('All');
  const [selectedLine, setSelectedLine] = useState<string>('All');
  const [selectedStyle, setSelectedStyle] = useState<string>('All');
  const [selectedFormat, setSelectedFormat] = useState<'PDF' | 'Excel' | 'CSV'>('PDF');

  // Interactive reporting tab
  const [activeTab, setActiveTab] = useState<'workforce' | 'attendance' | 'skill' | 'planning' | 'balancing' | 'replacements' | 'styles'>('workforce');
  
  // Progress & Notifications states
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportNotification, setExportNotification] = useState<string | null>(null);
  
  // Audit log states
  const [auditLogs, setAuditLogs] = useState<ExportLog[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);

  // Fetch audit logs on mount
  const fetchAuditLogs = async () => {
    setIsLoadingLogs(true);
    try {
      const res = await fetch('/api/export-logs');
      if (res.ok) {
        const data = await res.json();
        setAuditLogs(data);
      }
    } catch (e) {
      console.error("Failed to load export audit logs:", e);
    } finally {
      setIsLoadingLogs(false);
    }
  };

  useEffect(() => {
    fetchAuditLogs();
  }, []);

  // Set default dates based on system date
  useEffect(() => {
    if (systemDate) {
      setStartDate(systemDate);
      setEndDate(systemDate);
    }
  }, [systemDate]);

  // Filter core data sets to only include Sewing, Floater Pool, and Finishing operators
  const sewingAndFloatersEmployees = useMemo(() => {
    return employees.filter(emp => {
      const dept = (emp.department || '').toLowerCase();
      return dept.includes('sewing') || dept.includes('floater') || dept.includes('finishing') || emp.lineNumber === 99;
    });
  }, [employees]);

  // Fast lookup Map of employees by uppercase ID
  const employeeMap = useMemo(() => {
    const map = new Map<string, typeof employees[0]>();
    for (let i = 0; i < employees.length; i++) {
      map.set(employees[i].id.toUpperCase(), employees[i]);
    }
    return map;
  }, [employees]);

  const sewingAndFloatersAttendance = useMemo(() => {
    return attendance.filter(a => {
      const emp = employeeMap.get(a.employeeId.toUpperCase());
      if (!emp) return false;
      const dept = (emp.department || '').toLowerCase();
      return dept.includes('sewing') || dept.includes('floater') || dept.includes('finishing') || emp.lineNumber === 99;
    });
  }, [attendance, employeeMap]);

  // Helper lists for dropdown filters
  const lineNumbersList = useMemo(() => {
    const list = new Set<string>();
    productionLines.forEach(l => list.add(String(l.id)));
    sewingAndFloatersEmployees.forEach(e => {
      if (e.lineNumber && e.lineNumber > 0 && e.lineNumber !== 99) {
        list.add(String(e.lineNumber));
      }
    });
    return Array.from(list).sort();
  }, [productionLines, sewingAndFloatersEmployees]);

  // ----------------------------------------------------
  // REPORT 1: Workforce Assignment Dataset Generation
  // ----------------------------------------------------
  const workforceReportData = useMemo(() => {
    // Generate data line-by-line
    const linesToProcess = selectedLine === 'All' 
      ? [1, 2, 3, 4, 5] 
      : [Number(selectedLine)];

    // Pre-calculate line style assignments for instant retrieval
    const assignmentMap = new Map<number, string>();
    for (let i = 0; i < lineStyleAssignments.length; i++) {
      assignmentMap.set(lineStyleAssignments[i].lineNumber, lineStyleAssignments[i].garmentStyleId);
    }

    // Index today's attendance metrics as key-value pairs
    const attendanceTodayMap = new Map<string, string>();
    for (let i = 0; i < sewingAndFloatersAttendance.length; i++) {
      const a = sewingAndFloatersAttendance[i];
      if (a.date === systemDate) {
        attendanceTodayMap.set(a.employeeId.toUpperCase(), a.status);
      }
    }

    return linesToProcess.map(lineId => {
      const assignedStyleId = assignmentMap.get(lineId);
      const lineStyle = garmentStyles.find(g => g.id === assignedStyleId) 
        || garmentStyles[0] 
        || { id: 'STYLE-BASE', name: 'Standard Polo Style', requiredManpower: 28 };

      if (selectedStyle !== 'All' && lineStyle.id !== selectedStyle) {
        return null; // Skip if garment filter active and mismatched
      }

      const reqManpower = lineStyle.requiredManpower || 30;
      
      const lineStaff = sewingAndFloatersEmployees.filter(e => e.lineNumber === lineId);
      const assignedCount = lineStaff.length;

      const presentStaff = lineStaff.filter(emp => {
        const status = attendanceTodayMap.get(emp.id.toUpperCase());
        return status === 'Present' || status === 'Late';
      });
      const presentCount = presentStaff.length;

      const absentCount = lineStaff.filter(emp => {
        const status = attendanceTodayMap.get(emp.id.toUpperCase());
        return status === 'Absent';
      }).length;

      const unassignedFloaters = sewingAndFloatersEmployees.filter(e => {
        if (e.lineNumber !== 99) return false;
        const status = attendanceTodayMap.get(e.id.toUpperCase());
        return status === 'Present' || status === 'Late';
      }).length;

      const gap = reqManpower - presentCount;
      let status = 'Optimal';
      if (gap > 3) status = 'Critical Shortage';
      else if (gap > 0) status = 'Caution';

      return {
        lineNumber: `Line ${String(lineId).padStart(2, '0')}`,
        styleName: lineStyle.name,
        reqManpower,
        assignedCount,
        presentCount,
        absentCount,
        unassignedCount: sewingAndFloatersEmployees.filter(e => e.lineNumber === 0 || !e.lineNumber).length,
        floatersAvailable: unassignedFloaters,
        manpowerGap: gap,
        lineStatus: status
      };
    }).filter(Boolean);
  }, [selectedLine, selectedStyle, sewingAndFloatersEmployees, sewingAndFloatersAttendance, garmentStyles, lineStyleAssignments, systemDate]);

  // ----------------------------------------------------
  // REPORT 2: Attendance & Absenteeism Dataset Generation
  // ----------------------------------------------------
  const attendanceReportData = useMemo(() => {
    // Generate dates lists in range
    const start = new Date(startDate);
    const end = new Date(endDate);
    const dates: string[] = [];
    
    // Safely safeguard infinite loops
    let count = 0;
    while (start <= end && count < 100) {
      dates.push(start.toISOString().split('T')[0]);
      start.setDate(start.getDate() + 1);
      count++;
    }

    // Index attendance by date to avoid iterating O(N) attendance list for every single date
    const attendanceByDateMap = new Map<string, typeof sewingAndFloatersAttendance>();
    for (let i = 0; i < sewingAndFloatersAttendance.length; i++) {
      const a = sewingAndFloatersAttendance[i];
      let group = attendanceByDateMap.get(a.date);
      if (!group) {
        group = [];
        attendanceByDateMap.set(a.date, group);
      }
      group.push(a);
    }

    return dates.map(date => {
      const dayRecords = attendanceByDateMap.get(date) || [];
      
      let filteredRecords = dayRecords;
      if (selectedDept !== 'All') {
        filteredRecords = dayRecords.filter(a => {
          const emp = employeeMap.get(a.employeeId.toUpperCase());
          return emp?.department === selectedDept || (selectedDept === 'Floater Pool' && (emp?.department?.toLowerCase().includes('floater') || emp?.lineNumber === 99));
        });
      }

      if (filteredRecords.length === 0) {
        // Fallback placeholder record if no scans on that date
        return {
          date,
          present: 0,
          absent: 0,
          leave: 0,
          late: 0,
          rate: 100,
          expectedAbsence: '4.5%',
          plannedLeaveImpact: 0,
          summary: 'No scanned records registered.'
        };
      }

      const present = filteredRecords.filter(r => r.status === 'Present').length;
      const late = filteredRecords.filter(r => r.status === 'Late').length;
      const absent = filteredRecords.filter(r => r.status === 'Absent').length;
      const leave = filteredRecords.filter(r => r.status === 'Leave').length;
      const total = present + late + absent + leave;

      const rate = total > 0 ? Math.round(((present + late) / total) * 100) : 100;
      
      const linesWithAbsences = new Set<number>();
      filteredRecords.forEach(r => {
        if (r.status === 'Absent') {
          const emp = employeeMap.get(r.employeeId.toUpperCase());
          if (emp?.lineNumber) linesWithAbsences.add(emp.lineNumber);
        }
      });

      return {
        date,
        present,
        absent,
        leave,
        late,
        rate,
        expectedAbsence: '8.2%',
        plannedLeaveImpact: leave,
        summary: linesWithAbsences.size > 0 
          ? `Absences clustered on Line(s): ${Array.from(linesWithAbsences).join(', ')}`
          : 'Attendance optimal across all active lines.'
      };
    });
  }, [startDate, endDate, sewingAndFloatersAttendance, selectedDept, employeeMap]);

  // ----------------------------------------------------
  // REPORT 3: Skill Matrix Dataset Generation
  // ----------------------------------------------------
  const skillReportData = useMemo(() => {
    let filteredEmps = sewingAndFloatersEmployees;

    if (selectedDept !== 'All') {
      filteredEmps = filteredEmps.filter(e => e.department === selectedDept || (selectedDept === 'Floater Pool' && (e.department?.toLowerCase().includes('floater') || e.lineNumber === 99)));
    }
    if (selectedLine !== 'All') {
      filteredEmps = filteredEmps.filter(e => String(e.lineNumber) === selectedLine);
    }

    return filteredEmps.map(emp => {
      const primaryOps = emp.skills && emp.skills.length > 0 
        ? emp.skills.slice(0, 2).map((s: any) => s.operationName).join(', ') 
        : 'General Sewing';

      const avgProfit = emp.skills && emp.skills.length > 0
        ? Math.round(emp.skills.reduce((acc: number, s: any) => acc + (s.proficiency || 0), 0) / emp.skills.length)
        : 65;

      return {
        id: emp.id,
        name: emp.name,
        assignedLine: emp.lineNumber === 99 ? 'Floater' : emp.lineNumber > 0 ? `Line ${emp.lineNumber}` : 'Offline',
        primaryOps,
        skillScores: `${avgProfit}% Match`,
        efficiency: emp.baseEfficiency || 70,
        defectRate: emp.defectRate || 1.8,
        skillRanking: emp.skillCategory || 'Standard Operator',
        eligibility: emp.productionWorkforceEligible ? 'Eligible' : 'Restricted'
      };
    }).slice(0, 100); // Limit preview to top 100 lines for layout speed
  }, [sewingAndFloatersEmployees, selectedDept, selectedLine]);

  // ----------------------------------------------------
  // REPORT 4: Production Planning Dataset Generation
  // ----------------------------------------------------
  const productionReportData = useMemo(() => {
    let styles = garmentStyles;
    if (selectedStyle !== 'All') {
      styles = styles.filter(g => g.id === selectedStyle);
    }

    return styles.map(style => {
      const runningLines = lineStyleAssignments.filter(lsa => lsa.garmentStyleId === style.id).map(l => l.lineNumber);
      const linesAllocCount = runningLines.length;

      // Mock calculation based on SMV and active headcount count
      const runningLineHeadcount = sewingAndFloatersEmployees.filter(e => runningLines.includes(e.lineNumber)).length || 25;
      const expectedPcs = style.smv && style.smv > 0 
        ? Math.round((runningLineHeadcount * 480 * 0.70) / style.smv) 
        : 350;
      
      const actualProduced = Math.round(expectedPcs * (0.85 + Math.random() * 0.20));
      const variance = actualProduced - expectedPcs;

      return {
        styleName: style.name,
        styleNumber: style.id,
        opCount: style.operations?.length || 18,
        smv: style.smv || 1.25,
        requiredManpower: style.requiredManpower || 30,
        runningLines: linesAllocCount > 0 ? `Line(s): ${runningLines.join(', ')}` : 'No lines active',
        efficiency: `${Math.round(62 + Math.random() * 15)}%`,
        expectedPcs,
        actualProduced,
        variance: variance >= 0 ? `+${variance} (Gain)` : `${variance} (Loss)`
      };
    });
  }, [garmentStyles, selectedStyle, lineStyleAssignments, sewingAndFloatersEmployees]);

  // ----------------------------------------------------
  // REPORT 5: Line Balancing Dataset Generation
  // ----------------------------------------------------
  const balancingReportData = useMemo(() => {
    const linesToProcess = selectedLine === 'All' 
      ? [1, 2, 3, 4, 5] 
      : [Number(selectedLine)];

    const mockBottlenecks = [
      { op: 'Collar Joint', operator: 'Rajesh G.', efficiency: 52, balance: 74, gain: '+35 pcs/hr', suggestion: 'Add Support operator' },
      { op: 'Sleeve Attach', operator: 'Meera Sen', efficiency: 48, balance: 68, gain: '+48 pcs/hr', suggestion: 'Reallocate helper' },
      { op: 'Bottom Hemming', operator: 'Kiran Dev', efficiency: 55, balance: 78, gain: '+20 pcs/hr', suggestion: 'Improve machine feed' },
      { op: 'Cuff Attach', operator: 'Priti Das', efficiency: 49, balance: 71, gain: '+30 pcs/hr', suggestion: 'Incorporate guides' },
      { op: 'Shoulder Join', operator: 'Anand Lal', efficiency: 53, balance: 81, gain: '+15 pcs/hr', suggestion: 'No action required' }
    ];

    return linesToProcess.map((lineId, index) => {
      const bt = mockBottlenecks[index % mockBottlenecks.length];
      const style = getLineRunningStyle(lineId) || garmentStyles[0];

      return {
        line: `Line ${String(lineId).padStart(2, '0')}`,
        styleName: style?.name || 'Standard Style',
        btOp: bt.op,
        btOperator: bt.operator,
        opEfficiency: `${bt.efficiency}%`,
        lineEfficiency: `${bt.efficiency + 14}%`,
        balanceEfficiency: `${bt.balance}%`,
        suggestion: bt.suggestion,
        gainOpportunity: bt.gain
      };
    });
  }, [selectedLine, garmentStyles, getLineRunningStyle]);

  // ----------------------------------------------------
  // REPORT 6: Replacement Recommendations Dataset Generation
  // ----------------------------------------------------
  const replacementsReportData = useMemo(() => {
    // Current day attendance status map
    const attendanceTodayMap = new Map<string, string>();
    for (let i = 0; i < sewingAndFloatersAttendance.length; i++) {
      if (sewingAndFloatersAttendance[i].date === systemDate) {
        attendanceTodayMap.set(sewingAndFloatersAttendance[i].employeeId.toUpperCase(), sewingAndFloatersAttendance[i].status);
      }
    }

    // Collect absent operators today
    const absents = sewingAndFloatersEmployees.filter(emp => {
      const status = attendanceTodayMap.get(emp.id.toUpperCase());
      return status === 'Absent' || status === 'Leave';
    });

    if (absents.length === 0) {
      return [];
    }

    // Pre-calculate present floaters once to avoid nested evaluation
    const allPresentReplacements = sewingAndFloatersEmployees.filter(emp => {
      const status = attendanceTodayMap.get(emp.id.toUpperCase());
      const isPresent = status === 'Present' || status === 'Late';
      if (!isPresent) return false;

      // Either is a floater or is assigned to a non-critical task
      const isFloaterPool = emp.lineNumber === 99 || (emp.department || '').toLowerCase().includes('floater');
      return isFloaterPool;
    });

    return absents.map(absentEmp => {
      // Find eligible present floaters or unassigned staff that have skills matching the absent's operation
      const missingOp = absentEmp.operationAssignment || 'Sewing';
      const filteredReplacements = allPresentReplacements.filter(emp => emp.id !== absentEmp.id);

      // Simple scoring based on skill matches
      const sortedCandidates = filteredReplacements.map(rep => {
        const matchingSkill = rep.skills?.find((s: any) => s.operationName.toLowerCase() === missingOp.toLowerCase());
        const skillScore = matchingSkill ? matchingSkill.proficiency : 40;
        return {
          rep,
          skillScore,
          defectRate: rep.defectRate || 1.5,
          score: Math.round(skillScore * 0.8 + (10 - (rep.defectRate || 1.5)) * 2)
        };
      }).sort((a, b) => b.score - a.score);

      const topMatch = sortedCandidates[0];

      return {
        absentName: absentEmp.name,
        absentLine: absentEmp.lineNumber === 99 ? 'Floater' : absentEmp.lineNumber > 0 ? `Line ${absentEmp.lineNumber}` : 'Offline',
        missingOp,
        recommendedReplacement: topMatch ? topMatch.rep.name : 'No Floater Skill Match',
        skillMatch: topMatch ? `${topMatch.skillScore}%` : '50%',
        repEfficiency: topMatch ? `${topMatch.rep.baseEfficiency}%` : '60%',
        repDefect: topMatch ? `${topMatch.defectRate}%` : '2.0%',
        currentStat: topMatch ? 'Available in Pool' : 'Unassigned',
        recScore: topMatch ? `${topMatch.score}/100` : 'N/A'
      };
    });
  }, [sewingAndFloatersEmployees, sewingAndFloatersAttendance, systemDate]);

  // ----------------------------------------------------
  // REPORT 7: Garment History Dataset Generation
  // ----------------------------------------------------
  const styleHistoryReportData = useMemo(() => {
    return garmentStyleHistory.map(h => {
      const prevStyle = garmentStyles.find(g => g.id === h.prevGarmentStyleId || g.id === h.previousGarmentStyleId);
      const newStyle = garmentStyles.find(g => g.id === h.newGarmentStyleId);
      
      if (selectedLine !== 'All' && String(h.lineNumber) !== selectedLine) {
        return null;
      }
      if (selectedStyle !== 'All' && h.newGarmentStyleId !== selectedStyle) {
        return null;
      }

      return {
        lineNumber: `Line ${String(h.lineNumber).padStart(2, '0')}`,
        prevStyle: prevStyle?.name || h.previousGarmentStyleName || 'Primary Launch Style',
        newStyle: newStyle?.name || h.newGarmentStyleName,
        changedBy: h.changedBy || 'IE Admin',
        changeDate: h.changeDate || '2026-06-04',
        changeTime: h.changeTime || '08:00 AM',
        manpowerBefore: prevStyle?.requiredManpower || 25,
        manpowerAfter: newStyle?.requiredManpower || 30,
        impact: `Headcount Adjusted: ${newStyle?.requiredManpower || 30} Needed`
      };
    }).filter(Boolean);
  }, [garmentStyleHistory, garmentStyles, selectedLine, selectedStyle]);


  // Count selected page records
  const currentRecordsCount = useMemo(() => {
    switch (activeTab) {
      case 'workforce': return workforceReportData.length;
      case 'attendance': return attendanceReportData.length;
      case 'skill': return skillReportData.length;
      case 'planning': return productionReportData.length;
      case 'balancing': return balancingReportData.length;
      case 'replacements': return replacementsReportData.length;
      case 'styles': return styleHistoryReportData.length;
    }
  }, [activeTab, workforceReportData, attendanceReportData, skillReportData, productionReportData, balancingReportData, replacementsReportData, styleHistoryReportData]);

  // Resolve Active Tab Title
  const activeTabTitle = useMemo(() => {
    switch (activeTab) {
      case 'workforce': return "Workforce Assignment Report";
      case 'attendance': return "Attendance & Absenteeism Report";
      case 'skill': return "Skill Competence Matrix Report";
      case 'planning': return "Production Planning Report";
      case 'balancing': return "Line Balancing & Bottleneck Analysis";
      case 'replacements': return "Absentee Operator Replacement Recommendations";
      case 'styles': return "Garment Style Transition History Log";
    }
  }, [activeTab]);

  // Execute logging helper
  const logExportInDatabase = async (reportName: string, format: string, count: number) => {
    try {
      const payload = {
        username: currentUser?.username || 'IE Patel',
        role: currentUser?.role || 'Industrial Engineer',
        reportType: reportName,
        exportFormat: format,
        dateRange: `${startDate} to ${endDate}`,
        recordsCount: count
      };

      await fetch('/api/export-logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      fetchAuditLogs(); // Refresh log entries
    } catch (e) {
      console.error("Failed to log export event:", e);
    }
  };

  // ----------------------------------------------------
  // CSV EXPORT GENERATOR
  // ----------------------------------------------------
  const handleCSVExport = () => {
    let dataset: any[] = [];
    let fileName = `SWM_${activeTab}_Report`;

    if (activeTab === 'workforce') {
      dataset = workforceReportData;
    } else if (activeTab === 'attendance') {
      dataset = attendanceReportData;
    } else if (activeTab === 'skill') {
      dataset = skillReportData;
    } else if (activeTab === 'planning') {
      dataset = productionReportData;
    } else if (activeTab === 'balancing') {
      dataset = balancingReportData;
    } else if (activeTab === 'replacements') {
      dataset = replacementsReportData;
    } else if (activeTab === 'styles') {
      dataset = styleHistoryReportData;
    }

    const csvStr = Papa.unparse(dataset);
    const blob = new Blob([csvStr], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `${fileName}_${systemDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    logExportInDatabase(activeTabTitle, 'CSV', dataset.length);
  };

  // ----------------------------------------------------
  // EXCEL EXPORT GENERATOR
  // ----------------------------------------------------
  const handleExcelExport = () => {
    let dataset: any[] = [];
    let fileName = `SWM_${activeTab}_Report`;

    if (activeTab === 'workforce') {
      dataset = workforceReportData;
    } else if (activeTab === 'attendance') {
      dataset = attendanceReportData;
    } else if (activeTab === 'skill') {
      dataset = skillReportData;
    } else if (activeTab === 'planning') {
      dataset = productionReportData;
    } else if (activeTab === 'balancing') {
      dataset = balancingReportData;
    } else if (activeTab === 'replacements') {
      dataset = replacementsReportData;
    } else if (activeTab === 'styles') {
      dataset = styleHistoryReportData;
    }

    const worksheet = XLSX.utils.json_to_sheet(dataset);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Report Preview");
    XLSX.writeFile(workbook, `${fileName}_${systemDate}.xlsx`);

    logExportInDatabase(activeTabTitle, 'Excel', dataset.length);
  };

  // ----------------------------------------------------
  // PDF EXPORT (AUTO TABLE GENERATOR)
  // ----------------------------------------------------
  const handlePDFExport = async () => {
    const { jsPDF } = await import('jspdf');
    const { default: autoTable } = await import('jspdf-autotable');

    let dataset: any[] = [];
    let headers: string[][] = [];
    let rows: any[][] = [];

    const docPDF = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4'
    });

    // Elegant Corporate Letterhead Logo
    docPDF.setFillColor(15, 23, 42); // slate-900 background
    docPDF.rect(0, 0, 297, 35, 'F');

    docPDF.setFont("Helvetica", "bold");
    docPDF.setFontSize(20);
    docPDF.setTextColor(255, 255, 255);
    docPDF.text("SWM WORKFORCE INTELLIGENCE", 15, 15);

    docPDF.setFont("Helvetica", "normal");
    docPDF.setFontSize(10);
    docPDF.setTextColor(191, 219, 254);
    docPDF.text(`INDUSTRIAL ENGINEERING PORTAL · OPERATIONS DATA AUDIT`, 15, 21);
    docPDF.text(`Date Selected: ${startDate} to ${endDate}`, 15, 26);

    // Right-aligned report label
    docPDF.setFont("Helvetica", "bold");
    docPDF.setFontSize(12);
    docPDF.setTextColor(59, 130, 246);
    docPDF.text(activeTabTitle.toUpperCase(), 282, 18, { align: 'right' });
    
    docPDF.setFont("Helvetica", "normal");
    docPDF.setFontSize(8);
    docPDF.setTextColor(156, 163, 175);
    docPDF.text(`Report Generated On: ${new Date().toLocaleString()}`, 282, 24, { align: 'right' });
    docPDF.text(`Authorized User: ${currentUser?.username || 'System Admin'} (${currentUser?.role})`, 282, 28, { align: 'right' });

    // Set autoTable variables by active tab
    if (activeTab === 'workforce') {
      headers = [["Line Number", "Style Active", "Req. Headcount", "Staff count", "Present", "Absent", "Unassigned Pool", "Floaters", "Headcount Deficit", "Status"]];
      rows = workforceReportData.map(r => [
        r!.lineNumber,
        r!.styleName,
        r!.reqManpower,
        r!.assignedCount,
        r!.presentCount,
        r!.absentCount,
        r!.unassignedCount,
        r!.floatersAvailable,
        r!.manpowerGap,
        r!.lineStatus
      ]);
    } else if (activeTab === 'attendance') {
      headers = [["Scanned Date", "Present count", "Expected Absents", "Leave Approvals", "Late count", "Attendance Rate %", "Calculated Index", "Impact Level", "Details/Clustering"]];
      rows = attendanceReportData.map(r => [
        r.date,
        r.present,
        r.absent,
        r.leave,
        r.late,
        `${r.rate}%`,
        r.expectedAbsence,
        r.plannedLeaveImpact,
        r.summary
      ]);
    } else if (activeTab === 'skill') {
      headers = [["Employee ID", "Employee Name", "Current Line", "Primary Sewing Skills", "Skill Level Score", "Base Efficiency %", "Defect Rate %", "Grade Level", "Status"]];
      rows = skillReportData.map(r => [
        r.id,
        r.name,
        r.assignedLine,
        r.primaryOps,
        r.skillScores,
        `${r.efficiency}%`,
        `${r.defectRate}%`,
        r.skillRanking,
        r.eligibility
      ]);
    } else if (activeTab === 'planning') {
      headers = [["Garment Style", "Style Number", "Ops sequence", "Total SMV", "Planned Manpower", "Active Lines", "Line efficiency", "Expected Output/Day", "Actual Output", "Variance"]];
      rows = productionReportData.map(r => [
        r.styleName,
        r.styleNumber,
        r.opCount,
        r.smv,
        r.requiredManpower,
        r.runningLines,
        r.efficiency,
        r.expectedPcs,
        r.actualProduced,
        r.variance
      ]);
    } else if (activeTab === 'balancing') {
      headers = [["Line", "Active Style", "Bottleneck Operation", "Bottleneck Assigned Operator", "Op Efficiency %", "Line Average %", "Balance Ratio %", "Suggested Improvements", "Potential Hour Gain"]];
      rows = balancingReportData.map(r => [
        r!.line,
        r!.styleName,
        r!.btOp,
        r!.btOperator,
        r!.opEfficiency,
        r!.lineEfficiency,
        r!.balanceEfficiency,
        r!.suggestion,
        r!.gainOpportunity
      ]);
    } else if (activeTab === 'replacements') {
      headers = [["Absent Operator", "Primary Line", "Missing Task Block", "Auto replacement Suggestion", "Skill matching Score", "Base Efficiency", "Defect Index %", "Current status", "Rec Match Score"]];
      rows = replacementsReportData.map(r => [
        r.absentName,
        r.absentLine,
        r.missingOp,
        r.recommendedReplacement,
        r.skillMatch,
        r.repEfficiency,
        r.repDefect,
        r.currentStat,
        r.recScore
      ]);
    } else if (activeTab === 'styles') {
      headers = [["Line", "Previous Garment Style", "Transition Style Target", "Changed By", "Date of change", "Effective Time", "Req. Before", "Req. After", "Impact Summary"]];
      rows = styleHistoryReportData.map(r => [
        r!.lineNumber,
        r!.prevStyle,
        r!.newStyle,
        r!.changedBy,
        r!.changeDate,
        r!.changeTime,
        r!.manpowerBefore,
        r!.manpowerAfter,
        r!.impact
      ]);
    }

    // Load autoTable dynamically
    autoTable(docPDF, {
      head: headers,
      body: rows,
      startY: 42,
      theme: 'striped',
      headStyles: { fillColor: [30, 41, 59], fontStyle: 'bold', fontSize: 9 },
      bodyStyles: { fontSize: 8 },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      margin: { left: 15, right: 15 }
    });

    docPDF.save(`SWM_${activeTab}_AuditReport_${systemDate}.pdf`);
    logExportInDatabase(activeTabTitle, 'PDF', rows.length);
  };

  // ----------------------------------------------------
  // GENERAL TRIGGER RUNNING ASYNC SIMULATION
  // ----------------------------------------------------
  const triggerDataExport = () => {
    if (!isAuthorizedToExport) {
      setExportNotification("Access Restricted: Industrial Engineering and Planning roles required for exporting records.");
      setTimeout(() => setExportNotification(null), 4000);
      return;
    }

    setIsExporting(true);
    setExportProgress(10);
    
    // Animate incremental background worker compiling
    const interval = setInterval(() => {
      setExportProgress(prev => {
        if (prev >= 90) {
          clearInterval(interval);
          return 100;
        }
        return prev + 15;
      });
    }, 150);

    setTimeout(() => {
      setIsExporting(false);
      setExportProgress(0);
      
      // Execute based on active format selection
      if (selectedFormat === 'PDF') {
        handlePDFExport();
      } else if (selectedFormat === 'Excel') {
        handleExcelExport();
      } else {
        handleCSVExport();
      }

      setExportNotification(`Success: Compiled ${currentRecordsCount} records. Downloading ${selectedFormat} file...`);
      setTimeout(() => setExportNotification(null), 4500);
    }, 1100);
  };

  // ----------------------------------------------------
  // REPORT 8: IE EXECUTIVE SUMMARY BUILDER
  // ----------------------------------------------------
  const handleExecutiveSummaryDownload = async () => {
    if (!isAuthorizedToExport) {
      setExportNotification("Access Restricted: Downloading the IE Executive Summary requires IE or Admin permissions.");
      setTimeout(() => setExportNotification(null), 4000);
      return;
    }

    setIsExporting(true);
    setExportProgress(20);

    const { jsPDF } = await import('jspdf');
    const { default: autoTable } = await import('jspdf-autotable');

    const docPDF = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    // Pre-calculate enterprise analytics using ultra-fast Map-based lookups
    const attendanceStatusMap = new Map<string, string>();
    for (let i = 0; i < sewingAndFloatersAttendance.length; i++) {
      const record = sewingAndFloatersAttendance[i];
      if (record.date === systemDate) {
        attendanceStatusMap.set(record.employeeId.toUpperCase(), record.status);
      }
    }

    const totalPresent = sewingAndFloatersEmployees.filter(emp => {
      const status = attendanceStatusMap.get(emp.id.toUpperCase());
      return status === 'Present' || status === 'Late';
    }).length;

    const totalAbsentees = sewingAndFloatersEmployees.filter(emp => {
      const status = attendanceStatusMap.get(emp.id.toUpperCase());
      return status === 'Absent';
    }).length;

    const totalLeaves = sewingAndFloatersEmployees.filter(emp => {
      const status = attendanceStatusMap.get(emp.id.toUpperCase());
      return status === 'Leave';
    }).length;

    const runningGarmentsList = Array.from(new Set(lineStyleAssignments.map(a => {
      const match = garmentStyles.find(g => g.id === a.garmentStyleId);
      return match ? match.name : undefined;
    }).filter(Boolean)));

    // Professional Elegant Design Letterhead
    docPDF.setFillColor(15, 23, 42); // Deep slate background
    docPDF.rect(0, 0, 210, 45, 'F');

    docPDF.setFont("Helvetica", "bold");
    docPDF.setFontSize(22);
    docPDF.setTextColor(255, 255, 255);
    docPDF.text("SWM IE EXECUTIVE SUITE", 15, 18);

    docPDF.setFont("Helvetica", "normal");
    docPDF.setFontSize(10);
    docPDF.setTextColor(147, 197, 253);
    docPDF.text("FACTORY OPERATIONS & MANPOWER DEPLOYMENT AUDIT REVIEW", 15, 24);
    
    docPDF.setFontSize(9);
    docPDF.setTextColor(156, 163, 175);
    docPDF.text(`System Reference Date: ${systemDate}  ·  Generated: ${new Date().toLocaleString()}`, 15, 30);
    docPDF.text(`Authorized Officer: ${currentUser?.username} (${currentUser?.role})`, 15, 35);

    // Decorative blue accent line
    docPDF.setFillColor(37, 99, 235);
    docPDF.rect(0, 45, 210, 2, 'F');

    // Section: Operational KPI Dashboard Metrics
    docPDF.setFont("Helvetica", "bold");
    docPDF.setFontSize(14);
    docPDF.setTextColor(15, 23, 42);
    docPDF.text("1. SEWING OPERATIONS KPI KEY PERFORMANCE INDICATORS", 15, 58);

    // Draw grid metrics lines
    docPDF.setDrawColor(226, 232, 240);
    docPDF.rect(15, 64, 55, 25);
    docPDF.rect(75, 64, 55, 25);
    docPDF.rect(135, 64, 60, 25);

    // Grid 1 Text
    docPDF.setFont("Helvetica", "bold");
    docPDF.setFontSize(9);
    docPDF.setTextColor(71, 85, 105);
    docPDF.text("ACTIVE RUNNING LINES", 18, 70);
    docPDF.setFontSize(14);
    docPDF.setTextColor(37, 99, 235);
    docPDF.text("5 SEWING LINES", 18, 80);
    docPDF.setFontSize(8);
    docPDF.setTextColor(148, 163, 184);
    docPDF.text("Lines 1-5 + Support Offline", 18, 85);

    // Grid 2 Text
    docPDF.setFont("Helvetica", "bold");
    docPDF.setFontSize(9);
    docPDF.setTextColor(71, 85, 105);
    docPDF.text("LABOR FORCE CAP", 78, 70);
    docPDF.setFontSize(14);
    docPDF.setTextColor(220, 38, 38);
    docPDF.text(`${totalPresent} PRESENT / ${totalAbsentees} ABSENT`, 78, 80);
    docPDF.setFontSize(8);
    docPDF.setTextColor(148, 163, 184);
    docPDF.text(`Reliability Index: ${Math.round((totalPresent / (totalPresent + totalAbsentees || 1)) * 100)}%`, 78, 85);

    // Grid 3 Text
    docPDF.setFont("Helvetica", "bold");
    docPDF.setFontSize(9);
    docPDF.setTextColor(71, 85, 105);
    docPDF.text("ACTIVE HARVEST STYLE CAPS", 138, 70);
    docPDF.setFontSize(11);
    docPDF.setTextColor(5, 150, 105);
    docPDF.text(`${runningGarmentsList.length} Styles Running`, 138, 80);
    docPDF.setFontSize(7);
    docPDF.setTextColor(148, 163, 184);
    docPDF.text(runningGarmentsList.slice(0, 2).join(', '), 138, 85);

    // Section 2: Critical Gaps Alert
    docPDF.setFont("Helvetica", "bold");
    docPDF.setFontSize(13);
    docPDF.setTextColor(220, 38, 38);
    docPDF.text("2. CRITICAL MANPOWER SHORTAGE DEPLOYMENT ALERTS", 15, 105);

    // Detect high gaps
    const hardAllocGaps = workforceReportData.filter(w => w!.manpowerGap > 0);
    let gapTextStartY = 112;

    docPDF.setFont("Helvetica", "normal");
    docPDF.setFontSize(9.5);
    docPDF.setTextColor(15, 23, 42);

    if (hardAllocGaps.length > 0) {
      hardAllocGaps.forEach(g => {
        docPDF.text(`· ${g!.lineNumber} (${g!.styleName}) currently has a deficit of ${g!.manpowerGap} operators. Defect rate risk: Elevated.`, 18, gapTextStartY);
        gapTextStartY += 6;
      });
    } else {
      docPDF.text("· No severe headcount deficits registered today. All lines are running within optimal limits.", 18, gapTextStartY);
      gapTextStartY += 6;
    }

    // Section 3: Priority Bottleneck Operations
    docPDF.setFont("Helvetica", "bold");
    docPDF.setFontSize(13);
    docPDF.setTextColor(15, 23, 42);
    docPDF.text("3. DETECTED BOTTLENECKS & STABILITY ALIGNMENT", 15, gapTextStartY + 8);

    const listHeaders = [["Line", "Active Style", "Bottleneck Op", "Assigned Op", "Operation Efficiency %", "Hour Gain Opportunity"]];
    const listRows = balancingReportData.map(r => [
      r!.line,
      r!.styleName,
      r!.btOp,
      r!.btOperator,
      r!.opEfficiency,
      r!.gainOpportunity
    ]);

    autoTable(docPDF, {
      head: listHeaders,
      body: listRows,
      startY: gapTextStartY + 14,
      theme: 'grid',
      headStyles: { fillColor: [30, 41, 59], fontSize: 9 },
      bodyStyles: { fontSize: 8 }
    });

    const balancingTableEndY = (docPDF as any).lastAutoTable.finalY + 10;

    // Section 4: Recommended Correcting Engineering Actions
    docPDF.setFont("Helvetica", "bold");
    docPDF.setFontSize(13);
    docPDF.text("4. RECOMMENDED ENGINEERING INTERVENTIONS", 15, balancingTableEndY);

    docPDF.setFont("Helvetica", "normal");
    docPDF.setFontSize(9);
    docPDF.setTextColor(71, 85, 105);
    
    docPDF.text("1. RE-BALANCE DEFICIT LINES: Reallocate unassigned floaters to cover critical shortages.", 15, balancingTableEndY + 8);
    docPDF.text("2. SKILL GRADE UPGRADES: Schedule high-efficiency replacements for bottlenecked operations on Line 02 & Line 04.", 15, balancingTableEndY + 14);
    docPDF.text("3. PROCESS FEEDS ADJUSTMENTS: Incorporate hemming guides to reduce hemming defect times.", 15, balancingTableEndY + 20);

    // Save document
    docPDF.save(`SWM_Executive_Summary_${systemDate}.pdf`);

    setTimeout(() => {
      setIsExporting(false);
      setExportProgress(0);
      setExportNotification("Success: Professional Executive Summary PDF has been generated and downloaded.");
      logExportInDatabase("IE Executive Summary Document", "PDF", 1);
      setTimeout(() => setExportNotification(null), 4000);
    }, 1000);
  };

  return (
    <div className="space-y-6 container mx-auto px-4 py-2" id="ie-reports-export-container">
      
      {/* 1. Header Hero section */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-205 dark:border-slate-800 shadow-xs gap-4">
        <div className="space-y-1">
          <div className="inline-flex items-center space-x-2 bg-blue-50 dark:bg-blue-900/10 px-3 py-1 rounded-full border border-blue-105 dark:border-blue-800">
            <Layers className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
            <span className="text-[10px] font-extrabold text-blue-600 dark:text-blue-400 uppercase tracking-widest">Enterprise Reporting Suite</span>
          </div>
          <h1 className="text-xl md:text-2xl font-bold tracking-tight text-slate-900 dark:text-white font-display">
            IE Reports & Data Export Center
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Asynchronously download operational data, manpower allocations, line balancing details, style history, and executive summaries.
          </p>
        </div>

        {/* Executive Summary print button */}
        <button
          type="button"
          onClick={handleExecutiveSummaryDownload}
          className="w-full md:w-auto inline-flex items-center justify-center space-x-2 px-4 py-2.5 bg-slate-900 hover:bg-slate-805 text-white dark:bg-white dark:hover:bg-slate-100 dark:text-slate-950 rounded-xl text-xs font-semibold shadow-xs transition-colors pointer-events-auto"
        >
          <BarChart4 className="w-4 h-4" />
          <span>Generate Executive Summary PDF</span>
        </button>
      </div>

      {/* 2. Notification alerting layer */}
      {exportNotification && (
        <div className={`p-4 rounded-xl border flex items-center space-x-3 transition animate-fade ${
          exportNotification.includes('Access Restricted')
            ? 'bg-rose-50 text-rose-800 border-rose-100 dark:bg-rose-955/20 dark:text-rose-450 dark:border-rose-900/40'
            : 'bg-green-50 text-green-800 border-green-100 dark:bg-green-955/20 dark:text-green-450 dark:border-green-900/40'
        }`}>
          {exportNotification.includes('Access Restricted') ? (
            <AlertTriangle className="w-5 h-5 text-rose-500 flex-shrink-0" />
          ) : (
            <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0" />
          )}
          <span className="text-xs font-medium font-sans">{exportNotification}</span>
        </div>
      )}

      {/* Role permission lock warning if not authorized */}
      {!isAuthorizedToExport && (
        <div className="p-4 bg-amber-50 text-amber-805 border border-amber-100 dark:bg-amber-955/10 dark:text-amber-400 dark:border-amber-900/30 rounded-xl text-xs flex items-center space-x-3">
          <Shield className="w-5 h-5 text-amber-500 flex-shrink-0" />
          <p className="font-medium">
            <strong>Export Sandbox Restricted:</strong> Your active login role is <strong>{currentUser?.role}</strong>. Onlyauthorized Industrial Engineering, Production Manager, and Admin accounts have data export permissions. All tables remain fully viewable.
          </p>
        </div>
      )}

      {/* 3. Filters grid card structure */}
      <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-205 dark:border-slate-800 shadow-sm space-y-4">
        <div className="flex items-center space-x-2 pb-3 border-b border-slate-100 dark:border-slate-800">
          <Filter className="w-4 h-4 text-blue-600" />
          <span className="text-xs font-bold text-slate-800 dark:text-white uppercase font-display tracking-widest">Export Options & Parameters</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 text-xs font-medium font-sans text-slate-750 dark:text-slate-300">
          
          {/* Start Date */}
          <div className="space-y-1">
            <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Start Date</span>
            <div className="relative">
              <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="w-full pl-9 pr-2 py-2 border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 rounded-xl focus:ring-1 focus:ring-blue-500 outline-none"
              />
            </div>
          </div>

          {/* End Date */}
          <div className="space-y-1">
            <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">End Date</span>
            <div className="relative">
              <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="date"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                className="w-full pl-9 pr-2 py-2 border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 rounded-xl focus:ring-1 focus:ring-blue-500 outline-none"
              />
            </div>
          </div>

          {/* Department Filter */}
          <div className="space-y-1">
            <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Department</span>
            <select
              value={selectedDept}
              onChange={e => setSelectedDept(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 rounded-xl focus:ring-1 focus:ring-blue-500 outline-none"
            >
              <option value="All">All Sewing & Floaters</option>
              <option value="Sewing">Sewing Department Only</option>
              <option value="Floater Pool">Floater Pool Only</option>
            </select>
          </div>

          {/* Line Number Filter */}
          <div className="space-y-1">
            <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Line number</span>
            <select
              value={selectedLine}
              onChange={e => setSelectedLine(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 rounded-xl focus:ring-1 focus:ring-blue-500 outline-none"
            >
              <option value="All">All Lines</option>
              {lineNumbersList.map(num => (
                <option key={num} value={num}>Line {num}</option>
              ))}
            </select>
          </div>

          {/* Garment Style Filter */}
          <div className="space-y-1">
            <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Garment Style</span>
            <select
              value={selectedStyle}
              onChange={e => setSelectedStyle(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 rounded-xl focus:ring-1 focus:ring-blue-500 outline-none"
            >
              <option value="All">All Styles</option>
              {garmentStyles.map(g => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          </div>

          {/* Export Format */}
          <div className="space-y-1">
            <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Format</span>
            <div className="flex rounded-xl bg-slate-50 dark:bg-slate-950 p-0.5 border border-slate-205 dark:border-slate-800">
              {(['PDF', 'Excel', 'CSV'] as const).map(fmt => (
                <button
                  key={fmt}
                  type="button"
                  onClick={() => setSelectedFormat(fmt)}
                  className={`flex-1 text-center py-1.5 rounded-lg font-bold text-[10px] uppercase select-none transition-all ${
                    selectedFormat === fmt
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {fmt}
                </button>
              ))}
            </div>
          </div>

        </div>

        {/* Start Export button */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center pt-3 border-t border-slate-100 dark:border-slate-800 gap-4">
          <div className="text-[10.5px] text-slate-400 font-medium">
            Selected Range: <strong className="text-slate-700 dark:text-slate-200">{startDate}</strong> to <strong className="text-slate-700 dark:text-slate-200">{endDate}</strong> ({Math.round((new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 3600 * 24)) + 1} day(s))
          </div>

          <button
            type="button"
            disabled={isExporting}
            onClick={triggerDataExport}
            className={`w-full sm:w-auto inline-flex items-center justify-center space-x-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-md pointer-events-auto ${
              isExporting ? 'opacity-50 cursor-not-allowed' : ''
            }`}
          >
            {isExporting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Generating {exportProgress}%...</span>
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                <span>Export Active dataset ({selectedFormat})</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* 4. Interactive Tabs selector layout to preview datasets */}
      <div className="space-y-4">
        
        {/* Navigation row */}
        <div className="flex overflow-x-auto space-x-1.5 p-1 bg-slate-200/50 dark:bg-slate-900 border border-slate-205 dark:border-slate-800 rounded-xl scrollbar-none">
          <button
            type="button"
            onClick={() => setActiveTab('workforce')}
            className={`px-3 py-2 text-xs font-bold rounded-lg whitespace-nowrap transition-all ${
              activeTab === 'workforce'
                ? 'bg-white dark:bg-slate-950 text-blue-600 dark:text-blue-400 shadow-xs'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-white'
            }`}
          >
            Workforce Allocation
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('attendance')}
            className={`px-3 py-2 text-xs font-bold rounded-lg whitespace-nowrap transition-all ${
              activeTab === 'attendance'
                ? 'bg-white dark:bg-slate-950 text-blue-600 dark:text-blue-400 shadow-xs'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-white'
            }`}
          >
            Attendance Logs
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('skill')}
            className={`px-3 py-2 text-xs font-bold rounded-lg whitespace-nowrap transition-all ${
              activeTab === 'skill'
                ? 'bg-white dark:bg-slate-950 text-blue-600 dark:text-blue-400 shadow-xs'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-white'
            }`}
          >
            Skill Matrix Master
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('planning')}
            className={`px-3 py-2 text-xs font-bold rounded-lg whitespace-nowrap transition-all ${
              activeTab === 'planning'
                ? 'bg-white dark:bg-slate-950 text-blue-600 dark:text-blue-400 shadow-xs'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-white'
            }`}
          >
            Production Planning
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('balancing')}
            className={`px-3 py-2 text-xs font-bold rounded-lg whitespace-nowrap transition-all ${
              activeTab === 'balancing'
                ? 'bg-white dark:bg-slate-950 text-blue-600 dark:text-blue-400 shadow-xs'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-white'
            }`}
          >
            Line Balancing & BT
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('replacements')}
            className={`px-3 py-2 text-xs font-bold rounded-lg whitespace-nowrap transition-all ${
              activeTab === 'replacements'
                ? 'bg-white dark:bg-slate-950 text-blue-600 dark:text-blue-400 shadow-xs'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-white'
            }`}
          >
            Replacement Suggestions
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('styles')}
            className={`px-3 py-2 text-xs font-bold rounded-lg whitespace-nowrap transition-all ${
              activeTab === 'styles'
                ? 'bg-white dark:bg-slate-950 text-blue-600 dark:text-blue-400 shadow-xs'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-white'
            }`}
          >
            Style Changes Log
          </button>
        </div>

        {/* 5. Dataset Live Preview Panel */}
        <div className="bg-white dark:bg-slate-900 border border-slate-205 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
          
          <div className="p-4 bg-slate-50 dark:bg-slate-950/50 border-b border-slate-100 dark:border-slate-805 flex justify-between items-center z-10">
            <div className="flex items-center space-x-2">
              <ClipboardList className="w-4.5 h-4.5 text-blue-600" />
              <span className="text-xs font-bold text-slate-800 dark:text-white uppercase font-display tracking-wider">
                Live Preview: {activeTabTitle} ({currentRecordsCount} records calculated)
              </span>
            </div>
            <span className="text-[10px] bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-350 px-2 py-0.5 rounded-full font-semibold">
              Live DB Query
            </span>
          </div>

          <div className="overflow-x-auto">
            
            {/* WORKFORCE ALLOCATION PREVIEW */}
            {activeTab === 'workforce' && (
              <table className="w-full text-left text-xs text-slate-500 dark:text-slate-400">
                <thead className="bg-slate-50 dark:bg-slate-950/20 text-[10px] text-slate-400 uppercase font-mono border-b border-slate-100 dark:border-slate-805">
                  <tr>
                    <th className="px-5 py-3">Line Number</th>
                    <th className="px-5 py-3">Active Style</th>
                    <th className="px-5 py-3 text-center">Req Manpower</th>
                    <th className="px-5 py-3 text-center">Allocated staff</th>
                    <th className="px-5 py-3 text-center">Present operators</th>
                    <th className="px-5 py-3 text-center">Absent Count</th>
                    <th className="px-5 py-3 text-center">Unassigned Float.</th>
                    <th className="px-5 py-3 text-center">Deficit Gap</th>
                    <th className="px-5 py-3 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-sans">
                  {workforceReportData.map((row, i) => row && (
                    <tr key={i} className="hover:bg-slate-50/50 dark:hover:bg-slate-850/15">
                      <td className="px-5 py-4 font-bold text-slate-800 dark:text-white whitespace-nowrap">{row.lineNumber}</td>
                      <td className="px-5 py-4 font-medium text-slate-700 dark:text-slate-300">{row.styleName}</td>
                      <td className="px-5 py-4 text-center font-bold text-slate-600 dark:text-slate-450">{row.reqManpower}</td>
                      <td className="px-5 py-4 text-center">{row.assignedCount}</td>
                      <td className="px-5 py-4 text-center text-green-500 font-semibold">{row.presentCount}</td>
                      <td className="px-5 py-4 text-center text-rose-500 font-semibold">{row.absentCount}</td>
                      <td className="px-5 py-4 text-center font-mono">{row.floatersAvailable}</td>
                      <td className="px-5 py-4 text-center">
                        <span className={`px-2 py-0.5 rounded font-mono text-[10px] font-bold ${
                          row.manpowerGap > 3 
                            ? 'bg-rose-50 text-rose-600 dark:bg-rose-950/45 dark:text-rose-450' 
                            : row.manpowerGap > 0 
                              ? 'bg-amber-50 text-amber-600 dark:bg-amber-955/25 dark:text-amber-450' 
                              : 'bg-green-50 text-green-600 dark:bg-green-950/45 dark:text-green-450'
                        }`}>
                          {row.manpowerGap > 0 ? `+${row.manpowerGap} Short` : 'Optimal'}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-right">
                        <span className={`inline-flex items-center space-x-1 text-[10px] font-extrabold uppercase px-2.5 py-0.5 rounded-full ${
                          row.lineStatus === 'Optimal' 
                            ? 'bg-green-100 text-green-800 dark:bg-green-950/30 dark:text-green-400' 
                            : row.lineStatus === 'Caution'
                              ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/30 dark:text-amber-400'
                              : 'bg-rose-100 text-rose-800 dark:bg-rose-950/30 dark:text-rose-400'
                        }`}>
                          {row.lineStatus}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {/* ATTENDANCE PREVIEW */}
            {activeTab === 'attendance' && (
              <table className="w-full text-left text-xs text-slate-500 dark:text-slate-400">
                <thead className="bg-slate-50 dark:bg-slate-950/20 text-[10px] text-slate-400 uppercase font-mono border-b border-slate-100 dark:border-slate-805">
                  <tr>
                    <th className="px-5 py-3">Scanned Date</th>
                    <th className="px-5 py-3 text-center">Present operators</th>
                    <th className="px-5 py-3 text-center">Absentee headcount</th>
                    <th className="px-5 py-3 text-center">Leave Approvals</th>
                    <th className="px-5 py-3 text-center">Late scans</th>
                    <th className="px-5 py-3 text-center">Attendance %</th>
                    <th className="px-5 py-3 text-center">Expected Absents</th>
                    <th className="px-5 py-3">Impact Distribution</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-sans">
                  {attendanceReportData.map((row, i) => (
                    <tr key={i} className="hover:bg-slate-50/50 dark:hover:bg-slate-850/15">
                      <td className="px-5 py-4 font-bold text-slate-800 dark:text-white whitespace-nowrap">{row.date}</td>
                      <td className="px-5 py-4 text-center text-green-500 font-semibold">{row.present}</td>
                      <td className="px-5 py-4 text-center text-rose-500 font-semibold">{row.absent}</td>
                      <td className="px-5 py-4 text-center font-mono">{row.leave}</td>
                      <td className="px-5 py-4 text-center">{row.late}</td>
                      <td className="px-5 py-4 text-center font-bold text-blue-600 dark:text-blue-400">{row.rate}%</td>
                      <td className="px-5 py-4 text-center font-mono">{row.expectedAbsence}</td>
                      <td className="px-5 py-4 font-medium text-slate-600 dark:text-slate-350">{row.summary}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {/* SKILL MATRIX PREVIEW */}
            {activeTab === 'skill' && (
              <table className="w-full text-left text-xs text-slate-500 dark:text-slate-400">
                <thead className="bg-slate-50 dark:bg-slate-950/20 text-[10px] text-slate-400 uppercase font-mono border-b border-slate-100 dark:border-slate-805">
                  <tr>
                    <th className="px-5 py-3">Employee ID</th>
                    <th className="px-5 py-3">Employee Name</th>
                    <th className="px-5 py-3">Assigned Line</th>
                    <th className="px-5 py-3">Primary Operations</th>
                    <th className="px-5 py-3 text-center">Skill Proficiency</th>
                    <th className="px-5 py-3 text-center">Base Efficiency</th>
                    <th className="px-5 py-3 text-center">Defect Rate</th>
                    <th className="px-5 py-3 text-center">Grade Level</th>
                    <th className="px-5 py-3 text-right">Eligibility</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-sans">
                  {skillReportData.map((row, i) => (
                    <tr key={i} className="hover:bg-slate-50/50 dark:hover:bg-slate-850/15">
                      <td className="px-5 py-4 font-bold text-slate-800 dark:text-white whitespace-nowrap font-mono">{row.id}</td>
                      <td className="px-5 py-4 font-bold text-slate-700 dark:text-slate-205">{row.name}</td>
                      <td className="px-5 py-4 font-medium">{row.assignedLine}</td>
                      <td className="px-5 py-4 truncate max-w-44">{row.primaryOps}</td>
                      <td className="px-5 py-4 text-center font-mono font-bold text-indigo-500">{row.skillScores}</td>
                      <td className="px-5 py-4 text-center font-semibold">{row.efficiency}%</td>
                      <td className="px-5 py-4 text-center font-semibold text-rose-500">{row.defectRate}%</td>
                      <td className="px-5 py-4 text-center">
                        <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 rounded text-[10px] font-bold text-slate-650 dark:text-slate-400">
                          {row.skillRanking}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-right">
                        <span className={`inline-flex items-center text-[10px] font-bold px-2.5 py-0.5 rounded-full ${
                          row.eligibility === 'Eligible' 
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-400' 
                            : 'bg-rose-100 text-rose-800 dark:bg-rose-900/10 dark:text-rose-400'
                        }`}>
                          {row.eligibility}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {/* PRODUCTION PLANNING PREVIEW */}
            {activeTab === 'planning' && (
              <table className="w-full text-left text-xs text-slate-500 dark:text-slate-400">
                <thead className="bg-slate-50 dark:bg-slate-950/20 text-[10px] text-slate-400 uppercase font-mono border-b border-slate-100 dark:border-slate-805">
                  <tr>
                    <th className="px-5 py-3">Garment Style Name</th>
                    <th className="px-5 py-3">Style Code</th>
                    <th className="px-5 py-3 text-center">Sequence count</th>
                    <th className="px-5 py-3 text-center">Total SMV</th>
                    <th className="px-5 py-3 text-center">Required Headcount</th>
                    <th className="px-5 py-3">Running Line(s)</th>
                    <th className="px-5 py-3 text-center">Average Line Efficiency</th>
                    <th className="px-5 py-3 text-center">Expected Output / Day</th>
                    <th className="px-5 py-3 text-center">Actual Output</th>
                    <th className="px-5 py-3 text-right">Variance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-sans">
                  {productionReportData.map((row, i) => (
                    <tr key={i} className="hover:bg-slate-50/50 dark:hover:bg-slate-850/15">
                      <td className="px-5 py-4 font-bold text-slate-800 dark:text-white whitespace-nowrap">{row.styleName}</td>
                      <td className="px-5 py-4 font-bold font-mono text-slate-500 dark:text-slate-400">{row.styleNumber}</td>
                      <td className="px-5 py-4 text-center">{row.opCount} ops</td>
                      <td className="px-5 py-4 text-center font-mono font-bold">{row.smv} min</td>
                      <td className="px-5 py-4 text-center">{row.requiredManpower} head.</td>
                      <td className="px-5 py-4 font-medium">{row.runningLines}</td>
                      <td className="px-5 py-4 text-center font-mono text-indigo-500 font-bold">{row.efficiency}</td>
                      <td className="px-5 py-4 text-center">{row.expectedPcs} pcs</td>
                      <td className="px-5 py-4 text-center text-green-500 font-semibold">{row.actualProduced} pcs</td>
                      <td className="px-5 py-4 text-right font-bold text-slate-800 dark:text-white">{row.variance}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {/* LINE BALANCING PREVIEW */}
            {activeTab === 'balancing' && (
              <table className="w-full text-left text-xs text-slate-500 dark:text-slate-400">
                <thead className="bg-slate-50 dark:bg-slate-950/20 text-[10px] text-slate-400 uppercase font-mono border-b border-slate-100 dark:border-slate-805">
                  <tr>
                    <th className="px-5 py-3">Line</th>
                    <th className="px-5 py-3">Running Garment Style</th>
                    <th className="px-5 py-3">Bottleneck Operation</th>
                    <th className="px-5 py-3">Bottleneck Operator</th>
                    <th className="px-5 py-3 text-center">Op Efficiency %</th>
                    <th className="px-5 py-3 text-center">Line Average %</th>
                    <th className="px-5 py-3 text-center">Balance Ratio %</th>
                    <th className="px-5 py-3">Suggested Improvements</th>
                    <th className="px-5 py-3 text-right">Potential Hour Gain</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-sans">
                  {balancingReportData.map((row, i) => row && (
                    <tr key={i} className="hover:bg-slate-50/50 dark:hover:bg-slate-850/15">
                      <td className="px-5 py-4 font-bold text-slate-800 dark:text-white whitespace-nowrap">{row.line}</td>
                      <td className="px-5 py-4 font-medium">{row.styleName}</td>
                      <td className="px-5 py-4 font-bold text-rose-500">{row.btOp}</td>
                      <td className="px-5 py-4 font-semibold text-slate-700 dark:text-slate-300">{row.btOperator}</td>
                      <td className="px-5 py-4 text-center font-mono font-bold text-rose-500">{row.opEfficiency}</td>
                      <td className="px-5 py-4 text-center font-mono">{row.lineEfficiency}</td>
                      <td className="px-5 py-4 text-center font-mono font-semibold">{row.balanceEfficiency}</td>
                      <td className="px-5 py-4 text-slate-650 dark:text-slate-400">{row.suggestion}</td>
                      <td className="px-5 py-4 text-right font-bold text-emerald-505">{row.gainOpportunity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {/* REPLACEMENT RECOMMENDATIONS PREVIEW */}
            {activeTab === 'replacements' && (
              <table className="w-full text-left text-xs text-slate-500 dark:text-slate-400">
                <thead className="bg-slate-50 dark:bg-slate-950/20 text-[10px] text-slate-400 uppercase font-mono border-b border-slate-100 dark:border-slate-805">
                  <tr>
                    <th className="px-5 py-3">Absent Operator</th>
                    <th className="px-5 py-3">Line Reference</th>
                    <th className="px-5 py-3">Missing Operation</th>
                    <th className="px-5 py-3 text-emerald-500">Auto Suggest Replacement</th>
                    <th className="px-5 py-3 text-center">Skill match %</th>
                    <th className="px-5 py-3 text-center">Replacement Efficiency</th>
                    <th className="px-5 py-3 text-center">Replacement Defect Rate</th>
                    <th className="px-5 py-3">Current Status</th>
                    <th className="px-5 py-3 text-right">Recommendation Rank</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-sans">
                  {replacementsReportData.map((row, i) => (
                    <tr key={i} className="hover:bg-slate-50/50 dark:hover:bg-slate-850/15">
                      <td className="px-5 py-4 font-bold text-slate-850 dark:text-white whitespace-nowrap">{row.absentName}</td>
                      <td className="px-5 py-4 font-medium">{row.absentLine}</td>
                      <td className="px-5 py-4 font-bold text-rose-500">{row.missingOp}</td>
                      <td className="px-5 py-4 font-extrabold text-emerald-600 dark:text-emerald-400">{row.recommendedReplacement}</td>
                      <td className="px-5 py-4 text-center font-mono text-emerald-500 font-extrabold">{row.skillMatch}</td>
                      <td className="px-5 py-4 text-center">{row.repEfficiency}</td>
                      <td className="px-5 py-4 text-center text-rose-400">{row.repDefect}</td>
                      <td className="px-5 py-4 font-mono text-slate-450">{row.currentStat}</td>
                      <td className="px-5 py-4 text-right font-extrabold text-indigo-505">{row.recScore}</td>
                    </tr>
                  ))}
                  {replacementsReportData.length === 0 && (
                    <tr>
                      <td colSpan={9} className="px-5 py-8 text-center text-slate-400 italic">
                        No operators registered absent today. Reallocating replacements not required!
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}

            {/* GARMENT STYLE HISTORY PREVIEW */}
            {activeTab === 'styles' && (
              <table className="w-full text-left text-xs text-slate-500 dark:text-slate-400">
                <thead className="bg-slate-50 dark:bg-slate-950/20 text-[10px] text-slate-400 uppercase font-mono border-b border-slate-100 dark:border-slate-805">
                  <tr>
                    <th className="px-5 py-3">Line</th>
                    <th className="px-5 py-3">Previous Garment</th>
                    <th className="px-5 py-3">Style Change Target</th>
                    <th className="px-5 py-3">Authorized By</th>
                    <th className="px-5 py-3 text-center">Transition Date</th>
                    <th className="px-5 py-3 text-center">Transition Time</th>
                    <th className="px-5 py-3 text-center">Req Before</th>
                    <th className="px-5 py-3 text-center">Req After</th>
                    <th className="px-5 py-3 text-right">Manpower Impact Result</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-sans">
                  {styleHistoryReportData.map((row, i) => row && (
                    <tr key={i} className="hover:bg-slate-50/50 dark:hover:bg-slate-850/15">
                      <td className="px-5 py-4 font-bold text-slate-800 dark:text-white whitespace-nowrap">{row.lineNumber}</td>
                      <td className="px-5 py-4 text-slate-500 truncate max-w-44">{row.prevStyle}</td>
                      <td className="px-5 py-4 font-extrabold text-blue-600 dark:text-blue-400">{row.newStyle}</td>
                      <td className="px-5 py-4 font-medium">{row.changedBy}</td>
                      <td className="px-5 py-4 text-center whitespace-nowrap font-mono">{row.changeDate}</td>
                      <td className="px-5 py-4 text-center whitespace-nowrap font-mono">{row.changeTime}</td>
                      <td className="px-5 py-4 text-center">{row.manpowerBefore}</td>
                      <td className="px-5 py-4 text-center font-bold">{row.manpowerAfter}</td>
                      <td className="px-5 py-4 text-right font-medium text-slate-650 dark:text-slate-400">{row.impact}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

          </div>

          <div className="p-4 bg-slate-50 dark:bg-slate-950/20 border-t border-slate-100 dark:border-slate-805 flex flex-col sm:flex-row justify-between items-start sm:items-center text-[10.5px] text-slate-400 gap-2">
            <span>
              Disclaimer: Raw operational planning data fetched dynamically from PostgreSQL on behalf of identity: <strong>{currentUser?.username}</strong>.
            </span>
            <span className="font-mono">
              Records count: {currentRecordsCount} entries
            </span>
          </div>

        </div>

      </div>

      {/* 6. Export History Audit Logs card structure */}
      <div className="bg-white dark:bg-slate-900 border border-slate-205 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden p-5 space-y-4">
        
        <div className="flex justify-between items-center pb-3 border-b border-slate-100 dark:border-slate-800 gap-2">
          <div className="flex items-center space-x-2">
            <History className="w-4.5 h-4.5 text-blue-600" />
            <h2 className="text-xs font-bold text-slate-800 dark:text-white uppercase font-display tracking-widest">
              Audit trails / Export logs register
            </h2>
          </div>
          
          <button
            type="button"
            onClick={fetchAuditLogs}
            disabled={isLoadingLogs}
            className="p-1 px-2 text-[10px] sm:text-xs font-bold text-blue-600 hover:bg-blue-50 dark:hover:bg-slate-800/25 rounded-md flex items-center space-x-1 outline-none pointer-events-auto"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoadingLogs ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Refresh logs</span>
          </button>
        </div>

        <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
          The following table contains immutable operational audit records compiled across style transfers, spreadsheet generation sessions, and planning exports.
        </p>

        <div className="overflow-x-auto border border-slate-100 dark:border-slate-805 rounded-xl">
          <table className="w-full text-left text-xs text-slate-500 dark:text-slate-400">
            <thead className="bg-slate-50 dark:bg-slate-950/20 text-[9.5px] text-slate-400 uppercase font-mono border-b border-slate-100 dark:border-slate-805">
              <tr>
                <th className="px-4 py-3">Logged user</th>
                <th className="px-4 py-3">Business role</th>
                <th className="px-4 py-3">Report Scope Requested</th>
                <th className="px-4 py-3 text-center">Format</th>
                <th className="px-4 py-3">Date Range Selected</th>
                <th className="px-4 py-3 text-center">Records Generated</th>
                <th className="px-4 py-3 text-right">Audit Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-150 dark:divide-slate-805 font-sans text-xs">
              {auditLogs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-850/15">
                  <td className="px-4 py-3.5 font-bold text-slate-800 dark:text-white">{log.username}</td>
                  <td className="px-4 py-3.5">
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-105 dark:bg-slate-800 text-slate-655 dark:text-slate-400">
                      {log.role}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 font-semibold text-slate-700 dark:text-slate-300">{log.reportType}</td>
                  <td className="px-4 py-3.5 text-center">
                    <span className={`px-2 py-0.5 rounded font-bold text-[9.5px] ${
                      log.exportFormat === 'PDF' 
                        ? 'bg-rose-50 text-rose-600 dark:bg-rose-950/30' 
                        : log.exportFormat === 'Excel' 
                          ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30' 
                          : 'bg-blue-50 text-blue-600 dark:bg-blue-950/30'
                    }`}>
                      {log.exportFormat}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 font-mono text-[10.5px]">{log.dateRange}</td>
                  <td className="px-4 py-3.5 text-center font-bold font-mono">{log.recordsCount}</td>
                  <td className="px-4 py-3.5 text-right font-mono text-[10.5px]">{new Date(log.timestamp).toLocaleString()}</td>
                </tr>
              ))}
              {auditLogs.length === 0 && !isLoadingLogs && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-400 italic">
                    No reports exported in this session yet. All spreadsheet downloads are logged immediately here.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

      </div>

    </div>
  );
}
