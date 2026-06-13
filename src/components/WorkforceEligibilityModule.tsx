import React, { useState, useMemo } from 'react';
import { useAppState } from '../contexts/StateContext';
import { 
  Users, Check, X, ShieldAlert, BadgeInfo, Search, Filter, 
  HelpCircle, Settings, CheckSquare, Sparkles, Building2, UserX, UserCheck
} from 'lucide-react';
import { motion } from 'motion/react';
import { EmployeeAvatar } from './EmployeeAvatar';

export const WorkforceEligibilityModule: React.FC = () => {
  const { 
    employees, 
    productionWorkforcePool, 
    updateWorkforceEligibility, 
    updateDepartmentEligibility,
    theme 
  } = useAppState();

  const [searchTerm, setSearchTerm] = useState('');
  const [deptFilter, setDeptFilter] = useState('All');

  // Find unique departments
  const departmentsList = useMemo(() => {
    const list = new Set<string>();
    employees.forEach(e => {
      if (e.department) {
        list.add(e.department);
      }
    });
    return Array.from(list);
  }, [employees]);

  // Handle department bulk status toggle
  const handleDepartmentBulkToggle = (dept: string, setEligible: boolean) => {
    updateDepartmentEligibility(dept, setEligible);
  };

  // Filter employees
  const filteredEmployees = useMemo(() => {
    return employees.filter(emp => {
      const matchesSearch = emp.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                            emp.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
                            emp.designation.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesDept = deptFilter === 'All' || emp.department === deptFilter;
      return matchesSearch && matchesDept;
    });
  }, [employees, searchTerm, deptFilter]);

  // Statistics
  const totalEmployeesCount = employees.length;
  const eligibleCount = productionWorkforcePool.length;
  const ineligibleCount = totalEmployeesCount - eligibleCount;

  return (
    <div className="space-y-6">
      {/* Visual Header Banner */}
      <div className="bg-gradient-to-r from-blue-700 via-indigo-700 to-indigo-800 rounded-2xl p-6 text-white shadow-lg relative overflow-hidden">
        <div className="absolute right-0 top-0 opacity-10 transform translate-x-12 -translate-y-12">
          <Settings className="w-96 h-96" />
        </div>
        <div className="relative z-10 space-y-2">
          <div className="flex items-center space-x-2">
            <span className="bg-indigo-500/30 text-indigo-200 text-xs px-2.5 py-1 rounded-full font-mono font-bold tracking-wider uppercase">
              Auth & Permissions Control
            </span>
            <span className="bg-emerald-500/20 text-emerald-300 text-xs px-2.5 py-1 rounded-full font-mono font-bold tracking-wider uppercase">
              Centrally Audit Validated
            </span>
          </div>
          <h2 className="text-2xl font-black font-display tracking-tight sm:text-3xl">
            Workforce Eligibility Management
          </h2>
          <p className="text-indigo-200 text-xs max-w-2xl font-medium">
            Control which employees are eligible to participate in sewing line balancing, planning, and smart deployment calculations inside the **Industrial Engineering (IE) Portal**. Only active manufacturing personnel should be admitted to the IE pool.
          </p>
        </div>
      </div>

      {/* Stats Cards Bento Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="p-5 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-widest block">Total Registered Employees</span>
            <h3 className="text-2xl font-black font-mono text-slate-800 dark:text-white">{totalEmployeesCount}</h3>
            <span className="text-[10px] text-slate-500 block">Complete corporate workforce registry</span>
          </div>
          <div className="w-12 h-12 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center text-slate-600 dark:text-slate-300">
            <Users className="w-6 h-6" />
          </div>
        </div>

        <div className="p-5 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[10px] text-emerald-500 font-extrabold uppercase tracking-widest block">Eligible Production Pool</span>
            <h3 className="text-2xl font-black font-mono text-emerald-500">{eligibleCount}</h3>
            <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold block">Admitted into IE calculations</span>
          </div>
          <div className="w-12 h-12 bg-emerald-50 dark:bg-emerald-950/30 rounded-full flex items-center justify-center text-emerald-500">
            <UserCheck className="w-6 h-6" />
          </div>
        </div>

        <div className="p-5 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[10px] text-amber-500 font-extrabold uppercase tracking-widest block">Support / Non-Production Excluded</span>
            <h3 className="text-2xl font-black font-mono text-amber-500">{ineligibleCount}</h3>
            <span className="text-[10px] text-amber-600 dark:text-amber-400 font-bold block">Excluded from active lines</span>
          </div>
          <div className="w-12 h-12 bg-amber-50 dark:bg-amber-950/30 rounded-full flex items-center justify-center text-amber-500">
            <UserX className="w-6 h-6" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Bulk Department Permissions Console */}
        <div className="lg:col-span-1 space-y-5">
          <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl shadow-sm p-4 space-y-4">
            <div className="flex items-center space-x-1.5 border-b border-slate-50 dark:border-slate-850 pb-2.5">
              <Building2 className="w-4 h-4 text-indigo-500" />
              <h4 className="font-bold text-xs text-slate-800 dark:text-white">Department Eligibility Rules</h4>
            </div>
            
            <p className="text-[11px] text-slate-500 leading-relaxed">
              Quickly approve or exclude entire sections of operators to protect industrial deployment processes from support role pollution (such as administrative, warehousing, or CAD staffs).
            </p>

            <div className="space-y-3 pt-1">
              {departmentsList.map(dept => {
                const countInDept = employees.filter(e => e.department === dept).length;
                const eligibleCountInDept = employees.filter(e => e.department === dept && e.productionWorkforceEligible).length;
                const isAllEligible = eligibleCountInDept === countInDept;
                
                return (
                  <div 
                    key={dept} 
                    className="p-3 border border-slate-100 dark:border-slate-850 bg-slate-50/50 dark:bg-slate-950 rounded-xl space-y-2 flex flex-col justify-between"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-bold text-xs text-slate-800 dark:text-slate-200">{dept}</span>
                        <span className="text-[9px] text-slate-400 font-mono block">
                          {eligibleCountInDept}/{countInDept} Active Eligible
                        </span>
                      </div>
                      <span className={`w-2 h-2 rounded-full ${eligibleCountInDept > 0 ? 'bg-emerald-500' : 'bg-slate-350'}`} />
                    </div>

                    <div className="grid grid-cols-2 gap-1.5 pt-1">
                      <button
                        type="button"
                        onClick={() => handleDepartmentBulkToggle(dept, true)}
                        className="py-1 px-1.5 font-sans font-bold text-[9.5px] rounded border border-emerald-100 dark:border-emerald-950 bg-emerald-50/20 dark:bg-emerald-900/10 text-emerald-600 hover:bg-emerald-100/30 transition text-center"
                      >
                        Enable All
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDepartmentBulkToggle(dept, false)}
                        className="py-1 px-1.5 font-sans font-bold text-[9.5px] rounded border border-rose-100 dark:border-rose-950 bg-rose-50/20 dark:bg-rose-900/10 text-rose-600 hover:bg-rose-100/30 transition text-center"
                      >
                        Exclude All
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          
          <div className="bg-amber-50/30 dark:bg-amber-950/10 border border-amber-200/50 dark:border-amber-900/20 rounded-xl p-3.5 flex items-start space-x-2 text-[10.5px] text-amber-800 dark:text-amber-300">
            <BadgeInfo className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <strong className="font-bold block">Compliance Note:</strong>
              <span className="leading-relaxed block font-medium">
                Changing department-wide eligibility immediately syncs eligibility policies dynamically right across all line balancing algorithms and automatic operator deployment queries!
              </span>
            </div>
          </div>
        </div>

        {/* Individual Eligibility Table and List Search */}
        <div className="lg:col-span-3 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden flex flex-col">
          {/* Controls Bar */}
          <div className="p-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950 flex flex-col sm:flex-row items-center gap-3 justify-between">
            <span className="text-xs font-bold text-slate-800 dark:text-white shrink-0">
              Individual Operator Access Controls Ledger
            </span>
            
            <div className="flex items-center gap-2.5 w-full sm:w-auto">
              {/* Search */}
              <div className="relative flex-1 sm:w-64">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="ID, name, or role..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-750 rounded-lg text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              {/* Department Selector Filter */}
              <div className="relative">
                <select
                  value={deptFilter}
                  onChange={(e) => setDeptFilter(e.target.value)}
                  className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-755 rounded-lg text-xs font-semibold py-1.5 px-3 focus:outline-none focus:ring-1 focus:ring-blue-500 pr-8"
                >
                  <option value="All">All Departments</option>
                  {departmentsList.map(d => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Table Container */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs whitespace-nowrap">
              <thead className="bg-slate-50 dark:bg-slate-850/50 font-bold text-slate-500 border-b border-slate-100 dark:border-slate-800 font-mono text-[10px] uppercase tracking-wider">
                <tr>
                  <th className="px-5 py-3">Operator Details</th>
                  <th className="px-5 py-3">Department & Line</th>
                  <th className="px-5 py-3">Designation</th>
                  <th className="px-5 py-3 text-center">IE Eligibility Permit</th>
                  <th className="px-5 py-3 text-right">Manually Override</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {filteredEmployees.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-12 text-center">
                      <div className="max-w-xs mx-auto space-y-2">
                        <Users className="w-8 h-8 text-slate-300 mx-auto" />
                        <h5 className="font-bold text-xs text-slate-700 dark:text-slate-300">No Match found</h5>
                        <p className="text-[11px] text-slate-400">
                          Try adjusting your filters or search keywords.
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredEmployees.map((emp) => {
                    const isEligible = !!emp.productionWorkforceEligible;
                    return (
                      <tr 
                        key={emp.id} 
                        className={`hover:bg-slate-50/40 dark:hover:bg-slate-950/20 transition-colors ${
                          isEligible ? 'bg-emerald-50/5 dark:bg-emerald-900/2' : 'bg-slate-50/10 dark:bg-slate-800/1'
                        }`}
                      >
                        <td className="px-5 py-3">
                          <div className="flex items-center space-x-3">
                            <EmployeeAvatar 
                              photoUrl={emp.photoUrl} 
                              name={emp.name} 
                              className="w-8 h-8 rounded-full" 
                            />
                            <div>
                              <strong className="block text-xs font-bold text-slate-800 dark:text-slate-101">{emp.name}</strong>
                              <span className="text-[9.5px] text-slate-400 font-mono font-semibold">ID: {emp.id}</span>
                            </div>
                          </div>
                        </td>
                        
                        <td className="px-5 py-3">
                          <span className="text-slate-700 dark:text-slate-300 font-semibold block">{emp.department}</span>
                          <span className="text-[10px] text-slate-405 font-mono block">
                            LINE: {emp.lineNumber === 0 ? 'FLOATER POOL' : `LINE ${emp.lineNumber}`}
                          </span>
                        </td>

                        <td className="px-5 py-3 text-slate-600 dark:text-slate-400 font-semibold">
                          {emp.designation}
                        </td>

                        <td className="px-5 py-3 text-center">
                          {isEligible ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold font-mono bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 uppercase tracking-wide gap-1">
                              <Check className="w-2.5 h-2.5" /> Admitted
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold font-mono bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 uppercase tracking-wide gap-1">
                              <X className="w-2.5 h-2.5" /> Excluded
                            </span>
                          )}
                        </td>

                        <td className="px-5 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => updateWorkforceEligibility(emp.id, !isEligible)}
                            className={`px-3 py-1 text-[10.5px] font-bold font-sans rounded-lg transition-all border shrink-0 ${
                              isEligible
                                ? 'bg-amber-50 text-amber-600 border-amber-200 hover:bg-amber-100/50 dark:bg-amber-950/20 dark:border-amber-900/30'
                                : 'bg-emerald-50 text-emerald-600 border-emerald-200 hover:bg-emerald-100/50 dark:bg-emerald-950/20 dark:border-emerald-900/30'
                            }`}
                          >
                            {isEligible ? 'Exclude' : 'Admit to IE'}
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
