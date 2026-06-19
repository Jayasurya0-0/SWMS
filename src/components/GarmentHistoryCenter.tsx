import React, { useState, useMemo } from 'react';
import { useAppState } from '../contexts/StateContext';
import { GarmentStyleHistory, GarmentStyle } from '../types';
import { 
  History, Sliders, Calendar, Clock, User, MessageSquare, AlertCircle, 
  Search, SlidersHorizontal, ArrowRight, ArrowUpRight, ArrowDownRight, 
  Award, Key, Compass, Cpu, LineChart, CheckCircle2, ChevronRight,
  Trash2, RefreshCw
} from 'lucide-react';
import { StyleChangeModal } from './StyleChangeModal';

export function GarmentHistoryCenter() {
  const { 
    garmentStyleHistory, 
    garmentStyles, 
    productionLines, 
    getLineRunningStyle,
    currentGarment,
    currentUser,
    deleteGarmentStyleHistory
  } = useAppState();

  const isIEOrAdmin = currentUser?.role === 'Industrial Engineer' || currentUser?.role === 'Admin' || currentUser?.role === 'Production Manager';
  const isAdmin = currentUser?.role === 'Admin';

  // Filter/Search variables
  const [selectedLineFilter, setSelectedLineFilter] = useState<string>('All');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedHistoryItem, setSelectedHistoryItem] = useState<GarmentStyleHistory | null>(
    garmentStyleHistory[0] || null
  );
  const [activeLineChange, setActiveLineChange] = useState<number | null>(null);

  // Filtered History
  const filteredHistory = useMemo(() => {
    return garmentStyleHistory.filter(h => {
      const matchLine = selectedLineFilter === 'All' || String(h.lineNumber) === selectedLineFilter;
      
      const prevStyle = garmentStyles.find(g => g.id === h.prevGarmentStyleId);
      const newStyle = garmentStyles.find(g => g.id === h.newGarmentStyleId);
      
      const matchText = searchTerm.trim() === '' || 
        h.prevGarmentStyleId.toLowerCase().includes(searchTerm.toLowerCase()) ||
        h.newGarmentStyleId.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (prevStyle?.name && prevStyle.name.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (newStyle?.name && newStyle.name.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (h.reason && h.reason.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (h.remarks && h.remarks.toLowerCase().includes(searchTerm.toLowerCase()));

      return matchLine && matchText;
    }).sort((a, b) => {
      // Sort chronologically descending
      const dateStrA = a.effectiveDate || a.changeDate;
      const timeStrA = a.effectiveTime || a.changeTime || '00:00';
      const dateStrB = b.effectiveDate || b.changeDate;
      const timeStrB = b.effectiveTime || b.changeTime || '00:00';
      const dateA = new Date(`${dateStrA}T${timeStrA}`);
      const dateB = new Date(`${dateStrB}T${timeStrB}`);
      return dateB.getTime() - dateA.getTime();
    });
  }, [garmentStyleHistory, garmentStyles, selectedLineFilter, searchTerm]);

  // Set default selected item if current selected is not in filtered list
  React.useEffect(() => {
    if (filteredHistory.length > 0) {
      if (!selectedHistoryItem || !filteredHistory.some(f => f.id === selectedHistoryItem.id)) {
        setSelectedHistoryItem(filteredHistory[0]);
      }
    } else {
      setSelectedHistoryItem(null);
    }
  }, [filteredHistory, selectedHistoryItem]);

  // Style change Impact Analysis calculations
  const impactAnalysis = useMemo(() => {
    if (!selectedHistoryItem) return null;

    const prevStyle = garmentStyles.find(g => g.id === selectedHistoryItem.prevGarmentStyleId) || currentGarment;
    const newStyle = garmentStyles.find(g => g.id === selectedHistoryItem.newGarmentStyleId);

    if (!prevStyle || !newStyle) return null;

    const prevSmv = prevStyle.smv || 1.15;
    const newSmv = newStyle.smv || 1.15;
    const smvDiff = newSmv - prevSmv;
    const smvPct = (smvDiff / prevSmv) * 100;

    const prevManpower = prevStyle.requiredManpower || 30;
    const newManpower = newStyle.requiredManpower || 30;
    const manpowerDiff = newManpower - prevManpower;
    const manpowerPct = (manpowerDiff / prevManpower) * 100;

    const prevOps = prevStyle.operations?.length || 0;
    const newOps = newStyle.operations?.length || 0;
    const opsDiff = newOps - prevOps;
    const opsPct = prevOps > 0 ? (opsDiff / prevOps) * 100 : 0;

    return {
      prevStyle,
      newStyle,
      smv: { prev: prevSmv, next: newSmv, diff: smvDiff, pct: smvPct },
      manpower: { prev: prevManpower, next: newManpower, diff: manpowerDiff, pct: manpowerPct },
      ops: { prev: prevOps, next: newOps, diff: opsDiff, pct: opsPct }
    };
  }, [selectedHistoryItem, garmentStyles, currentGarment]);

  return (
    <div className="flex-1 overflow-y-auto p-4 lg:p-6 space-y-6">
      
      {/* HEADER SECTION */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <span className="bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-400 font-mono text-[9px] px-2.5 py-0.5 rounded-full uppercase tracking-wider font-bold">
            Audit Ledger & Versioning Station
          </span>
          <h1 className="font-display font-extrabold text-[#1E293B] dark:text-white text-xl md:text-2xl mt-1 tracking-tight flex items-center gap-2">
            <History className="h-6 w-6 text-slate-400" />
            <span>Style Change Management Ledger</span>
          </h1>
          <p className="text-xs text-slate-405 dark:text-slate-400 mt-1">
            Real-time tracking, permanent traceability audits, and engineering impact simulations for garment transformations.
          </p>
        </div>
      </div>

      {/* CURRENT LINE STATUS DASHBOARD */}
      <div className="space-y-3">
        <h2 className="font-display font-bold text-[#1E293B] dark:text-neutral-250 text-xs uppercase tracking-wider flex items-center gap-1.5">
          <Compass className="h-4 w-4 text-blue-500" />
          <span>Active Sew Lines Running Status</span>
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          {productionLines.map(line => {
            const runningStyle = getLineRunningStyle(line.id);
            const targetEff = line.targetEfficiency || 68;
            const baseEff = line.baseEfficiency || 55;
            
            // Bottleneck calculation: highest SMV operation in style
            const bottleneckOp = runningStyle?.operations?.reduce(
              (max, op) => op.smv > max.smv ? op : max, 
              runningStyle.operations[0]
            );

            return (
              <div 
                key={line.id} 
                className="bg-white dark:bg-slate-900 border border-slate-205 dark:border-slate-800 p-4 rounded-2xl shadow-xs hover:border-slate-300 dark:hover:border-slate-700 transition"
              >
                <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-850 pb-2 mb-2">
                  <span className="font-extrabold text-sm text-slate-800 dark:text-neutral-200">
                    Line 0{line.id}
                  </span>
                  <span className="text-[10px] font-mono text-slate-400 bg-slate-50 dark:bg-slate-950 px-2 py-0.5 rounded border border-slate-100 dark:border-slate-800">
                    {line.supervisor || 'Unassigned'}
                  </span>
                </div>
                
                <div className="space-y-2 text-[11px]">
                  <div>
                    <span className="text-slate-400 block font-mono text-[9px] uppercase">Active Style ID:</span>
                    <strong className="text-slate-750 dark:text-slate-200 block truncate" title={runningStyle?.name}>
                      {runningStyle?.id || 'STY-POLO-001'} &middot; <span className="font-light text-slate-500">{runningStyle?.name?.split(' ')[0]}</span>
                    </strong>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-2 border-t border-slate-100 dark:border-slate-850 pt-1.5">
                    <div>
                      <span className="text-slate-400 block font-mono text-[9px] uppercase">Base Eff:</span>
                      <strong className="text-slate-700 dark:text-slate-300 font-mono">{baseEff}%</strong>
                    </div>
                    <div>
                      <span className="text-slate-400 block font-mono text-[9px] uppercase">Target Eff:</span>
                      <strong className="text-slate-700 dark:text-slate-300 font-mono text-blue-500">{targetEff}%</strong>
                    </div>
                  </div>

                  <div className="border-t border-slate-100 dark:border-slate-850 pt-1.5 leading-tight">
                    <span className="text-slate-400 block font-mono text-[9px] uppercase">Bottleneck Op:</span>
                    <strong className="text-amber-600 dark:text-amber-400 text-[10px] truncate block" title={bottleneckOp?.name || 'Manual Attach'}>
                      {bottleneckOp?.operationCode || 'OP01'} - {bottleneckOp?.name || 'Manual Attach'} ({bottleneckOp?.smv || 0.18}m)
                    </strong>
                  </div>

                  {isIEOrAdmin && (
                    <div className="border-t border-slate-100 dark:border-slate-850 pt-2 mt-1">
                      <button
                        type="button"
                        onClick={() => setActiveLineChange(line.id)}
                        className="w-full inline-flex items-center justify-center gap-1.5 px-2 py-1 bg-blue-50 hover:bg-blue-100 dark:bg-blue-955/20 dark:hover:bg-blue-950/40 text-blue-600 dark:text-blue-400 font-extrabold text-[10px] rounded-lg transition-all cursor-pointer"
                      >
                        <RefreshCw className="h-2.5 w-2.5 animate-spin-slow" />
                        <span>Change Style</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* CORE TIMELINE AND DETAILED LEDGER GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* LEFT COMPONENT: STYLES CHRONOLOGICAL TIMELINE LEDGER (SPAN 7) */}
        <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-205 dark:border-slate-800 rounded-2xl p-4 lg:p-5 shadow-xs space-y-4">
          
          {/* Filtering Header */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-850">
            <h3 className="font-display font-black text-slate-800 dark:text-neutral-100 text-sm">
              Past Style Mutations ({filteredHistory.length})
            </h3>
            
            <div className="flex flex-wrap items-center gap-2">
              {/* Searh */}
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="ID, name, reason..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8 pr-3 py-1.5 bg-slate-50 dark:bg-slate-950 text-xs border border-slate-200 dark:border-slate-800 rounded-xl outline-none focus:ring-1 focus:ring-blue-500 w-full sm:w-[150px]"
                />
              </div>

              {/* Line dropdown */}
              <select
                value={selectedLineFilter}
                onChange={(e) => setSelectedLineFilter(e.target.value)}
                className="p-1.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-705 dark:text-slate-300 rounded-xl outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="All">All Lines</option>
                {productionLines.map(line => (
                  <option key={line.id} value={String(line.id)}>Line {line.id < 10 ? `0${line.id}` : line.id}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Timeline List */}
          {filteredHistory.length === 0 ? (
            <div className="text-center py-20 text-slate-400 flex flex-col items-center justify-center space-y-2">
              <History className="h-10 w-10 text-slate-300 stroke-1" />
              <p className="text-xs font-semibold">No style changes found matching current filters.</p>
              <p className="text-[10px]">Alter search filters or assign a new style in Line Balance Assist tab.</p>
            </div>
          ) : (
            <div className="relative border-l-2 border-slate-100 dark:border-slate-850 ml-3 pl-5 space-y-6 max-h-[580px] overflow-y-auto pr-1">
              {filteredHistory.map((h, idx) => {
                const isSelected = selectedHistoryItem?.id === h.id;
                const prevStyle = garmentStyles.find(g => g.id === h.prevGarmentStyleId);
                const newStyle = garmentStyles.find(g => g.id === h.newGarmentStyleId);

                return (
                  <div 
                    key={h.id}
                    onClick={() => setSelectedHistoryItem(h)}
                    className={`relative group cursor-pointer p-3.5 rounded-xl border transition-all ${
                      isSelected 
                        ? 'bg-blue-50 border-blue-200 dark:bg-blue-950/20 dark:border-blue-800' 
                        : 'bg-slate-50/50 hover:bg-slate-50 border-transparent hover:border-slate-200 dark:bg-slate-950/10 dark:hover:bg-slate-950/30'
                    }`}
                  >
                    {/* Timestamp bullet wrapper */}
                    <div className={`absolute -left-[27px] top-6 w-3 h-3 rounded-full transition-colors border-2 ${
                      isSelected 
                        ? 'bg-blue-600 border-blue-200 dark:border-blue-600' 
                        : 'bg-white border-slate-300 dark:bg-slate-900 dark:border-slate-700'
                    }`} />

                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-slate-400 font-mono">
                        <div className="flex items-center gap-1.5">
                          <span className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded font-bold">
                            Line {h.lineNumber}
                          </span>
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {h.effectiveDate || h.changeDate}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {h.effectiveTime || h.changeTime || '08:00'}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-blue-500 font-semibold">{h.changedBy || 'IE Rahul'}</span>
                          {isAdmin && (
                            <button
                              type="button"
                              title="Delete style change history record"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (window.confirm("Are you sure you want to permanently delete this style mutation record? This action cannot be undone.")) {
                                  deleteGarmentStyleHistory(h.id);
                                }
                              }}
                              className="text-slate-400 hover:text-red-500 dark:text-slate-600 dark:hover:text-red-400 p-1 rounded transition-colors cursor-pointer"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="text-xs font-bold text-slate-650 dark:text-slate-400 line-through truncate max-w-[150px]">
                          {prevStyle?.name || h.prevGarmentStyleId}
                        </div>
                        <ArrowRight className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                        <div className="text-xs font-black text-slate-800 dark:text-white truncate max-w-[180px] flex items-center gap-1">
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                          <span>{newStyle?.name || h.newGarmentStyleId}</span>
                        </div>
                      </div>

                      {h.reason && (
                        <div className="text-[11px] text-slate-550 dark:text-slate-400 font-sans flex items-start gap-1">
                          <MessageSquare className="h-3 w-3 mt-0.5 text-slate-400 shrink-0" />
                          <span className="line-clamp-2">Reason: <strong>{h.reason}</strong> {h.remarks ? `· ${h.remarks}` : ''}</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

        </div>

        {/* RIGHT COMPONENT: DETAILED STYLE CHANGE IMPACT ANALYSES (SPAN 5) */}
        <div className="lg:col-span-5 space-y-4">
          
          <div className="bg-white dark:bg-slate-900 border border-slate-205 dark:border-slate-800 rounded-2xl p-4 lg:p-5 shadow-xs">
            <h3 className="font-display font-black text-slate-800 dark:text-neutral-100 text-sm border-b border-slate-100 dark:border-slate-850 pb-3 mb-4 flex items-center gap-2">
              <Cpu className="h-4.5 w-4.5 text-blue-500 animate-pulse" />
              <span>Style Change Impact Analyzer</span>
            </h3>

            {!selectedHistoryItem || !impactAnalysis ? (
              <div className="text-center py-20 text-slate-400 space-y-1">
                <AlertCircle className="h-10 w-10 text-slate-300 stroke-1 mx-auto" />
                <p className="text-xs font-semibold">No Trace Ledger Record Selected</p>
                <p className="text-[10px]">Click any stylistic mutation on the timeline of the left panel to execute real-time balancing audits.</p>
              </div>
            ) : (
              <div className="space-y-5">
                
                {/* Meta details */}
                <div className="p-3 bg-slate-50 dark:bg-slate-950 border border-slate-150 rounded-xl space-y-1">
                  <div className="text-[10px] font-mono text-slate-400">ASSIGNED LOG REF #</div>
                  <div className="font-mono text-xs font-bold text-slate-700 dark:text-slate-300 truncate">{selectedHistoryItem.id}</div>
                  <div className="text-[11px] text-slate-500 mt-1">
                    Mutation effective date is <strong className="text-slate-650 dark:text-slate-350">{selectedHistoryItem.effectiveDate}</strong> at <strong className="text-slate-650 dark:text-slate-350">{selectedHistoryItem.effectiveTime || "08:00"}</strong>, authorized securely by <strong className="text-slate-650 dark:text-slate-350">{selectedHistoryItem.changedBy || 'IE Engineer'}</strong>.
                  </div>
                </div>

                {/* Compare specs */}
                <div className="space-y-3.5">
                  <h4 className="text-[11.5px] font-bold text-slate-405 dark:text-slate-350 uppercase tracking-wide">
                    Sequence & Capacity Differentials:
                  </h4>
                  
                  {/* SMV Parameter row */}
                  <div className="flex items-center justify-between p-3 border border-slate-100 dark:border-slate-850/80 rounded-xl">
                    <div>
                      <span className="text-[11px] text-slate-400 block font-bold uppercase">Standard SMV (Total)</span>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs font-bold text-slate-400 line-through font-mono">{impactAnalysis.smv.prev} min</span>
                        <ArrowRight className="h-3 w-3 text-slate-400" />
                        <span className="text-sm font-black text-slate-800 dark:text-neutral-150 font-mono">{impactAnalysis.smv.next} min</span>
                      </div>
                    </div>
                    
                    <div className={`p-1.5 px-2.5 rounded-lg text-xs font-extrabold flex items-center gap-1 font-mono ${
                      impactAnalysis.smv.diff > 0 
                        ? 'bg-rose-50 dark:bg-rose-950/20 text-rose-600' 
                        : impactAnalysis.smv.diff < 0 
                          ? 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600' 
                          : 'bg-slate-100 text-slate-500'
                    }`}>
                      {impactAnalysis.smv.diff > 0 ? (
                        <>
                          <ArrowUpRight className="h-3.5 w-3.5" />
                          <span>+{impactAnalysis.smv.pct.toFixed(1)}% (Thicker)</span>
                        </>
                      ) : impactAnalysis.smv.diff < 0 ? (
                        <>
                          <ArrowDownRight className="h-3.5 w-3.5" />
                          <span>{impactAnalysis.smv.pct.toFixed(1)}% (Leaner)</span>
                        </>
                      ) : (
                        <span>No Diff</span>
                      )}
                    </div>
                  </div>

                  {/* Required manpower row */}
                  <div className="flex items-center justify-between p-3 border border-slate-100 dark:border-slate-850/80 rounded-xl">
                    <div>
                      <span className="text-[11px] text-slate-400 block font-bold uppercase">Required Manpower</span>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs font-bold text-slate-400 line-through font-mono">{impactAnalysis.manpower.prev} Operators</span>
                        <ArrowRight className="h-3 w-3 text-slate-400" />
                        <span className="text-sm font-black text-slate-800 dark:text-neutral-150 font-mono">{impactAnalysis.manpower.next} Operators</span>
                      </div>
                    </div>
                    
                    <div className={`p-1.5 px-2.5 rounded-lg text-xs font-extrabold flex items-center gap-1 font-mono ${
                      impactAnalysis.manpower.diff > 0 
                        ? 'bg-rose-50 dark:bg-rose-950/20 text-rose-600' 
                        : impactAnalysis.manpower.diff < 0 
                          ? 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600' 
                          : 'bg-slate-100 text-slate-500'
                    }`}>
                      {impactAnalysis.manpower.diff > 0 ? (
                        <>
                          <ArrowUpRight className="h-3.5 w-3.5" />
                          <span>+{impactAnalysis.manpower.diff} Operators</span>
                        </>
                      ) : impactAnalysis.manpower.diff < 0 ? (
                        <>
                          <ArrowDownRight className="h-3.5 w-3.5" />
                          <span>{impactAnalysis.manpower.diff} Operators</span>
                        </>
                      ) : (
                        <span>Equal</span>
                      )}
                    </div>
                  </div>

                  {/* Bulletins Operations length row */}
                  <div className="flex items-center justify-between p-3 border border-slate-100 dark:border-slate-850/80 rounded-xl">
                    <div>
                      <span className="text-[11px] text-slate-400 block font-bold uppercase">Standard Operations Bulletin Size</span>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs font-bold text-slate-400 line-through font-mono">{impactAnalysis.ops.prev} ops</span>
                        <ArrowRight className="h-3 w-3 text-slate-400" />
                        <span className="text-sm font-black text-slate-800 dark:text-neutral-150 font-mono">{impactAnalysis.ops.next} ops</span>
                      </div>
                    </div>
                    
                    <div className={`p-1.5 px-2.5 rounded-lg text-xs font-extrabold flex items-center gap-1 font-mono ${
                      impactAnalysis.ops.diff > 0 
                        ? 'bg-rose-50 dark:bg-rose-950/20 text-rose-600' 
                        : impactAnalysis.ops.diff < 0 
                          ? 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600' 
                          : 'bg-slate-100 text-slate-500'
                    }`}>
                      {impactAnalysis.ops.diff > 0 ? (
                        <>
                          <ArrowUpRight className="h-3.5 w-3.5" />
                          <span>+{impactAnalysis.ops.diff} Operations</span>
                        </>
                      ) : impactAnalysis.ops.diff < 0 ? (
                        <>
                          <ArrowDownRight className="h-3.5 w-3.5" />
                          <span>{impactAnalysis.ops.diff} Operations</span>
                        </>
                      ) : (
                        <span>Clean</span>
                      )}
                    </div>
                  </div>

                </div>

                {/* Intelligent Balancing Insights recommendations Card */}
                <div className="p-3 bg-blue-500/5 border border-blue-500/10 rounded-xl space-y-1.5">
                  <div className="flex items-center gap-1.5 text-xs font-extrabold text-blue-600 dark:text-blue-400 uppercase tracking-widest">
                    <LineChart className="h-4 w-4" />
                    <span>IE Balancing Advice Warning</span>
                  </div>
                  <p className="text-[11px] text-slate-500 leading-relaxed font-sans mt-1">
                    {impactAnalysis.smv.diff > 0 ? (
                      <span>
                        The new style <strong>{impactAnalysis.newStyle.name}</strong> has a higher SMV of <strong>{impactAnalysis.smv.next} min</strong>. To stay within target Shift output, consider reallocating surplus assistants or increasing Line {selectedHistoryItem.lineNumber} target operators count by up to <strong>{Math.ceil(impactAnalysis.manpower.diff)} operators</strong> to prevent severe conveyor bottleneck build-ups.
                      </span>
                    ) : impactAnalysis.smv.diff < 0 ? (
                      <span>
                        The new style <strong>{impactAnalysis.newStyle.name}</strong> is lighter than the previous by <strong>{Math.abs(impactAnalysis.smv.diff).toFixed(2)} min</strong>. You can safely release up to <strong>{Math.abs(impactAnalysis.manpower.diff)} operators</strong> to the available placement helper pool without affecting output yield metrics.
                      </span>
                    ) : (
                      <span>
                        Style SMV is unchanged. No immediate layout reconfiguration or re-balancing is strictly mandated. Maintain standard operator supervisor configurations.
                      </span>
                    )}
                  </p>
                </div>

              </div>
            )}

          </div>

        </div>

      </div>

      {activeLineChange !== null && (
        <StyleChangeModal 
          isOpen={true} 
          onClose={() => setActiveLineChange(null)} 
          lineNumber={activeLineChange} 
        />
      )}

    </div>
  );
}
