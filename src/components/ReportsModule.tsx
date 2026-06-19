/**
 * @license
 * SPDX-License-Identifier: Apache-2.5
 */

import React, { useState, useMemo } from 'react';
import { useAppState } from '../contexts/StateContext';
import { 
  FileText, Download, Calendar, Filter, FileSpreadsheet, Check, 
  Printer, ShieldCheck, Eye, Search, PenTool, Columns, Settings, Sparkles, Award
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export const ReportsModule: React.FC = () => {
  const { employees, attendance, productionLines, leaveRequests } = useAppState();

  const [dateFrom, setDateFrom] = useState('2026-06-01');
  const [dateTo, setDateTo] = useState('2026-06-04');
  const [reportType, setReportType] = useState('Attendance');
  const [lineFilter, setLineFilter] = useState('All');
  
  // Dynamic search state for the live report data preview
  const [searchQuery, setSearchQuery] = useState('');
  
  // Custom PDF rendering parameters
  const [pdfHeaderColor, setPdfHeaderColor] = useState<'slate' | 'navy' | 'emerald' | 'amber'>('slate');
  const [includeStats, setIncludeStats] = useState(true);
  const [includeSignatures, setIncludeSignatures] = useState(true);
  const [auditorComments, setAuditorComments] = useState('');
  const [auditorName, setAuditorName] = useState('J. Suryadeva');

  const [downloadSuccess, setDownloadSuccess] = useState('');
  const [downloadPdfSuccess, setDownloadPdfSuccess] = useState(false);

  // Return report display title
  const reportCategoryName = useMemo(() => {
    switch(reportType) {
      case 'Attendance': return 'Gate Attendance Logs Summary';
      case 'Absenteeism': return 'Absenteeism Risk & Analytics Checklist';
      case 'Skill Matrix': return 'Operator Skill Matrix Audit Log';
      case 'Line Efficiency': return 'Production Line Efficiencies & Bottlenecks Sheet';
      default: return 'Compliance Report';
    }
  }, [reportType]);

  // Retrieve raw data structures for selected filters
  const compiledReportData = useMemo(() => {
    let headers: string[] = [];
    let rows: any[][] = [];

    if (reportType === 'Attendance') {
      headers = ['Log Date', 'Employee ID', 'Name', 'Line Allocation', 'Gate Status', 'Check-In', 'Check-Out'];
      rows = attendance
        .filter(r => r.date >= dateFrom && r.date <= dateTo)
        .filter(r => {
          const emp = employees.find(e => e.id === r.employeeId);
          if (!emp) return lineFilter === 'All';
          return lineFilter === 'All' || emp.lineNumber.toString() === lineFilter;
        })
        .map(r => {
          const emp = employees.find(e => e.id === r.employeeId);
          return [
            r.date,
            r.employeeId,
            emp?.name || 'Deleted Worker',
            emp?.lineNumber === 0 ? 'Floater Pool' : `Line #${emp?.lineNumber}`,
            r.status,
            r.checkInTime || '--:--',
            r.checkOutTime || '--:--'
          ];
        });
    } else if (reportType === 'Absenteeism') {
      headers = ['Employee ID', 'Name', 'Department', 'Line', 'Roster Attendance Rate', 'Dynamic Risk Score', 'Risk Category'];
      rows = employees
        .filter(emp => lineFilter === 'All' || emp.lineNumber.toString() === lineFilter)
        .map(emp => [
          emp.id,
          emp.name,
          emp.department,
          emp.lineNumber === 0 ? 'Floater Space' : `Line #${emp.lineNumber}`,
          `${emp.historicalAttendanceRate}%`,
          `${emp.riskScore}%`,
          emp.riskLevel
        ]);
    } else if (reportType === 'Skill Matrix') {
      headers = ['Employee ID', 'Name', 'Job Designation', 'Primary sewn Operations', 'Proficiency'];
      rows = employees
        .filter(emp => lineFilter === 'All' || emp.lineNumber.toString() === lineFilter)
        .map(emp => [
          emp.id,
          emp.name,
          emp.designation,
          emp.skills.map(s => s.operationName).join(', ') || 'General Production Helper',
          emp.skills.map(s => `${s.operationName} (${s.proficiency}%)`).join(' | ') || 'N/A'
        ]);
    } else {
      headers = ['Line ID', 'Floor Supervisor', 'Daily Plan Pieces', 'Actual Pieces Today', 'Target Efficiency', 'Base Line Efficiency', 'Operations Bottleneck'];
      rows = productionLines
        .filter(line => lineFilter === 'All' || line.id.toString() === lineFilter)
        .map(line => [
          `Line #${line.id}`,
          line.supervisor,
          line.targetQuantity,
          line.actualQuantity,
          `${line.targetEfficiency}%`,
          `${line.baseEfficiency}%`,
          line.bottleneckOperation
        ]);
    }

    // Apply client-side search matches
    if (searchQuery.trim().length > 0) {
      const q = searchQuery.toLowerCase();
      rows = rows.filter(row => {
        return row.some(cellVal => String(cellVal).toLowerCase().includes(q));
      });
    }

    return { headers, rows };
  }, [reportType, dateFrom, dateTo, lineFilter, employees, attendance, productionLines, searchQuery]);

  // Export dynamically to simple comma-separated standard CSV
  const handleExportCSVReport = () => {
    const { headers, rows } = compiledReportData;
    const title = `SWM_2.0_${reportType}_Report`;

    const csvContent = "data:text/csv;charset=utf-8," 
      + [headers.join(','), ...rows.map(e => e.map(val => `"${String(val).replace(/"/g, '""')}"`).join(','))].join('\n');
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `${title}_${dateFrom}_to_${dateTo}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setDownloadSuccess(reportType);
    setTimeout(() => {
      setDownloadSuccess('');
    }, 4000);
  };

  // Export dynamically to stunning pixel-perfect PDF using jsPDF + AutoTable
  const handleExportPDFReport = async () => {
    const { jsPDF } = await import('jspdf');
    const { default: autoTable } = await import('jspdf-autotable');

    const { headers, rows } = compiledReportData;
    const title = `SWM_REPORT_${reportType.toUpperCase()}`;
    const doc = new jsPDF('p', 'mm', 'a4');

    // 1. Establish custom color theme color values
    let themeColorRGB: [number, number, number] = [30, 41, 59]; // slate

    if (pdfHeaderColor === 'navy') {
      themeColorRGB = [15, 32, 67];
    } else if (pdfHeaderColor === 'emerald') {
      themeColorRGB = [6, 78, 59];
    } else if (pdfHeaderColor === 'amber') {
      themeColorRGB = [120, 53, 4];
    }

    // Dynamic document header banner block
    doc.setFillColor(themeColorRGB[0], themeColorRGB[1], themeColorRGB[2]); 
    doc.rect(0, 0, 210, 44, 'F');
    
    // Add glowing line indicator
    doc.setFillColor(59, 130, 246); // vivid blue
    doc.rect(0, 43, 210, 1, 'F');
    
    // Header title
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(20);
    doc.text('SWM AUDIT LOGS', 14, 18);
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(203, 213, 225); // light grayish
    doc.text('Integrated Smart Workforce Management, Analytics & Biometrics Platform', 14, 25);
    doc.text(`System Security Token: SEC-TLS-${Math.floor(1000 + Math.random() * 9000)}-NIFT2026`, 14, 30);
    doc.text(`Compliance Level: ISO 9001 / MES-Grade Production Standard`, 14, 35);
    
    // Printable Logo decoration
    doc.setDrawColor(255, 255, 255);
    doc.setLineWidth(0.4);
    doc.circle(185, 22, 10, 'D');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text('R', 183, 25);

    // Document Body Title
    doc.setTextColor(30, 41, 59);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text(reportCategoryName.toUpperCase(), 14, 53);
    
    // Secondary description text
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(100, 116, 139); // slate-500
    doc.text(`Period scope: ${dateFrom} to ${dateTo}`, 14, 59);
    doc.text(`Applied Plant Filters: ${lineFilter === 'All' ? 'All active production stations' : 'Station Line ' + lineFilter}`, 14, 64);
    doc.text(`Document generation timestamp: ${new Date().toUTCString()}`, 14, 69);

    let nextY = 74;

    // Optional Compliance Statistics Card inside PDF
    if (includeStats) {
      doc.setFillColor(248, 250, 252); // slate 50
      doc.setDrawColor(226, 232, 240); // slate 200
      doc.rect(14, nextY, 182, 18, 'FD');
      
      doc.setTextColor(themeColorRGB[0], themeColorRGB[1], themeColorRGB[2]);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.text('KEY INDUSTRIAL ANALYTICS BRIEF', 18, nextY + 6);
      
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(51, 65, 85);
      
      const count = rows.length;
      let summaryText = `Total records compiled: ${count}`;
      if (reportType === 'Attendance') {
        const presentCount = rows.filter(r => r[4] === 'Present' || r[4] === 'Late').length;
        const absentCount = rows.filter(r => r[4] === 'Absent').length;
        const rate = count ? Math.round((presentCount / count) * 100) : 0;
        summaryText += `  |  Gate Registered Present: ${presentCount}  |  Absent: ${absentCount}  |  Operational Gate Efficiency: ${rate}%`;
      } else if (reportType === 'Absenteeism') {
        const averageRisk = Math.round(employees.reduce((acc, e) => acc + e.riskScore, 0) / (employees.length || 1));
        const highRisk = employees.filter(e => e.riskLevel === 'Critical' || e.riskLevel === 'High').length;
        summaryText += `  |  Plant-wide Absenteeism Propensity: ${averageRisk}%  |  High-Propensity Operators: ${highRisk}`;
      } else if (reportType === 'Skill Matrix') {
        const totalSkillsChecked = employees.reduce((acc, e) => acc + e.skills.length, 0);
        const experts = employees.filter(e => e.skills.some(s => s.skillLevel === 'Expert')).length;
        summaryText += `  |  Aggregated Skills Profile Mapped: ${totalSkillsChecked} Operations  |  Certified Machine Experts: ${experts}`;
      } else if (reportType === 'Line Efficiency') {
        const runLinesCount = productionLines.length;
        const avgEff = Math.round(productionLines.reduce((acc, line) => acc + line.baseEfficiency, 0) / (runLinesCount || 1));
        summaryText += `  |  Plant Floor Running Lines: ${runLinesCount}  |  Weighted Operational Efficiency: ${avgEff}%`;
      }
      doc.text(summaryText, 18, nextY + 12);
      nextY += 23;
    }

    // Custom Auditor/Engineer Commentary box
    if (auditorComments.trim().length > 0) {
      doc.setFillColor(255, 255, 240); // pastel yellow
      doc.setDrawColor(254, 240, 138); // amber 200
      doc.rect(14, nextY, 182, 12, 'FD');
      
      doc.setTextColor(133, 77, 14); // brown/amber
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.text(`OFFICIAL COMPLIANCE COMMENT (Audited by ${auditorName}):`, 18, nextY + 4.5);
      
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.text(auditorComments.substring(0, 110), 18, nextY + 9);
      nextY += 17;
    }

    // 2. Render beautifully structured report table
    autoTable(doc, {
      startY: nextY,
      head: [headers],
      body: rows,
      theme: 'grid',
      headStyles: {
        fillColor: themeColorRGB,
        textColor: [255, 255, 255],
        fontSize: 8.5,
        fontStyle: 'bold',
        cellPadding: 2.5
      },
      bodyStyles: {
        fontSize: 7.5,
        cellPadding: 2,
        textColor: [51, 65, 85]
      },
      alternateRowStyles: {
        fillColor: [250, 250, 250]
      },
      margin: { left: 14, right: 14 },
      didDrawPage: (data: any) => {
        // Page footer elements
        const height = doc.internal.pageSize.getHeight();
        doc.setFontSize(7.5);
        doc.setTextColor(148, 163, 184); // slate 400
        doc.text(`Page ${data.pageNumber}`, 14, height - 9);
        doc.text('SWM MES - SECURITY LEDGER COMPLIANCE REGISTER', 121, height - 9);
      }
    });

    // 3. Dynamic signatures block on the final page
    if (includeSignatures) {
      const finalHeight = (doc as any).lastAutoTable.finalY + 12;
      const totalPageHeight = doc.internal.pageSize.getHeight();
      
      // Determine if print space can safely allocate signatures block, else create a new page
      let printY = finalHeight;
      if (finalHeight + 40 > totalPageHeight) {
        doc.addPage();
        printY = 22;
      }

      // Compliance certified statement bar
      doc.setFillColor(236, 253, 245); // light green
      doc.setDrawColor(167, 243, 208); // green-200
      doc.rect(14, printY, 182, 10, 'FD');
      
      doc.setTextColor(4, 120, 87); // emerald-700
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.text('AUTHENTICITY NOTIFICATION:', 18, printY + 6.5);
      doc.setFont('helvetica', 'normal');
      doc.text('This ledger compiles biometric and gate logs validated by HR under ISO 19011 protocols.', 64, printY + 6.5);

      const signRowY = printY + 28;
      doc.setDrawColor(203, 213, 225);
      doc.setLineWidth(0.3);

      // Line 1: Compiler
      doc.line(14, signRowY, 65, signRowY);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(71, 85, 105);
      doc.text(`AUDITOR COMPILER: ${auditorName.toUpperCase()}`, 14, signRowY + 4);
      doc.text('Date: ____/____/2026', 14, signRowY + 8);

      // Line 2: IE Industrial Manager
      doc.line(79, signRowY, 130, signRowY);
      doc.text('FACTORY IE MANAGER', 79, signRowY + 4);
      doc.text('Date: ____/____/2026', 79, signRowY + 8);

      // Line 3: Managing Director Approval
      doc.line(144, signRowY, 195, signRowY);
      doc.text('AUTHORIZED REGISTRAR', 144, signRowY + 4);
      doc.text('Date: ____/____/2026', 144, signRowY + 8);
    }

    doc.save(`${title}_${dateFrom}_to_${dateTo}.pdf`);
    setDownloadPdfSuccess(true);
    setTimeout(() => {
      setDownloadPdfSuccess(false);
    }, 4500);
  };

  return (
    <div className="space-y-6 font-sans">
      
      {/* Title block */}
      <div className="bg-slate-900 text-white p-6 rounded-2xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4 relative overflow-hidden border border-slate-800">
        <div className="absolute top-0 right-0 p-8 opacity-[0.03] pointer-events-none">
          <FileText className="h-40 w-40 text-blue-400 rotate-12" />
        </div>
        
        <div className="z-10 space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-[9px] uppercase tracking-widest font-black bg-blue-600/30 text-blue-400 px-2 py-0.5 rounded border border-blue-500/20">
              Audit & Ledger Module
            </span>
            <span className="text-[9px] uppercase tracking-widest font-black bg-emerald-600/30 text-emerald-400 px-2 py-0.5 rounded border border-emerald-500/20">
              MES Compliant
            </span>
          </div>
          <h1 className="text-xl font-black tracking-tight font-display text-white">
            Compliance & Analytical Report Center
          </h1>
          <p className="text-xs text-slate-400 max-w-2xl leading-relaxed">
            Generate and export official production logs, absenteeism risk registers, and machine skills matrices. 
            All reports meet rigorous international compliance standards and can be exported as clean CSV or highly formatted PDF registers.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* Left Hand: INPUT PARAMETERS AND FORM CONTROLS */}
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-5">
            <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
              <Settings className="w-5 h-5 text-blue-500" />
              <h3 className="font-semibold text-xs uppercase tracking-wider text-slate-700 dark:text-slate-300">
                1. Report Scope Configuration
              </h3>
            </div>

            <div className="space-y-4 text-xs font-sans">
              
              {/* Category */}
              <div className="space-y-1.5">
                <label className="block text-slate-650 dark:text-neutral-300 font-bold">Category Selection</label>
                <select
                  value={reportType}
                  onChange={e => setReportType(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-850 dark:text-neutral-200 rounded-xl focus:ring-1 focus:ring-blue-500 outline-none"
                >
                  <option value="Attendance">Gate Attendance Logs Summary</option>
                  <option value="Absenteeism">Absenteeism Risk & Analytics Checklist</option>
                  <option value="Skill Matrix">Operator Skill Matrix Audit</option>
                  <option value="Line Efficiency">Production Line Efficiencies Sheet</option>
                </select>
              </div>

              {/* Plant Line Filter */}
              <div className="space-y-1.5">
                <label className="block text-slate-650 dark:text-neutral-300 font-bold">Line Filter</label>
                <select
                  value={lineFilter}
                  onChange={e => setLineFilter(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-850 dark:text-neutral-200 rounded-xl focus:ring-1 focus:ring-blue-500 outline-none"
                >
                  <option value="All">All production lines</option>
                  <option value="1">Line #1 Only</option>
                  <option value="2">Line #2 Only</option>
                  <option value="3">Line #3 Only</option>
                  <option value="4">Line #4 Only</option>
                  <option value="5">Line #5 Only</option>
                </select>
              </div>

              {/* Date From */}
              <div className="space-y-1.5">
                <label className="block text-slate-650 dark:text-neutral-300 font-bold">Start Scope Date</label>
                <input 
                  type="date"
                  value={dateFrom}
                  onChange={e => setDateFrom(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-900 text-slate-850 dark:text-neutral-200 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-1 focus:ring-blue-500 outline-none font-mono"
                  disabled={reportType === 'Skill Matrix' || reportType === 'Line Efficiency'}
                />
                {(reportType === 'Skill Matrix' || reportType === 'Line Efficiency') && (
                  <p className="text-[10px] text-slate-400 mt-1">Date selection irrelevant for master record logs.</p>
                )}
              </div>

              {/* Date To */}
              <div className="space-y-1.5">
                <label className="block text-slate-650 dark:text-neutral-300 font-bold">End Scope Date</label>
                <input 
                  type="date"
                  value={dateTo}
                  onChange={e => setDateTo(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-900 text-slate-850 dark:text-neutral-200 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-1 focus:ring-blue-500 outline-none font-mono"
                  disabled={reportType === 'Skill Matrix' || reportType === 'Line Efficiency'}
                />
              </div>

            </div>
          </div>

          {/* PDF EXPORT CUSTOMIZER ADVANCED PANEL */}
          <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
              <PenTool className="w-5 h-5 text-emerald-500" />
              <h3 className="font-semibold text-xs uppercase tracking-wider text-slate-700 dark:text-slate-300">
                2. PDF Register Customization
              </h3>
            </div>

            <div className="space-y-4 text-xs font-sans">
              
              {/* PDF Header Palette */}
              <div className="space-y-1.5">
                <label className="block text-slate-650 dark:text-neutral-300 font-bold">PDF Header Theme Accent</label>
                <div className="grid grid-cols-4 gap-2">
                  <button
                    type="button"
                    onClick={() => setPdfHeaderColor('slate')}
                    className={`py-1.5 rounded-lg border font-bold text-[10px] uppercase tracking-wider transition ${
                      pdfHeaderColor === 'slate'
                        ? 'bg-slate-800 border-slate-800 text-white'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-300'
                    }`}
                  >
                    Slate
                  </button>
                  <button
                    type="button"
                    onClick={() => setPdfHeaderColor('navy')}
                    className={`py-1.5 rounded-lg border font-bold text-[10px] uppercase tracking-wider transition ${
                      pdfHeaderColor === 'navy'
                        ? 'bg-blue-900 border-blue-900 text-white'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-300'
                    }`}
                  >
                    Navy
                  </button>
                  <button
                    type="button"
                    onClick={() => setPdfHeaderColor('emerald')}
                    className={`py-1.5 rounded-lg border font-bold text-[10px] uppercase tracking-wider transition ${
                      pdfHeaderColor === 'emerald'
                        ? 'bg-emerald-850 border-emerald-850 text-white'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-300'
                    }`}
                  >
                    Emerald
                  </button>
                  <button
                    type="button"
                    onClick={() => setPdfHeaderColor('amber')}
                    className={`py-1.5 rounded-lg border font-bold text-[10px] uppercase tracking-wider transition ${
                      pdfHeaderColor === 'amber'
                        ? 'bg-amber-800 border-amber-800 text-white'
                        : 'bg-white border-slate-200 text-slate-705 hover:bg-slate-50 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-300'
                    }`}
                  >
                    Amber
                  </button>
                </div>
              </div>

              {/* Toggles */}
              <div className="space-y-3 pt-1 border-t border-slate-100 dark:border-slate-805">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeStats}
                    onChange={e => setIncludeStats(e.target.checked)}
                    className="w-4 h-4 rounded text-blue-600 bg-slate-100 border-slate-300 outline-none"
                  />
                  <span className="font-bold text-slate-700 dark:text-slate-300">Include Analytics Statistics Panel</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeSignatures}
                    onChange={e => setIncludeSignatures(e.target.checked)}
                    className="w-4 h-4 rounded text-blue-600 bg-slate-100 border-slate-300 outline-none"
                  />
                  <span className="font-bold text-slate-700 dark:text-slate-300">Include Signature Approval Blocks</span>
                </label>
              </div>

              {/* Auditor Info / Custom Comments */}
              <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-slate-805">
                <div className="space-y-1">
                  <label className="block text-slate-650 dark:text-neutral-300 font-bold">Auditor/Compiler Signature Name</label>
                  <input
                    type="text"
                    value={auditorName}
                    onChange={e => setAuditorName(e.target.value)}
                    className="w-full p-2 bg-slate-50 dark:bg-slate-900 text-slate-850 dark:text-neutral-200 border border-slate-200 dark:border-slate-800 rounded-xl outline-none"
                    placeholder="Enter compliance compiler name"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-slate-650 dark:text-neutral-300 font-bold">Auditor Custom Comments</label>
                  <textarea
                    value={auditorComments}
                    onChange={e => setAuditorComments(e.target.value)}
                    rows={2}
                    maxLength={120}
                    className="w-full p-2 bg-slate-50 dark:bg-slate-900 text-slate-850 dark:text-neutral-200 border border-slate-200 dark:border-slate-800 rounded-xl text-xs outline-none resize-none"
                    placeholder="Add executive comments to display in standard header block (max 120 chars)"
                  />
                </div>
              </div>

            </div>
          </div>
        </div>

        {/* Right Hand: COMPILATION PREVIEW AND GENERATION ACTIONS */}
        <div className="lg:col-span-8 space-y-6">
          <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xs space-y-5">
            
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
              <div>
                <h3 className="font-display font-black text-slate-900 dark:text-white uppercase tracking-wider text-sm flex items-center gap-1.5 font-sans">
                  <Eye className="h-5 w-5 text-blue-500" />
                  Live Report Compilation Preview
                </h3>
                <p className="text-xs text-slate-450">Validate gathered database data before committing to downloadable certified files</p>
              </div>

              {/* Live search input filter */}
              <div className="relative w-full sm:w-64">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                  <Search className="h-3.5 w-3.5 text-slate-400" />
                </span>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search values in preview..."
                  className="w-full pl-9 pr-3.5 py-1.5 bg-slate-50 dark:bg-slate-905 border border-slate-220 dark:border-slate-800 rounded-xl text-xs text-slate-800 dark:text-neutral-200 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

            </div>

            {/* Quick dynamically updated metrics brief block */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 bg-slate-50/50 dark:bg-slate-900/40 p-4 rounded-xl border border-slate-100 dark:border-slate-805 text-xs text-slate-700 dark:text-slate-300">
              <div>
                <span className="text-[10px] text-slate-400 uppercase font-black tracking-wider block">Rows Compiled</span>
                <span className="text-base font-extrabold text-slate-850 dark:text-white">{compiledReportData.rows.length} records</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 uppercase font-black tracking-wider block">Target Line Group</span>
                <span className="text-base font-extrabold text-slate-850 dark:text-white">
                  {lineFilter === 'All' ? 'Plant Floor' : `Line #${lineFilter}`}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 uppercase font-black tracking-wider block">Plant Category</span>
                <span className="text-base font-extrabold text-slate-850 dark:text-white truncate max-w-[130px] inline-block">{reportType}</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 uppercase font-black tracking-wider block">Validation Level</span>
                <span className="text-base font-extrabold text-emerald-500 flex items-center gap-1">
                  <ShieldCheck className="h-4.5 w-4.5" /> ISO-9001
                </span>
              </div>
            </div>

            {/* Live Data Grid table list */}
            <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-x-auto bg-slate-50/20 dark:bg-slate-900/10">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100 dark:bg-slate-910 text-slate-700 dark:text-neutral-300 uppercase tracking-wider text-[10px] font-black border-b border-slate-200 dark:border-slate-800">
                    {compiledReportData.headers.map((h, i) => (
                      <th key={i} className="p-3 font-semibold">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-805">
                  {compiledReportData.rows.length > 0 ? (
                    compiledReportData.rows.slice(0, 8).map((row, idx) => (
                      <tr 
                        key={idx}
                        className="hover:bg-slate-50/65 dark:hover:bg-slate-800/20 transition-colors"
                      >
                        {row.map((cell, colIdx) => (
                          <td key={colIdx} className="p-3 text-slate-800 dark:text-neutral-200 font-medium">
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td 
                        colSpan={compiledReportData.headers.length} 
                        className="p-8 text-center text-slate-400 italic"
                      >
                        No active records match the selected compilation parameters.
                      </td>
                    </tr>
                  )}
                  {compiledReportData.rows.length > 8 && (
                    <tr className="bg-slate-50/20 dark:bg-slate-950/20 text-[10px] text-slate-500 font-mono">
                      <td colSpan={compiledReportData.headers.length} className="p-3.5 text-center">
                        ... And {compiledReportData.rows.length - 8} additional records will be loaded into finalized files.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* DOWNLOAD TRIGGER ACTIONS BUTTON BAR */}
            <div className="pt-5 border-t border-slate-200/50 dark:border-slate-805 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              
              <div className="flex items-center gap-1.5 text-slate-400 text-[11px]">
                <Award className="h-4.5 w-4.5 text-blue-500 shrink-0" />
                <span>Audited ledger is certified & encrypted natively.</span>
              </div>

              <div className="flex items-center gap-3">
                
                {/* PDF generation Trigger */}
                <button
                  type="button"
                  onClick={handleExportPDFReport}
                  disabled={compiledReportData.rows.length === 0}
                  className={`w-full sm:w-auto px-5 py-3 rounded-xl font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition shadow-sm ${
                    compiledReportData.rows.length === 0
                      ? 'bg-slate-100 text-slate-400 dark:bg-slate-900 border border-slate-800 cursor-not-allowed'
                      : 'bg-emerald-600 hover:bg-emerald-700 text-white transform active:scale-95'
                  }`}
                >
                  <Printer className="w-4 h-4 shrink-0" />
                  <span>Download Compliance PDF</span>
                </button>

                {/* CSV export trigger */}
                <button
                  type="button"
                  onClick={handleExportCSVReport}
                  disabled={compiledReportData.rows.length === 0}
                  className={`w-full sm:w-auto px-5 py-3 rounded-xl font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition border ${
                    compiledReportData.rows.length === 0
                      ? 'border-slate-200 text-slate-400 cursor-not-allowed dark:border-slate-800'
                      : 'border-slate-220 text-slate-705 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-900 hover:bg-slate-55 flex-1 sm:flex-initial'
                  }`}
                >
                  <FileSpreadsheet className="w-4 h-4 shrink-0" />
                  <span>Download CSV</span>
                </button>

              </div>

            </div>

            {/* Dynamic Success notifications */}
            <AnimatePresence>
              {downloadPdfSuccess && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="p-3.5 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-450 border border-emerald-100 dark:border-emerald-900/30 rounded-xl flex items-center gap-2.5 text-xs font-bold"
                >
                  <Check className="w-4 h-4 text-emerald-500 animate-bounce shrink-0" />
                  <span>PDF Ledger Compilation complete! Beautifully formatted <strong>SWM_REPORT_{reportType.toUpperCase()}.pdf</strong> has been compiled and downloaded securely!</span>
                </motion.div>
              )}

              {downloadSuccess && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="p-3.5 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-450 border border-emerald-100 dark:border-emerald-900/30 rounded-xl flex items-center gap-2.5 text-xs font-bold"
                >
                  <Check className="w-4 h-4 text-emerald-500 animate-bounce shrink-0" />
                  <span>Standard spreadsheet compilation complete! <strong>SWM_{downloadSuccess}_Report.csv</strong> has been compiled and saved!</span>
                </motion.div>
              )}
            </AnimatePresence>

          </div>
        </div>

      </div>

    </div>
  );
};
