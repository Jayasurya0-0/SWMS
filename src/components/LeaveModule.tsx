/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { useAppState } from '../contexts/StateContext';
import { LeaveType, LeaveRequest } from '../types';
import { 
  Plus, Calendar, CheckSquare, XSquare, Clock, X, Info, 
  HelpCircle, User, MessageCircle, ClipboardList, ShieldAlert
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { EmployeeAvatar } from './EmployeeAvatar';

export const LeaveModule: React.FC = () => {
  const { 
    employees, leaveRequests, submitLeaveRequest, approveRejectLeave, currentUser 
  } = useAppState();

  const [isSubmitModalOpen, setIsSubmitModalOpen] = useState(false);
  const [selectedReq, setSelectedReq] = useState<LeaveRequest | null>(null);

  // Form states
  const [formEmpId, setFormEmpId] = useState('');
  const [formLeaveType, setFormLeaveType] = useState<LeaveType>('Casual');
  const [formStart, setFormStart] = useState('2026-06-05');
  const [formEnd, setFormEnd] = useState('2026-06-06');
  const [formReason, setFormReason] = useState('');

  const [approvalComment, setApprovalComment] = useState('');

  const activeEmployeeDetail = employees.find(e => e.id === formEmpId);

  // Role permissions check
  const canSupervisorApprove = currentUser.role === 'Supervisor' || currentUser.role === 'Admin';
  const canHRApprove = currentUser.role === 'HR Manager' || currentUser.role === 'Admin';

  const handleOpenRequest = () => {
    setFormEmpId('');
    setFormLeaveType('Casual');
    setFormStart('2026-06-05');
    setFormEnd('2026-06-06');
    setFormReason('');
    setIsSubmitModalOpen(true);
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formEmpId || !formReason.trim()) return;

    submitLeaveRequest({
      employeeId: formEmpId,
      leaveType: formLeaveType,
      startDate: formStart,
      endDate: formEnd,
      reason: formReason
    });

    setIsSubmitModalOpen(false);
  };

  const handleApproveReject = (id: string, action: 'Approved' | 'Rejected') => {
    approveRejectLeave(id, action, approvalComment);
    setApprovalComment('');
    setSelectedReq(null);
  };

  return (
    <div className="space-y-6">

      {/* Head layout */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800 dark:text-neutral-100 font-display">
            Leave Ledger & Approval Pipelines
          </h2>
          <p className="text-xs text-slate-500">Track and authorize worker casual, medical, and emergency timesheets</p>
        </div>

        {/* Request addition button available for all */}
        <button 
          type="button" 
          onClick={handleOpenRequest}
          className="flex items-center space-x-1.5 px-3 py-1.5 bg-blue-600 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors self-start"
        >
          <Plus className="w-4 h-4" />
          <span>Apply Timeoff</span>
        </button>
      </div>

      {/* Main Board mapping list */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Active Leave Requests database queue */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm col-span-1 lg:col-span-8 space-y-4">
          <div>
            <h3 className="font-display font-semibold text-slate-800 dark:text-neutral-100 text-sm">
              Pending & Historic Approval Flow Queue
            </h3>
            <p className="text-xs text-slate-400">Workflow: Operator submission → Floor Supervisor sign-off → HR final approval audit</p>
          </div>

          <div className="space-y-3 max-h-[420px] overflow-y-auto custom-scrollbar pr-1">
            {leaveRequests.map(req => {
              const emp = employees.find(e => e.id === req.employeeId);
              
              const statusColor = req.status === 'Approved' 
                ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/20' 
                : req.status === 'Rejected'
                  ? 'bg-rose-50 text-rose-600 dark:bg-rose-955/20'
                  : 'bg-amber-50 text-amber-600 dark:bg-amber-955/20 animate-pulse';

              // calculates total days requested
              const start = new Date(req.startDate);
              const end = new Date(req.endDate);
              const totalDaysNum = Math.round((end.getTime() - start.getTime()) / (1000 * 3600 * 24)) + 1;

              return (
                <div 
                  key={req.id}
                  className={`p-4 border rounded-xl flex flex-col sm:flex-row sm:items-center justify-between text-xs transition gap-4 ${
                    req.status === 'Pending' 
                      ? 'border-amber-200 bg-amber-50/10 dark:border-amber-950/20 shadow-xs' 
                      : 'border-slate-100 dark:border-slate-800 hover:bg-slate-50/55 dark:hover:bg-slate-850'
                  }`}
                >
                  <div className="flex items-start space-x-3.5 min-w-0 flex-1">
                    <EmployeeAvatar 
                      photoUrl={emp?.photoUrl} 
                      name={emp?.name || 'Unknown'} 
                      className="w-10 h-10 rounded-full" 
                    />
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center space-x-1.5 flex-wrap">
                        <span className="font-bold text-slate-800 dark:text-slate-155 truncate block">
                          {emp?.name || 'Unknown Operator'}
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">({req.employeeId})</span>
                        <span className="px-2 py-0.5 rounded text-[9px] bg-slate-100 dark:bg-slate-800 text-slate-500 font-bold">
                          {req.leaveType}
                        </span>
                      </div>
                      
                      <div className="text-slate-450 leading-relaxed max-w-sm truncate text-[11px] block italic">
                        "{req.reason}"
                      </div>

                      <span className="text-[10px] text-slate-400 block font-mono">
                        Dates: {req.startDate} to {req.endDate} ({totalDaysNum} days total)
                      </span>
                    </div>
                  </div>

                  {/* Actions checklist or status badge layout */}
                  <div className="flex sm:flex-col sm:items-end justify-between items-center sm:gap-1.5 flex-shrink-0">
                    <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider font-mono ${statusColor}`}>
                      {req.status}
                    </span>

                    {/* Pending control flow buttons */}
                    {req.status === 'Pending' ? (
                      <div className="flex space-x-1.5 mt-1">
                        <button 
                          type="button" 
                          onClick={() => setSelectedReq(req)}
                          className="px-2.5 py-1.5 bg-slate-900 dark:bg-slate-800 text-white rounded text-[10px] font-bold hover:bg-blue-600 transition"
                        >
                          Review details
                        </button>
                      </div>
                    ) : (
                      <div className="text-slate-400 text-[10px] text-right font-mono space-y-0.5">
                        {req.approvedBySupervisor && <div>Sup approved: {req.approvedBySupervisor}</div>}
                        {req.approvedByHR && <div>HR approved: {req.approvedByHR}</div>}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {leaveRequests.length === 0 && (
              <div className="py-12 text-center bg-slate-50 dark:bg-slate-950 border border-transparent rounded-lg">
                <span className="text-slate-400">No active leave petitions in system files.</span>
              </div>
            )}
          </div>
        </div>

        {/* Leave balance rules and guidelines block */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm col-span-1 lg:col-span-4 space-y-4">
          <div>
            <h3 className="font-display font-semibold text-slate-800 dark:text-neutral-100 text-sm">
              Standard Leave Class Regulations
            </h3>
            <p className="text-xs text-slate-400">Annual employee allocations under Mill HR directives</p>
          </div>

          <div className="space-y-4 text-xs font-sans">
            
            <div className="p-3 border border-slate-100 dark:border-slate-800/80 rounded-lg space-y-1">
              <span className="font-bold text-slate-700 dark:text-slate-350 block">Casual Leave Class (CL)</span>
              <p className="text-slate-400 leading-normal text-[11px]">
                8 days annually. Eligible for non-emergencies. Requires 3-day buffer advance supervisor notify.
              </p>
            </div>

            <div className="p-3 border border-slate-100 dark:border-slate-800/80 rounded-lg space-y-1">
              <span className="font-bold text-emerald-500 block">Medical/Sick Leave (SL)</span>
              <p className="text-slate-400 leading-normal text-[11px]">
                10 days annually. Authorizable for illnesses. Requires registered physician certificate on resume shift.
              </p>
            </div>

            <div className="p-3 border border-slate-100 dark:border-slate-800/85 rounded-lg space-y-1">
              <span className="font-bold text-teal-500 block">Earned Leave (EL / PL)</span>
              <p className="text-slate-400 leading-normal text-[11px]">
                Up to 15 days, calculated based on perfect shift performance. Encashable upon fiscal closure.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Submission Modal screen */}
      <AnimatePresence>
        {isSubmitModalOpen && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
            <motion.div 
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl w-full max-w-md overflow-hidden"
            >
              <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between">
                <h3 className="font-display font-semibold text-sm uppercase">Apply Timeoff Request</h3>
                <button type="button" onClick={() => setIsSubmitModalOpen(false)} className="text-slate-400 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleFormSubmit} className="p-5 space-y-4 text-xs font-sans">
                
                {/* Operator ID input */}
                <div className="space-y-1">
                  <label className="block text-slate-700 dark:text-neutral-200 font-semibold">Employee ID code</label>
                  <select
                    value={formEmpId}
                    onChange={e => setFormEmpId(e.target.value)}
                    required
                    className="w-full p-2 bg-slate-50 dark:bg-slate-950 text-slate-705 border border-slate-205 dark:border-slate-800 rounded focus:outline-none"
                  >
                    <option value="">-- Choose Operator ID --</option>
                    {employees.map(emp => (
                      <option key={emp.id} value={emp.id}>{emp.name} ({emp.id}) · Line {emp.lineNumber}</option>
                    ))}
                  </select>
                </div>

                {/* Balance indicators if ID is selected */}
                {activeEmployeeDetail && (
                  <div className="p-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-102 dark:border-slate-850 rounded grid grid-cols-4 gap-2 text-center text-[10px]">
                    <div>
                      <span className="text-slate-400 block font-bold">CASUAL</span>
                      <span className="font-bold text-slate-705 dark:text-white">{activeEmployeeDetail.leaveBalances.casual} days</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block font-bold">SICK</span>
                      <span className="font-bold text-blue-500">{activeEmployeeDetail.leaveBalances.sick} days</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block font-bold">EARNED</span>
                      <span className="font-bold text-emerald-500">{activeEmployeeDetail.leaveBalances.earned} days</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block font-bold">EMERGENCY</span>
                      <span className="font-bold text-orange-500">{activeEmployeeDetail.leaveBalances.emergency} days</span>
                    </div>
                  </div>
                )}

                {/* Leave class and date row */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="block text-slate-700 dark:text-neutral-200 font-semibold">Leave Type</label>
                    <select
                      value={formLeaveType}
                      onChange={e => setFormLeaveType(e.target.value as LeaveType)}
                      className="w-full p-2 bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-neutral-200 border border-slate-200 dark:border-slate-800 rounded focus:outline-none"
                    >
                      <option value="Casual">Casual Leave (CL)</option>
                      <option value="Sick Leave">Sick/Medical Leave (SL)</option>
                      <option value="Emergency Leave">Emergency leave</option>
                      <option value="Earned Leave">Earned Leave (EL)</option>
                    </select>
                  </div>

                  <div className="space-y-1 font-mono">
                    <label className="block text-slate-700 dark:text-neutral-200 font-semibold">Start date</label>
                    <input 
                      type="date" 
                      value={formStart}
                      onChange={e => setFormStart(e.target.value)}
                      className="w-full p-2 bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-neutral-200 border border-slate-205 dark:border-slate-800 rounded focus:outline-none"
                    />
                  </div>
                </div>

                {/* End dates and Reason */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1 font-mono">
                    <label className="block text-slate-700 dark:text-neutral-200 font-semibold">End date</label>
                    <input 
                      type="date" 
                      value={formEnd}
                      onChange={e => setFormEnd(e.target.value)}
                      className="w-full p-2 bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-neutral-200 border border-slate-205 dark:border-slate-800 rounded focus:outline-none"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="block text-slate-705 dark:text-neutral-200 font-semibold">Application Reason</label>
                  <textarea 
                    rows={3}
                    placeholder="Provide authentic explanation for supervisor audit approvals..."
                    value={formReason}
                    onChange={e => setFormReason(e.target.value)}
                    required
                    className="w-full p-2 bg-slate-50 dark:bg-slate-955 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-neutral-200 rounded focus:outline-none focus:ring-1 focus:ring-slate-500"
                  />
                </div>

                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-end space-x-2.5">
                  <button 
                    type="button" 
                    onClick={() => setIsSubmitModalOpen(false)}
                    className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-350 rounded font-bold"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit" 
                    className="px-5 py-2 bg-blue-600 text-white rounded font-bold hover:bg-slate-800 transition"
                  >
                    Submit request
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Review Approval Modal popup */}
      <AnimatePresence>
        {selectedReq && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              this-class-exit="true"
              className="bg-white dark:bg-slate-900 rounded-xl max-w-sm w-full border border-slate-200 dark:border-slate-800 overflow-hidden"
            >
              <div className="px-5 py-4 bg-slate-900 text-white flex justify-between items-center">
                <h4 className="font-display font-semibold text-xs uppercase">Review Authorization: {selectedReq.id}</h4>
                <button type="button" onClick={() => setSelectedReq(null)} className="text-slate-400 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-5 space-y-4 text-xs font-sans">
                
                <div className="space-y-1 bg-slate-50 dark:bg-slate-950 p-3 rounded border border-slate-102 dark:border-slate-850">
                  <span className="text-[10px] text-slate-400 font-bold block uppercase tracking-wider">Application Reason</span>
                  <p className="font-medium text-slate-700 dark:text-slate-300">"{selectedReq.reason}"</p>
                </div>

                {/* Interactive comment form field */}
                <div className="space-y-1">
                  <label className="block text-slate-750 dark:text-slate-300 font-semibold mb-1">Authorization Comments</label>
                  <input 
                    type="text" 
                    placeholder="e.g. Cleared by floor supervisor. Backups arranged."
                    value={approvalComment}
                    onChange={e => setApprovalComment(e.target.value)}
                    className="w-full p-2 bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-neutral-200 border border-slate-200 dark:border-slate-800 rounded focus:outline-none"
                  />
                </div>

                {/* Workflow approvals guidance notes */}
                <div className="p-2 bg-amber-50 dark:bg-amber-955/20 border border-amber-100 rounded text-[10px] text-amber-600 leading-normal flex items-start space-x-1.5">
                  <Info className="w-4 h-4 text-warning-orange flex-shrink-0" />
                  <span>
                    <strong>Workflow Audit:</strong> {currentUser.role} log entry is required to commit this change to factory shift registers.
                  </span>
                </div>

                {/* Action buttons */}
                <div className="pt-2 border-t border-slate-100 dark:border-slate-800 grid grid-cols-2 gap-3">
                  <button 
                    type="button" 
                    onClick={() => handleApproveReject(selectedReq.id, 'Rejected')}
                    className="py-2 bg-rose-50 text-rose-600 border border-rose-100 hover:bg-rose-100 dark:bg-rose-955/20 dark:hover:bg-rose-900/30 rounded font-bold"
                  >
                    Reject request
                  </button>
                  <button 
                    type="button" 
                    onClick={() => handleApproveReject(selectedReq.id, 'Approved')}
                    className="py-2 bg-emerald-600 text-white rounded font-bold hover:bg-emerald-700 transition"
                  >
                    Authorized Approval
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
