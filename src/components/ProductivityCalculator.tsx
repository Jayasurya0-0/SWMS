/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { useAppState } from '../contexts/StateContext';
import { 
  Calculator, AlertTriangle, TrendingDown, HelpCircle, 
  ChevronRight, RefreshCw, Layers, Award, Sparkles, DollarSign, ArrowRight,
  Save, RotateCcw, Check
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export const ProductivityCalculator: React.FC = () => {
  const { employees, attendance, productionLines, systemDate } = useAppState();

  const today = systemDate;
  const todayAttendance = attendance.filter(record => record.date === today);

  // Compute live floor requirements and deployments
  const totalRequiredList = productionLines.reduce((acc, l) => acc + l.requiredManpower, 0) || 40;

  // Present/Active operators currently assigned to active lines
  const presentOperatorIds = new Set(
    todayAttendance
      .filter(r => r.status === 'Present' || r.status === 'Late')
      .map(r => r.employeeId.toUpperCase())
  );
  
  const totalActiveList = employees.filter(
    emp => emp.workforceAssignmentStatus === 'Assigned' && presentOperatorIds.has(emp.id.toUpperCase())
  ).length || 32;

  // Input parameters state - Loading from localStorage with fallback defaults
  const [smv, setSmv] = useState<number>(() => {
    const saved = localStorage.getItem('productivity_calc_smv');
    return saved ? parseFloat(saved) : 14.5;
  });
  const [requiredManpower, setRequiredManpower] = useState<number>(() => {
    const saved = localStorage.getItem('productivity_calc_requiredManpower');
    return saved ? parseInt(saved) : 15;
  });
  const [availableManpower, setAvailableManpower] = useState<number>(() => {
    const saved = localStorage.getItem('productivity_calc_availableManpower');
    return saved ? parseInt(saved) : 11;
  });
  const [workingHours, setWorkingHours] = useState<number>(() => {
    const saved = localStorage.getItem('productivity_calc_workingHours');
    return saved ? parseFloat(saved) : 8;
  });
  const [targetQuantity, setTargetQuantity] = useState<number>(() => {
    const saved = localStorage.getItem('productivity_calc_targetQuantity');
    return saved ? parseInt(saved) : 450;
  });
  const [avgEfficiency, setAvgEfficiency] = useState<number>(() => {
    const saved = localStorage.getItem('productivity_calc_avgEfficiency');
    return saved ? parseInt(saved) : 75;
  });
  const [garmentPrice, setGarmentPrice] = useState<number>(() => {
    const saved = localStorage.getItem('productivity_calc_garmentPrice');
    return saved ? parseInt(saved) : 1800;
  });

  // Success alert state
  const [showSaveSuccess, setShowSaveSuccess] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  // Handle Save Operation
  const handleSaveConfig = () => {
    localStorage.setItem('productivity_calc_smv', smv.toString());
    localStorage.setItem('productivity_calc_requiredManpower', requiredManpower.toString());
    localStorage.setItem('productivity_calc_availableManpower', availableManpower.toString());
    localStorage.setItem('productivity_calc_workingHours', workingHours.toString());
    localStorage.setItem('productivity_calc_targetQuantity', targetQuantity.toString());
    localStorage.setItem('productivity_calc_avgEfficiency', avgEfficiency.toString());
    localStorage.setItem('productivity_calc_garmentPrice', garmentPrice.toString());

    setSuccessMessage('Configuration Saved! Your custom parameters will now persist across pages and refreshes.');
    setShowSaveSuccess(true);
    setTimeout(() => {
      setShowSaveSuccess(false);
    }, 4500);
  };

  // Handle Reset Operation
  const handleResetConfig = () => {
    setSmv(14.5);
    setRequiredManpower(15);
    setAvailableManpower(11);
    setWorkingHours(8);
    setTargetQuantity(450);
    setAvgEfficiency(75);
    setGarmentPrice(1800);

    localStorage.removeItem('productivity_calc_smv');
    localStorage.removeItem('productivity_calc_requiredManpower');
    localStorage.removeItem('productivity_calc_availableManpower');
    localStorage.removeItem('productivity_calc_workingHours');
    localStorage.removeItem('productivity_calc_targetQuantity');
    localStorage.removeItem('productivity_calc_avgEfficiency');
    localStorage.removeItem('productivity_calc_garmentPrice');

    setSuccessMessage('Parameters Reset to System Defaults! Clean slate loaded.');
    setShowSaveSuccess(true);
    setTimeout(() => {
      setShowSaveSuccess(false);
    }, 4500);
  };

  // Calculations
  const differenceManpower = Math.max(0, requiredManpower - availableManpower);
  
  // Total available working minutes of active operators
  const totalAvailableMinutes = availableManpower * workingHours * 60;
  
  // Total target minutes under ideal staffing
  const totalTargetMinutes = requiredManpower * workingHours * 60;

  // Expected Production volume in pieces based on SMV and active efficiency
  // Expected pieces = Available Minutes * efficiency% / SMV
  const expectedProduction = Math.round(
    (totalAvailableMinutes * (avgEfficiency / 100)) / smv
  );

  // Target pieces under ideal full-staff posture
  const idealProductionSum = Math.round(
    (totalTargetMinutes * (avgEfficiency / 100)) / smv
  );

  const productionLoss = Math.max(0, idealProductionSum - expectedProduction);
  const efficiencyLoss = requiredManpower > 0 
    ? Math.round(((differenceManpower) / requiredManpower) * 100) 
    : 0;

  // Financial impact: Production Loss * Selling Price
  const financialImpact = productionLoss * garmentPrice;

  return (
    <div className="space-y-6">

      {/* Header text */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800 dark:text-neutral-100 font-display">
            Productivity Impact Calculator (Absenteeism SMV Model)
          </h2>
          <p className="text-xs text-slate-500">Solve industrial labor constraints and review target vs actual quantity losses instantly</p>
        </div>
      </div>

      {/* Success Persisted Notification Alert */}
      <AnimatePresence>
        {showSaveSuccess && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-250 dark:border-emerald-900/35 rounded-xl p-3.5 flex items-center space-x-3 shadow-xs"
          >
            <div className="p-1 rounded-full bg-emerald-500 text-white shrink-0">
              <Check className="w-3.5 h-3.5" />
            </div>
            <div className="text-xs">
              <span className="font-bold text-emerald-800 dark:text-emerald-450 block">Parameters Persisted!</span>
              <p className="text-slate-600 dark:text-slate-400 mt-0.5">{successMessage}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Dynamic Visual Dashboard Row of Outputs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        
        {/* Total Expected Volume */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm flex flex-col justify-between">
          <span className="text-[10px] text-slate-400 font-bold block uppercase tracking-wider">Expected shift output</span>
          <div className="my-2">
            <span className="text-3xl font-mono font-bold text-blue-600 dark:text-blue-400">
              {expectedProduction}
            </span>
            <span className="text-xs text-slate-400 block mt-0.5">pieces today</span>
          </div>
          <span className="text-[10px] text-slate-400">Shift Target: {targetQuantity} pcs</span>
        </div>

        {/* Expected Production Loss */}
        <div className="bg-white dark:bg-slate-900 border border-slate-205 dark:border-slate-800 rounded-xl p-4 shadow-sm flex flex-col justify-between">
          <span className="text-[10px] text-slate-400 font-bold block uppercase tracking-wider">Absenteeism Volume Deficit</span>
          <div className="my-2 text-rose-500">
            <span className="text-3xl font-mono font-bold font-extrabold text-quality-red">
              -{productionLoss}
            </span>
            <span className="text-xs block mt-0.5 font-bold">pieces lost</span>
          </div>
          <span className="text-[10px] text-slate-400">Target Ideal: {idealProductionSum} pcs</span>
        </div>

        {/* Line Efficiency Loss */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm flex flex-col justify-between">
          <span className="text-[10px] text-slate-400 font-bold block uppercase tracking-wider">Line Capacity Loss %</span>
          <div className="my-2 text-amber-500">
            <span className="text-3xl font-mono font-bold">
              {efficiencyLoss}%
            </span>
            <span className="text-xs block mt-0.5 font-bold">labor capacity drop</span>
          </div>
          <span className="text-[10px] text-slate-400">{differenceManpower} operators short</span>
        </div>

        {/* Financial Profit Loss Impact */}
        <div className="bg-slate-900 text-white border border-slate-850 rounded-xl p-4 shadow-lg flex flex-col justify-between relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
            <DollarSign className="w-16 h-16 text-emerald-400" />
          </div>
          <span className="text-[10px] text-slate-400 font-bold block uppercase tracking-wider">Financial Loss Impact</span>
          <div className="my-2 text-emerald-400">
            <span className="text-2xl font-mono font-bold">
              ₹{financialImpact.toLocaleString()}
            </span>
            <span className="text-xs block mt-0.5 text-slate-300 font-semibold">turnover loss</span>
          </div>
          <span className="text-[10px] text-slate-500 block">At ₹{garmentPrice} net per piece</span>
        </div>
      </div>

      {/* Inputs sliders layout panel */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Sliders panel */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm col-span-1 lg:col-span-7 space-y-5">
          <h3 className="font-display font-semibold text-slate-850 dark:text-neutral-100 text-sm">
            Configure Line parameters
          </h3>

          <div className="space-y-4 text-xs font-sans">
            
            {/* Live Data Link Option */}
            <div className="bg-blue-50/40 dark:bg-blue-950/15 border border-blue-200/30 p-3.5 rounded-xl flex items-start gap-3">
              <Sparkles className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <span className="text-[11px] font-bold text-slate-705 dark:text-neutral-250 block">Synchronize Real-Time Shift Allocations</span>
                <p className="text-[10px] text-slate-400 leading-normal">
                  Our workforce assignment register tracks <strong className="text-emerald-500">{totalRequiredList} required line operators</strong> vs. <strong className="text-blue-500">{totalActiveList} actually stationed and productive</strong> on the sewing floor.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setRequiredManpower(totalRequiredList);
                    setAvailableManpower(totalActiveList);
                  }}
                  className="mt-1.5 inline-flex items-center gap-1 bg-blue-600 hover:bg-blue-700 text-[10px] text-white font-extrabold px-3 py-1 rounded transition duration-200 cursor-pointer"
                >
                  Apply Live Floor Gaps ({Math.max(0, totalRequiredList - totalActiveList)} Station Shortages)
                </button>
              </div>
            </div>

            {/* SMV slider */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-center font-bold">
                <span className="text-slate-650 dark:text-slate-300">Garment SMV (Standard Minute Value)</span>
                <div className="flex items-center gap-1.5">
                  <input 
                    type="number"
                    min="0.1"
                    max="500"
                    step="0.1"
                    value={smv}
                    onChange={e => {
                      const val = parseFloat(e.target.value);
                      setSmv(isNaN(val) ? 0 : val);
                    }}
                    className="w-20 px-2 py-0.5 text-right font-mono text-xs rounded border border-slate-205 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-blue-600 dark:text-blue-400 focus:ring-1 focus:ring-blue-500 outline-none"
                    placeholder="14.5"
                  />
                  <span className="text-slate-400 text-[10px]">min</span>
                </div>
              </div>
              <input 
                type="range" min="3" max="30" step="0.5"
                value={smv >= 3 && smv <= 30 ? smv : (smv < 3 ? 3 : 30)} 
                onChange={e => setSmv(Number(e.target.value))}
                className="w-full h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-blue-600 dark:bg-slate-800"
              />
              <span className="text-[10px] text-slate-400 italic block">Higher SMV indicates complex apparel assembly like jackets. Type any value directly.</span>
            </div>

            {/* Manpower sliders */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <div className="flex justify-between items-center font-bold">
                  <span className="text-slate-650 dark:text-slate-300">Required Headcount</span>
                  <div className="flex items-center gap-1.5">
                    <input 
                      type="number"
                      min="1"
                      max="1000"
                      value={requiredManpower}
                      onChange={e => {
                        const val = parseInt(e.target.value);
                        setRequiredManpower(isNaN(val) ? 0 : val);
                      }}
                      className="w-16 px-1.5 py-0.5 text-right font-mono text-xs rounded border border-slate-205 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-white focus:ring-1 focus:ring-blue-500 outline-none"
                    />
                    <span className="text-slate-400 text-[10px]">ops</span>
                  </div>
                </div>
                <input 
                  type="range" min="4" max="100"
                  value={requiredManpower >= 4 && requiredManpower <= 100 ? requiredManpower : (requiredManpower < 4 ? 4 : 100)} 
                  onChange={e => setRequiredManpower(Number(e.target.value))}
                  className="w-full h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-slate-600 dark:bg-slate-800"
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex justify-between items-center font-bold">
                  <span className="text-slate-650 dark:text-slate-300">Available Headcount</span>
                  <div className="flex items-center gap-1.5">
                    <input 
                      type="number"
                      min="0"
                      max="1000"
                      value={availableManpower}
                      onChange={e => {
                        const val = parseInt(e.target.value);
                        setAvailableManpower(isNaN(val) ? 0 : val);
                      }}
                      className="w-16 px-1.5 py-0.5 text-right font-mono text-xs rounded border border-slate-205 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-blue-600 dark:text-blue-400 focus:ring-1 focus:ring-blue-500 outline-none"
                    />
                    <span className="text-slate-400 text-[10px]">ops</span>
                  </div>
                </div>
                <input 
                  type="range" min="1" max={Math.max(1, requiredManpower)}
                  value={availableManpower >= 1 && availableManpower <= requiredManpower ? availableManpower : (availableManpower < 1 ? 1 : (requiredManpower || 1))} 
                  onChange={e => setAvailableManpower(Number(e.target.value))}
                  className="w-full h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-blue-600 dark:bg-slate-800"
                />
              </div>
            </div>

            {/* Shift working hours */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <div className="flex justify-between items-center font-bold">
                  <span className="text-slate-650 dark:text-slate-300">Average Shift Time</span>
                  <div className="flex items-center gap-1.5">
                    <input 
                      type="number"
                      min="0.5"
                      max="24"
                      step="0.5"
                      value={workingHours}
                      onChange={e => {
                        const val = parseFloat(e.target.value);
                        setWorkingHours(isNaN(val) ? 0 : val);
                      }}
                      className="w-16 px-1.5 py-0.5 text-right font-mono text-xs rounded border border-slate-205 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-white focus:ring-1 focus:ring-blue-500 outline-none"
                    />
                    <span className="text-slate-400 text-[10px]">hrs</span>
                  </div>
                </div>
                <input 
                  type="range" min="4" max="12"
                  value={workingHours >= 4 && workingHours <= 12 ? workingHours : (workingHours < 4 ? 4 : 12)} 
                  onChange={e => setWorkingHours(Number(e.target.value))}
                  className="w-full h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-slate-600 dark:bg-slate-800"
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex justify-between items-center font-bold">
                  <span className="text-slate-650 dark:text-slate-300">Mean worker efficiency %</span>
                  <div className="flex items-center gap-1.5">
                    <input 
                      type="number"
                      min="1"
                      max="100"
                      value={avgEfficiency}
                      onChange={e => {
                        const val = parseInt(e.target.value);
                        setAvgEfficiency(isNaN(val) ? 0 : Math.min(100, val));
                      }}
                      className="w-16 px-1.5 py-0.5 text-right font-mono text-xs rounded border border-slate-205 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-blue-600 dark:text-blue-400 focus:ring-1 focus:ring-blue-500 outline-none"
                    />
                    <span className="text-slate-400 text-[10px]">%</span>
                  </div>
                </div>
                <input 
                  type="range" min="30" max="100" step="5"
                  value={avgEfficiency >= 30 && avgEfficiency <= 100 ? avgEfficiency : (avgEfficiency < 30 ? 30 : 100)} 
                  onChange={e => setAvgEfficiency(Number(e.target.value))}
                  className="w-full h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-blue-600 dark:bg-slate-800"
                />
              </div>
            </div>

            {/* Price unit net */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-center font-bold">
                <span className="text-slate-650 dark:text-slate-300">Garment FOB Sell Price per piece (₹)</span>
                <div className="flex items-center gap-1.5">
                  <input 
                    type="number"
                    min="1"
                    max="100000"
                    step="10"
                    value={garmentPrice}
                    onChange={e => {
                      const val = parseInt(e.target.value);
                      setGarmentPrice(isNaN(val) ? 0 : val);
                    }}
                    className="w-24 px-1.5 py-0.5 text-right font-mono text-xs rounded border border-slate-205 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-white focus:ring-1 focus:ring-blue-500 outline-none"
                  />
                  <span className="text-slate-400 text-[10px]">INR</span>
                </div>
              </div>
              <input 
                type="range" min="300" max="5000" step="100"
                value={garmentPrice >= 300 && garmentPrice <= 5000 ? garmentPrice : (garmentPrice < 300 ? 300 : 5000)} 
                onChange={e => setGarmentPrice(Number(e.target.value))}
                className="w-full h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-slate-600 dark:bg-slate-800"
              />
            </div>

            {/* Target Quantity slider/input */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-center font-bold">
                <span className="text-slate-650 dark:text-slate-300">Shift Target Pieces (target quantity)</span>
                <div className="flex items-center gap-1.5">
                  <input 
                    type="number"
                    min="10"
                    max="10000"
                    value={targetQuantity}
                    onChange={e => {
                      const val = parseInt(e.target.value);
                      setTargetQuantity(isNaN(val) ? 0 : val);
                    }}
                    className="w-20 px-2 py-0.5 text-right font-mono text-xs rounded border border-slate-205 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-white focus:ring-1 focus:ring-blue-500 outline-none"
                  />
                  <span className="text-slate-400 text-[10px]">pcs</span>
                </div>
              </div>
              <input 
                type="range" min="100" max="2500" step="50"
                value={targetQuantity >= 100 && targetQuantity <= 2500 ? targetQuantity : (targetQuantity < 100 ? 100 : 2500)} 
                onChange={e => setTargetQuantity(Number(e.target.value))}
                className="w-full h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-blue-600 dark:bg-slate-800"
              />
            </div>

            {/* Persistence Buttons row */}
            <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-100 dark:border-slate-800/80">
              <button
                type="button"
                onClick={handleResetConfig}
                className="px-3 py-1.5 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-850 text-slate-500 dark:text-slate-400 font-bold rounded-lg text-xs flex items-center gap-1.5 transition duration-200 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset Defaults</span>
              </button>
              <button
                type="button"
                onClick={handleSaveConfig}
                className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold rounded-lg text-xs flex items-center gap-1.5 shadow-sm transition duration-200 cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Save Configuration</span>
              </button>
            </div>
          </div>
        </div>

        {/* Analytical guide card explaining calculations */}
        <div className="bg-white dark:bg-slate-900 border border-slate-205 dark:border-slate-800 rounded-xl p-5 shadow-sm col-span-1 lg:col-span-5 space-y-4">
          <div>
            <h3 className="font-display font-semibold text-slate-800 dark:text-neutral-100 text-sm">
              IE Production Math Model
            </h3>
            <p className="text-xs text-slate-400">Industrial engineering formulas linking absenteeism to financial numbers</p>
          </div>

          <div className="space-y-4 text-xs font-mono text-slate-500 leading-relaxed bg-slate-50 dark:bg-slate-950 p-4 border border-slate-100 dark:border-slate-850 rounded-xl">
            <div className="space-y-1">
              <p className="font-bold text-slate-700 dark:text-slate-300 select-none border-b border-slate-200 dark:border-slate-850 pb-0.5">A. Available labor Capacity minutes</p>
              <p className="text-[11px] font-mono select-all">
                Minutes = activeCount ({availableManpower}) * shiftHours ({workingHours}) * 60min<br />
                <strong>= {totalAvailableMinutes.toLocaleString()} minutes today</strong>
              </p>
            </div>

            <div className="space-y-1">
              <p className="font-bold text-slate-700 dark:text-slate-300 select-none border-b border-slate-200 dark:border-slate-800 pb-0.5">B. Output volume calculation</p>
              <p className="text-[11px] font-mono select-all">
                Output = (Minutes * efficiency% ({avgEfficiency}%)) / SMV ({smv})<br />
                <strong>= {expectedProduction} pieces today</strong>
              </p>
            </div>

            <div className="space-y-1">
              <p className="font-bold text-slate-700 dark:text-slate-300 select-none border-b border-slate-200 dark:border-slate-800 pb-0.5">C. Loss calculation</p>
              <p className="text-[11px] font-mono">
                Volume Loss = {idealProductionSum} (Ideal) - {expectedProduction} (Active)<br />
                <strong>= {productionLoss} pieces loss today</strong>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
