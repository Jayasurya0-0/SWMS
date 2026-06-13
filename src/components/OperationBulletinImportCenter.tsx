/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import { useAppState } from '../contexts/StateContext';
import { GarmentStyle, FactoryOperation, GarmentOperationSequenceItem, SkillLevel } from '../types';
import { 
  X, Check, AlertTriangle, Info, FileSpreadsheet, Download, RefreshCw, 
  Layers, Settings, UserCheck, HelpCircle, ArrowRight, Save, History, 
  Trash2, Upload, Calendar, CheckCircle2, ChevronRight, BarChart
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import * as XLSX from 'xlsx';

interface OperationBulletinImportCenterProps {
  isOpen: boolean;
  onClose: () => void;
  triggerToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

interface ImportFileRow {
  rowNum: number;
  garmentName: string;
  category: string;
  seqNumber: number;
  opCode?: string;
  opName: string;
  departmentName: string;
  machineType: string;
  smv: number;
  targetEfficiency: number;
  remarks: string;
}

interface ValidationIssue {
  rowNum?: number;
  severity: 'error' | 'warning';
  column?: string;
  message: string;
}

interface MappingDecision {
  tempId: string; // row unique identifier
  uploadedOpName: string;
  uploadedSMV: number;
  uploadedMachineType: string;
  uploadedCategory: string;
  seqNumber: number;
  departmentName: string;
  targetEfficiency: number;
  remarks: string;
  
  // Mapping Strategy
  strategy: 'create_new' | 'link_existing';
  selectedOpCode: string; // empty if create_new
  suggestionScore: number;
  suggestedOpName?: string;
}

interface ImportHistoryItem {
  id: string;
  filename: string;
  importDate: string;
  styleId: string;
  garmentName: string;
  totalOperations: number;
  totalSMV: number;
  createdOpsCount: number;
  linkedOpsCount: number;
  errorsCount: number;
  status: 'Completed' | 'Failed';
}

export const OperationBulletinImportCenter: React.FC<OperationBulletinImportCenterProps> = ({
  isOpen,
  onClose,
  triggerToast
}) => {
  const {
    departments,
    operations: masterOperations,
    garmentStyles,
    addOperation,
    addGarmentStyle,
    updateGarmentStyle,
    selectGarmentStyle,
    addNotification
  } = useAppState();

  // Dialog inner subtab
  const [activeTab, setActiveTab] = useState<'upload' | 'mapping' | 'history'>('upload');

  // Drag & drop highlight state
  const [isDragging, setIsDragging] = useState(false);

  // File parsing states
  const [uploadedFilename, setUploadedFilename] = useState('');
  const [parsedRows, setParsedRows] = useState<ImportFileRow[]>([]);
  const [detectedGarments, setDetectedGarments] = useState<string[]>([]);
  const [selectedGarment, setSelectedGarment] = useState<string>('');

  // Validation report
  const [validationIssues, setValidationIssues] = useState<ValidationIssue[]>([]);
  
  // Mapping engine choices
  const [mappingDecisions, setMappingDecisions] = useState<MappingDecision[]>([]);

  // Local storage Import history
  const [importHistory, setImportHistory] = useState<ImportHistoryItem[]>([]);

  // Load history from localStorage
  useEffect(() => {
    const cached = localStorage.getItem('swm_bulletin_import_history');
    if (cached) {
      try {
        setImportHistory(JSON.parse(cached));
      } catch (e) {
        console.error('Failed to parse bulletin import history', e);
      }
    }
  }, []);

  // Save history to localStorage
  const saveHistory = (items: ImportHistoryItem[]) => {
    setImportHistory(items);
    localStorage.setItem('swm_bulletin_import_history', JSON.stringify(items));
  };

  // String similarity analyzer (Jaccard + contains match)
  const calculateTextSimilarity = (str1: string, str2: string): number => {
    const s1 = str1.toLowerCase().trim();
    const s2 = str2.toLowerCase().trim();
    
    if (s1 === s2) return 1.0;
    if (s1.includes(s2) || s2.includes(s1)) return 0.85;

    // Tokenized Jaccard Similarity
    const stopWords = ['stitch', 'stitching', 'join', 'joining', 'hem', 'hemming', 'attach', 'attaching', 'sew', 'sewing', 'collar', 'sleeve', 'machine'];
    const tokens1 = s1.split(/[\s_\-/]+/).filter(w => w.length > 2 && !stopWords.includes(w));
    const tokens2 = s2.split(/[\s_\-/]+/).filter(w => w.length > 2 && !stopWords.includes(w));

    if (tokens1.length === 0 || tokens2.length === 0) return 0;

    const set1 = new Set(tokens1);
    const set2 = new Set(tokens2);
    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);

    return intersection.size / union.size;
  };

  // Find department ID by matching department string
  const findDepartmentId = (deptStr: string): string => {
    const clean = deptStr.toLowerCase().trim();
    if (!clean) return 'DEPT01'; // Default: Sewing

    const match = departments.find(d => 
      d.name.toLowerCase() === clean || 
      d.id.toLowerCase() === clean ||
      clean.includes(d.name.toLowerCase()) ||
      d.name.toLowerCase().includes(clean)
    );

    return match ? match.id : 'DEPT01';
  };

  // Generate Excel Template
  const downloadTemplate = () => {
    const headers = [
      'Garment Name', 
      'Garment Category', 
      'Operation Sequence Number', 
      'Operation Code', 
      'Operation Name', 
      'Department', 
      'Machine Type', 
      'SMV (Standard Minute Value)', 
      'Target Efficiency', 
      'Remarks'
    ];
    
    // Sample high fidelity rows
    const sampleData = [
      {
        'Garment Name': 'Classic Fit Polo Shirt',
        'Garment Category': 'Polo Shirt',
        'Operation Sequence Number': 1,
        'Operation Code': 'OP-SEW-01',
        'Operation Name': 'Collar Join',
        'Department': 'Sewing',
        'Machine Type': 'Overlock 4-Thread',
        'SMV (Standard Minute Value)': 1.25,
        'Target Efficiency': 80,
        'Remarks': 'Verify neck standard width before join'
      },
      {
        'Garment Name': 'Classic Fit Polo Shirt',
        'Garment Category': 'Polo Shirt',
        'Operation Sequence Number': 2,
        'Operation Code': 'OP-SEW-02',
        'Operation Name': 'Sleeve Hemming',
        'Department': 'Sewing',
        'Machine Type': 'Flatlock 3-Needle',
        'SMV (Standard Minute Value)': 0.90,
        'Target Efficiency': 85,
        'Remarks': 'Folder width 1.5 cm'
      },
      {
        'Garment Name': 'Classic Fit Polo Shirt',
        'Garment Category': 'Polo Shirt',
        'Operation Sequence Number': 3,
        'Operation Code': '', // Check optional handling
        'Operation Name': 'Side Seam Closing',
        'Department': 'Sewing',
        'Machine Type': 'Overlock 4-Thread',
        'SMV (Standard Minute Value)': 1.45,
        'Target Efficiency': 75,
        'Remarks': 'Thread matched with shell fabric details'
      },
      {
        'Garment Name': 'Premium Jogger Trousers',
        'Garment Category': 'Trousers',
        'Operation Sequence Number': 1,
        'Operation Code': 'OP-TR-01',
        'Operation Name': 'Pocket Attach',
        'Department': 'Sewing',
        'Machine Type': 'Single Needle Lockstitch',
        'SMV (Standard Minute Value)': 1.80,
        'Target Efficiency': 80,
        'Remarks': 'Check visual alignments'
      }
    ];

    const ws = XLSX.utils.json_to_sheet(sampleData, { header: headers });
    
    // Make column widths look beautiful
    const wscols = [
      { wch: 25 }, // Garment Name
      { wch: 18 }, // Garment Category
      { wch: 25 }, // Operation Sequence Number
      { wch: 16 }, // Operation Code
      { wch: 25 }, // Operation Name
      { wch: 15 }, // Department
      { wch: 22 }, // Machine Type
      { wch: 28 }, // SMV
      { wch: 18 }, // Target Efficiency
      { wch: 30 }  // Remarks
    ];
    ws['!cols'] = wscols;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'IE Operation List');
    XLSX.writeFile(wb, 'SWM_Operation_Bulletin_Template.xlsx');
    triggerToast('Bulletin Excel template downloaded successfully.');
  };

  // Handle excel drag & drop
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls') || file.name.endsWith('.csv')) {
        parseUploadedFile(file);
      } else {
        triggerToast('Invalid file format. Please upload spreadsheet files (.xlsx, .xls, .csv).', 'error');
      }
    }
  };

  // Parse Upload Flow
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      parseUploadedFile(file);
    }
  };

  const parseUploadedFile = (file: File) => {
    setUploadedFilename(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const buffer = e.target?.result;
        const workbook = XLSX.read(buffer, { type: 'binary' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json<any>(worksheet);

        if (jsonData.length === 0) {
          triggerToast('Uploaded file appears to be empty!', 'error');
          return;
        }

        processParsedData(jsonData);
      } catch (error: any) {
        triggerToast(`Parser Error: ${error.message}`, 'error');
      }
    };
    reader.readAsBinaryString(file);
  };

  // Columns & data normalizer
  const processParsedData = (rawRows: any[]) => {
    const issuesList: ValidationIssue[] = [];
    const normalizedRows: ImportFileRow[] = [];
    const garmentsSet = new Set<string>();

    rawRows.forEach((row, index) => {
      const rowNum = index + 2; // Row offset (includes Excel header row + 1-indexed)

      // Normalize row keys (handling case differences)
      const garmentName = String(row['Garment Name'] || row['garment name'] || row['GarmentName'] || row['Style Name'] || '').trim();
      const category = String(row['Garment Category'] || row['garment category'] || row['GarmentCategory'] || row['Type'] || 'Polo Shirt').trim();
      
      const rawSeq = row['Operation Sequence Number'] || row['sequence'] || row['Sequence'] || row['Seq'] || row['seqNumber'];
      const seqNumber = parseInt(rawSeq);

      const opCode = String(row['Operation Code'] || row['operation code'] || row['OperationCode'] || row['Code'] || '').trim();
      const opName = String(row['Operation Name'] || row['operation name'] || row['OperationName'] || row['Operation'] || '').trim();
      const departmentName = String(row['Department'] || row['department'] || row['Dept'] || 'Sewing').trim();
      const machineType = String(row['Machine Type'] || row['machine type'] || row['MachineType'] || row['Machine'] || 'Single Needle Lockstitch').trim();
      
      const rawSMV = row['SMV (Standard Minute Value)'] || row['Standard Minute Value (SMV)'] || row['smv'] || row['SMV'] || row['Standard Minute Value'] || row['SMV Value'] || row['SMV_Value'] || row['smv value'];
      const smv = parseFloat(rawSMV);

      const rawEfficiency = row['Target Efficiency'] || row['efficiency'] || row['Target Efficiency %'] || 80;
      const targetEfficiency = parseInt(rawEfficiency) || 80;

      const remarks = String(row['Remarks'] || row['remarks'] || row['Comment'] || '').trim();

      // Basic Validation Checkers
      if (!garmentName) {
        issuesList.push({ rowNum, severity: 'error', column: 'Garment Name', message: 'Garment Name is empty or missing.' });
      }

      if (isNaN(seqNumber) || seqNumber <= 0) {
        issuesList.push({ rowNum, severity: 'error', column: 'Operation Sequence Number', message: 'Sequence number must be a positive integer.' });
      }

      if (!opName) {
        issuesList.push({ rowNum, severity: 'error', column: 'Operation Name', message: 'Operation Name is required.' });
      }

      if (isNaN(smv) || smv < 0) {
        issuesList.push({ rowNum, severity: 'error', column: 'SMV', message: 'SMV (Standard Minute Value) must be a positive decimal.' });
      } else if (smv === 0) {
        issuesList.push({ rowNum, severity: 'warning', column: 'SMV', message: 'SMV is specified as 0. This will not add standard time to the garment.' });
      }

      if (targetEfficiency <= 30 || targetEfficiency > 100) {
        issuesList.push({ rowNum, severity: 'warning', column: 'Target Efficiency', message: `Unusual Target Efficiency (${targetEfficiency}%). Defaulting to 80% if invalid.` });
      }

      if (garmentName) {
        garmentsSet.add(garmentName);
      }

      // Add to array if no fatal structural issue prevents mapping
      if (garmentName && opName && !isNaN(seqNumber)) {
        normalizedRows.push({
          rowNum,
          garmentName,
          category,
          seqNumber,
          opCode: opCode || undefined,
          opName,
          departmentName,
          machineType,
          smv: smv || 0.1,
          targetEfficiency: targetEfficiency || 80,
          remarks
        });
      }
    });

    // Check duplicate sequence order inside rows
    const uniqueSeqs = new Set<string>();
    normalizedRows.forEach(r => {
      const key = `${r.garmentName}-${r.seqNumber}`;
      if (uniqueSeqs.has(key)) {
        issuesList.push({
          rowNum: r.rowNum,
          severity: 'warning',
          column: 'Operation Sequence Number',
          message: `Duplicate sequence order #${r.seqNumber} detected in Garment style "${r.garmentName}".`
        });
      } else {
        uniqueSeqs.add(key);
      }
    });

    setParsedRows(normalizedRows);
    setValidationIssues(issuesList);
    
    const detectedNames = Array.from(garmentsSet);
    setDetectedGarments(detectedNames);
    
    if (detectedNames.length > 0) {
      setSelectedGarment(detectedNames[0]);
    }

    triggerToast(`File loaded successfully. Detected ${detectedNames.length} styles, ${normalizedRows.length} total operations parsed.`);
  };

  // Compile decisions for selected Garment
  useEffect(() => {
    if (!selectedGarment) return;

    const filteredRows = parsedRows.filter(r => r.garmentName === selectedGarment);
    
    // Standardize mapping decisions
    const decisions: MappingDecision[] = filteredRows.map((r, index) => {
      const tempId = `imported-row-${r.rowNum}-${index}`;

      // Search fuzzily for similar master operations
      let bestMatch: FactoryOperation | null = null;
      let highestScore = 0;

      masterOperations.forEach(mOp => {
        const score = calculateTextSimilarity(r.opName, mOp.name);
        if (score > highestScore) {
          highestScore = score;
          bestMatch = mOp;
        }
      });

      // Strategy heuristics: if similarity is high, auto-suggest linking to avoid duplicate mess
      const autoMatchEnabled = highestScore > 0.65;

      return {
        tempId,
        uploadedOpName: r.opName,
        uploadedSMV: r.smv,
        uploadedMachineType: r.machineType,
        uploadedCategory: r.category,
        seqNumber: r.seqNumber,
        departmentName: r.departmentName,
        targetEfficiency: r.targetEfficiency,
        remarks: r.remarks,
        strategy: autoMatchEnabled ? 'link_existing' : 'create_new',
        selectedOpCode: autoMatchEnabled && bestMatch ? (bestMatch as FactoryOperation).code : '',
        suggestionScore: highestScore,
        suggestedOpName: bestMatch ? (bestMatch as FactoryOperation).name : undefined
      };
    });

    // Sort decisions by sequence order
    decisions.sort((a,b) => a.seqNumber - b.seqNumber);
    setMappingDecisions(decisions);

    if (decisions.length > 0) {
      setActiveTab('mapping');
    }
  }, [selectedGarment, parsedRows]);

  // Handle Strategy change for a row
  const changeMappingStrategy = (tempId: string, strategy: 'create_new' | 'link_existing', opCode?: string) => {
    setMappingDecisions(prev => prev.map(d => {
      if (d.tempId === tempId) {
        return {
          ...d,
          strategy,
          selectedOpCode: strategy === 'link_existing' ? (opCode || d.selectedOpCode || masterOperations[0]?.code || '') : ''
        };
      }
      return d;
    }));
  };

  // Handle Selection Code mapping override
  const changeMappedOpCode = (tempId: string, opCode: string) => {
    setMappingDecisions(prev => prev.map(d => {
      if (d.tempId === tempId) {
        const match = masterOperations.find(o => o.code === opCode);
        return {
          ...d,
          selectedOpCode: opCode,
          suggestedOpName: match?.name
        };
      }
      return d;
    }));
  };

  // Calculate sum of SMV values
  const totalImportedSMV = useMemo(() => {
    return Number(mappingDecisions.reduce((sum, item) => sum + item.uploadedSMV, 0).toFixed(2));
  }, [mappingDecisions]);

  // Final Action: commit Bulletin compilation to Database
  const commitImportBulletin = () => {
    if (mappingDecisions.length === 0) {
      triggerToast('No operations to import!', 'error');
      return;
    }

    // Determine Garment style details
    const firstDecision = mappingDecisions[0];
    const categoryType = (firstDecision.uploadedCategory || 'Polo Shirt') as any;
    
    // Create logical ID based on name "Polo Blue Premium" -> "STY-POLO-BLUE-PREMIUM"
    const slug = selectedGarment.trim()
      .toUpperCase()
      .replace(/[^A-Z0-9\s]/g, '')
      .split(/\s+/)
      .slice(0, 5)
      .join('-');
    const styleId = `STY-BULLETIN-${slug || Date.now().toString().slice(-6)}`;

    // Prepare container registers
    let newlyCreatedOpsCount = 0;
    let linkedOpsCount = 0;

    const sequenceItems: GarmentOperationSequenceItem[] = [];

    // Processes mapping decisions and add master library items if needed
    mappingDecisions.forEach((d, idx) => {
      let finalOpCode = '';

      if (d.strategy === 'create_new') {
        newlyCreatedOpsCount++;
        // Generate neat unique operation code
        const numCode = String(masterOperations.length + newlyCreatedOpsCount).padStart(3, '0');
        finalOpCode = `OP-BULLETIN-${numCode}`;

        const newOp: FactoryOperation = {
          code: finalOpCode,
          name: d.uploadedOpName,
          departmentId: findDepartmentId(d.departmentName),
          skillCategory: d.uploadedSMV > 1.3 ? 'Grade A Operator' : d.uploadedSMV > 0.8 ? 'Grade B Operator' : 'Grade C Operator',
          smv: d.uploadedSMV,
          machineType: d.uploadedMachineType || 'Single Needle Lockstitch',
          targetEfficiency: d.targetEfficiency || 80,
          minSkillLevel: d.uploadedSMV > 1.3 ? 'Advanced' : 'Intermediate',
          status: 'Active'
        };

        // Add to state context master operations
        addOperation(newOp);
      } else {
        linkedOpsCount++;
        finalOpCode = d.selectedOpCode;
      }

      // Link operation to bulletin sequence
      const matchedMaster = masterOperations.find(o => o.code === finalOpCode) || {
        name: d.uploadedOpName,
        machineType: d.uploadedMachineType,
        departmentId: 'DEPT01',
        minSkillLevel: 'Intermediate' as SkillLevel
      };

      sequenceItems.push({
        operationCode: finalOpCode,
        name: matchedMaster.name,
        sequenceOrder: d.seqNumber || (idx + 1),
        smv: d.uploadedSMV,
        machineType: d.uploadedMachineType || matchedMaster.machineType || 'Single Needle Lockstitch',
        skillRequired: (matchedMaster as any).minSkillLevel || 'Intermediate',
        departmentId: matchedMaster.departmentId || 'DEPT01'
      });
    });

    // Make sure sequence numbers are sorted
    sequenceItems.sort((a,b) => a.sequenceOrder - b.sequenceOrder);

    // Assembly complete Garment Style
    const newGarmentStyle: GarmentStyle = {
      id: styleId,
      name: selectedGarment,
      type: categoryType,
      smv: totalImportedSMV,
      requiredManpower: Math.max(4, Math.round(totalImportedSMV * 1.15)),
      estimatedManpower: Math.max(3, Math.round(totalImportedSMV * 1.05)),
      description: `Imported via Operation Bulletin Import Center from file "${uploadedFilename}". Preserves sequence order.`,
      version: '1.0.0',
      isArchived: false,
      status: 'Active',
      operations: sequenceItems,
      linesAllocated: [1, 2], // Default allocates line 1 & 2
      createdAt: new Date().toISOString(),
      lastModifiedAt: new Date().toISOString()
    };

    // Check if garment already exists
    const duplicateIdIdx = garmentStyles.findIndex(g => g.name.toLowerCase() === selectedGarment.toLowerCase());
    
    if (duplicateIdIdx !== -1) {
      // Overwrite style specifications
      const existing = garmentStyles[duplicateIdIdx];
      const updatedStyle: GarmentStyle = {
        ...existing,
        smv: totalImportedSMV,
        operations: sequenceItems,
        lastModifiedAt: new Date().toISOString(),
        description: `Updated via Bulletin Import from file "${uploadedFilename}".`
      };
      updateGarmentStyle(updatedStyle);
      selectGarmentStyle(updatedStyle.id);
      triggerToast(`Re-imported. Overwrote existing "${selectedGarment}" with compiled Operation Bulletin successfully!`);
    } else {
      // Register brand new style
      addGarmentStyle(newGarmentStyle);
      selectGarmentStyle(newGarmentStyle.id);
      triggerToast(`Import Successful. Added new garment style "${selectedGarment}" to Factory register.`);
    }

    // Add milestone notification
    addNotification(
      'Milestone',
      'Bulletin Import Completed',
      `Imported style "${selectedGarment}" with ${sequenceItems.length} sequential operations. Total SMV is ${totalImportedSMV}m.`
    );

    // Save history audit log
    const logItem: ImportHistoryItem = {
      id: `HIST-${Date.now().toString()}`,
      filename: uploadedFilename,
      importDate: new Date().toLocaleString(),
      styleId: styleId,
      garmentName: selectedGarment,
      totalOperations: sequenceItems.length,
      totalSMV: totalImportedSMV,
      createdOpsCount: newlyCreatedOpsCount,
      linkedOpsCount: linkedOpsCount,
      errorsCount: validationIssues.filter(i => i.severity === 'error').length,
      status: 'Completed'
    };

    saveHistory([logItem, ...importHistory]);

    // Reset flow states
    setParsedRows([]);
    setValidationIssues([]);
    setMappingDecisions([]);
    setUploadedFilename('');
    setSelectedGarment('');

    // Go to upload tab or close
    onClose();
  };

  // Helper values
  const errorsList = validationIssues.filter(i => i.severity === 'error');
  const warningsList = validationIssues.filter(i => i.severity === 'warning');

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4" id="bulletin-import-center-modal">
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 max-w-5xl w-full rounded-2xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden text-slate-800 dark:text-slate-100"
          >
            {/* Header section with step badges */}
            <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-900/40">
              <div className="flex items-center gap-2.5">
                <span className="bg-blue-600 text-white p-2 rounded-xl">
                  <FileSpreadsheet className="h-5 w-5" />
                </span>
                <div>
                  <h3 className="text-lg font-bold tracking-tight">Operation Bulletin Import Center</h3>
                  <p className="text-xs text-slate-400 mt-0.5">Industrial Engineering Digitization Pipeline</p>
                </div>
              </div>

              {/* Step Navigation Bar */}
              <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
                <button
                  onClick={() => setActiveTab('upload')}
                  className={`text-xs px-3 py-1.5 font-bold rounded-lg transition-all flex items-center gap-1 ${
                    activeTab === 'upload' 
                      ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs' 
                      : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                  }`}
                >
                  <Upload className="h-3.5 w-3.5" />
                  <span>1. Upload File</span>
                </button>
                <button
                  disabled={mappingDecisions.length === 0}
                  onClick={() => setActiveTab('mapping')}
                  className={`text-xs px-3 py-1.5 font-bold rounded-lg transition-all flex items-center gap-1 ${
                    activeTab === 'mapping' 
                      ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs' 
                      : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 disabled:opacity-40 disabled:pointer-events-none'
                  }`}
                >
                  <Settings className="h-3.5 w-3.5" />
                  <span>2. Mapping Engine</span>
                </button>
                <button
                  onClick={() => setActiveTab('history')}
                  className={`text-xs px-3 py-1.5 font-bold rounded-lg transition-all flex items-center gap-1 ${
                    activeTab === 'history' 
                      ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs' 
                      : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                  }`}
                >
                  <History className="h-3.5 w-3.5" />
                  <span>3. Audit Logs</span>
                </button>
              </div>

              <button 
                onClick={onClose} 
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 p-1.5 rounded-full"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Modal Sub Content Panel */}
            <div className="flex-1 overflow-y-auto p-6">
              
              {/* TAB 1: UPLOAD AREA */}
              {activeTab === 'upload' && (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Instructions Card info */}
                    <div className="lg:col-span-1 space-y-4">
                      <div className="bg-blue-50/70 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/40 rounded-2xl p-4 space-y-3.5">
                        <div className="flex items-center gap-2">
                          <Info className="h-4.5 w-4.5 text-blue-600 dark:text-blue-300" />
                          <h4 className="text-sm font-bold text-blue-900 dark:text-blue-300">How to use Bulletin Import</h4>
                        </div>
                        <ul className="text-xs text-blue-800/80 dark:text-blue-400/90 space-y-2 list-disc pl-4 leading-relaxed">
                          <li>Download the standardized Excel workbook template using the helper button below.</li>
                          <li>Fill out the operation bulletin sequence matching your manufacturing layout specs.</li>
                          <li>Optionally input existing Standard codes to link them instantaneously to master databases.</li>
                          <li>Drag & drop the finished workbook file here to parse and standardise names.</li>
                        </ul>
                        
                        <button
                          onClick={downloadTemplate}
                          className="w-full mt-2 flex items-center justify-center gap-1.5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl text-xs transition-all shadow-xs"
                          id="download-ie-template-btn"
                        >
                          <Download className="h-4 w-4" />
                          <span>Download Excel Template</span>
                        </button>
                      </div>

                      {/* File Requirements Metrics */}
                      <div className="border border-slate-200 dark:border-slate-800 rounded-2xl p-4 bg-slate-50/50 dark:bg-slate-900/30">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-2">Required Table Schema</span>
                        <div className="flex flex-wrap gap-1.5">
                          {['Garment Name', 'Garment Category', 'Sequence #', 'Operation Name', 'Department', 'Machine Type', 'SMV value'].map(col => (
                            <span key={col} className="text-[10px] bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-2.5 py-1 rounded-lg text-slate-600 dark:text-slate-350 font-medium">
                              {col}
                            </span>
                          ))}
                        </div>
                        <p className="text-[10px] text-slate-400 mt-2.5">
                          * Target Efficiency, Operation Code, and Special remarks are fully optional columns.
                        </p>
                      </div>
                    </div>

                    {/* Drag-drop Core container */}
                    <div className="lg:col-span-2 space-y-4">
                      <div
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                        className={`border-2 border-dashed rounded-3xl p-8 flex flex-col items-center justify-center text-center transition-all min-h-[260px] relative ${
                          isDragging 
                            ? 'border-blue-500 bg-blue-50/15' 
                            : 'border-slate-300 dark:border-slate-750 hover:border-slate-400 dark:hover:border-slate-600 bg-slate-50/30'
                        }`}
                      >
                        <input
                          type="file"
                          id="bulletin-file-upload-input"
                          accept=".xlsx, .xls, .csv"
                          onChange={handleFileChange}
                          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        />
                        
                        <div className="p-4 bg-blue-50 dark:bg-slate-850 text-blue-600 dark:text-blue-400 rounded-2xl mb-3 shadow-xs">
                          <Upload className="h-7 w-7" />
                        </div>
                        <h4 className="text-sm font-bold dark:text-white">Upload Garment Operation Bulletin</h4>
                        <p className="text-xs text-slate-400 mt-1 max-w-sm">
                          Drag and drop your spreadsheet here, or click to browse local folders. Supports Excel files (.xlsx, .xls) and standard CSV outputs.
                        </p>
                        
                        {uploadedFilename && (
                          <div className="mt-4 px-3 py-1.5 bg-emerald-500/10 dark:bg-emerald-950/20 border border-emerald-500/20 text-emerald-600 text-xs rounded-xl font-bold flex items-center gap-1.5">
                            <Check className="h-4 w-4" />
                            <span>Active: {uploadedFilename}</span>
                          </div>
                        )}
                      </div>

                      {/* Validator Report Cards */}
                      {detectedGarments.length > 0 && (
                        <motion.div
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden bg-slate-500/5"
                        >
                          <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                            <div>
                              <span className="text-xs text-slate-400 block font-semibold">Multiple Garmet Styles found in Sheet:</span>
                              <strong className="text-xs text-slate-800 dark:text-white">
                                Total {detectedGarments.length} unique styles found. Select layout:
                              </strong>
                            </div>

                            <select
                              value={selectedGarment}
                              onChange={(e) => setSelectedGarment(e.target.value)}
                              className="px-3 py-1.5 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-xl text-xs text-slate-800 dark:text-white focus:outline-none shadow-xs font-semibold"
                            >
                              {detectedGarments.map(g => (
                                <option key={g} value={g}>{g}</option>
                              ))}
                            </select>
                          </div>

                          {/* Quick statistics display */}
                          <div className="grid grid-cols-3 gap-2 px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-white/40 dark:bg-slate-900/40 text-center">
                            <div>
                              <span className="text-[10px] text-slate-400 block font-medium uppercase tracking-wider">Style Size</span>
                              <strong className="text-sm text-slate-800 dark:text-white">
                                {parsedRows.filter(r => r.garmentName === selectedGarment).length} sequenced steps
                              </strong>
                            </div>
                            <div>
                              <span className="text-[10px] text-slate-400 block font-medium uppercase tracking-wider">Validation Errors</span>
                              <span className={`text-sm font-bold ${errorsList.length > 0 ? 'text-rose-500' : 'text-emerald-500'}`}>
                                {errorsList.length} fatal errors
                              </span>
                            </div>
                            <div>
                              <span className="text-[10px] text-slate-400 block font-medium uppercase tracking-wider">Validation Warnings</span>
                              <span className="text-sm font-bold text-amber-500">
                                {warningsList.length} notices
                              </span>
                            </div>
                          </div>

                          {/* Detail validation errors container */}
                          {validationIssues.length > 0 && (
                            <div className="p-4 space-y-2 max-h-[160px] overflow-y-auto">
                              {validationIssues.map((issue, idx) => (
                                <div 
                                  key={idx} 
                                  className={`flex items-start gap-2 p-2.5 rounded-xl border text-xs ${
                                    issue.severity === 'error'
                                      ? 'bg-rose-50/80 border-rose-100 text-rose-800 dark:bg-rose-950/20 dark:border-rose-900/30 dark:text-rose-300'
                                      : 'bg-amber-50/80 border-amber-100 text-amber-800 dark:bg-amber-950/15 dark:border-amber-900/30 dark:text-amber-300'
                                  }`}
                                >
                                  {issue.severity === 'error' ? (
                                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                                  ) : (
                                    <Info className="h-4 w-4 shrink-0 mt-0.5" />
                                  )}
                                  <div>
                                    <span className="font-bold underline mr-1">Row {issue.rowNum} {issue.column ? `(${issue.column})` : ''}:</span>
                                    <span>{issue.message}</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </motion.div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: MAPPING / STANDARDIZATION ENGINE */}
              {activeTab === 'mapping' && (
                <div className="space-y-4">
                  
                  {/* Style Overview summary strip */}
                  <div className="bg-gradient-to-r from-blue-500/10 to-indigo-500/10 border border-blue-100/40 dark:border-blue-900/20 rounded-2xl p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div className="space-y-0.5">
                      <span className="text-[10px] bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
                        IE Operation Bulletin Compiler
                      </span>
                      <h4 className="text-base font-bold dark:text-white mt-1">{selectedGarment}</h4>
                      <p className="text-xs text-slate-400">Preserving original layout sequences and matching names fuzzily in SWM registers.</p>
                    </div>

                    <div className="flex gap-4">
                      <div className="bg-white/70 dark:bg-slate-800 border border-slate-200/50 dark:border-slate-700 px-3 py-1.5 rounded-xl text-center shadow-xs">
                        <span className="text-[10px] text-slate-400 block">Planned Style SMV</span>
                        <strong className="text-sm text-blue-600 dark:text-blue-400 font-bold">{totalImportedSMV} minutes</strong>
                      </div>

                      <div className="bg-white/70 dark:bg-slate-800 border border-slate-200/50 dark:border-slate-700 px-3 py-1.5 rounded-xl text-center shadow-xs">
                        <span className="text-[10px] text-slate-400 block font-medium">Auto-Mapped Ops</span>
                        <strong className="text-sm text-slate-800 dark:text-white font-bold">
                          {mappingDecisions.filter(d => d.strategy === 'link_existing').length} / {mappingDecisions.length}
                        </strong>
                      </div>
                    </div>
                  </div>

                  {/* Decisions Sequence Table */}
                  <div className="border border-slate-200 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-950 overflow-hidden shadow-xs">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-800 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          <th className="py-3 px-4 w-12 text-center">Seq</th>
                          <th className="py-3 px-4">Uploaded Operation (SMV)</th>
                          <th className="py-3 px-4">Mapped Department</th>
                          <th className="py-3 px-4 text-center">Standardization Decision</th>
                          <th className="py-3 px-4">Target Standard Reference</th>
                          <th className="py-3 px-4 text-center">Match Quality</th>
                        </tr>
                      </thead>
                      <tbody>
                        {mappingDecisions.map((decision) => {
                          const hasMatchSuggestion = decision.suggestionScore > 0.40;

                          return (
                            <tr key={decision.tempId} className="border-b border-slate-100 dark:border-slate-900 text-xs text-slate-700 dark:text-slate-350 hover:bg-slate-50/50 dark:hover:bg-slate-900/35 transition-colors">
                              <td className="py-3 px-4 text-center font-bold">
                                <span className="bg-slate-100 dark:bg-slate-850 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded font-mono text-[10px]">
                                  {decision.seqNumber}
                                </span>
                              </td>
                              
                              <td className="py-3 px-4">
                                <div className="font-semibold text-slate-900 dark:text-white">
                                  {decision.uploadedOpName}
                                </div>
                                <div className="text-[10px] text-indigo-600 dark:text-indigo-400 font-bold mt-0.5">
                                  SMV: {decision.uploadedSMV}m · Class: {decision.uploadedMachineType || 'SNLS'}
                                </div>
                              </td>

                              <td className="py-3 px-4 font-mono text-[10px]">
                                {decision.departmentName || 'Sewing'}
                              </td>

                              <td className="py-3 px-4 text-center">
                                <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-750 p-0.5 bg-slate-50 dark:bg-slate-900">
                                  <button
                                    type="button"
                                    onClick={() => changeMappingStrategy(decision.tempId, 'create_new')}
                                    className={`px-2.5 py-1 text-[10px] font-bold rounded-md transition-all ${
                                      decision.strategy === 'create_new'
                                        ? 'bg-blue-600 text-white shadow-xs'
                                        : 'text-slate-400 hover:text-slate-600'
                                    }`}
                                  >
                                    Create New Master
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => changeMappingStrategy(decision.tempId, 'link_existing')}
                                    className={`px-2.5 py-1 text-[10px] font-bold rounded-md transition-all ${
                                      decision.strategy === 'link_existing'
                                        ? 'bg-emerald-600 text-white shadow-xs'
                                        : 'text-slate-400 hover:text-slate-600'
                                    }`}
                                  >
                                    Link Existing Standard
                                  </button>
                                </div>
                              </td>

                              <td className="py-3 px-4">
                                {decision.strategy === 'link_existing' ? (
                                  <select
                                    value={decision.selectedOpCode}
                                    onChange={(e) => changeMappedOpCode(decision.tempId, e.target.value)}
                                    className="px-2 py-1.5 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-xs font-semibold focus:outline-none dark:text-white text-slate-700 max-w-[180px]"
                                  >
                                    {masterOperations.map(mOp => (
                                      <option key={mOp.code} value={mOp.code}>
                                        {mOp.code}: {mOp.name}
                                      </option>
                                    ))}
                                  </select>
                                ) : (
                                  <span className="text-[10px] text-amber-600 font-bold bg-amber-500/10 px-2 py-1 rounded-lg border border-amber-500/10 flex items-center gap-1 self-start w-fit">
                                    <CheckCircle2 className="h-3 w-3" />
                                    <span>Auto Registers Unique Code on Commit</span>
                                  </span>
                                )}
                              </td>

                              <td className="py-3 px-4 text-center">
                                {decision.strategy === 'link_existing' && decision.suggestionScore > 0 ? (
                                  <div className="flex flex-col items-center">
                                    <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                                      decision.suggestionScore > 0.8 
                                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300' 
                                        : decision.suggestionScore > 0.5 
                                          ? 'bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300'
                                          : 'bg-slate-100 text-slate-600 dark:bg-slate-850 dark:text-slate-400'
                                    }`}>
                                      {Math.round(decision.suggestionScore * 105)}% similarity
                                    </span>
                                    {decision.suggestedOpName && (
                                      <span className="text-[8px] text-slate-400 block mt-0.5 italic max-w-[120px] truncate">
                                        Suggests: {decision.suggestedOpName}
                                      </span>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-slate-400 text-[10px] font-mono">—</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Master sync instructions banner */}
                  <div className="flex items-start gap-2.5 bg-indigo-50/70 dark:bg-indigo-950/20 border border-indigo-100/40 dark:border-indigo-900/30 p-3.5 rounded-2xl text-xs text-indigo-900 dark:text-indigo-300">
                    <UserCheck className="h-4.5 w-4.5 text-indigo-500 shrink-0 mt-0.5" />
                    <div>
                      <strong>Dynamic Operational Synchronization:</strong>
                      <p className="opacity-90 leading-relaxed mt-0.5">
                        New master operations registered during compilation will automatically appear inside the <strong>Skill Matrix Management</strong> and <strong>Workforce Assignment Center</strong> immediately. IE supervisors can immediately define team training rates for newly imported operations.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 3: IMPORT HISTORY AUDIT LOGS */}
              {activeTab === 'history' && (
                <div className="space-y-4">
                  {importHistory.length > 0 ? (
                    <div className="border border-slate-200 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-950 overflow-hidden shadow-xs">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-800 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                            <th className="py-3 px-4">Uploaded File</th>
                            <th className="py-3 px-4">Date & Time</th>
                            <th className="py-3 px-4">Target Style</th>
                            <th className="py-3 px-4 text-center">Ops Count</th>
                            <th className="py-3 px-4 text-center">Total SMV</th>
                            <th className="py-3 px-4">Master Stats</th>
                            <th className="py-3 px-4 text-center">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {importHistory.map((log) => (
                            <tr key={log.id} className="border-b border-slate-100 dark:border-slate-900 text-xs hover:bg-slate-50/50 dark:hover:bg-slate-900/35 transition-all text-slate-750 dark:text-slate-350">
                              <td className="py-3 px-4 font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                                <FileSpreadsheet className="h-4.5 w-4.5 text-blue-500 shrink-0" />
                                <span className="truncate max-w-[170px]">{log.filename}</span>
                              </td>
                              
                              <td className="py-3 px-4 text-slate-400 font-mono text-[10px]">
                                {log.importDate}
                              </td>

                              <td className="py-3 px-4">
                                <span className="font-bold">{log.garmentName}</span>
                                <span className="text-[9px] text-slate-400 block font-mono mt-0.5">{log.styleId}</span>
                              </td>

                              <td className="py-3 px-4 text-center font-bold">
                                {log.totalOperations} steps
                              </td>

                              <td className="py-3 px-4 text-center font-bold text-blue-600">
                                {log.totalSMV}m
                              </td>

                              <td className="py-3 px-4 text-[10px] leading-wider text-slate-500">
                                <div className="flex flex-col">
                                  <span>Created Ops: <strong className="text-slate-800 dark:text-white">{log.createdOpsCount}</strong></span>
                                  <span>Linked Ops: <strong className="text-slate-800 dark:text-white">{log.linkedOpsCount}</strong></span>
                                </div>
                              </td>

                              <td className="py-3 px-4 text-center">
                                <span className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 font-bold px-2 py-0.5 rounded text-[10px] uppercase">
                                  {log.status}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center p-12 text-center border border-slate-200 dark:border-slate-800 rounded-3xl bg-slate-50/20">
                      <History className="h-9 w-9 text-slate-300 dark:text-slate-600 mb-3" />
                      <h4 className="text-sm font-bold dark:text-white">No Import History Available</h4>
                      <p className="text-xs text-slate-400 mt-1 max-w-sm">No operation bulletins have been uploaded in your current browser session yet.</p>
                    </div>
                  )}
                </div>
              )}

            </div>

            {/* Sticky Action Footer */}
            <div className="p-5 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 flex justify-between items-center">
              
              {/* Back navigation buttons */}
              <div>
                {activeTab === 'mapping' && (
                  <button
                    type="button"
                    onClick={() => setActiveTab('upload')}
                    className="px-4 py-2 border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-slate-800 dark:hover:text-white text-xs font-semibold rounded-xl flex items-center gap-1 bg-white dark:bg-slate-800"
                  >
                    ← Back to Upload
                  </button>
                )}
              </div>

              {/* Commit and load buttons */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 border border-slate-200 dark:border-slate-800 text-slate-500 hover:text-slate-700 text-xs font-semibold rounded-xl"
                >
                  Cancel
                </button>
                
                {activeTab === 'upload' && (
                  <button
                    type="button"
                    disabled={mappingDecisions.length === 0}
                    onClick={() => setActiveTab('mapping')}
                    className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:pointer-events-none text-white font-semibold text-xs rounded-xl shadow-xs flex items-center gap-1"
                  >
                    <span>Proceed to Mapping</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                )}

                {activeTab === 'mapping' && (
                  <button
                    type="button"
                    onClick={commitImportBulletin}
                    className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs rounded-xl shadow-xs flex items-center gap-1"
                    id="confirm-bulletin-commit-btn"
                  >
                    <Save className="h-3.5 w-3.5" />
                    <span>Compile & Sync Bulletin</span>
                  </button>
                )}
              </div>

            </div>

          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
