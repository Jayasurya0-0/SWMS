/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { useAppState } from '../contexts/StateContext';
import { 
  FactoryDepartment, FactoryOperation, GarmentStyle, GarmentOperationSequenceItem, SkillLevel 
} from '../types';
import { 
  Plus, Search, Edit2, Trash2, Check, X, Shield, Layers, Layout, Grid,
  Maximize2, Save, FileSpreadsheet, RefreshCw, FolderPlus, ArrowUpRight,
  TrendingUp, Download, Eye, AlertTriangle, FileText, ChevronRight, Settings, CheckCircle, Play
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import * as XLSX from 'xlsx';
import { OperationBulletinImportCenter } from './OperationBulletinImportCenter';

export const FactoryConfigurationModule: React.FC = () => {
  const {
    departments, operations, garmentStyles, currentGarment, employees, productionLines,
    addDepartment, updateDepartment, deleteDepartment,
    addOperation, updateOperation, deleteOperation,
    addGarmentStyle, updateGarmentStyle, deleteGarmentStyle, selectGarmentStyle,
    addProductionLine, updateProductionLineFull, deleteProductionLine
  } = useAppState();

  // Active configurations panel tab
  const [activeSubTab, setActiveSubTab] = useState<'garments' | 'operations' | 'departments' | 'lines'>('garments');

  // Operation Bulletin Import Center modal state
  const [showImportCenter, setShowImportCenter] = useState(false);

  // Search filter
  const [searchTerm, setSearchTerm] = useState('');

  // Department Modal / Inline form state
  const [showDeptForm, setShowDeptForm] = useState(false);
  const [editingDept, setEditingDept] = useState<FactoryDepartment | null>(null);
  const [deptFormState, setDeptFormState] = useState<Partial<FactoryDepartment>>({
    id: '', name: '', supervisor: '', status: 'Active'
  });

  // Operation Modal / Inline form state
  const [showOpForm, setShowOpForm] = useState(false);
  const [editingOp, setEditingOp] = useState<FactoryOperation | null>(null);
  const [opFormState, setOpFormState] = useState<Partial<FactoryOperation>>({
    code: '', name: '', departmentId: 'DEPT01', skillCategory: 'Grade A Operator',
    smv: 1.0, machineType: 'Single Needle Lockstitch', targetEfficiency: 80, minSkillLevel: 'Intermediate', status: 'Active'
  });

  // Garment Style Form State
  const [showGarmentForm, setShowGarmentForm] = useState(false);
  const [editingGarment, setEditingGarment] = useState<GarmentStyle | null>(null);
  const [garmentFormState, setGarmentFormState] = useState<Partial<GarmentStyle>>({
    id: '', name: '', type: 'Polo Shirt', smv: 12.0, requiredManpower: 12,
    description: '', version: '1.0.0', status: 'Active', operations: [], linesAllocated: [1]
  });

  // Custom operation item in Garment creator
  const [newGarmentOp, setNewGarmentOp] = useState<Partial<GarmentOperationSequenceItem>>({
    operationCode: '', name: '', smv: 1.0, machineType: 'Single Needle Lockstitch',
    skillRequired: 'Intermediate', departmentId: 'DEPT01'
  });

  // Quick Operation creation inside Garment specification modal
  const [showQuickOpForm, setShowQuickOpForm] = useState(false);
  const [quickOpForm, setQuickOpForm] = useState({
    code: '',
    name: '',
    departmentId: 'DEPT01',
    skillCategory: 'Grade A Operator',
    smv: 1.0,
    machineType: 'Single Needle Lockstitch',
    targetEfficiency: 80,
    minSkillLevel: 'Intermediate' as SkillLevel,
    status: 'Active' as const
  });

  const handleQuickOpSubmit = () => {
    if (!quickOpForm.code || !quickOpForm.name) {
      triggerToast('Operation Code and Name are required', 'error');
      return;
    }

    // Check duplicate code
    if (operations.some(o => o.code.toUpperCase() === quickOpForm.code.toUpperCase())) {
      triggerToast(`Operation with code ${quickOpForm.code} already exists!`, 'error');
      return;
    }

    const opToCreate: FactoryOperation = {
      code: quickOpForm.code,
      name: quickOpForm.name,
      departmentId: quickOpForm.departmentId || 'DEPT01',
      skillCategory: quickOpForm.skillCategory || 'Grade A Operator',
      smv: Number(quickOpForm.smv) || 1.0,
      machineType: quickOpForm.machineType || 'Single Needle Lockstitch',
      targetEfficiency: Number(quickOpForm.targetEfficiency) || 80,
      minSkillLevel: quickOpForm.minSkillLevel || 'Intermediate',
      status: 'Active'
    };

    // Add it to the master library!
    addOperation(opToCreate);

    // Auto-prepopulate the newly appended operation state
    setNewGarmentOp({
      operationCode: opToCreate.code,
      name: opToCreate.name,
      smv: opToCreate.smv,
      machineType: opToCreate.machineType,
      skillRequired: opToCreate.minSkillLevel,
      departmentId: opToCreate.departmentId
    });

    triggerToast(`Added new operation "${opToCreate.name}" to Master Library.`);

    // Reset and hide
    setQuickOpForm({
      code: '',
      name: '',
      departmentId: 'DEPT01',
      skillCategory: 'Grade A Operator',
      smv: 1.0,
      machineType: 'Single Needle Lockstitch',
      targetEfficiency: 80,
      minSkillLevel: 'Intermediate',
      status: 'Active'
    });
    setShowQuickOpForm(false);
  };

  // Production Line Modal / Inline form state
  const [showLineForm, setShowLineForm] = useState(false);
  const [editingLine, setEditingLine] = useState<any | null>(null);
  const [lineFormState, setLineFormState] = useState<any>({
    id: 0, supervisor: '', targetQuantity: 400, requiredManpower: 12, availableManpower: 12, targetEfficiency: 80, bottleneckOperation: 'Collar Join', status: 'Running', baseEfficiency: 80, actualQuantity: 380, operatorsCount: 12
  });

  // Save Production Line
  const handleSaveLine = () => {
    const line = {
      id: Number(lineFormState.id),
      supervisor: lineFormState.supervisor || 'Rajesh Mehta',
      targetQuantity: Number(lineFormState.targetQuantity) || 400,
      actualQuantity: Number(lineFormState.actualQuantity) || 380,
      requiredManpower: Number(lineFormState.requiredManpower) || 12,
      availableManpower: Number(lineFormState.availableManpower) || 12,
      targetEfficiency: Number(lineFormState.targetEfficiency) || 80,
      baseEfficiency: Number(lineFormState.baseEfficiency) || 75.0,
      bottleneckOperation: lineFormState.bottleneckOperation || 'Collar Join',
      status: lineFormState.status || 'Running',
      operatorsCount: Number(lineFormState.availableManpower) || 12
    } as any;

    if (!line.id || line.id <= 0) {
      triggerToast('Line identification number is required and must be greater than 0', 'error');
      return;
    }

    if (editingLine) {
      updateProductionLineFull(line);
      triggerToast(`Sewing Line #${line.id} configuration updated.`);
    } else {
      // Check duplicate ID
      if (productionLines.some(l => l.id === line.id)) {
        triggerToast(`Production Line #${line.id} already exists!`, 'error');
        return;
      }
      addProductionLine(line);
      triggerToast(`Sewing Line #${line.id} created successfully.`);
    }

    setShowLineForm(false);
    setEditingLine(null);
  };

  // Edit Production Line
  const startEditLine = (line: any) => {
    setEditingLine(line);
    setLineFormState(line);
    setShowLineForm(true);
  };

  // Create Production Line
  const startAddLine = () => {
    setEditingLine(null);
    const maxId = productionLines.length > 0 ? Math.max(...productionLines.map(l => l.id)) : 0;
    setLineFormState({
      id: maxId + 1,
      supervisor: '',
      targetQuantity: 400,
      actualQuantity: 380,
      requiredManpower: 12,
      availableManpower: 12,
      targetEfficiency: 80,
      baseEfficiency: 75.0,
      bottleneckOperation: 'Collar Join',
      status: 'Running',
      operatorsCount: 12
    });
    setShowLineForm(true);
  };

  // Delete Production Line
  const handleLineDelete = (id: number) => {
    if (confirm(`Are you sure you want to delete Sewing Line #${id}?`)) {
      deleteProductionLine(id);
      triggerToast(`Sewing Line #${id} deleted.`);
    }
  };

  // Notification Banner State
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  const triggerToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  // Derived: actual employee department tallies
  const departmentCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    employees.forEach(emp => {
      // Map section or section string (e.g., Sewing) to department id
      const matchedDept = departments.find(d => d.name.toLowerCase() === emp.section?.toLowerCase());
      const dId = matchedDept ? matchedDept.id : 'DEPT01'; // fallback
      counts[dId] = (counts[dId] || 0) + 1;
    });
    return counts;
  }, [employees, departments]);

  // Handle Department Submit
  const handleDeptSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!deptFormState.id || !deptFormState.name || !deptFormState.supervisor) {
      triggerToast('All fields are required', 'error');
      return;
    }

    const dept: FactoryDepartment = {
      id: deptFormState.id.trim().toUpperCase(),
      name: deptFormState.name.trim(),
      supervisor: deptFormState.supervisor.trim(),
      status: deptFormState.status || 'Active',
      totalEmployees: departmentCounts[deptFormState.id] || 0
    };

    if (editingDept) {
      updateDepartment(dept);
      triggerToast(`Department "${dept.name}" updated successfully.`);
    } else {
      // Check duplicate ID
      if (departments.some(d => d.id === dept.id)) {
        triggerToast(`Department with ID ${dept.id} already exists!`, 'error');
        return;
      }
      addDepartment(dept);
      triggerToast(`Department "${dept.name}" created successfully.`);
    }

    setShowDeptForm(false);
    setEditingDept(null);
    setDeptFormState({ id: '', name: '', supervisor: '', status: 'Active' });
  };

  // Edit Department
  const startEditDept = (dept: FactoryDepartment) => {
    setEditingDept(dept);
    setDeptFormState(dept);
    setShowDeptForm(true);
  };

  // Delete Department
  const handleDeptDelete = (id: string, name: string) => {
    if (confirm(`Are you sure you want to deactivate or remove department "${name}" (${id})?`)) {
      deleteDepartment(id);
      triggerToast(`Department "${name}" removed.`);
    }
  };

  // Handle Operation Library Submit
  const handleOpSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!opFormState.code || !opFormState.name || !opFormState.departmentId) {
      triggerToast('Code, Name and Department are required', 'error');
      return;
    }

    const op: FactoryOperation = {
      code: opFormState.code.trim().toUpperCase(),
      name: opFormState.name.trim(),
      departmentId: opFormState.departmentId,
      skillCategory: opFormState.skillCategory || 'Grade A Operator',
      smv: Number(opFormState.smv) || 1.0,
      machineType: opFormState.machineType || 'Single Needle Lockstitch',
      targetEfficiency: Number(opFormState.targetEfficiency) || 80,
      minSkillLevel: opFormState.minSkillLevel || 'Intermediate',
      status: opFormState.status || 'Active'
    };

    if (editingOp) {
      updateOperation(op);
      triggerToast(`Operation "${op.name}" updated successfully.`);
    } else {
      if (operations.some(o => o.code === op.code)) {
        triggerToast(`Operation with code ${op.code} already exists!`, 'error');
        return;
      }
      addOperation(op);
      triggerToast(`Operation "${op.name}" registered successfully.`);
    }

    setShowOpForm(false);
    setEditingOp(null);
    setOpFormState({
      code: '', name: '', departmentId: 'DEPT01', skillCategory: 'Grade A Operator',
      smv: 1.0, machineType: 'Single Needle Lockstitch', targetEfficiency: 80, minSkillLevel: 'Intermediate', status: 'Active'
    });
  };

  // Edit Operation
  const startEditOp = (op: FactoryOperation) => {
    setEditingOp(op);
    setOpFormState(op);
    setShowOpForm(true);
  };

  // Delete Operation
  const handleOpDelete = (code: string, name: string) => {
    if (confirm(`Are you sure you want to delete operation "${name}" (${code}) from library?`)) {
      deleteOperation(code);
      triggerToast(`Operation "${name}" deleted.`);
    }
  };

  // Add Operation to Garment Creator
  const addOpToGarmentForm = () => {
    if (!newGarmentOp.operationCode) {
      triggerToast('Select an operation from the library', 'error');
      return;
    }

    const matchedLibOp = operations.find(o => o.code === newGarmentOp.operationCode);
    if (!matchedLibOp) return;

    const opItem: GarmentOperationSequenceItem = {
      operationCode: matchedLibOp.code,
      name: matchedLibOp.name,
      sequenceOrder: (garmentFormState.operations?.length || 0) + 1,
      smv: Number(newGarmentOp.smv) || matchedLibOp.smv,
      machineType: newGarmentOp.machineType || matchedLibOp.machineType,
      skillRequired: newGarmentOp.skillRequired || matchedLibOp.minSkillLevel,
      departmentId: newGarmentOp.departmentId || matchedLibOp.departmentId
    };

    // Prevent duplicates
    if (garmentFormState.operations?.some(o => o.operationCode === opItem.operationCode)) {
      triggerToast('This operation is already added to style sequence!', 'error');
      return;
    }

    const updatedOps = [...(garmentFormState.operations || []), opItem];
    
    // Automatically recalculate Style standard minute value
    const totalSMV = Number(updatedOps.reduce((sum, item) => sum + item.smv, 0).toFixed(2));
    // Estimate required manpower based on total SMV (1.0 SMV ~ 1-1.2 operator rules)
    const estManpower = Math.max(2, Math.round(totalSMV * 1.1));

    setGarmentFormState(prev => ({
      ...prev,
      operations: updatedOps,
      smv: totalSMV,
      requiredManpower: estManpower,
      estimatedManpower: estManpower
    }));

    triggerToast(`"${opItem.name}" added to style breakdown.`);
  };

  // Remove op from Garment Creator list
  const removeOpFromGarmentForm = (opCode: string) => {
    const updatedOps = (garmentFormState.operations || [])
      .filter(o => o.operationCode !== opCode)
      .map((o, idx) => ({ ...o, sequenceOrder: idx + 1 }));

    const totalSMV = Number(updatedOps.reduce((sum, item) => sum + item.smv, 0).toFixed(2));
    const estManpower = Math.max(2, Math.round(totalSMV * 1.1));

    setGarmentFormState(prev => ({
      ...prev,
      operations: updatedOps,
      smv: totalSMV,
      requiredManpower: estManpower,
      estimatedManpower: estManpower
    }));
  };

  // Move op up or down in style sequence
  const moveGarmentOpOrder = (index: number, direction: 'up' | 'down') => {
    const ops = [...(garmentFormState.operations || [])];
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === ops.length - 1) return;

    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    const temp = ops[index];
    ops[index] = ops[targetIdx];
    ops[targetIdx] = temp;

    // Reset sequence numbers
    const updatedOps = ops.map((op, idx) => ({ ...op, sequenceOrder: idx + 1 }));
    setGarmentFormState(prev => ({ ...prev, operations: updatedOps }));
  };

  // Submit Garment Style
  const handleGarmentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!garmentFormState.id || !garmentFormState.name || !garmentFormState.type) {
      triggerToast('ID, Name and Style Type are required', 'error');
      return;
    }

    if (!garmentFormState.operations || garmentFormState.operations.length === 0) {
      triggerToast('Garment Style must contain at least one operation in sequence!', 'error');
      return;
    }

    // Auto calculate SMV again to be perfectly sure
    const totalSMV = Number(garmentFormState.operations.reduce((acc, current) => acc + current.smv, 0).toFixed(2));
    const finalEstManpower = Math.max(1, Math.round(totalSMV * 1.15));

    const style: GarmentStyle = {
      id: garmentFormState.id.trim().toUpperCase(),
      name: garmentFormState.name.trim(),
      type: garmentFormState.type,
      smv: totalSMV,
      requiredManpower: Number(garmentFormState.requiredManpower) || finalEstManpower,
      estimatedManpower: finalEstManpower,
      description: garmentFormState.description || 'Custom garment specification layout.',
      version: garmentFormState.version || '1.0.0',
      isArchived: false,
      status: garmentFormState.status || 'Active',
      operations: garmentFormState.operations,
      linesAllocated: garmentFormState.linesAllocated || [1],
      createdAt: garmentFormState.createdAt || new Date().toISOString(),
      lastModifiedAt: new Date().toISOString()
    };

    if (editingGarment) {
      updateGarmentStyle(style);
      triggerToast(`Style "${style.name}" modified successfully.`);
    } else {
      if (garmentStyles.some(s => s.id === style.id)) {
        triggerToast(`Style code "${style.id}" already exists in registers!`, 'error');
        return;
      }
      addGarmentStyle(style);
      triggerToast(`Style "${style.name}" has been registered into system.`);
    }

    setShowGarmentForm(false);
    setEditingGarment(null);
    setGarmentFormState({
      id: '', name: '', type: 'Polo Shirt', smv: 12.0, requiredManpower: 12,
      description: '', version: '1.0.1', status: 'Active', operations: [], linesAllocated: [1]
    });
  };

  // Edit Garment
  const startEditGarment = (style: GarmentStyle) => {
    setEditingGarment(style);
    setGarmentFormState(style);
    setShowGarmentForm(true);
  };

  // Delete Garment
  const handleGarmentDelete = (id: string, name: string) => {
    if (confirm(`Are you sure you want to delete/archive garment style "${name}" (${id})?`)) {
      deleteGarmentStyle(id);
      triggerToast(`Style "${name}" deleted.`);
    }
  };

  // Export current list to Excel
  const exportToExcel = () => {
    let wsData: any[] = [];
    let filename = `SWMS_Configuration_${activeSubTab}.xlsx`;

    if (activeSubTab === 'departments') {
      wsData = departments.map(d => ({
        'Department ID': d.id,
        'Department Name': d.name,
        'Supervisor / Manager': d.supervisor,
        'Live Employees Count': departmentCounts[d.id] || d.totalEmployees || 0,
        'Status': d.status
      }));
    } else if (activeSubTab === 'operations') {
      wsData = operations.map(o => ({
        'Operation Code': o.code,
        'Operation Name': o.name,
        'Department ID': o.departmentId,
        'Skill Level Category': o.skillCategory,
        'Standard Minute Value (SMV)': o.smv,
        'Machine Type Requirement': o.machineType,
        'Target Efficiency %': o.targetEfficiency,
        'Minimum Grade Required': o.minSkillLevel,
        'Status': o.status
      }));
    } else if (activeSubTab === 'garments') {
      wsData = garmentStyles.map(g => ({
        'Style ID/Code': g.id,
        'Garment Name': g.name,
        'Style Type': g.type,
        'Total Style SMV': g.smv,
        'Planned Manpower': g.requiredManpower,
        'Calculated Min Operators': g.estimatedManpower,
        'Active Version': g.version,
        'Allocated Sewing Lines': g.linesAllocated.join(', '),
        'Total Operations Count': g.operations.length,
        'Status': g.status,
        'Created On': g.createdAt
      }));
    } else {
      wsData = productionLines.map(l => ({
        'Line Number': l.id,
        'Supervisor': l.supervisor,
        'Operator Count': l.operatorsCount,
        'Hourly Production Target': l.targetQuantity,
        'Daily Target': l.targetQuantity * 8,
        'Assigned Active Style': (currentGarment && currentGarment.linesAllocated) ? (currentGarment.linesAllocated.includes(l.id) ? currentGarment.name : 'Other Style') : 'No Active Style'
      }));
    }

    const worksheet = XLSX.utils.json_to_sheet(wsData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, activeSubTab.toUpperCase());
    XLSX.writeFile(workbook, filename);
    triggerToast(`Exported ${activeSubTab} list successfully.`);
  };

  // Filter lists based on search
  const filteredDepts = departments.filter(d => 
    d.id.toLowerCase().includes(searchTerm.toLowerCase()) || 
    d.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    d.supervisor.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredOps = operations.filter(o => {
    const dept = departments.find(d => d.id === o.departmentId);
    return o.code.toLowerCase().includes(searchTerm.toLowerCase()) || 
           o.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
           o.machineType.toLowerCase().includes(searchTerm.toLowerCase()) ||
           (dept && dept.name.toLowerCase().includes(searchTerm.toLowerCase()));
  });

  const filteredGarments = garmentStyles.filter(g => 
    g.id.toLowerCase().includes(searchTerm.toLowerCase()) || 
    g.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    g.type.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6 container mx-auto px-4 py-2" id="factory-setup-container">
      
      {/* Toast Alert Banner */}
      <AnimatePresence>
        {toast && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg border flex items-center gap-2 ${
              toast.type === 'error' 
                ? 'bg-rose-50 border-rose-200 text-rose-800 dark:bg-rose-950/40 dark:border-rose-900/40 dark:text-rose-300' 
                : 'bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-950/40 dark:border-emerald-900/40 dark:text-emerald-300'
            }`}
          >
            <CheckCircle className="h-5 w-5" />
            <span className="text-sm font-medium">{toast.message}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 p-2 rounded-xl">
              <Settings className="h-5 w-5" />
            </span>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              Factory Configuration & Garment Setup
            </h1>
          </div>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
            Complete administrative control over departments, operations master libraries, garment styles, and production lines.
          </p>
        </div>

        {/* Global Action Header Panel */}
        <div className="flex items-center gap-2">
          <button 
            onClick={exportToExcel}
            className="flex items-center gap-1.5 px-3 py-2 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm transition-all"
            id="export-active-config-btn"
          >
            <Download className="h-4 w-4 text-slate-500" />
            <span>Export layout</span>
          </button>
          
          {activeSubTab === 'departments' && (
            <button 
              onClick={() => { setEditingDept(null); setDeptFormState({ id: `DEPT0${departments.length+1}`, name: '', supervisor: '', status: 'Active' }); setShowDeptForm(true); }}
              className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl text-sm transition-all shadow-sm"
              id="add-new-dept-button"
            >
              <Plus className="h-4 w-4" />
              <span>Add Department</span>
            </button>
          )}

          {activeSubTab === 'operations' && (
            <button 
              onClick={() => { setEditingOp(null); setOpFormState({ code: `OP-SEW-${operations.length+1}`, name: '', departmentId: 'DEPT01', smv: 1.0, machineType: 'Single Needle Lockstitch', status: 'Active' }); setShowOpForm(true); }}
              className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl text-sm transition-all shadow-sm"
              id="add-new-op-button"
            >
              <Plus className="h-4 w-4" />
              <span>Register Operation</span>
            </button>
          )}

          {activeSubTab === 'garments' && (
            <div className="flex items-center gap-2">
              <button 
                onClick={() => setShowImportCenter(true)}
                className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl text-sm transition-all shadow-sm"
                id="import-bulletin-btn"
              >
                <FileSpreadsheet className="h-4 w-4" />
                <span>Import Operation Bulletin</span>
              </button>
              
              <button 
                onClick={() => { setEditingGarment(null); setGarmentFormState({ id: `ST-STYLE-${garmentStyles.length+1}`, name: '', type: 'Polo Shirt', smv: 0, requiredManpower: 10, operations: [], linesAllocated: [1], version: '1.0.0', status: 'Active' }); setShowGarmentForm(true); }}
                className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-xl text-sm transition-all shadow-sm"
                id="add-new-garment-button"
              >
                <Plus className="h-4 w-4" />
                <span>Create Garment Style</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Central Navigation Tabs */}
      <div className="flex border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 p-1.5 rounded-xl">
        <button
          onClick={() => { setActiveSubTab('garments'); setSearchTerm(''); }}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-semibold transition-all ${
            activeSubTab === 'garments'
              ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
          id="tab-garment-setup"
        >
          <Layers className="h-4 w-4" />
          <span>Garment Styles Setup</span>
          <span className="ml-1 text-xs px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-500">
            {garmentStyles.length}
          </span>
        </button>

        <button
          onClick={() => { setActiveSubTab('operations'); setSearchTerm(''); }}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-semibold transition-all ${
            activeSubTab === 'operations'
              ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
          id="tab-operations-lib"
        >
          <Layout className="h-4 w-4" />
          <span>Operations Library</span>
          <span className="ml-1 text-xs px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-500">
            {operations.length}
          </span>
        </button>

        <button
          onClick={() => { setActiveSubTab('departments'); setSearchTerm(''); }}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-semibold transition-all ${
            activeSubTab === 'departments'
              ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
          id="tab-dept-center"
        >
          <Grid className="h-4 w-4" />
          <span>Department Center</span>
          <span className="ml-1 text-xs px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-500">
            {departments.length}
          </span>
        </button>

        <button
          onClick={() => { setActiveSubTab('lines'); setSearchTerm(''); }}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-semibold transition-all ${
            activeSubTab === 'lines'
              ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
          id="tab-sewing-lines"
        >
          <Settings className="h-4 w-4" />
          <span>Sewing Line Layouts</span>
          <span className="ml-1 text-xs px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-500">
            {productionLines.length}
          </span>
        </button>
      </div>

      {/* Global Filter Bar */}
      <div className="flex bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3 rounded-2xl shadow-sm items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 h-4 w-4" />
          <input
            type="text"
            placeholder={`Filter ${activeSubTab === 'garments' ? 'garment structures or types...' : activeSubTab === 'operations' ? 'operations by name, machine or department...' : 'departments...'}`}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
            id="admin-search-input"
          />
        </div>
      </div>

      {/* Subtab content renders below */}
      <AnimatePresence mode="wait">
        
        {/* TAB 1: GARMENTS SETUP */}
        {activeSubTab === 'garments' && (
          <motion.div
            key="garments"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-6"
          >
            {/* Active Running Garment Style Hero Selector */}
            {currentGarment ? (
              <div className="bg-gradient-to-br from-blue-500/10 via-emerald-500/5 to-slate-900/0 border border-blue-100 dark:border-blue-900/30 rounded-2xl p-6 flex flex-col md:flex-row items-center justify-between gap-6">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="bg-emerald-100 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-300 text-xs px-2.5 py-1 font-bold rounded-full uppercase tracking-wider">
                      Running Production Style
                    </span>
                    <span className="text-xs text-slate-400">Version {currentGarment.version}</span>
                  </div>
                  <h3 className="text-xl font-bold dark:text-white flex items-center gap-2">
                    {currentGarment.name}
                    <span className="text-sm font-normal text-slate-400">({currentGarment.id})</span>
                  </h3>
                  <p className="text-slate-500 dark:text-slate-400 text-sm max-w-xl">
                    {currentGarment.description}
                  </p>
                  
                  {/* Micro metric display */}
                  <div className="flex gap-4 pt-2 text-xs">
                    <div className="bg-white/60 dark:bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-200/50 dark:border-slate-700/50">
                      <span className="text-slate-400 block">Garment SMV</span>
                      <strong className="text-blue-600 dark:text-blue-400">{currentGarment.smv} min</strong>
                    </div>
                    <div className="bg-white/60 dark:bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-200/50 dark:border-slate-700/50">
                      <span className="text-slate-400 block">Required Manpower</span>
                      <strong>{currentGarment.requiredManpower} workers</strong>
                    </div>
                    <div className="bg-white/60 dark:bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-200/50 dark:border-slate-700/50">
                      <span className="text-slate-400 block">Operations Sequence</span>
                      <strong>{currentGarment.operations?.length || 0} steps</strong>
                    </div>
                  </div>
                </div>

                {/* Selector form */}
                <div className="flex flex-col gap-2 w-full md:w-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-xl shadow-sm">
                  <label className="text-xs font-semibold text-slate-400">Switch Active Style</label>
                  <div className="flex gap-2">
                    <select
                      value={currentGarment.id}
                      onChange={(e) => selectGarmentStyle(e.target.value)}
                      className="border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-sm bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-white focus:outline-none"
                      id="hero-garment-select"
                    >
                      {garmentStyles.map(g => (
                        <option key={g.id} value={g.id}>{g.name} - ({g.type})</option>
                      ))}
                    </select>
                    <span className="flex items-center justify-center p-2 rounded-lg bg-green-500/10 text-green-500">
                      <Play className="h-4 w-4" />
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-105 dark:border-yellow-905/30 rounded-2xl p-6 text-center space-y-2">
                <AlertTriangle className="h-8 w-8 text-yellow-500 mx-auto" />
                <h3 className="text-base font-bold dark:text-white">No Active Garment Style Selected</h3>
                <p className="text-slate-500 dark:text-slate-400 text-xs max-w-md mx-auto">
                  Create/import a garment style below or select "Run Load" on one of the styles to activate a style for production lines.
                </p>
              </div>
            )}

            {/* Garment Style Creation/Edit Modal Form overlay */}
            {showGarmentForm && (
              <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
                <motion.div 
                  initial={{ scale: 0.95, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 max-w-4xl w-full rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden"
                >
                  <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                      {editingGarment ? `Edit Garment Style [${editingGarment.id}]` : 'Create New Garment Style Specification'}
                    </h3>
                    <button onClick={() => setShowGarmentForm(false)} className="text-slate-400 hover:text-slate-600">
                      <X className="h-5 w-5" />
                    </button>
                  </div>

                  <form onSubmit={handleGarmentSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className="text-xs font-semibold block text-slate-500 mb-1">Style Reference ID / Code*</label>
                        <input
                          type="text"
                          required
                          disabled={!!editingGarment}
                          placeholder="e.g. STY-POLO-NEW"
                          value={garmentFormState.id || ''}
                          onChange={(e) => setGarmentFormState(p => ({ ...p, id: e.target.value }))}
                          className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 dark:text-white disabled:opacity-50"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold block text-slate-500 mb-1">Garment Name*</label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. Premium Cotton Polo Shirt"
                          value={garmentFormState.name || ''}
                          onChange={(e) => setGarmentFormState(p => ({ ...p, name: e.target.value }))}
                          className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 dark:text-white"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold block text-slate-500 mb-1">Garment Type*</label>
                        <select
                          required
                          value={garmentFormState.type || 'Polo Shirt'}
                          onChange={(e) => setGarmentFormState(p => ({ ...p, type: e.target.value as any }))}
                          className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 dark:text-white"
                        >
                          <option value="Polo Shirt">Polo Shirt</option>
                          <option value="T-Shirt">T-Shirt</option>
                          <option value="Hoodie">Hoodie</option>
                          <option value="Shirt">Shirt</option>
                          <option value="Trousers">Trousers</option>
                          <option value="Jeans">Jeans</option>
                          <option value="Jacket">Jacket</option>
                          <option value="Dress">Dress</option>
                          <option value="Custom">Custom</option>
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className="text-xs font-semibold block text-slate-500 mb-1">Specification Version*</label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. 1.0.0"
                          value={garmentFormState.version || '1.0.0'}
                          onChange={(e) => setGarmentFormState(p => ({ ...p, version: e.target.value }))}
                          className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 dark:text-white"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold block text-slate-500 mb-1">Target Line Allocations*</label>
                        <input
                          type="text"
                          placeholder="e.g. 1, 2, 3"
                          value={garmentFormState.linesAllocated?.join(', ') || '1'}
                          onChange={(e) => setGarmentFormState(p => ({ 
                            ...p, 
                            linesAllocated: e.target.value.split(',').map(n => parseInt(n.trim())).filter(n => !isNaN(n)) 
                          }))}
                          className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 dark:text-white"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold block text-slate-500 mb-1">Required Pitched Manpower</label>
                        <input
                          type="number"
                          placeholder="Allocated manpower limit"
                          value={garmentFormState.requiredManpower || ''}
                          onChange={(e) => setGarmentFormState(p => ({ ...p, requiredManpower: parseInt(e.target.value) }))}
                          className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 dark:text-white"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-xs font-semibold block text-slate-500 mb-1">Detailed Description</label>
                      <textarea
                        rows={2}
                        placeholder="Define style particulars, fabric structures or details..."
                        value={garmentFormState.description || ''}
                        onChange={(e) => setGarmentFormState(p => ({ ...p, description: e.target.value }))}
                        className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 dark:text-white"
                      ></textarea>
                    </div>

                    {/* Operational sequence breakdown designer */}
                    <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden bg-slate-50 dark:bg-slate-900/60 p-4 space-y-4">
                      <div className="flex justify-between items-center">
                        <h4 className="text-sm font-bold text-slate-900 dark:text-white">Assemble Operation Sequence Breakdown</h4>
                        <span className="text-xs text-blue-600 dark:text-blue-400 font-semibold bg-blue-100/40 px-2.5 py-1 rounded-full">
                          Calculated Style SMV: {garmentFormState.smv} min
                        </span>
                      </div>

                      {/* Operation builder panel */}
                      <div className="bg-white dark:bg-slate-950 p-4 border border-slate-100 dark:border-slate-800/80 rounded-xl grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
                        <div className="flex flex-col">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block mb-1">Select Master Operation</label>
                          <select
                            value={newGarmentOp.operationCode || ''}
                            onChange={(e) => {
                              const match = operations.find(o => o.code === e.target.value);
                              if (match) {
                                setNewGarmentOp({
                                  operationCode: match.code,
                                  name: match.name,
                                  smv: match.smv,
                                  machineType: match.machineType,
                                  skillRequired: match.minSkillLevel,
                                  departmentId: match.departmentId
                                });
                              }
                            }}
                            className="w-full px-3 py-1.5 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800 text-xs focus:outline-none text-slate-800 dark:text-slate-100"
                          >
                            <option value="" className="text-slate-500">-- Choose From Master Library --</option>
                            {operations.map(o => (
                              <option key={o.code} value={o.code}>{o.code}: {o.name} ({o.smv} min)</option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => {
                              const sewOps = operations.filter(o => o.code.startsWith('OP-SEW-'));
                              const nextNum = sewOps.length > 0 
                                ? Math.max(...sewOps.map(o => parseInt(o.code.replace('OP-SEW-', '')) || 0)) + 1
                                : 10;
                              const numStr = String(nextNum).padStart(2, '0');
                              setQuickOpForm(prev => ({
                                ...prev,
                                code: `OP-SEW-${numStr}`
                              }));
                              setShowQuickOpForm(!showQuickOpForm);
                            }}
                            className="mt-1.5 text-[10px] text-blue-600 dark:text-blue-400 hover:underline font-bold flex items-center gap-1 bg-transparent border-0 cursor-pointer text-left self-start"
                          >
                            <Plus className="h-2.5 w-2.5" />
                            <span>Add New Operation (Not in list?)</span>
                          </button>
                        </div>

                        <div>
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block mb-1">Override Operation SMV (min)</label>
                          <input
                            type="number"
                            step="0.01"
                            value={newGarmentOp.smv || ''}
                            onChange={(e) => setNewGarmentOp(o => ({ ...o, smv: parseFloat(e.target.value) }))}
                            className="w-full px-3 py-1.5 border border-slate-200 dark:border-slate-700 rounded-lg text-xs dark:bg-slate-850 dark:text-white"
                          />
                        </div>

                        <button
                          type="button"
                          onClick={addOpToGarmentForm}
                          className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-lg flex items-center justify-center gap-1.5 transition-colors h-[31px]"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          <span>Append to Sequence</span>
                        </button>

                        {showQuickOpForm && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            className="col-span-1 md:col-span-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-xl mt-2 space-y-3"
                          >
                            <div className="flex justify-between items-center pb-2 border-b border-slate-200 dark:border-slate-800">
                              <span className="text-xs font-bold text-slate-800 dark:text-white uppercase tracking-wider">Quick Register New Operation</span>
                              <button 
                                type="button"
                                onClick={() => setShowQuickOpForm(false)} 
                                className="text-slate-400 hover:text-slate-600 text-[10px] font-bold"
                              >
                                ✕
                              </button>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                              <div>
                                <label className="text-[9px] font-bold text-slate-400 uppercase block mb-1">Operation Code</label>
                                <input 
                                  type="text"
                                  value={quickOpForm.code}
                                  onChange={(e) => setQuickOpForm({ ...quickOpForm, code: e.target.value })}
                                  placeholder="e.g. OP-SEW-10"
                                  className="w-full text-xs px-2.5 py-1.5 border border-slate-200 dark:border-slate-800 rounded-lg dark:bg-slate-950 dark:text-white"
                                />
                              </div>

                              <div>
                                <label className="text-[9px] font-bold text-slate-400 uppercase block mb-1">Operation Name</label>
                                <input 
                                  type="text"
                                  value={quickOpForm.name}
                                  onChange={(e) => setQuickOpForm({ ...quickOpForm, name: e.target.value })}
                                  placeholder="e.g. Cuff Stitch"
                                  className="w-full text-xs px-2.5 py-1.5 border border-slate-200 dark:border-slate-800 rounded-lg dark:bg-slate-950 dark:text-white"
                                />
                              </div>

                              <div>
                                <label className="text-[9px] font-bold text-slate-400 uppercase block mb-1">Default SMV (min)</label>
                                <input 
                                  type="number"
                                  step="0.01"
                                  value={quickOpForm.smv}
                                  onChange={(e) => setQuickOpForm({ ...quickOpForm, smv: parseFloat(e.target.value) || 0 })}
                                  className="w-full text-xs px-2.5 py-1.5 border border-slate-200 dark:border-slate-800 rounded-lg dark:bg-slate-950 dark:text-white"
                                />
                              </div>

                              <div>
                                <label className="text-[9px] font-bold text-slate-400 uppercase block mb-1">Machine Type</label>
                                <input 
                                  type="text"
                                  value={quickOpForm.machineType}
                                  onChange={(e) => setQuickOpForm({ ...quickOpForm, machineType: e.target.value })}
                                  placeholder="e.g. Overlock 4-Thread"
                                  className="w-full text-xs px-2.5 py-1.5 border border-slate-200 dark:border-slate-800 rounded-lg dark:bg-slate-950 dark:text-white"
                                />
                              </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                              <div>
                                <label className="text-[9px] font-bold text-slate-400 uppercase block mb-1">Department Mapping</label>
                                <select
                                  value={quickOpForm.departmentId}
                                  onChange={(e) => setQuickOpForm({ ...quickOpForm, departmentId: e.target.value })}
                                  className="w-full text-xs px-2.5 py-1.5 border border-slate-200 dark:border-slate-800 rounded-lg dark:bg-slate-950 dark:text-white"
                                >
                                  {departments.map(d => (
                                    <option key={d.id} value={d.id}>{d.name}</option>
                                  ))}
                                </select>
                              </div>

                              <div>
                                <label className="text-[9px] font-bold text-slate-400 uppercase block mb-1">Grade Category</label>
                                <select
                                  value={quickOpForm.skillCategory}
                                  onChange={(e) => setQuickOpForm({ ...quickOpForm, skillCategory: e.target.value })}
                                  className="w-full text-xs px-2.5 py-1.5 border border-slate-200 dark:border-slate-800 rounded-lg dark:bg-slate-950 dark:text-white"
                                >
                                  <option value="Grade A Operator">Grade A Operator</option>
                                  <option value="Grade B Operator">Grade B Operator</option>
                                  <option value="Grade C Operator">Grade C Operator</option>
                                  <option value="Helper">Helper</option>
                                </select>
                              </div>

                              <div>
                                <label className="text-[9px] font-bold text-slate-400 uppercase block mb-1">Minimum Skill Required</label>
                                <select
                                  value={quickOpForm.minSkillLevel}
                                  onChange={(e) => setQuickOpForm({ ...quickOpForm, minSkillLevel: e.target.value as SkillLevel })}
                                  className="w-full text-xs px-2.5 py-1.5 border border-slate-200 dark:border-slate-800 rounded-lg dark:bg-slate-950 dark:text-white"
                                >
                                  <option value="Beginner">Beginner</option>
                                  <option value="Intermediate">Intermediate</option>
                                  <option value="Advanced">Advanced</option>
                                  <option value="Expert">Expert</option>
                                </select>
                              </div>
                            </div>

                            <div className="flex justify-end gap-2 pt-1 border-t border-slate-200 dark:border-slate-800">
                              <button
                                type="button"
                                onClick={() => setShowQuickOpForm(false)}
                                className="px-3 py-1.5 border border-slate-200 dark:border-slate-800 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-xs font-semibold"
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                onClick={handleQuickOpSubmit}
                                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1"
                              >
                                <Check className="h-3 w-3" />
                                <span>Create & Preselect</span>
                              </button>
                            </div>
                          </motion.div>
                        )}
                      </div>

                      {/* Operation sequence layout table */}
                      <div className="border border-slate-100 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 overflow-hidden">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="bg-slate-50 dark:bg-slate-950 text-slate-400 text-[10px] font-bold uppercase tracking-wider border-b border-slate-100 dark:border-slate-800">
                              <th className="py-2.5 px-3 w-12 text-center">Seq</th>
                              <th className="py-2.5 px-3">Operation Description</th>
                              <th className="py-2.5 px-3 text-center">Specific SMV</th>
                              <th className="py-2.5 px-3">Requirement</th>
                              <th className="py-2.5 px-3 text-center">Grade</th>
                              <th className="py-2.5 px-3 text-center">Reorder</th>
                              <th className="py-2.5 px-3 text-center">Act</th>
                            </tr>
                          </thead>
                          <tbody>
                            {garmentFormState.operations && garmentFormState.operations.length > 0 ? (
                              garmentFormState.operations.map((op, idx) => (
                                <tr key={op.operationCode} className="border-b border-slate-100 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-300">
                                  <td className="py-2 px-3 text-center">
                                    <span className="bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-[10px] font-mono">
                                      {op.sequenceOrder}
                                    </span>
                                  </td>
                                  <td className="py-2 px-3 font-medium">
                                    {op.name} <span className="text-[10px] text-slate-400 block font-mono">{op.operationCode}</span>
                                  </td>
                                  <td className="py-2 px-3 text-center font-bold text-indigo-600 dark:text-indigo-400">
                                    {op.smv}m
                                  </td>
                                  <td className="py-2 px-3 text-slate-500 max-w-xs truncate">
                                    {op.machineType}
                                  </td>
                                  <td className="py-2 px-3 text-center">
                                    <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 font-semibold text-[10px]">
                                      {op.skillRequired}
                                    </span>
                                  </td>
                                  <td className="py-2 px-3 text-center">
                                    <div className="flex justify-center items-center gap-1">
                                      <button
                                        type="button"
                                        disabled={idx === 0}
                                        onClick={() => moveGarmentOpOrder(idx, 'up')}
                                        className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 disabled:opacity-35"
                                      >
                                        ▲
                                      </button>
                                      <button
                                        type="button"
                                        disabled={idx === (garmentFormState.operations?.length || 0) - 1}
                                        onClick={() => moveGarmentOpOrder(idx, 'down')}
                                        className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 disabled:opacity-35"
                                      >
                                        ▼
                                      </button>
                                    </div>
                                  </td>
                                  <td className="py-2 px-3 text-center">
                                    <button
                                      type="button"
                                      onClick={() => removeOpFromGarmentForm(op.operationCode)}
                                      className="text-rose-500 hover:text-rose-700 p-1"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </button>
                                  </td>
                                </tr>
                              ))
                            ) : (
                              <tr>
                                <td colSpan={7} className="py-6 text-center text-slate-400 text-xs italic">
                                  No operations added into style yet. Please choice master operations above to populate.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    <div className="flex justify-end gap-3 p-5 bg-slate-50 dark:bg-slate-950/80 rounded-2xl border border-slate-100 dark:border-slate-800">
                      <button
                        type="button"
                        onClick={() => setShowGarmentForm(false)}
                        className="px-4 py-2 border border-slate-200 dark:border-slate-800 text-slate-500 hover:text-slate-700 text-sm font-semibold rounded-xl"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm rounded-xl shadow-sm"
                      >
                        {editingGarment ? 'Save Specifications' : 'Build Garment Structure'}
                      </button>
                    </div>
                  </form>
                </motion.div>
              </div>
            )}

            {/* Garment Registers List (Flex Cards) */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredGarments.map(g => {
                const isActive = currentGarment && g.id === currentGarment.id;
                return (
                  <div 
                    key={g.id} 
                    className={`bg-white dark:bg-slate-900 border rounded-2xl flex flex-col justify-between overflow-hidden shadow-sm hover:shadow-md transition-all ${
                      isActive 
                        ? 'border-blue-500 ring-1 ring-blue-500 bg-gradient-to-b from-blue-50/15 to-transparent' 
                        : 'border-slate-100 dark:border-slate-800/80'
                    }`}
                  >
                    <div className="p-5 space-y-4">
                      <div className="flex justify-between items-start">
                        <div>
                          <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                            g.type === 'Polo Shirt' ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300' :
                            g.type === 'T-Shirt' ? 'bg-orange-50 text-orange-700 dark:bg-orange-950 dark:text-orange-300' :
                            g.type === 'Hoodie' ? 'bg-violet-50 text-violet-700 dark:bg-violet-950 dark:text-violet-300' :
                            'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                          }`}>
                            {g.type}
                          </span>
                          <h4 className="text-base font-bold text-slate-900 dark:text-white mt-2 leading-tight">
                            {g.name}
                          </h4>
                          <span className="text-[10px] uppercase font-mono text-slate-400">Code: {g.id}</span>
                        </div>
                        <div className="text-right">
                          <span className="text-slate-400 text-xs block">Version</span>
                          <span className="text-xs font-semibold px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                            v{g.version}
                          </span>
                        </div>
                      </div>

                      <p className="text-slate-500 dark:text-slate-400 text-xs leading-relaxed max-w-sm">
                        {g.description}
                      </p>

                      <div className="grid grid-cols-3 gap-2 border-t border-slate-100 dark:border-slate-800/80 pt-3">
                        <div className="text-center">
                          <span className="text-[10px] text-slate-400 block">Total SMV</span>
                          <span className="text-sm font-bold text-slate-700 dark:text-slate-300">{g.smv} min</span>
                        </div>
                        <div className="text-center">
                          <span className="text-[10px] text-slate-400 block">Required MP</span>
                          <span className="text-sm font-bold text-slate-700 dark:text-slate-300">{g.requiredManpower} ops</span>
                        </div>
                        <div className="text-center">
                          <span className="text-[10px] text-slate-400 block">Lines</span>
                          <span className="text-xs font-bold text-blue-600">{g.linesAllocated.map(l => l).join(', ')}</span>
                        </div>
                      </div>

                      {/* Display summary chips of steps */}
                      <div className="space-y-1">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Breakdown Preview</span>
                        <div className="flex flex-wrap gap-1">
                          {g.operations.slice(0, 3).map(op => (
                            <span key={op.operationCode} className="text-[9px] bg-slate-50 dark:bg-slate-950 dark:border dark:border-slate-800 text-slate-500 px-2 py-0.5 rounded">
                              {op.name}
                            </span>
                          ))}
                          {g.operations.length > 3 && (
                            <span className="text-[9px] bg-indigo-50 dark:bg-indigo-950 text-indigo-600 px-2 py-0.5 rounded font-bold">
                              +{g.operations.length - 3} more
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="bg-slate-50 dark:bg-slate-950/40 px-5 py-3 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center">
                      <div className="flex items-center gap-1.5">
                        {!isActive ? (
                          <button
                            onClick={() => selectGarmentStyle(g.id)}
                            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-blue-500 font-bold hover:text-blue-500 text-xs px-2.5 py-1.5 rounded-lg text-slate-600 flex items-center gap-1 transition-all"
                          >
                            <Play className="h-3 w-3" />
                            <span>Run Load</span>
                          </button>
                        ) : (
                          <span className="text-xs text-blue-600 font-semibold flex items-center gap-1">
                            <Check className="h-3.5 w-3.5" />
                            <span>Active Route</span>
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => startEditGarment(g)}
                          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-1.5 hover:border-slate-400 hover:text-slate-800 dark:hover:text-white rounded-lg text-slate-500 transition-all"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => handleGarmentDelete(g.id, g.name)}
                          disabled={garmentStyles.length <= 1}
                          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-1.5 hover:border-rose-400 hover:text-rose-500 disabled:opacity-30 rounded-lg text-slate-500 transition-all"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}

        {/* TAB 2: OPERATIONS REGISTER LIBRARY */}
        {activeSubTab === 'operations' && (
          <motion.div
            key="operations"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-6"
          >
            {/* Inline Creation / Edit Form Overlay */}
            {showOpForm && (
              <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
                <motion.div 
                  initial={{ scale: 0.95, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 max-w-lg w-full rounded-2xl shadow-2xl overflow-hidden"
                >
                  <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                      {editingOp ? `Modify Master Operation [${editingOp.code}]` : 'Register Master Operation'}
                    </h3>
                    <button onClick={() => setShowOpForm(false)} className="text-slate-400 hover:text-slate-600">
                      <X className="h-5 w-5" />
                    </button>
                  </div>

                  <form onSubmit={handleOpSubmit} className="p-6 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs font-semibold block text-slate-500 mb-1">Operation Code*</label>
                        <input
                          type="text"
                          required
                          disabled={!!editingOp}
                          placeholder="e.g. OP-SEW-XX"
                          value={opFormState.code || ''}
                          onChange={(e) => setOpFormState(p => ({ ...p, code: e.target.value }))}
                          className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 text-sm focus:outline-none dark:text-white dark:bg-slate-800 disabled:opacity-50"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold block text-slate-500 mb-1">Standard Minute Value (SMV)*</label>
                        <input
                          type="number"
                          step="0.01"
                          required
                          placeholder="e.g. 1.25"
                          value={opFormState.smv || ''}
                          onChange={(e) => setOpFormState(p => ({ ...p, smv: parseFloat(e.target.value) }))}
                          className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 text-sm focus:outline-none dark:text-white dark:bg-slate-800"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-xs font-semibold block text-slate-500 mb-1">Operation Name*</label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Sleeve Hemming"
                        value={opFormState.name || ''}
                        onChange={(e) => setOpFormState(p => ({ ...p, name: e.target.value }))}
                        className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 text-sm focus:outline-none dark:text-white dark:bg-slate-800"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs font-semibold block text-slate-500 mb-1">Department Structure*</label>
                        <select
                          value={opFormState.departmentId || 'DEPT01'}
                          onChange={(e) => setOpFormState(p => ({ ...p, departmentId: e.target.value }))}
                          className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 text-sm focus:outline-none dark:text-white dark:bg-slate-800"
                        >
                          {departments.map(d => (
                            <option key={d.id} value={d.id}>{d.name}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="text-xs font-semibold block text-slate-500 mb-1">Machine Class Requirement*</label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. Overlock 4-Thread"
                          value={opFormState.machineType || ''}
                          onChange={(e) => setOpFormState(p => ({ ...p, machineType: e.target.value }))}
                          className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 text-sm focus:outline-none dark:text-white dark:bg-slate-800"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs font-semibold block text-slate-500 mb-1">Skill level / Minimum Grade*</label>
                        <select
                          value={opFormState.minSkillLevel || 'Intermediate'}
                          onChange={(e) => setOpFormState(p => ({ ...p, minSkillLevel: e.target.value as SkillLevel }))}
                          className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 text-sm focus:outline-none dark:text-white dark:bg-slate-800"
                        >
                          <option value="Expert">Expert</option>
                          <option value="Advanced">Advanced</option>
                          <option value="Intermediate">Intermediate</option>
                          <option value="Beginner">Beginner</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-xs font-semibold block text-slate-500 mb-1">Target Efficiency %*</label>
                        <input
                          type="number"
                          required
                          placeholder="80"
                          value={opFormState.targetEfficiency || 80}
                          onChange={(e) => setOpFormState(p => ({ ...p, targetEfficiency: parseInt(e.target.value) }))}
                          className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 text-sm focus:outline-none dark:text-white dark:bg-slate-800"
                        />
                      </div>
                    </div>

                    <div className="flex justify-end gap-3 pt-5 border-t border-slate-100 dark:border-slate-800 mt-5">
                      <button
                        type="button"
                        onClick={() => setShowOpForm(false)}
                        className="px-4 py-2 border border-slate-200 dark:border-slate-800 text-slate-500 hover:text-slate-700 hover:bg-slate-50 text-sm font-semibold rounded-xl"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm rounded-xl shadow-sm animate-pulse-once"
                      >
                        {editingOp ? 'Commit Changes' : 'Register Operation'}
                      </button>
                    </div>
                  </form>
                </motion.div>
              </div>
            )}

            {/* Table layout of operations library */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-950 text-slate-400 text-xs font-bold uppercase tracking-wider border-b border-slate-200 dark:border-slate-800">
                    <th className="py-4 px-4 w-28">Code</th>
                    <th className="py-4 px-4">Operation Description</th>
                    <th className="py-4 px-4">Associated Dept</th>
                    <th className="py-4 px-4 text-center">Standard SMV</th>
                    <th className="py-4 px-4">Machine Required</th>
                    <th className="py-4 px-3 text-center">Efficiency Target</th>
                    <th className="py-4 px-4 text-center">Grade Level</th>
                    <th className="py-4 px-4 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-850">
                  {filteredOps.map(op => {
                    const dept = departments.find(d => d.id === op.departmentId);
                    return (
                      <tr key={op.code} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 text-sm text-slate-700 dark:text-slate-300">
                        <td className="py-3 px-4 font-mono text-xs font-bold text-slate-500">
                          {op.code}
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-semibold block text-slate-900 dark:text-white">{op.name}</div>
                          <span className="text-[10px] text-slate-400 block font-normal">{op.skillCategory || 'Sewing Unit'}</span>
                        </td>
                        <td className="py-3 px-4">
                          <span className="px-2.5 py-1 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs shadow-sm">
                            {dept ? dept.name : 'Unknown Department'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center font-bold text-indigo-600 dark:text-indigo-400">
                          {op.smv} min
                        </td>
                        <td className="py-3 px-4 text-slate-500 italic max-w-xs truncate">
                          {op.machineType}
                        </td>
                        <td className="py-3 px-3 text-center font-semibold text-emerald-600 dark:text-emerald-400">
                          {op.targetEfficiency}%
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-blue-550/15 border border-blue-500/20 text-blue-600">
                            {op.minSkillLevel}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <div className="flex justify-center items-center gap-1.5">
                            <button
                              onClick={() => startEditOp(op)}
                              className="p-1 text-slate-400 hover:text-blue-500 rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
                            >
                              <Edit2 className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => handleOpDelete(op.code, op.name)}
                              className="p-1 text-slate-400 hover:text-rose-500 rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </motion.div>
        )}

        {/* TAB 3: DEPARTMENTS CENTER */}
        {activeSubTab === 'departments' && (
          <motion.div
            key="departments"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-6"
          >
            {/* Department Entry/Modify Modal Overlay */}
            {showDeptForm && (
              <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
                <motion.div 
                  initial={{ scale: 0.95, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 max-w-md w-full rounded-2xl shadow-2xl overflow-hidden"
                >
                  <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                      {editingDept ? 'Update Department Settings' : 'Create Factory Department'}
                    </h3>
                    <button onClick={() => setShowDeptForm(false)} className="text-slate-400 hover:text-slate-600">
                      <X className="h-5 w-5" />
                    </button>
                  </div>

                  <form onSubmit={handleDeptSubmit} className="p-6 space-y-4">
                    <div>
                      <label className="text-xs font-semibold block text-slate-500 mb-1">Department ID/Code*</label>
                      <input
                        type="text"
                        required
                        disabled={!!editingDept}
                        placeholder="e.g. DEPT08"
                        value={deptFormState.id || ''}
                        onChange={(e) => setDeptFormState(p => ({ ...p, id: e.target.value }))}
                        className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 text-sm focus:outline-none dark:text-white dark:bg-slate-800 disabled:opacity-50"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-semibold block text-slate-500 mb-1">Department Name*</label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Quality Assurance"
                        value={deptFormState.name || ''}
                        onChange={(e) => setDeptFormState(p => ({ ...p, name: e.target.value }))}
                        className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 text-sm focus:outline-none dark:text-white dark:bg-slate-800"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-semibold block text-slate-500 mb-1">Allocated Supervisor / Manager*</label>
                      <input
                        type="text"
                        required
                        placeholder="Supervisor / Line Manager Name"
                        value={deptFormState.supervisor || ''}
                        onChange={(e) => setDeptFormState(p => ({ ...p, supervisor: e.target.value }))}
                        className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 text-sm focus:outline-none dark:text-white dark:bg-slate-800"
                      />
                    </div>

                    <div className="flex justify-end gap-3 pt-5 border-t border-slate-100 dark:border-slate-800 mt-5">
                      <button
                        type="button"
                        onClick={() => setShowDeptForm(false)}
                        className="px-4 py-2 border border-slate-200 dark:border-slate-800 text-slate-500 hover:text-slate-700 hover:bg-slate-50 text-sm font-semibold rounded-xl"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm rounded-xl shadow-sm"
                      >
                        {editingDept ? 'Update Department' : 'Build Department'}
                      </button>
                    </div>
                  </form>
                </motion.div>
              </div>
            )}

            {/* Grid of department cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredDepts.map(d => {
                const liveCount = departmentCounts[d.id] || d.totalEmployees || 0;
                return (
                  <div key={d.id} className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-5 flex flex-col justify-between hover:shadow-sm transition-all shadow-xs">
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="font-mono text-xs text-slate-400 uppercase tracking-widest">{d.id}</span>
                        <span className="flex items-center gap-1.5">
                          <span className="h-2 w-2 rounded-full bg-green-500"></span>
                          <span className="text-[10px] font-bold text-slate-500 uppercase">{d.status}</span>
                        </span>
                      </div>
                      
                      <h4 className="text-lg font-bold text-slate-900 dark:text-white leading-tight">
                        {d.name}
                      </h4>

                      <div className="bg-slate-50 dark:bg-slate-950 p-3 rounded-xl border border-slate-100 dark:border-slate-850 flex justify-between items-center">
                        <div>
                          <span className="text-[10px] text-slate-400 block uppercase font-medium">Primary Manager</span>
                          <span className="text-xs font-semibold text-slate-800 dark:text-slate-300">{d.supervisor}</span>
                        </div>
                        <div className="text-right">
                          <span className="text-[10px] text-slate-400 block uppercase font-medium">Headcount</span>
                          <span className="text-sm font-bold text-blue-600">{liveCount} specialists</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex justify-end gap-2 border-t border-slate-100 dark:border-slate-800/80 mt-4 pt-3">
                      <button
                        onClick={() => startEditDept(d)}
                        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-3 py-1.5 text-xs font-semibold hover:border-slate-400 rounded-lg text-slate-600 transition-all flex items-center gap-1"
                      >
                        <Edit2 className="h-3 w-3" />
                        <span>Edit Settings</span>
                      </button>
                      <button
                        onClick={() => handleDeptDelete(d.id, d.name)}
                        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-3 py-1.5 text-xs font-semibold hover:border-rose-400 hover:text-rose-500 rounded-lg text-slate-600 transition-all flex items-center gap-1"
                      >
                        <Trash2 className="h-3 w-3" />
                        <span>Remove</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}

        {/* TAB 4: SEWING LINES LAYOUTS */}
        {activeSubTab === 'lines' && (
          <motion.div
            key="lines"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-6"
          >
            <div className="bg-slate-50 dark:bg-slate-800/20 border border-slate-200 dark:border-slate-800 p-5 rounded-2xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <h4 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider mb-2">Sewing Assembly Line Integrations</h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed max-w-3xl">
                  Display of sewing modules configured inside SWM. These lines receive dynamic workloads depending on the chosen Garment Style above.
                </p>
              </div>
              <button
                onClick={startAddLine}
                className="shrink-0 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 shadow-xs transition-all"
              >
                <Plus className="h-4 w-4" />
                <span>Add Production Line</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {productionLines.map(line => {
                const stylesAssignedThisLine = garmentStyles.filter(g => g.linesAllocated.includes(line.id));
                return (
                  <div key={line.id} className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-5 shadow-xs flex flex-col justify-between">
                    <div>
                      <div className="flex justify-between items-center mb-3">
                        <span className="text-sm font-bold text-blue-600">Line #{line.id}</span>
                        <span className="text-[10px] text-slate-400 uppercase font-mono">ID: {line.id}</span>
                      </div>
                      
                      <div className="space-y-1">
                        <span className="text-[10px] text-slate-400 block uppercase font-medium">Assigned Supervisor</span>
                        <span className="font-semibold block text-slate-800 dark:text-slate-300">{line.supervisor || 'Rajesh Mehta'}</span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 border-y border-slate-100 dark:border-slate-800/80 my-3 py-2 text-xs">
                        <div>
                          <span className="text-slate-400 block">Pushed Target</span>
                          <span className="font-bold text-slate-700 dark:text-slate-300">{line.targetQuantity}/hr</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block">Operators count</span>
                          <span className="font-bold text-slate-700 dark:text-slate-300">{line.operatorsCount || line.availableManpower || 0} techs</span>
                        </div>
                      </div>

                      <div className="space-y-1">
                        <span className="text-[10px] text-slate-400 uppercase tracking-widest block font-medium">Mapped Garment Style</span>
                        <div className="flex flex-col gap-1.5">
                          {stylesAssignedThisLine.length > 0 ? (
                            stylesAssignedThisLine.map(s => (
                              <div key={s.id} className="flex justify-between items-center bg-slate-50 dark:bg-slate-950 p-1.5 rounded border border-slate-100 dark:border-slate-800 text-[10px]">
                                <span className="font-semibold text-slate-600 dark:text-slate-300 truncate">{s.name}</span>
                                <span className="bg-emerald-100 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-300 px-1 py-0.2 rounded font-mono">
                                  {s.smv}m
                                </span>
                              </div>
                            ))
                          ) : (
                            <span className="text-[10px] italic text-slate-400">No active structures mapped</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="mt-5 pt-3 border-t border-slate-100 dark:border-slate-800/80 text-[11px] text-slate-400 flex flex-col gap-2">
                      <div className="flex justify-between items-center bg-slate-50 dark:bg-slate-950 p-1 rounded-lg">
                        <span className="pl-1">Module Status: </span>
                        <span className={`font-bold px-2 py-0.5 rounded text-[9px] uppercase ${
                          line.status === 'Running' ? 'bg-green-100 text-green-800 dark:bg-green-950/40 dark:text-green-300' :
                          line.status === 'Understaffed' ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300' :
                          'bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300'
                        }`}>
                          {line.status || 'Running'}
                        </span>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => startEditLine(line)}
                          className="flex-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 py-1 rounded-lg text-slate-600 dark:text-slate-300 hover:border-slate-400 hover:text-slate-900 dark:hover:text-white font-semibold flex justify-center items-center gap-1"
                        >
                          <Edit2 className="h-3 w-3" />
                          <span>Edit</span>
                        </button>
                        <button
                          onClick={() => handleLineDelete(line.id)}
                          className="px-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/20 rounded-lg flex justify-center items-center"
                          title="Delete Line"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Production Line Entry/Modify Modal Overlay */}
            {showLineForm && (
              <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
                <motion.div 
                  initial={{ scale: 0.95, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 max-w-md w-full rounded-2xl shadow-2xl overflow-hidden"
                >
                  <div className="p-6 border-b border-slate-100 dark:border-slate-800/80 flex justify-between items-center bg-slate-50 dark:bg-slate-950">
                    <h3 className="text-base font-bold text-slate-800 dark:text-white">
                      {editingLine ? `Edit Sewing Line Configuration - Line #${editingLine.id}` : 'Configure New Sewing Assembly Line'}
                    </h3>
                    <button 
                      onClick={() => setShowLineForm(false)}
                      className="p-1 px-2 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-bold"
                    >
                      ✕
                    </button>
                  </div>
                  
                  <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
                    <div>
                      <label className="block text-xs font-bold uppercase text-slate-400 mb-1.5">Line Identification Number</label>
                      <input 
                        type="number"
                        disabled={!!editingLine}
                        value={lineFormState.id || ''}
                        onChange={(e) => setLineFormState({ ...lineFormState, id: parseInt(e.target.value) || 0 })}
                        placeholder="e.g. 5"
                        className="w-full text-slate-800 dark:text-white bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg p-2.5 text-sm focus:outline-hidden focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold uppercase text-slate-400 mb-1.5">Assigned Production Supervisor</label>
                      <input 
                        type="text"
                        value={lineFormState.supervisor || ''}
                        onChange={(e) => setLineFormState({ ...lineFormState, supervisor: e.target.value })}
                        placeholder="e.g. Ramesh Mehta"
                        className="w-full text-slate-800 dark:text-white bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg p-2.5 text-sm focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold uppercase text-slate-400 mb-1.5">Hourly Target (pcs)</label>
                        <input 
                          type="number"
                          value={lineFormState.targetQuantity || ''}
                          onChange={(e) => setLineFormState({ ...lineFormState, targetQuantity: parseInt(e.target.value) || 0 })}
                          placeholder="e.g. 400"
                          className="w-full text-slate-800 dark:text-white bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg p-2.5 text-sm focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold uppercase text-slate-400 mb-1.5">Target Efficiency (%)</label>
                        <input 
                          type="number"
                          value={lineFormState.targetEfficiency || ''}
                          onChange={(e) => setLineFormState({ ...lineFormState, targetEfficiency: parseInt(e.target.value) || 0 })}
                          placeholder="e.g. 80"
                          className="w-full text-slate-800 dark:text-white bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg p-2.5 text-sm focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold uppercase text-slate-400 mb-1.5">Required Manpower</label>
                        <input 
                          type="number"
                          value={lineFormState.requiredManpower || ''}
                          onChange={(e) => setLineFormState({ ...lineFormState, requiredManpower: parseInt(e.target.value) || 0 })}
                          placeholder="e.g. 12"
                          className="w-full text-slate-800 dark:text-white bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg p-2.5 text-sm focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold uppercase text-slate-400 mb-1.5">Available Manpower</label>
                        <input 
                          type="number"
                          value={lineFormState.availableManpower || ''}
                          onChange={(e) => setLineFormState({ ...lineFormState, availableManpower: parseInt(e.target.value) || 0 })}
                          placeholder="e.g. 12"
                          className="w-full text-slate-800 dark:text-white bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg p-2.5 text-sm focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold uppercase text-slate-400 mb-1.5">Current Efficiency (%)</label>
                        <input 
                          type="number"
                          step="0.1"
                          value={lineFormState.baseEfficiency || ''}
                          onChange={(e) => setLineFormState({ ...lineFormState, baseEfficiency: parseFloat(e.target.value) || 0 })}
                          placeholder="e.g. 75"
                          className="w-full text-slate-800 dark:text-white bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg p-2.5 text-sm focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold uppercase text-slate-400 mb-1.5">Bottleneck Operation</label>
                        <select 
                          value={lineFormState.bottleneckOperation || ''}
                          onChange={(e) => setLineFormState({ ...lineFormState, bottleneckOperation: e.target.value })}
                          className="w-full text-slate-800 dark:text-white bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg p-2.5 text-sm focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                        >
                          <option value="">None / Balanced</option>
                          {operations.map(op => (
                            <option key={op.code} value={op.name}>{op.name}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold uppercase text-slate-400 mb-1.5">Line Running Status</label>
                      <select 
                        value={lineFormState.status || 'Running'}
                        onChange={(e) => setLineFormState({ ...lineFormState, status: e.target.value })}
                        className="w-full text-slate-800 dark:text-white bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg p-2.5 text-sm focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                      >
                        <option value="Running">Running</option>
                        <option value="Understaffed">Understaffed</option>
                        <option value="Critical">Critical</option>
                      </select>
                    </div>
                  </div>

                  <div className="p-6 bg-slate-50 dark:bg-slate-950 border-t border-slate-100 dark:border-slate-800/80 flex justify-end gap-3">
                    <button
                      onClick={() => setShowLineForm(false)}
                      className="px-4 py-2 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-900 rounded-lg text-xs font-bold uppercase tracking-wider"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSaveLine}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold uppercase tracking-wider flex items-center gap-1.5"
                    >
                      <Save className="h-3.5 w-3.5" />
                      <span>{editingLine ? 'Save Changes' : 'Create Module'}</span>
                    </button>
                  </div>
                </motion.div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Operation Bulletin Import Center Modal overlay */}
      <OperationBulletinImportCenter 
        isOpen={showImportCenter} 
        onClose={() => setShowImportCenter(false)} 
        triggerToast={triggerToast}
      />
    </div>
  );
};
