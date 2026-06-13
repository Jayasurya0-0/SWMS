/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef } from 'react';
import { useAppState } from '../contexts/StateContext';
import { LineAllocationEntry, WorkforceAssignmentStatus } from '../types';
import * as XLSX from 'xlsx';
import { 
  UploadCloud, FileSpreadsheet, Download, RefreshCw, Layers, CheckCircle, 
  AlertCircle, Trash2, Search, Table, HelpCircle, User, Info, FileText 
} from 'lucide-react';

export const LineAllocationConfigurationCenter: React.FC = () => {
  const { 
    lineAllocations, 
    uploadLineAllocationsFile, 
    setLineAllocations, 
    employees,
    systemDate,
    productionLines
  } = useAppState();

  const [dragActive, setDragActive] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterLine, setFilterLine] = useState<string>('All');
  
  // Tab view: 'view' | 'upload' | 'paste'
  const [mode, setMode] = useState<'view' | 'upload' | 'paste'>('view');
  
  // Paste Area state
  const [pastedText, setPastedText] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Download official CSV template
  const downloadCSVTemplate = () => {
    const headers = "Employee ID,Employee Name,Department,Assigned Line,Assignment Status,Remarks\n";
    const sampleRows = [
      "EMP-P001,Rajesh Kumar,Sewing,Line 01,Assigned,Critical top stitcher\n",
      "EMP-P002,Sunita Patel,Sewing,Line 01,Assigned,Collar specialist\n",
      "EMP-P005,Anil Sharma,Sewing,Line 02,Assigned,Overlap expert\n",
      "EMP-P010,Kriti Sen,Sewing,Floater,Available for Replacement,Multi-skilled floater\n",
      "EMP-P015,Rahul Dev,Sewing,Unassigned,Unassigned,Sleeve attachment trainee\n"
    ];
    const content = headers + sampleRows.join("");
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "swm_workforce_line_allocation_template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Download official Excel template
  const downloadExcelTemplate = () => {
    const headers = [["Employee ID", "Employee Name", "Department", "Assigned Line", "Assignment Status", "Remarks"]];
    const sampleRows = [
      ["EMP-P001", "Rajesh Kumar", "Sewing", "Line 01", "Assigned", "Critical top stitcher"],
      ["EMP-P002", "Sunita Patel", "Sewing", "Line 01", "Assigned", "Collar specialist"],
      ["EMP-P005", "Anil Sharma", "Sewing", "Line 02", "Assigned", "Overlap expert"],
      ["EMP-P010", "Kriti Sen", "Sewing", "Floater", "Available for Replacement", "Multi-skilled floater"],
      ["EMP-P015", "Rahul Dev", "Sewing", "Unassigned", "Unassigned", "Sleeve attachment trainee"]
    ];
    const ws = XLSX.utils.aoa_to_sheet([...headers, ...sampleRows]);
    const max_width = [15, 20, 15, 15, 25, 35];
    ws['!cols'] = max_width.map(w => ({ wch: w }));
    
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Line Allocations");
    XLSX.writeFile(wb, "swm_workforce_line_allocation_template.xlsx");
  };

  // Export current active roster to Excel format
  const exportRosterToExcel = () => {
    if (lineAllocations.length === 0) {
      setErrorMsg("No active layouts to export.");
      return;
    }
    const headers = [["Employee ID", "Employee Name", "Department", "Assigned Line Code", "Deployment Status", "Active Operation", "Remarks"]];
    const rows = lineAllocations.map(alloc => {
      const matchedEmp = employees.find(e => e.id.toUpperCase() === alloc.employeeId.toUpperCase());
      const assignedLine = matchedEmp ? matchedEmp.lineNumber : alloc.assignedLine;
      const assignmentStatus = matchedEmp ? matchedEmp.workforceAssignmentStatus : alloc.assignmentStatus;
      const assignedOperation = (matchedEmp && matchedEmp.operationAssignment) ? matchedEmp.operationAssignment : (alloc.assignedOperation || 'Vacant');
      return [
        alloc.employeeId,
        alloc.employeeName,
        alloc.department || 'Sewing',
        assignedLine === 99 ? 'Floater Pool' : assignedLine > 0 ? `Line 0${assignedLine}` : 'Unassigned',
        assignmentStatus,
        assignedOperation || 'Vacant',
        alloc.remarks || ''
      ];
    });
    const ws = XLSX.utils.aoa_to_sheet([...headers, ...rows]);
    const max_width = [15, 22, 15, 20, 25, 25, 35];
    ws['!cols'] = max_width.map(w => ({ wch: w }));
    
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Active Layout Plan");
    XLSX.writeFile(wb, `swm_active_line_allocations_export.xlsx`);
    setSuccessMsg(`Successfully generated active workforce layout Excel export. Packed ${rows.length} rows.`);
  };

  // Safe manual CSV/TSV parsing
  const parseTextData = (text: string): LineAllocationEntry[] => {
    const lines = text.split(/\r?\n/);
    if (lines.length < 2) {
      throw new Error("Missing data rows in imported content.");
    }

    const header = lines[0].split(/[,\t]/).map(h => h.trim().toLowerCase());
    
    let idIdx = header.findIndex(h => h.includes('id') || h.includes('code'));
    let nameIdx = header.findIndex(h => h.includes('name'));
    let deptIdx = header.findIndex(h => h.includes('dept') || h.includes('department'));
    let lineIdx = header.findIndex(h => h.includes('line') || h.includes('assigned') || h.includes('number'));
    let statusIdx = header.findIndex(h => h.includes('status'));
    let remarksIdx = header.findIndex(h => h.includes('remarks') || h.includes('comment') || h.includes('note'));
    let opIdx = header.findIndex(h => h.includes('operation') || h.includes('target') || h.includes('task'));

    // Fallbacks
    if (idIdx === -1) idIdx = 0;
    if (nameIdx === -1) nameIdx = 1;
    if (deptIdx === -1) deptIdx = 2;
    if (lineIdx === -1) lineIdx = 3;
    if (statusIdx === -1) statusIdx = 4;
    if (remarksIdx === -1) remarksIdx = 5;

    const parsed: LineAllocationEntry[] = [];

    for (let i = 1; i < lines.length; i++) {
      const lineStr = lines[i].trim();
      if (!lineStr) continue;

      // Unpack CSV quoting
      const cells: string[] = [];
      let currentCell = '';
      let inQuotes = false;
      for (let c = 0; c < lineStr.length; c++) {
        const char = lineStr[c];
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if ((char === ',' || char === '\t') && !inQuotes) {
          cells.push(currentCell.trim());
          currentCell = '';
        } else {
          currentCell += char;
        }
      }
      cells.push(currentCell.trim());

      if (cells.length === 0 || !cells[idIdx]) continue;

      const empId = cells[idIdx].toUpperCase();
      const empName = cells[nameIdx] || 'Unknown Operator';
      const dept = cells[deptIdx] || 'Sewing';
      const rawLineStr = (cells[lineIdx] || '').toLowerCase().trim();
      
      let assignedLine = 0;
      if (rawLineStr.includes('floater') || rawLineStr === 'floater') {
        assignedLine = 99; // Floater code
      } else {
        const matchNum = rawLineStr.match(/\d+/);
        if (matchNum) {
          assignedLine = parseInt(matchNum[0]);
        } else if (rawLineStr === '1' || rawLineStr === '2' || rawLineStr === '3' || rawLineStr === '4' || rawLineStr === '5') {
          assignedLine = parseInt(rawLineStr);
        }
      }

      const rawStatus = (cells[statusIdx] || '').trim().toLowerCase();
      let status: WorkforceAssignmentStatus = 'Assigned';
      if (assignedLine === 0) {
        status = 'Unassigned';
      } else if (rawStatus.includes('replacement') || rawStatus.includes('available')) {
        status = 'Available for Replacement';
      } else if (rawStatus.includes('training')) {
        status = 'Training';
      } else if (rawStatus.includes('leave')) {
        status = 'Leave';
      }

      const assignedOp = opIdx !== -1 ? (cells[opIdx] || '') : '';

      parsed.push({
        employeeId: empId,
        employeeName: empName,
        department: dept,
        assignedLine: assignedLine,
        assignmentStatus: status,
        remarks: cells[remarksIdx] || '',
        assignedOperation: assignedOp
      });
    }

    return parsed;
  };

  const processTextParsing = (rawText: string) => {
    try {
      setErrorMsg(null);
      const parsed = parseTextData(rawText);
      if (parsed.length === 0) {
        throw new Error("No valid database records found in uploaded file.");
      }
      uploadLineAllocationsFile(parsed);
      setSuccessMsg(`Ingested successfully! Processed ${parsed.length} official line allocations.`);
      setMode('view');
    } catch (err: any) {
      setErrorMsg(err.message || 'File parsing failed. Please check the columns and formatting.');
    }
  };

  const processUploadFile = (file: File) => {
    const fileName = file.name.toLowerCase();
    const isExcel = fileName.endsWith('.xlsx') || fileName.endsWith('.xls');

    if (isExcel) {
      const arrayBufferReader = new FileReader();
      arrayBufferReader.onload = (event) => {
        try {
          setErrorMsg(null);
          const data = new Uint8Array(event.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          
          const firstSheetName = workbook.SheetNames[0];
          if (!firstSheetName) {
            throw new Error("No worksheets found in uploaded Excel file.");
          }
          
          const worksheet = workbook.Sheets[firstSheetName];
          const csvText = XLSX.utils.sheet_to_csv(worksheet);
          
          const parsed = parseTextData(csvText);
          if (parsed.length === 0) {
            throw new Error("No valid records found in Excel spreadsheet.");
          }
          
          uploadLineAllocationsFile(parsed);
          setSuccessMsg(`Ingested successfully from Excel! Processed ${parsed.length} official line allocations.`);
          setMode('view');
        } catch (err: any) {
          setErrorMsg(err.message || 'Excel parsing failed. Check format, headers, and sheet schema.');
        }
      };
      arrayBufferReader.readAsArrayBuffer(file);
    } else {
      const textReader = new FileReader();
      textReader.onload = (event) => {
        const text = event.target?.result as string;
        processTextParsing(text);
      };
      textReader.readAsText(file);
    }
  };

  // Drag handlers
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
      processUploadFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      processUploadFile(e.target.files[0]);
    }
  };

  const handlePasteSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pastedText.trim()) {
      setErrorMsg("Please paste tab or comma separated values.");
      return;
    }
    processTextParsing(pastedText);
  };

  const handleResetToDefaults = () => {
    if (confirm("Are you sure you want to reset line allocations to factory default values? This will erase any uploaded allocation mapping.")) {
      const defaults = employees.map(emp => {
        const isFloater = (emp.department || '').toLowerCase().includes('floater') || emp.lineNumber === 10 || emp.lineNumber === 99;
        const resolvedLine = isFloater ? 99 : (emp.lineNumber || 0);
        return {
          employeeId: emp.id,
          employeeName: emp.name,
          department: emp.department,
          assignedLine: resolvedLine,
          assignmentStatus: emp.workforceAssignmentStatus || (resolvedLine > 0 ? 'Assigned' : 'Unassigned'),
          remarks: 'Restored factory default',
          assignedOperation: emp.operationAssignment || ''
        } as LineAllocationEntry;
      });
      uploadLineAllocationsFile(defaults);
      setSuccessMsg("Restored factory default configuration successfully.");
    }
  };

  // Modify individual row assignment status
  const handleToggleStatus = (empId: string, current: WorkforceAssignmentStatus) => {
    const nextStatus: WorkforceAssignmentStatus = 
      current === 'Assigned' ? 'Available for Replacement' :
      current === 'Available for Replacement' ? 'Training' : 'Assigned';
    
    setLineAllocations(prev => prev.map(item => {
      if (item.employeeId === empId) {
        return { ...item, assignmentStatus: nextStatus };
      }
      return item;
    }));
  };

  // Line allocations calculations
  const stats = React.useMemo(() => {
    const total = lineAllocations.length;
    const lineAllocCounts: { [key: string]: number } = { 'Floater': 0, 'Unassigned': 0 };
    productionLines.forEach(line => {
      lineAllocCounts[`Line ${line.id}`] = 0;
    });
    
    lineAllocations.forEach(alloc => {
      const matchedEmp = employees.find(e => e.id.toUpperCase() === alloc.employeeId.toUpperCase());
      const l = matchedEmp ? matchedEmp.lineNumber : alloc.assignedLine;
      if (l === 99) {
        lineAllocCounts['Floater']++;
      } else if (productionLines.some(line => line.id === l)) {
        lineAllocCounts[`Line ${l}`]++;
      } else {
        lineAllocCounts['Unassigned']++;
      }
    });

    return { total, ...lineAllocCounts };
  }, [lineAllocations, employees, productionLines]);

  // Filter lineAllocations for search and line
  const filtered = React.useMemo(() => {
    return lineAllocations.map(alloc => {
      const matchedEmp = employees.find(e => e.id.toUpperCase() === alloc.employeeId.toUpperCase());
      return {
        ...alloc,
        assignedLine: matchedEmp ? matchedEmp.lineNumber : alloc.assignedLine,
        assignmentStatus: matchedEmp ? matchedEmp.workforceAssignmentStatus : alloc.assignmentStatus,
        assignedOperation: (matchedEmp && matchedEmp.operationAssignment) ? matchedEmp.operationAssignment : (alloc.assignedOperation || '')
      };
    }).filter(alloc => {
      const matchSearch = 
        alloc.employeeId.toLowerCase().includes(searchTerm.toLowerCase()) ||
        alloc.employeeName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (alloc.department || '').toLowerCase().includes(searchTerm.toLowerCase());
      
      if (!matchSearch) return false;

      if (filterLine === 'All') return true;
      if (filterLine === '99') return alloc.assignedLine === 99;
      if (filterLine === '0') return alloc.assignedLine === 0 || !alloc.assignedLine;
      return alloc.assignedLine === parseInt(filterLine);
    });
  }, [lineAllocations, employees, searchTerm, filterLine]);

  return (
    <div id="line_alloc_config_center" className="space-y-6">
      
      {/* Dynamic Upper Hero */}
      <div className="bg-slate-900 text-white rounded-3xl p-6 relative overflow-hidden shadow-xl border border-slate-850">
        <div className="absolute right-0 top-0 translate-x-12 -translate-y-12 w-64 h-64 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute left-1/3 bottom-0 w-48 h-48 bg-emerald-600/5 rounded-full blur-2xl pointer-events-none" />

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-800 text-slate-300 border border-slate-700 font-mono text-[9.5px]">
              <Layers className="w-3.5 h-3.5 text-blue-400" />
              <span>INDUSTRIAL ENGINEERING WORKSPACE</span>
            </div>
            <h1 className="font-display font-black text-2xl tracking-tight text-white">
              Line Allocation Configuration Center
            </h1>
            <p className="text-xs text-slate-400 max-w-2xl leading-relaxed">
              Upload, edit, and establish the official plant workforce layout. Under SWM, this module acts as the <strong>absolute source of truth</strong> for production line ownership. Automations or skills inference are strictly locked out.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button 
              type="button"
              onClick={downloadExcelTemplate}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold flex items-center gap-2 transition active:scale-95 shadow-md shadow-blue-900/20"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Get Excel Template</span>
            </button>

            <button 
              type="button"
              onClick={downloadCSVTemplate}
              className="px-4 py-2 bg-slate-850 hover:bg-slate-800 border border-slate-750 rounded-xl text-xs font-semibold flex items-center gap-2 transition active:scale-95 text-slate-300"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Get CSV Template</span>
            </button>

            <button 
              type="button"
              onClick={exportRosterToExcel}
              className="px-4 py-2 bg-slate-850 hover:bg-slate-800 border border-slate-750 rounded-xl text-xs font-semibold flex items-center gap-2 transition active:scale-95 text-slate-300"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
              <span>Export to Excel</span>
            </button>

            <button 
              type="button"
              onClick={handleResetToDefaults}
              className="px-4 py-2 bg-slate-850 hover:bg-red-950/20 hover:text-red-300 border border-slate-750 hover:border-red-900/30 rounded-xl text-xs font-semibold flex items-center gap-2 transition active:scale-95 text-slate-300"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Reset to Defaults</span>
            </button>
          </div>
        </div>
      </div>

      {/* Notifications banner */}
      {successMsg && (
        <div className="bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200/50 dark:border-emerald-900/30 p-4 rounded-2xl flex items-start gap-3 relative">
          <CheckCircle className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" />
          <div className="text-xs text-emerald-800 dark:text-emerald-400 font-medium">
            {successMsg}
          </div>
          <button 
            type="button" 
            onClick={() => setSuccessMsg(null)}
            className="absolute top-4 right-4 text-emerald-500 hover:text-emerald-700 font-mono text-xs"
          >
            ×
          </button>
        </div>
      )}

      {errorMsg && (
        <div className="bg-rose-50 dark:bg-rose-950/20 border border-rose-200/50 dark:border-rose-900/30 p-4 rounded-2xl flex items-start gap-3 relative">
          <AlertCircle className="w-4 h-4 text-rose-500 mt-0.5 flex-shrink-0" />
          <div className="text-xs text-rose-800 dark:text-rose-400 font-medium">
            {errorMsg}
          </div>
          <button 
            type="button" 
            onClick={() => setErrorMsg(null)}
            className="absolute top-4 right-4 text-rose-500 hover:text-rose-700 font-mono text-xs"
          >
            ×
          </button>
        </div>
      )}

      {/* Factory Floor Layout Metrics (Visual Bento Stats) */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3.5">
        {(() => {
          const getLineColor = (id: number) => {
            const colors = [
              'border-blue-500/20 bg-blue-50/20 dark:bg-blue-950/10',     // Line 1
              'border-amber-500/20 bg-amber-50/20 dark:bg-amber-950/10',   // Line 2
              'border-orange-500/20 bg-orange-50/20 dark:bg-orange-950/10', // Line 3
              'border-emerald-500/20 bg-emerald-50/20 dark:bg-emerald-950/10', // Line 4
              'border-indigo-500/20 bg-indigo-50/20 dark:bg-indigo-950/10'  // Line 5
            ];
            return colors[(id - 1) % colors.length];
          };

          const items = [
            ...productionLines.map(line => ({
              label: `Line ${line.id < 10 ? `0${line.id}` : line.id} Ownership`,
              count: stats[`Line ${line.id}`] || 0,
              color: getLineColor(line.id)
            })),
            { label: 'Floater Pool', count: stats['Floater'] || 0, color: 'border-purple-500/20 bg-purple-50/20 dark:bg-purple-950/10' },
            { label: 'Unassigned Pool', count: stats['Unassigned'] || 0, color: 'border-slate-300 bg-slate-50 dark:bg-slate-900' },
            { label: 'Total Ingested', count: stats.total, color: 'col-span-1 border-slate-900 bg-slate-900 text-white dark:border-slate-800 dark:bg-slate-900' }
          ];

          return items.map((item, idx) => (
            <div key={idx} className={`p-3.5 rounded-2xl border flex flex-col justify-between shadow-sm ${item.color}`}>
              <span className="text-[10px] font-bold text-slate-400 leading-none truncate block">{item.label}</span>
              <span className={`text-xl font-black block mt-2 ${idx === items.length - 1 ? 'text-blue-400' : 'text-slate-800 dark:text-slate-100'}`}>
                {item.count}
              </span>
            </div>
          ));
        })()}
      </div>

      {/* Sub-tab options: View Roster vs. Ingest Excel/CSV */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800">
        
        <div className="flex border-b border-slate-100 dark:border-slate-800 p-4 justify-between items-center flex-wrap gap-4">
          <div className="flex gap-2 bg-slate-50 dark:bg-slate-950 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => setMode('view')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${mode === 'view' ? 'bg-white dark:bg-slate-905 text-slate-850 dark:text-neutral-100 shadow-sm' : 'text-slate-450 hover:text-slate-700'}`}
            >
              <Table className="w-3.5 h-3.5" />
              <span>Allocated Roster ({filtered.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setMode('upload')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${mode === 'upload' ? 'bg-white dark:bg-slate-905 text-slate-850 dark:text-neutral-100 shadow-sm' : 'text-slate-450 hover:text-slate-700'}`}
            >
              <UploadCloud className="w-3.5 h-3.5" />
              <span>Import CSV/Excel File</span>
            </button>

            <button
              type="button"
              onClick={() => setMode('paste')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${mode === 'paste' ? 'bg-white dark:bg-slate-905 text-slate-850 dark:text-neutral-100 shadow-sm' : 'text-slate-450 hover:text-slate-700'}`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Paste Data Grid</span>
            </button>
          </div>

          {mode === 'view' && (
            <div className="flex items-center gap-2">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-slate-400" />
                <input 
                  type="text" 
                  placeholder="Search Employee ID/Name..." 
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="pl-8 pr-3 py-1.5 rounded-xl text-xs bg-slate-50 dark:bg-slate-950 border border-slate-150 dark:border-slate-805 text-slate-700 dark:text-slate-200 focus:outline-none w-52 focus:ring-1 focus:ring-blue-500"
                />
              </div>

              {/* Line Filter */}
              <select
                value={filterLine}
                onChange={e => setFilterLine(e.target.value)}
                className="bg-slate-50 dark:bg-slate-950 border border-slate-150 dark:border-slate-805 text-xs py-1.5 px-3 rounded-xl focus:outline-none focus:ring-1 focus:ring-blue-500 text-slate-700 dark:text-slate-200"
              >
                <option value="All">All Lines</option>
                {productionLines.map(line => (
                  <option key={line.id} value={String(line.id)}>Line {line.id < 10 ? `0${line.id}` : line.id}</option>
                ))}
                <option value="99">Floater Pool</option>
                <option value="0">Unassigned Pool</option>
              </select>
            </div>
          )}
        </div>

        {/* MODE: VIEW allocated roster table */}
        {mode === 'view' && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500 font-mono text-[10px] uppercase border-b border-slate-100 dark:border-slate-800">
                <tr>
                  <th className="py-3 px-4">Operator Code</th>
                  <th className="py-3 px-4">Operator Name</th>
                  <th className="py-3 px-4">Primary Department</th>
                  <th className="py-3 px-4">Assigned Line Code</th>
                  <th className="py-3 px-4">Operation Target</th>
                  <th className="py-3 px-4">Deployment Status</th>
                  <th className="py-3 px-4">Remarks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-400">
                      <Info className="w-5 h-5 mx-auto text-slate-300 mb-2" />
                      <span>No mappings found matching custom parameters. Choose "Import File" above to setup your layout.</span>
                    </td>
                  </tr>
                ) : (
                  filtered.map((item) => (
                    <tr key={item.employeeId} className="hover:bg-slate-50/50 dark:hover:bg-slate-950/20 transition">
                      <td className="py-3.5 px-4 font-mono font-bold text-slate-800 dark:text-slate-200">
                        {item.employeeId}
                      </td>
                      <td className="py-3.5 px-4 font-semibold text-slate-700 dark:text-slate-300">
                        {item.employeeName}
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-[10px] font-mono font-medium text-slate-605 text-slate-500">
                          {item.department || 'Sewing'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 font-mono">
                        {item.assignedLine === 99 ? (
                          <span className="text-purple-600 dark:text-purple-400 font-bold">★ Floater Pool</span>
                        ) : item.assignedLine > 0 ? (
                          <span className="text-blue-600 dark:text-blue-400 font-semibold">Line 0{item.assignedLine}</span>
                        ) : (
                          <span className="text-slate-400 italic">Unassigned</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        {item.assignedOperation ? (
                          <span className="font-mono text-slate-700 dark:text-slate-300 font-medium px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400">
                            {item.assignedOperation}
                          </span>
                        ) : (
                          <span className="text-amber-500 dark:text-amber-400 font-semibold italic flex items-center gap-1">
                            ⚠️ Vacant
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        <button
                          type="button"
                          onClick={() => handleToggleStatus(item.employeeId, item.assignmentStatus)}
                          className={`px-2 py-0.5 rounded-md font-mono text-[10px] transition font-bold leading-normal ${
                            item.assignmentStatus === 'Assigned' 
                              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400' 
                              : item.assignmentStatus === 'Available for Replacement' 
                                ? 'bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-400'
                                : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                          }`}
                        >
                          {item.assignmentStatus}
                        </button>
                      </td>
                      <td className="py-3.5 px-4 text-slate-400 italic truncate max-w-xs">
                        {item.remarks || '-'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* MODE: IMPORT FILE DRAG-AND-DROP */}
        {mode === 'upload' && (
          <div className="p-8 max-w-xl mx-auto space-y-6">
            <h3 className="font-display font-bold text-slate-800 dark:text-slate-200 text-sm">Upload Official Line Allocations Excel/CSV File</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Import your workforce deployment grid directly from an MS Excel spreadsheet (<code className="font-mono text-emerald-500">*.xlsx</code>, <code className="font-mono text-emerald-500">*.xls</code>) or Comma Separated CSV. Required headers inside the first worksheet: <code className="bg-slate-100 dark:bg-slate-950 p-1 px-1.5 rounded font-mono text-blue-500">Employee ID, Employee Name, Department, Assigned Line, Assignment Status, Remarks</code>.
            </p>

            <div 
              onDragEnter={handleDrag}
              onDragOver={handleDrag}
              onDragLeave={handleDrag}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-3xl p-10 text-center cursor-pointer transition flex flex-col items-center justify-center gap-3 ${dragActive ? 'border-blue-500 bg-blue-50/10' : 'border-slate-205 hover:border-slate-400 dark:border-slate-800 dark:hover:border-slate-700 bg-slate-50/50 dark:bg-slate-950/30'}`}
            >
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileChange}
                accept=".xlsx,.xls,.csv,.tsv,.txt"
                className="hidden" 
              />
              
              <UploadCloud className="w-10 h-10 text-blue-500 animate-pulse" />
              <div>
                <strong className="block text-slate-700 dark:text-slate-200 text-xs">Drag and drop Excel or CSV allocation file here</strong>
                <span className="text-[10px] text-slate-400 block mt-1">or click to browse local folders</span>
              </div>
            </div>

            <div className="flex bg-slate-50 dark:bg-slate-950 p-4 rounded-2xl gap-3">
              <Info className="w-4 h-4 text-slate-500 mt-0.5 flex-shrink-0" />
              <div className="text-[10.5px] text-slate-400 leading-relaxed space-y-1">
                <p className="font-bold text-slate-650 dark:text-slate-350">Format Constraints & Ingestion Rules:</p>
                <p>1. If active line field is empty, the parser automatically flags the employee as <strong className="text-slate-650 dark:text-slate-350">Unassigned</strong>.</p>
                <p>2. Values like <code className="bg-slate-150 p-0.5 rounded text-purple-600 dark:text-purple-400 font-bold dark:bg-slate-900 font-mono text-[9px]">Floater</code> map operators to the active Floater Replacement pool pool.</p>
                <p>3. Uploading a configuration will overwrite previous workforce layout records, cleanly generating the updated assignment grid.</p>
              </div>
            </div>
          </div>
        )}

        {/* MODE: PASTE CSV DATA GRID */}
        {mode === 'paste' && (
          <form onSubmit={handlePasteSubmit} className="p-8 max-w-xl mx-auto space-y-4">
            <h3 className="font-display font-bold text-slate-800 dark:text-slate-200 text-sm">Paste Spreadsheet Grid Rows</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Copy-paste rows from Microsoft Excel or Google Sheets straight into the field below. Ensure header keys exist on row 1.
            </p>

            <textarea
              rows={8}
              value={pastedText}
              onChange={e => setPastedText(e.target.value)}
              placeholder="Employee ID&#9;Employee Name&#9;Department&#9;Assigned Line&#9;Assignment Status&#9;Remarks&#10;EMP-P001&#9;Rajesh Kumar&#9;Sewing&#9;Line 01&#9;Assigned&#9;Top Performer"
              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 font-mono text-[11px] focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-slate-700 dark:text-slate-200"
            />

            <div className="flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setPastedText('')}
                className="px-4 py-2 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 rounded-xl text-xs font-semibold"
              >
                Clear Field
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold shadow-md active:scale-95 transition"
              >
                Parse & Upload Grid
              </button>
            </div>
          </form>
        )}

      </div>
    </div>
  );
};
