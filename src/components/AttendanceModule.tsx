/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { useAppState } from '../contexts/StateContext';
import { AttendanceStatus, AttendanceMethod, Employee } from '../types';
import { 
  Check, X, Clock, HelpCircle, Calendar, Users, 
  QrCode, HardDrive, Smartphone, Sparkles, Filter, ShieldAlert, Monitor, CheckCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { EmployeeAvatar } from './EmployeeAvatar';

export const AttendanceModule: React.FC = () => {
  const { 
    employees, attendance, markAttendance, currentUser, systemDate 
  } = useAppState();

  const [selectedDate, setSelectedDate] = useState(systemDate);
  const [lineFilter, setLineFilter] = useState<number | 'All'>('All');
  const [statusFilter, setStatusFilter] = useState<AttendanceStatus | 'All'>('All');
  
  React.useEffect(() => {
    setSelectedDate(systemDate);
  }, [systemDate]);
  
  // Gate Simulator states
  const [simulatMode, setSimulateMode] = useState<AttendanceMethod>('Biometric');
  const [scannedEmpId, setScannedEmpId] = useState('');
  const [scanStatus, setScanStatus] = useState<'idle' | 'success' | 'failed'>('idle');
  const [scanMessage, setScanMessage] = useState('');

  // Daily Statistics
  const todayRecords = attendance.filter(r => r.date === selectedDate);
  const totalRoster = employees.filter(e => lineFilter === 'All' || e.lineNumber === lineFilter);

  const getStatusOfEmployee = (empId: string) => {
    const record = todayRecords.find(r => r.employeeId === empId);
    return record ? record.status : 'Absent'; // default absent if not registered in logs
  };

  const getRecordOfEmployee = (empId: string) => {
    return todayRecords.find(r => r.employeeId === empId);
  };

  // Quick Action Buttons
  const handleMarkStatus = (empId: string, status: AttendanceStatus, method: AttendanceMethod) => {
    markAttendance(empId, selectedDate, status, method);
  };

  // Biometric / QR scanning simulator execution
  const handleSimulateScan = (e: React.FormEvent) => {
    e.preventDefault();
    if (!scannedEmpId.trim()) return;

    const emp = employees.find(e => e.id.toLowerCase() === scannedEmpId.trim().toLowerCase());
    if (emp) {
      // Mark as present today
      markAttendance(emp.id, selectedDate, 'Present', simulatMode);
      setScanStatus('success');
      setScanMessage(`Verified: ${emp.name} (${emp.id}) checked-in successfully as Present.`);
      setScannedEmpId('');
    } else {
      setScanStatus('failed');
      setScanMessage(`Clearance Error: ID Code "${scannedEmpId}" not found in factory registry.`);
    }

    setTimeout(() => {
      setScanStatus('idle');
      setScanMessage('');
    }, 4000);
  };

  // Filtered Roster display list
  const filteredRoster = totalRoster.filter(emp => {
    const status = getStatusOfEmployee(emp.id);
    const matchesStatus = statusFilter === 'All' || status === statusFilter;
    return matchesStatus;
  });

  const presentCount = totalRoster.filter(emp => getStatusOfEmployee(emp.id) === 'Present').length;
  const lateCount = totalRoster.filter(emp => getStatusOfEmployee(emp.id) === 'Late').length;
  const leaveCount = totalRoster.filter(emp => getStatusOfEmployee(emp.id) === 'Leave').length;
  const absentCount = totalRoster.length - (presentCount + lateCount + leaveCount);

  return (
    <div className="space-y-6">

      {/* Title block */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800 dark:text-neutral-100 font-display">
            Attendance Logging Center
          </h2>
          <p className="text-xs text-slate-500">Scan cards, verify biometric terminal registers, or allocate daily statuses</p>
        </div>

        {/* Date Selector input banner */}
        <div className="flex items-center space-x-2">
          <Calendar className="w-5.5 h-5.5 text-slate-400" />
          <input 
            type="date"
            value={selectedDate}
            onChange={e => setSelectedDate(e.target.value)}
            className="px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-xs font-mono font-bold text-slate-700 dark:text-slate-300 focus:outline-none"
          />
        </div>
      </div>

      {/* Gate Scanners Biometrics Simulator Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Hardware Terminal mock */}
        <div className="bg-slate-900 text-slate-100 rounded-xl p-5 shadow-lg border border-slate-800 flex flex-col justify-between relative overflow-hidden">
          <div className="absolute -bottom-10 -right-10 opacity-5 pointer-events-none">
            <QrCode className="w-40 h-40" />
          </div>
          
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-850 pb-2.5">
              <span className="flex items-center space-x-1.5 font-mono text-[10px] text-blue-400 font-bold uppercase tracking-widest">
                <Monitor className="w-4 h-4 text-sky-400 animate-pulse" />
                <span>Line Gate Scanner Simulator</span>
              </span>
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-ping"></span>
            </div>

            <div className="text-xs space-y-2">
              <p className="text-slate-400">Select simulated gate hardware input mechanism:</p>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { mode: 'Biometric' as AttendanceMethod, label: 'Fingerprint', icon: Sparkles },
                  { mode: 'RFID' as AttendanceMethod, label: 'RFID Fob', icon: HardDrive },
                  { mode: 'QR Code' as AttendanceMethod, label: 'QR Scanner', icon: QrCode }
                ].map(item => (
                  <button 
                    key={item.mode}
                    type="button" 
                    onClick={() => setSimulateMode(item.mode)}
                    className={`p-2 border rounded-lg text-center font-medium flex flex-col items-center justify-center space-y-1 transition text-[10px] ${
                      simulatMode === item.mode 
                        ? 'border-blue-500 bg-blue-950/40 text-blue-300' 
                        : 'border-slate-800 bg-slate-950/60 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <item.icon className="w-4 h-4.5" />
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Input scanning fields */}
            <form onSubmit={handleSimulateScan} className="space-y-2 pt-2 text-xs">
              <label className="block text-slate-400 font-semibold uppercase font-mono tracking-wide">
                Scanner Card ID Code Input
              </label>
              <div className="flex space-x-2">
                <input 
                  type="text" 
                  value={scannedEmpId}
                  onChange={e => setScannedEmpId(e.target.value)}
                  placeholder="e.g. EMP105, EMP111..."
                  className="flex-1 bg-black/60 border border-slate-850 p-2.5 rounded font-mono font-bold text-emerald-400 uppercase tracking-widest placeholder:text-slate-600 focus:outline-none focus:border-blue-500"
                />
                <button 
                  type="submit"
                  className="px-4 bg-blue-600 hover:bg-blue-700 text-white rounded font-bold transition"
                >
                  Scan ID
                </button>
              </div>
            </form>
          </div>

          {/* Feedback messages */}
          <div className="mt-4 pt-3 border-t border-slate-850 min-h-[50px] flex items-center">
            {scanStatus === 'idle' && (
              <span className="text-[11px] text-slate-500 font-mono text-center w-full">
                [ Waiting for fingerprint biometric tag scan... ]
              </span>
            )}
            {scanStatus === 'success' && (
              <div className="flex items-start space-x-2 text-xs text-emerald-400 bg-emerald-950/40 p-2.5 rounded border border-emerald-900/50 w-full animate-pulse">
                <CheckCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                <span>{scanMessage}</span>
              </div>
            )}
            {scanStatus === 'failed' && (
              <div className="flex items-start space-x-2 text-xs text-rose-455 bg-rose-950/40 p-2.5 rounded border border-rose-900/50 w-full">
                <ShieldAlert className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                <span className="text-red-300">{scanMessage}</span>
              </div>
            )}
          </div>
        </div>

        {/* Attendance KPI stats widgets for current selectedDate */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 col-span-1 lg:col-span-2 shadow-sm flex flex-col justify-between">
          <div>
            <h3 className="font-display font-semibold text-slate-800 dark:text-neutral-100 text-sm">
              Roster Summary ({selectedDate === '2026-06-04' ? 'Today' : selectedDate})
            </h3>
            <p className="text-xs text-slate-400">Total metrics distribution of assigned plant lines</p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 my-4">
            <div className="bg-emerald-50/50 dark:bg-emerald-950/10 p-3 rounded-lg border border-emerald-100 dark:border-emerald-900/20 text-center">
              <span className="text-2xl font-bold font-mono text-emerald-500 block">{presentCount}</span>
              <span className="text-[10px] text-slate-400 font-bold block">Present</span>
            </div>
            <div className="bg-amber-50/50 dark:bg-amber-955/10 p-3 rounded-lg border border-amber-100 dark:border-amber-900/20 text-center">
              <span className="text-2xl font-bold font-mono text-amber-500 block">{lateCount}</span>
              <span className="text-[10px] text-slate-400 font-bold block">Late / Delayed</span>
            </div>
            <div className="bg-blue-50/50 dark:bg-blue-955/10 p-3 rounded-lg border border-blue-105 dark:border-blue-900/20 text-center">
              <span className="text-2xl font-bold font-mono text-blue-500 block">{leaveCount}</span>
              <span className="text-[10px] text-slate-400 font-bold block">On Approved Leave</span>
            </div>
            <div className="bg-rose-50/50 dark:bg-rose-955/10 p-3 rounded-lg border border-rose-100 dark:border-rose-900/20 text-center">
              <span className="text-2xl font-bold font-mono text-red-500 block">{absentCount}</span>
              <span className="text-[10px] text-slate-400 font-bold block">Absentee Void</span>
            </div>
          </div>

          <div className="border-t border-slate-100 dark:border-slate-800 pt-3 text-xs text-slate-400 flex items-center justify-between">
            <span>Overall Attendance Completion Ratio:</span>
            <span className="font-mono font-bold text-slate-700 dark:text-slate-350 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded font-mono">
              {totalRoster.length > 0 ? Math.round(((presentCount + lateCount + leaveCount) / totalRoster.length) * 100) : 100}%
            </span>
          </div>
        </div>
      </div>

      {/* Active Shift Roster Markings Control Board */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm space-y-4">
        
        {/* List Filter header options */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 dark:bg-slate-950 p-2.5 rounded-lg border border-slate-100 dark:border-slate-850 text-xs">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-bold flex items-center space-x-1">
              <Filter className="w-4.5 h-4.5 text-blue-500" />
              <span>Table Filter:</span>
            </span>

            {/* Line select */}
            <div>
              <select 
                value={lineFilter} 
                onChange={e => setLineFilter(e.target.value === 'All' ? 'All' : Number(e.target.value))}
                className="py-1 px-2.5 bg-white dark:bg-slate-900 text-slate-700 dark:text-neutral-200 border border-slate-200 dark:border-slate-800 rounded focus:outline-none"
              >
                <option value="All">All Lines</option>
                <option value={1}>Sewing Line 1</option>
                <option value={2}>Sewing Line 2</option>
                <option value={3}>Sewing Line 3</option>
                <option value={4}>Sewing Line 4</option>
              </select>
            </div>

            {/* Status select */}
            <div>
              <select 
                value={statusFilter} 
                onChange={e => setStatusFilter(e.target.value as AttendanceStatus | 'All')}
                className="py-1 px-2.5 bg-white dark:bg-slate-900 text-slate-700 dark:text-neutral-200 border border-slate-200 dark:border-slate-800 rounded focus:outline-none"
              >
                <option value="All">All statuses</option>
                <option value="Present">Present (Checked-in)</option>
                <option value="Absent">Absent</option>
                <option value="Leave">Leave status</option>
                <option value="Late">Late / Delayed</option>
              </select>
            </div>
          </div>

          <span className="font-mono text-slate-400 uppercase text-[10px] block">
            Grid Records: {filteredRoster.length} Operators
          </span>
        </div>

        {/* Database Grid List */}
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left text-slate-600 dark:text-slate-400">
            <thead className="text-[10px] uppercase font-bold text-slate-400 tracking-wider bg-slate-50 dark:bg-slate-950/60 border-b border-slate-200 dark:border-slate-850">
              <tr>
                <th className="px-4 py-3">Operator</th>
                <th className="px-4 py-3">Allocated Line</th>
                <th className="px-4 py-3">Gate check-in</th>
                <th className="px-4 py-3">Gate check-out</th>
                <th className="px-4 py-3">Method type</th>
                <th className="px-4 py-3 text-center">Status state</th>
                {currentUser.role !== 'Industrial Engineer' && (
                  <th className="px-4 py-3 text-right">Floor Action Control</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-850">
              {filteredRoster.map(emp => {
                const stat = getStatusOfEmployee(emp.id);
                const rec = getRecordOfEmployee(emp.id);

                return (
                  <tr key={emp.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/30 transition-colors">
                    <td className="px-4 py-3 flex items-center space-x-3">
                      <EmployeeAvatar 
                        photoUrl={emp.photoUrl} 
                        name={emp.name} 
                        className="w-8 h-8 rounded-full" 
                      />
                      <div>
                        <span className="font-bold text-slate-800 dark:text-slate-200 block truncate">{emp.name}</span>
                        <span className="font-mono text-[9px] text-slate-400 uppercase">{emp.id} - {emp.designation}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-700 dark:text-slate-350">
                      {emp.lineNumber === 0 ? 'Off Line' : `Line ${emp.lineNumber}`}
                    </td>
                    <td className="px-4 py-3 font-mono">
                      {rec?.checkInTime ? (
                        <span className="flex items-center space-x-1">
                          <Clock className="w-3.5 h-3.5 text-slate-400" />
                          <span>{rec.checkInTime}</span>
                        </span>
                      ) : (
                        <span className="text-slate-400 italic">-- : --</span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono">
                      {rec?.checkOutTime ? (
                        <span className="flex items-center space-x-1">
                          <Clock className="w-3.5 h-3.5 text-slate-400" />
                          <span>{rec.checkOutTime}</span>
                        </span>
                      ) : (
                        <span className="text-slate-400 italic">-- : --</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {rec?.method ? (
                        <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-850 text-slate-500 font-medium">
                          {rec.method}
                        </span>
                      ) : (
                        <span className="text-slate-400 italic">No entry</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-center">
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                          stat === 'Present' 
                            ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/20' 
                            : stat === 'Absent'
                              ? 'bg-rose-50 text-rose-600 dark:bg-rose-950/20'
                              : stat === 'Late'
                                ? 'bg-amber-50 text-amber-600 dark:bg-amber-955/20'
                                : 'bg-blue-50 text-blue-600 dark:bg-blue-955/20'
                        }`}>
                          {stat}
                        </span>
                      </div>
                    </td>
                    {currentUser.role !== 'Industrial Engineer' && (
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-855 overflow-hidden">
                          {/* Present button */}
                          <button 
                            type="button"
                            title="Mark Present"
                            onClick={() => handleMarkStatus(emp.id, 'Present', 'Manual')}
                            className={`p-1 px-2 text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition border-r border-slate-150 dark:border-slate-850 ${
                              stat === 'Present' ? 'bg-emerald-50 dark:bg-emerald-950/20 font-bold' : ''
                            }`}
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          
                          {/* Late button */}
                          <button 
                            type="button"
                            title="Mark Late check-in"
                            onClick={() => handleMarkStatus(emp.id, 'Late', 'Manual')}
                            className={`p-1 px-2 text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-955/20 transition border-r border-slate-150 dark:border-slate-855 ${
                              stat === 'Late' ? 'bg-amber-50 dark:bg-amber-955/20 font-bold' : ''
                            }`}
                          >
                            <Clock className="w-3.5 h-3.5" />
                          </button>
                          
                          {/* Absent button */}
                          <button 
                            type="button"
                            title="Mark Absent"
                            onClick={() => handleMarkStatus(emp.id, 'Absent', 'Manual')}
                            className={`p-1 px-2 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-955/20 transition border-r border-slate-150 dark:border-slate-855 ${
                              stat === 'Absent' ? 'bg-rose-50 dark:bg-rose-955/20 font-bold' : ''
                            }`}
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>

                          {/* Leave status button */}
                          <button 
                            type="button"
                            title="Mark Leave approval"
                            onClick={() => handleMarkStatus(emp.id, 'Leave', 'Manual')}
                            className={`p-1 px-2 text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-955/20 transition ${
                              stat === 'Leave' ? 'bg-blue-50 dark:bg-blue-955/20 font-bold' : ''
                            }`}
                          >
                            <Calendar className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>

          {filteredRoster.length === 0 && (
            <div className="py-12 text-center">
              <span className="text-slate-400">No shift records match this specific grid filter criteria.</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
