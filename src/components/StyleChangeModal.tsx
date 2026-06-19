import React, { useState } from 'react';
import { useAppState } from '../contexts/StateContext';
import { X, Calendar, Clock, RefreshCw, AlertCircle, CheckCircle2 } from 'lucide-react';

interface StyleChangeModalProps {
  isOpen: boolean;
  onClose: () => void;
  lineNumber: number;
}

export function StyleChangeModal({ isOpen, onClose, lineNumber }: StyleChangeModalProps) {
  const { 
    garmentStyles, 
    currentGarment, 
    changeLineStyle, 
    systemDate,
    productionLines 
  } = useAppState();

  const activeStyles = garmentStyles.filter(g => g.status === 'Active');
  
  const [selectedStyleId, setSelectedStyleId] = useState<string>(
    activeStyles[0]?.id || currentGarment?.id || ''
  );
  const [effectiveDate, setEffectiveDate] = useState<string>(systemDate || new Date().toISOString().split('T')[0]);
  const [effectiveTime, setEffectiveTime] = useState<string>('08:00');
  const [reason, setReason] = useState<string>('Buyer Order Transition');
  const [remarks, setRemarks] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const currentLine = productionLines.find(l => l.id === lineNumber);
  const selectedStyleDetails = garmentStyles.find(g => g.id === selectedStyleId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStyleId) return;

    setIsSubmitting(true);
    try {
      await changeLineStyle(
        lineNumber,
        selectedStyleId,
        effectiveDate,
        effectiveTime,
        reason,
        remarks
      );
      setSuccessMsg(`Garment Style assigned to Line ${lineNumber} successfully!`);
      setTimeout(() => {
        setSuccessMsg(null);
        setIsSubmitting(false);
        onClose();
      }, 1500);
    } catch (err) {
      console.error(err);
      setIsSubmitting(false);
    }
  };

  const standardReasons = [
    'Buyer Order Transition',
    'Production Balancing Adjustments',
    'Equipment Outage Re-routing',
    'Urgent Shipment Priority',
    'Pilot Run / Sample Production',
    'Manual Reallocation Plan'
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs transition-opacity duration-350"
        onClick={onClose}
      />

      {/* Modal Content */}
      <div className="relative w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 shadow-2xl p-6 transition-all duration-350 animate-in fade-in zoom-in-95">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h3 className="text-base font-extrabold text-slate-850 dark:text-neutral-100 flex items-center gap-2">
              <RefreshCw className="h-4.5 w-4.5 text-blue-500 animate-spin-slow" />
              <span>Manual Garment Change</span>
            </h3>
            <p className="text-[11px] text-slate-400 mt-1">
              IE Style Management Control Portal &middot; <strong className="text-slate-650 dark:text-slate-350">Line #{lineNumber}</strong> {currentLine?.supervisor ? `(Supervisor: ${currentLine.supervisor})` : ''}
            </p>
          </div>
          <button 
            type="button"
            className="p-1 px-2.5 rounded-lg text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-800 dark:hover:text-neutral-100 cursor-pointer"
            onClick={onClose}
          >
            <X className="h-4.5 w-4.5" />
          </button>
        </div>

        {successMsg ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <CheckCircle2 className="h-14 w-14 text-emerald-500 mb-3 animate-bounce" />
            <h4 className="text-sm font-bold text-slate-800 dark:text-slate-205">{successMsg}</h4>
            <p className="text-xs text-slate-400 mt-1">Auto-synchronizing other workspace modules...</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            
            {/* Style Selection */}
            <div>
              <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                Select New Active Garment Style
              </label>
              
              {activeStyles.length === 0 ? (
                <div className="flex items-center gap-2 p-3 bg-amber-500/10 border border-amber-500/15 rounded-xl text-amber-600">
                  <AlertCircle className="h-4 w-4" />
                  <span className="text-xs font-semibold">No active garment styles are configured. Create/Activate styles in the configuration engine module.</span>
                </div>
              ) : (
                <select
                  value={selectedStyleId}
                  onChange={(e) => setSelectedStyleId(e.target.value)}
                  className="w-full py-2 px-3 border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 font-sans text-xs font-semibold text-slate-700 dark:text-slate-300 rounded-xl outline-none focus:ring-1 focus:ring-blue-500"
                >
                  {activeStyles.map(g => (
                    <option key={g.id} value={g.id}>
                      {g.id} - {g.name} ({g.type}, SMV: {g.smv} min)
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Quick specifications breakdown card */}
            {selectedStyleDetails && (
              <div className="p-3.5 bg-slate-50 dark:bg-slate-950/40 border border-slate-100 dark:border-slate-800/80 rounded-xl space-y-1 text-[11.5px] text-slate-500 leading-relaxed">
                <span className="text-[10px] font-mono text-blue-500 font-bold block uppercase tracking-wide">Allocated Style Metrics Preview:</span>
                <div>Operations Bulletin Length: <strong className="text-slate-700 dark:text-slate-300">{selectedStyleDetails.operations?.length || 0} Standard Sequences</strong></div>
                <div>Target SMV Value: <strong className="text-slate-700 dark:text-slate-300 font-mono">{selectedStyleDetails.smv || 0} min</strong></div>
                <div>Standard Ideal Manpower: <strong className="text-slate-700 dark:text-slate-300 font-mono">{selectedStyleDetails.requiredManpower || 15} Operators</strong></div>
              </div>
            )}

            {/* Shift timings & Effective Scheduling */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5 text-slate-455" />
                  <span>Effective Date</span>
                </label>
                <input
                  type="date"
                  required
                  value={effectiveDate}
                  onChange={(e) => setEffectiveDate(e.target.value)}
                  className="w-full py-2 px-3 border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 font-sans text-xs font-semibold text-slate-700 dark:text-slate-300 rounded-xl outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5 text-slate-455" />
                  <span>Effective Time</span>
                </label>
                <input
                  type="time"
                  required
                  value={effectiveTime}
                  onChange={(e) => setEffectiveTime(e.target.value)}
                  className="w-full py-2 px-3 border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 font-sans text-xs font-semibold text-slate-700 dark:text-slate-300 rounded-xl outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Reason selection */}
            <div>
              <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                Reason for Style Mutation assignment
              </label>
              <select
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full py-2 px-3 border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 font-sans text-xs font-semibold text-slate-700 dark:text-slate-300 rounded-xl outline-none focus:ring-1 focus:ring-blue-500"
              >
                {standardReasons.map(r => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>

            {/* Remarks / Notes */}
            <div>
              <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                Special Remarks & Supervision Guidelines (Optional)
              </label>
              <textarea
                placeholder="IE instructions, bottlenecks warnings, or supervisor remarks..."
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                rows={2}
                className="w-full py-2 px-3 border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 font-sans text-xs font-semibold text-slate-700 dark:text-slate-300 rounded-xl outline-none focus:ring-1 focus:ring-blue-500 placeholder:text-slate-400"
              />
            </div>

            {/* Actions button */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 border border-slate-200 dark:border-slate-850 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-305 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting || !selectedStyleId}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-not-allowed text-white rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition whitespace-nowrap cursor-pointer shadow-md shadow-blue-500/10"
              >
                {isSubmitting ? (
                  <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
                <span>Confirm Style Transition</span>
              </button>
            </div>

          </form>
        )}

      </div>
    </div>
  );
}
