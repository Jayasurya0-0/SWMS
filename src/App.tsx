/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { StateProvider, useAppState } from './contexts/StateContext';
import { DashboardView } from './components/DashboardView';
import { EmployeeModule } from './components/EmployeeModule';
import { AttendanceModule } from './components/AttendanceModule';
import { AbsenteeismModule } from './components/AbsenteeismModule';
import { PredictiveModule } from './components/PredictiveModule';
import { SkillMatrixModule } from './components/SkillMatrixModule';
import { LineBalancingModule } from './components/LineBalancingModule';
import { ProductivityCalculator } from './components/ProductivityCalculator';
import { LeaveModule } from './components/LeaveModule';
import { RewardModule } from './components/RewardModule';
import { ReportsModule } from './components/ReportsModule';
import { AdminPanel } from './components/AdminPanel';
import { AttendanceImportExportModule } from './components/AttendanceImportExportModule';
import { WorkforceAssignmentCenter } from './components/WorkforceAssignmentCenter';
import { FactoryConfigurationModule } from './components/FactoryConfigurationModule';
import { WorkforceEligibilityModule } from './components/WorkforceEligibilityModule';
import { LineAllocationConfigurationCenter } from './components/LineAllocationConfigurationCenter';
import { EmployeeAvatar } from './components/EmployeeAvatar';
import { FactoryWorkforceCommandCenter } from './components/FactoryWorkforceCommandCenter';
import { GarmentHistoryCenter } from './components/GarmentHistoryCenter';
import { IEReportsModule } from './components/IEReportsModule';
import { LoginGate } from './components/LoginGate';
import { ProfileCenterModal } from './components/ProfileCenterModal';
import { 
  Factory, LayoutDashboard, Users, Fingerprint, TrendingDown, 
  Sparkles, Award, Sliders, Calculator, CalendarDays, BarChart4, 
  Database, UserCheck, Bell, Search, Sun, Moon, LogIn, ChevronDown,
  Menu, X, FileSpreadsheet, Settings, ShieldAlert, History
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

const getUserDisplayName = (username?: string) => {
  if (!username) return 'User';
  if (username.startsWith('admin_prakash')) return 'Prakash Mehta';
  if (username.startsWith('hr_ananya')) return 'Ananya Sharma';
  if (username.startsWith('pm_vikram')) return 'Vikram Singh';
  if (username.startsWith('sup_karthik')) return 'Karthik S.';
  if (username.startsWith('ie_rahul')) return 'Rahul Patel';
  return username.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
};

function DashboardPortal() {
  const { 
    currentUser, setCurrentUser, allUsers, notifications, markAllNotificationsRead, 
    theme, toggleTheme, employees, clearNotification, markNotificationAsRead, clearAllNotifications,
    currentGarment, garmentStyles, selectGarmentStyle
  } = useAppState();

  // Active business domain state: defaults to 'HR' for administrative roles, locks to 'IE' for planning roles
  const [activePortal, setActivePortal] = useState<'HR' | 'IE'>('HR');

  const [activeTab, setActiveTab] = useState('dashboard');
  const [showNotificationPopover, setShowNotificationPopover] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  
  // Search state across entire enterprise database
  const [globalSearchTerm, setGlobalSearchTerm] = useState('');
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  // Filter state indicators
  const unreadNotifications = notifications.filter(n => !n.read);

  // Role based access rules
  const userRole = currentUser?.role || 'Viewer';

  const canAccessHRPortal = React.useMemo(() => {
    return userRole === 'HR' || userRole === 'Admin' || userRole === 'Production Manager';
  }, [userRole]);

  const canAccessIEPortal = React.useMemo(() => {
    return userRole === 'IE' || userRole === 'Admin' || userRole === 'Production Manager' || userRole === 'Supervisor' || userRole === 'Viewer';
  }, [userRole]);

  // Securely resolve active portal based on role permissions
  const resolvedPortal = React.useMemo(() => {
    if (userRole === 'HR') return 'HR';
    if (userRole === 'IE' || userRole === 'Supervisor' || userRole === 'Viewer') return 'IE';
    return activePortal;
  }, [userRole, activePortal]);

  // Global search implementation
  const matchingEmployees = globalSearchTerm.trim() === '' 
    ? [] 
    : employees.filter(emp => 
        emp.name.toLowerCase().includes(globalSearchTerm.toLowerCase()) || 
        emp.id.toLowerCase().includes(globalSearchTerm.toLowerCase())
      ).slice(0, 5);

  const navigationItems = React.useMemo(() => {
    if (resolvedPortal === 'HR') {
      const allHrProducts = [
        { id: 'dashboard', label: 'Factory Dashboard', icon: LayoutDashboard },
        { id: 'employees', label: 'Employees Master', icon: Users },
        { id: 'eligibility', label: 'Workforce Eligibility', icon: ShieldAlert },
        { id: 'attendance', label: 'Gate Scan Register', icon: Fingerprint },
        { id: 'import-export', label: 'Attendance Import/Export', icon: FileSpreadsheet },
        { id: 'leaves', label: 'Leave & Approvals', icon: CalendarDays },
        { id: 'reports', label: 'Compliance Reports', icon: BarChart4 },
        { id: 'rewards', label: 'Operator Milestones', icon: Award },
        { id: 'admin', label: 'PostgreSQL Database', icon: Database }
      ];

      if (userRole === 'Admin') return allHrProducts;
      if (userRole === 'HR') {
        return allHrProducts.filter(tab => tab.id !== 'admin');
      }
      if (userRole === 'Production Manager') {
        return allHrProducts.filter(tab => ['dashboard', 'attendance', 'reports'].includes(tab.id));
      }
      return [];
    } else {
      const allIeProducts = [
        { id: 'command-center', label: 'Workforce Control Tower', icon: LayoutDashboard },
        { id: 'line-allocation-config', label: 'Line Allocation Config', icon: FileSpreadsheet },
        { id: 'assignment', label: 'Workforce Assignment', icon: UserCheck },
        { id: 'balancing', label: 'Line Balance Assist', icon: Sliders },
        { id: 'skills', label: 'Skill Matrix Grade', icon: Award },
        { id: 'absenteeism', label: 'Absenteeism Analytics', icon: TrendingDown },
        { id: 'predictive', label: 'Manpower Forecasting', icon: Sparkles },
        { id: 'garment-history', label: 'Garment History Center', icon: History },
        { id: 'calculator', label: 'IE SMV Calculator', icon: Calculator },
        { id: 'ie-reports', label: 'IE Reports & Data Export Center', icon: BarChart4 },
        { id: 'factory-setup', label: 'Factory Configuration', icon: Settings }
      ];

      if (userRole === 'Admin') return allIeProducts;
      if (userRole === 'IE') return allIeProducts;
      if (userRole === 'Production Manager') {
        return allIeProducts.filter(tab => ['command-center', 'line-allocation-config', 'assignment', 'ie-reports'].includes(tab.id));
      }
      if (userRole === 'Supervisor') {
        return allIeProducts.filter(tab => ['command-center', 'assignment', 'balancing'].includes(tab.id));
      }
      if (userRole === 'Viewer') {
        return allIeProducts.filter(tab => ['command-center', 'skills', 'garment-history', 'ie-reports'].includes(tab.id));
      }
      return [];
    }
  }, [resolvedPortal, userRole]);

  // Auto-redirect active tab on portal transition to prevent broken visual empty states
  React.useEffect(() => {
    const permittedTabIds = navigationItems.map(n => n.id);
    if (!permittedTabIds.includes(activeTab) && permittedTabIds.length > 0) {
      setActiveTab(permittedTabIds[0]);
    }
  }, [resolvedPortal, activeTab, navigationItems]);

  const renderActiveModule = () => {
    switch (activeTab) {
      case 'dashboard': return <DashboardView />;
      case 'factory-setup': return <FactoryConfigurationModule />;
      case 'employees': return <EmployeeModule />;
      case 'line-allocation-config': return <LineAllocationConfigurationCenter />;
      case 'eligibility': return <WorkforceEligibilityModule />;
      case 'assignment': return <WorkforceAssignmentCenter />;
      case 'attendance': return <AttendanceModule />;
      case 'import-export': return <AttendanceImportExportModule />;
      case 'absenteeism': return <AbsenteeismModule />;
      case 'predictive': return <PredictiveModule />;
      case 'skills': return <SkillMatrixModule />;
      case 'balancing': return <LineBalancingModule />;
      case 'calculator': return <ProductivityCalculator />;
      case 'garment-history': return <GarmentHistoryCenter />;
      case 'ie-reports': return <IEReportsModule />;
      case 'leaves': return <LeaveModule />;
      case 'rewards': return <RewardModule />;
      case 'reports': return <ReportsModule />;
      case 'admin': return <AdminPanel />;
      case 'command-center': return <FactoryWorkforceCommandCenter setActiveTab={setActiveTab} />;
      default: return resolvedPortal === 'HR' ? <DashboardView /> : <FactoryWorkforceCommandCenter setActiveTab={setActiveTab} />;
    }
  };

  return (
    <div className={`h-screen w-screen overflow-hidden flex transition-colors duration-200 ${
      theme === 'dark' ? 'bg-[#0F172A] dark text-slate-100' : 'bg-[#F8FAFC] text-slate-805'
    }`}>
      
      {/* 1. OFF-CANVAS RESPONSIVE SIDEBAR DRAWER (MOBILE) */}
      <AnimatePresence>
        {isMobileSidebarOpen && (
          <div className="fixed inset-0 z-50 flex lg:hidden">
            {/* Overlay background blur */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMobileSidebarOpen(false)}
              className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs"
            />
            {/* Sliding navigation drawer body */}
            <motion.aside 
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'tween', duration: 0.25 }}
              className={`relative w-64 flex flex-col h-full shrink-0 shadow-2xl z-20 transition-colors ${
                theme === 'dark' ? 'bg-[#0F172A] text-slate-100' : 'bg-[#FFFFFF] text-[#475569] border-r border-slate-200'
              }`}
            >
              {/* Brand logo header */}
              <div className={`p-6 border-b flex items-center justify-between shrink-0 ${
                theme === 'dark' ? 'border-slate-800' : 'border-slate-200'
              }`}>
                <div>
                  <div className="flex items-center space-x-2">
                    <Factory className={`w-5.5 h-5.5 ${theme === 'dark' ? 'text-blue-400' : 'text-[#2563EB]'}`} />
                    <span className={`text-xl font-bold tracking-tight font-display ${theme === 'dark' ? 'text-blue-400' : 'text-[#2563EB]'}`}>SWM</span>
                  </div>
                  <div className="text-[10px] uppercase tracking-widest text-slate-400 mt-1 font-bold">
                    Workforce Intelligence
                  </div>
                </div>
                <button 
                  type="button"
                  onClick={() => setIsMobileSidebarOpen(false)}
                  className={`p-1.5 rounded-lg pointer-events-auto transition ${
                    theme === 'dark' ? 'hover:bg-slate-805 text-slate-400 hover:text-white' : 'hover:bg-slate-100 text-[#475569] hover:text-slate-900'
                  }`}
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Dynamic Domain Portal Selector */}
              {canAccessHRPortal ? (
                <div className="px-4 pt-4 pb-2 shrink-0">
                  <div className={`p-1 flex rounded-xl border ${
                    theme === 'dark' ? 'bg-slate-950 border-slate-805' : 'bg-slate-100 border-slate-250'
                  }`}>
                    <button
                      type="button"
                      onClick={() => setActivePortal('HR')}
                      className={`flex-1 text-center py-2 text-[10px] font-extrabold uppercase tracking-widest rounded-lg transition-all ${
                        resolvedPortal === 'HR'
                          ? theme === 'dark'
                            ? 'bg-blue-600 text-white shadow-xs font-bold'
                            : 'bg-[#FFFFFF] text-[#2563EB] shadow-xs border border-slate-200 font-bold'
                          : 'text-slate-400 hover:text-slate-600'
                      }`}
                    >
                      HR Portal
                    </button>
                    <button
                      type="button"
                      onClick={() => setActivePortal('IE')}
                      className={`flex-1 text-center py-2 text-[10px] font-extrabold uppercase tracking-widest rounded-lg transition-all ${
                        resolvedPortal === 'IE'
                          ? theme === 'dark'
                            ? 'bg-blue-600 text-white shadow-xs font-bold'
                            : 'bg-[#FFFFFF] text-[#2563EB] shadow-xs border border-slate-200 font-bold'
                          : 'text-slate-400 hover:text-slate-600'
                      }`}
                    >
                      IE Portal
                    </button>
                  </div>
                </div>
              ) : (
                <div className="px-4 pt-4 pb-2 shrink-0">
                  <div className={`p-3 border rounded-xl space-y-1 ${
                    theme === 'dark' ? 'bg-indigo-50/5 border-indigo-500/10' : 'bg-indigo-50/30 border-indigo-100/40'
                  }`}>
                    <div className="flex items-center space-x-1">
                      <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
                      <span className="text-[9px] uppercase tracking-wider font-extrabold text-indigo-505">
                        IE Planning Restricted
                      </span>
                    </div>
                    <p className="text-[9.5px] leading-relaxed text-slate-400 font-medium font-sans">
                      Your role is restricted to sewing line deployment.
                    </p>
                  </div>
                </div>
              )}

              {/* Navigation directory array list */}
              <nav className="flex-1 p-4 space-y-1 overflow-y-auto custom-scrollbar">
                {navigationItems.map(item => {
                  const IconComp = item.icon;
                  const isActive = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setActiveTab(item.id);
                        setIsMobileSidebarOpen(false);
                      }}
                      className={`w-full text-left px-3.5 py-2.5 rounded-lg text-xs font-semibold flex items-center space-x-2.5 transition-all outline-none border ${
                        isActive 
                          ? theme === 'dark'
                            ? 'bg-blue-600/20 text-blue-400 border-blue-600/30 font-bold' 
                            : 'bg-[#DBEAFE] text-[#2563EB] border-[#2563EB]/10 font-bold'
                          : theme === 'dark'
                            ? 'text-slate-400 border-transparent hover:bg-slate-800/45 hover:text-white'
                            : 'text-[#475569] border-transparent hover:bg-[#F1F5F9] hover:text-[#111827]'
                      }`}
                    >
                      <IconComp className={`w-4.5 h-4.5 ${
                        isActive 
                          ? theme === 'dark' 
                            ? 'text-blue-400' 
                            : 'text-[#2563EB]' 
                          : 'text-slate-400'
                      }`} />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </nav>

              {/* Lower dynamic worker session indicators */}
              <div className={`p-4 border-t shrink-0 ${
                theme === 'dark' ? 'border-slate-800 bg-slate-900/50' : 'border-slate-200 bg-[#F1F5F9]'
              }`}>
                <div className="flex items-center space-x-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs border ${
                    theme === 'dark' ? 'bg-slate-750 border-slate-700 text-blue-300' : 'bg-slate-100 border-slate-200 text-[#2563EB]'
                  }`}>
                    {getUserDisplayName(currentUser?.username).substring(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className={`text-xs font-semibold uppercase truncate ${theme === 'dark' ? 'text-slate-200' : 'text-slate-900'}`}>{getUserDisplayName(currentUser?.username)}</div>
                    <div className="text-[10px] text-slate-400 truncate">{currentUser?.role}</div>
                  </div>
                </div>
              </div>
            </motion.aside>
          </div>
        )}
      </AnimatePresence>

      {/* 2. PERSISTENT SYSTEM SIDEBAR (DESKTOP) */}
      <aside className={`hidden lg:flex flex-col w-64 shrink-0 border-r h-screen transition-colors ${
        theme === 'dark' 
          ? 'bg-[#0F172A] text-slate-100 border-slate-800' 
          : 'bg-[#FFFFFF] text-[#475569] border-slate-200'
      }`}>
        {/* Brand header branding */}
        <div className={`p-6 border-b shrink-0 ${theme === 'dark' ? 'border-slate-800' : 'border-slate-200'}`}>
          <div className="flex items-center space-x-2.5">
            <Factory className={`w-5.5 h-5.5 ${theme === 'dark' ? 'text-blue-400' : 'text-[#2563EB]'}`} />
            <span className={`text-xl font-bold tracking-tight font-display ${theme === 'dark' ? 'text-blue-400' : 'text-[#2563EB]'}`}>SWM</span>
          </div>
          <div className="text-[10px] uppercase tracking-widest text-[#6B7280] mt-1 font-bold">
            Workforce Intelligence
          </div>
        </div>

        {/* Dynamic Domain Portal Selector */}
        {canAccessHRPortal ? (
          <div className="px-4 pt-4 pb-2 shrink-0">
            <div className={`p-1 flex rounded-xl border ${
              theme === 'dark' ? 'bg-slate-950 border-slate-805' : 'bg-slate-100 border-slate-250'
            }`}>
              <button
                type="button"
                onClick={() => setActivePortal('HR')}
                className={`flex-1 text-center py-2 text-[10px] font-extrabold uppercase tracking-widest rounded-lg transition-all ${
                  resolvedPortal === 'HR'
                    ? theme === 'dark'
                      ? 'bg-blue-600 text-white shadow-xs font-bold'
                      : 'bg-[#FFFFFF] text-[#2563EB] shadow-xs border border-slate-200 font-bold'
                    : 'text-slate-400 hover:text-slate-605'
                }`}
              >
                HR Portal
              </button>
              <button
                type="button"
                onClick={() => setActivePortal('IE')}
                className={`flex-1 text-center py-2 text-[10px] font-extrabold uppercase tracking-widest rounded-lg transition-all ${
                  resolvedPortal === 'IE'
                    ? theme === 'dark'
                      ? 'bg-blue-600 text-white shadow-xs font-bold'
                      : 'bg-[#FFFFFF] text-[#2563EB] shadow-xs border border-slate-200 font-bold'
                    : 'text-slate-400 hover:text-slate-605'
                }`}
              >
                IE Portal
              </button>
            </div>
          </div>
        ) : (
          <div className="px-4 pt-4 pb-2 shrink-0">
            <div className={`p-3 border rounded-xl space-y-1 ${
              theme === 'dark' ? 'bg-indigo-50/5 border-indigo-500/10' : 'bg-indigo-50/30 border-indigo-100/40'
            }`}>
              <div className="flex items-center space-x-1">
                <Sparkles className="w-3.5 h-3.5 text-indigo-505" />
                <span className="text-[9px] uppercase tracking-wider font-extrabold text-indigo-505">
                  IE Planning Restricted
                </span>
              </div>
              <p className="text-[9.5px] leading-relaxed text-slate-400 font-medium font-sans">
                Your role is restricted to sewing line deployment.
              </p>
            </div>
          </div>
        )}

        {/* Navigation list */}
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto custom-scrollbar">
          {navigationItems.map(item => {
            const IconComp = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`w-full text-left px-3.5 py-2.5 rounded-lg text-xs font-semibold flex items-center space-x-2.5 transition-all outline-none border ${
                  isActive 
                    ? theme === 'dark'
                      ? 'bg-blue-600/25 text-blue-400 border-blue-600/35 border-l-3 border-l-blue-500 font-bold' 
                      : 'bg-[#DBEAFE] text-[#2563EB] border-[#2563EB]/10 border-l-3 border-l-[#2563EB] font-bold'
                    : theme === 'dark'
                      ? 'text-slate-400 border-transparent hover:bg-slate-800/40 hover:text-white'
                      : 'text-[#475569] border-transparent hover:bg-[#F1F5F9] hover:text-[#111827]'
                }`}
              >
                <IconComp className={`w-4.5 h-4.5 ${
                  isActive 
                    ? theme === 'dark' ? 'text-blue-400' : 'text-[#2563EB]' 
                    : 'text-[#6B7280]'
                }`} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Administrator account drawer item */}
        <div className={`p-4 border-t shrink-0 ${
          theme === 'dark' ? 'border-slate-850 bg-slate-900/50' : 'border-slate-200 bg-[#F1F5F9]'
        }`}>
          <div className="flex items-center space-x-3">
            <div className={`w-8.5 h-8.5 rounded-full flex items-center justify-center font-bold text-xs border ${
              theme === 'dark' ? 'bg-slate-800 border-slate-700 text-blue-400' : 'bg-white border-slate-200 text-[#2563EB]'
            }`}>
              {getUserDisplayName(currentUser?.username).substring(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className={`text-xs font-semibold uppercase truncate leading-tight ${theme === 'dark' ? 'text-slate-200' : 'text-[#111827]'}`}>{getUserDisplayName(currentUser?.username)}</div>
              <div className="text-[10px] text-[#6B7280] truncate mt-0.5">{currentUser?.role}</div>
            </div>
          </div>
        </div>
      </aside>

      {/* 3. SCROLLING VIEWPORT WORKSPACE (RIGHT COLUMN) */}
      <main className="flex-1 flex flex-col h-screen min-w-0 overflow-hidden">
        
        {/* Dynamic header row matching high fidelity layout specs */}
        <header className={`h-16 border-b px-6 flex items-center justify-between shrink-0 z-30 transition-colors ${
          theme === 'dark' 
            ? 'bg-[#0F172A] border-slate-800 text-white' 
            : 'bg-white border-slate-200 text-slate-800'
        }`}>
          {/* Collapsible Mobile hamburger helper and header info */}
          <div className="flex items-center space-x-3 min-w-0">
            <button 
              type="button"
              onClick={() => setIsMobileSidebarOpen(true)}
              className="lg:hidden p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-900 transition"
            >
              <Menu className="w-4.5 h-4.5" />
            </button>

          </div>

          {/* Alert telemetry states & controls row */}
          <div className="flex items-center space-x-4">
            
            {/* Live plant indicators with high fidelity tags */}
            <div className="hidden xl:flex items-center space-x-2">
              <span className="px-2 py-0.5 bg-red-100 text-red-600 text-[9px] font-bold rounded border border-red-200 uppercase whitespace-nowrap select-none">
                CRITICAL ALERT: LINE 04
              </span>
              <span className="px-2 py-0.5 bg-green-100 text-green-600 text-[9px] font-bold rounded border border-green-200 uppercase whitespace-nowrap select-none">
                SYSTEM LIVE
              </span>
            </div>

            {/* Dark theme toggle icon */}
            <button 
              type="button" 
              onClick={toggleTheme}
              className={`p-1.5 rounded-lg transition-colors outline-none border ${
                theme === 'dark' 
                  ? 'text-slate-300 border-slate-800 hover:bg-slate-800' 
                  : 'text-slate-500 border-slate-200 hover:bg-slate-100'
              }`}
              title="Change visual theme"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-slate-500" />}
            </button>

            {/* Enterprise wide Search operator ID bar */}
            <div className="relative text-black hidden md:block">
              <div className={`flex items-center rounded-lg px-2.5 py-1.5 border w-44 lg:w-48 text-xs transition-all focus-within:w-52 ${
                theme === 'dark'
                  ? 'bg-slate-900 border-slate-800 text-slate-303 focus-within:border-blue-500'
                  : 'bg-slate-50 border-slate-150 text-slate-700 focus-within:border-blue-600 focus-within:bg-white'
              }`}>
                <Search className={`w-3.5 h-3.5 mr-1.5 ${theme === 'dark' ? 'text-slate-500' : 'text-slate-400'}`} />
                <input 
                  type="text" 
                  placeholder="Search operator ID..."
                  value={globalSearchTerm}
                  onChange={e => {
                    setGlobalSearchTerm(e.target.value);
                    setShowSearchDropdown(true);
                  }}
                  onBlur={() => setTimeout(() => setShowSearchDropdown(false), 205)}
                  className={`bg-transparent border-none text-[11px] focus:outline-none w-full ${
                    theme === 'dark' ? 'text-white placeholder-slate-500' : 'text-slate-800 placeholder-slate-400'
                  }`}
                />
              </div>

              {/* Dynamic search suggestions */}
              {showSearchDropdown && matchingEmployees.length > 0 && (
                <div className="absolute right-0 top-full mt-1.5 bg-white dark:bg-slate-900 border border-slate-205 dark:border-slate-800 shadow-xl rounded-xl p-2 w-64 z-50 text-xs">
                  <p className="px-2.5 py-1 uppercase text-[9px] font-bold tracking-wider text-slate-400 border-b border-slate-100 dark:border-slate-800">
                    Schedules search matches
                  </p>
                  <div className="space-y-1.5 mt-1.5 font-sans">
                    {matchingEmployees.map(emp => (
                      <button
                        key={emp.id}
                        type="button"
                        onClick={() => {
                          setActiveTab('employees');
                          setGlobalSearchTerm('');
                        }}
                        className="w-full text-left p-2 hover:bg-slate-150 dark:hover:bg-slate-800 rounded-lg flex items-center space-x-2.5 transition animate-fade"
                      >
                        <EmployeeAvatar 
                          photoUrl={emp.photoUrl} 
                          name={emp.name} 
                          className="w-7 h-7 rounded-full" 
                        />
                        <div className="min-w-0">
                          <span className="font-bold text-slate-850 dark:text-neutral-200 block truncate">{emp.name}</span>
                          <span className="text-[10px] text-slate-400 font-mono block">ID: {emp.id} · Line {emp.lineNumber}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Notification alert bell */}
            <div className="relative">
              <button 
                type="button" 
                onClick={() => setShowNotificationPopover(!showNotificationPopover)}
                className={`p-2 rounded-lg transition-colors border outline-none ${
                  theme === 'dark' 
                    ? 'text-slate-350 border-slate-800 hover:bg-slate-800' 
                    : 'text-slate-550 border-slate-200 hover:bg-slate-100'
                }`}
              >
                <Bell className="w-4 h-4" />
                {unreadNotifications.length > 0 && (
                  <span className="absolute top-1 right-1 w-3.5 h-3.5 bg-red-500 text-white font-mono text-[8px] font-extrabold rounded-full flex items-center justify-center animate-bounce">
                    {unreadNotifications.length}
                  </span>
                )}
              </button>

              {/* Popup lists */}
              <AnimatePresence>
                {showNotificationPopover && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    className="absolute right-0 top-full mt-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-850 rounded-xl p-3 shadow-2xl z-50 w-72 text-xs"
                  >
                    <div className="flex justify-between items-center pb-2 border-b border-slate-100 dark:border-slate-800 gap-1">
                      <span className="font-bold text-slate-800 dark:text-white uppercase font-display text-[9px] shrink-0">REAL-TIME MES ALERTS</span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {unreadNotifications.length > 0 && (
                          <button 
                            type="button" 
                            onClick={markAllNotificationsRead}
                            className="text-[10px] text-blue-600 dark:text-blue-400 font-semibold outline-none hover:underline pointer-events-auto"
                            title="Mark all as read"
                          >
                            Mark read
                          </button>
                        )}
                        {notifications.length > 0 && (
                          <>
                            {unreadNotifications.length > 0 && <span className="text-slate-350 dark:text-slate-700 text-[10px] select-none">|</span>}
                            <button 
                              type="button" 
                              onClick={clearAllNotifications}
                              className="text-[10px] text-rose-600 dark:text-rose-400 font-semibold outline-none hover:underline pointer-events-auto"
                              title="Delete all notifications"
                            >
                              Clear all
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="space-y-2 mt-2 max-h-56 overflow-y-auto custom-scrollbar">
                      {notifications.map(notif => (
                        <div 
                          key={notif.id} 
                          onClick={() => {
                            if (!notif.read) markNotificationAsRead(notif.id);
                          }}
                          className={`p-2 border rounded-lg relative transition-all ${notif.read ? 'border-slate-100 dark:border-slate-800 opacity-60' : 'border-blue-200/55 bg-blue-50/20 dark:border-blue-950/20 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-850/30'}`}
                        >
                          <div className="flex justify-between items-start gap-1">
                            <p className="font-bold text-[10px] text-slate-800 dark:text-slate-200 pr-5">{notif.title}</p>
                            <button
                              type="button"
                              title="Clear notification"
                              onClick={(e) => {
                                e.stopPropagation();
                                clearNotification(notif.id);
                              }}
                              className="text-slate-400 hover:text-red-500 rounded p-0.5 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                          <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">{notif.message}</p>
                          <span className="text-[9px] text-slate-400 font-mono mt-1 block">{notif.timestamp}</span>
                        </div>
                      ))}

                      {notifications.length === 0 && (
                        <p className="py-6 text-center text-slate-400 font-mono text-[9px]">No active system alerts.</p>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Active profile and identity control center */}
            <div className="relative flex items-center space-x-2 animate-fade-in">
              <button 
                type="button" 
                onClick={() => setIsProfileOpen(true)}
                className="flex items-center space-x-2 bg-white dark:bg-[#121929] border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-[#1C263B] text-slate-800 dark:text-slate-100 font-semibold rounded-lg pl-1.5 pr-2.5 py-1 text-xs shadow-xs outline-none transition"
              >
                <div className="w-6 h-6 rounded-full overflow-hidden border border-slate-200 dark:border-slate-700 shrink-0">
                  <img 
                    src={currentUser?.avatarUrl || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=facearea&facepad=2&w=128&h=128&q=80'} 
                    alt={currentUser?.employeeName || 'User'} 
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                </div>
                <div className="text-left hidden md:block">
                  <span className="block leading-tight text-[11px] font-bold">{currentUser?.employeeName || 'Active User'}</span>
                  <p className="text-[9px] text-slate-400 capitalize -mt-0.5">{currentUser?.role || 'Viewer'}</p>
                </div>
              </button>
            </div>

          </div>
        </header>

        {/* Scrolling application content workspace */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 custom-scrollbar bg-slate-50 dark:bg-[#0B0F19]">
          <AnimatePresence mode="popLayout">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.12, ease: 'easeOut' }}
            >
              {renderActiveModule()}
            </motion.div>
          </AnimatePresence>
        </div>

      </main>

      <ProfileCenterModal isOpen={isProfileOpen} onClose={() => setIsProfileOpen(false)} />
    </div>
  );
}

function AppContent() {
  const { loading, currentUser } = useAppState();
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 dark:bg-[#0B0F19]">
        <div className="relative flex flex-col items-center">
          <div className="w-12 h-12 border-4 border-blue-250 border-t-blue-600 rounded-full animate-spin"></div>
          <h2 className="mt-4 text-sm font-semibold text-slate-800 dark:text-slate-100 font-sans tracking-tight">Syncing SWM Ledger Node...</h2>
          <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400 font-mono">Loading data on demand from PostgreSQL</p>
        </div>
      </div>
    );
  }
  if (!currentUser) {
    return <LoginGate />;
  }
  return <DashboardPortal />;
}

export default function App() {
  return (
    <StateProvider>
      <AppContent />
    </StateProvider>
  );
}
