import React, { useState, useEffect } from 'react';
import { useAppState } from '../contexts/StateContext';
import { SQL_TABLES } from './SQLSchemaData';
import { 
  Database, Shield, Settings, Info, RefreshCw, Key, ShieldAlert, 
  Terminal, Server, FileCode, CheckCircle, Table, Network, Globe, X,
  UserPlus, Power, Users, Lock, Check, Search, FileText, AlertCircle, ShieldCheck, HelpCircle,
  Trash2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export const AdminPanel: React.FC = () => {
  const { 
    currentUser, allUsers, refreshState, employees, attendance, leaveRequests, 
    productionLines, resetDatabase, recalculateRiskScores,
    adminCreateUser, updateUserStatus, changeUserRole, resetUserPassword,
    deleteUserAccount,
    auditLogs, fetchAuditLogs
  } = useAppState();

  // Active Main Tabs: 'database' | 'users' | 'audit_logs' | 'query'
  const [activeTab, setActiveTab] = useState<'database' | 'users' | 'audit_logs' | 'query'>('database');
  const [selectedTable, setSelectedTable] = useState<string>('employees');
  const [copiedDDL, setCopiedDDL] = useState<string | null>(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [userToDelete, setUserToDelete] = useState<any | null>(null);
  const [systemLogs, setSystemLogs] = useState<string[]>([
    'SWM Security Node active and querying PostgreSQL data state',
    'Authentication module running database-driven encryption standards',
    'Audit Logger bound to target collections successfully',
    'Sync status: 100% stable with Firestore Cloud'
  ]);

  // Loading indicator for background operations
  const [isProcessing, setIsProcessing] = useState(false);
  const [infoFeedback, setInfoFeedback] = useState<{ message: string; isError: boolean } | null>(null);

  // User Creation Form States
  const [newEmpId, setNewEmpId] = useState('');
  const [newEmpName, setNewEmpName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newDept, setNewDept] = useState('Sewing Line 1');
  const [newDesg, setNewDesg] = useState('Operator');
  const [newRole, setNewRole] = useState('Viewer');
  const [newPass, setNewPass] = useState('');
  const [newPassConfirm, setNewPassConfirm] = useState('');
  const [newPhotoUrl, setNewPhotoUrl] = useState('');

  // Password reset request modal/dialog states for targeted user
  const [userPasswordResetTarget, setUserPasswordResetTarget] = useState<string | null>(null);
  const [resetFinishedCode, setResetFinishedCode] = useState<string | null>(null);
  const [resetTargetUser, setResetTargetUser] = useState<any | null>(null);
  const [customResetPassword, setCustomResetPassword] = useState('');
  const [errorReset, setErrorReset] = useState<string | null>(null);

  const [ticketInput, setTicketInput] = useState('');
  const [ticketSearchError, setTicketSearchError] = useState<string | null>(null);

  // Extract pending reset tickets from audit logs
  const pendingResetTickets = React.useMemo(() => {
    if (!auditLogs) return [];
    
    // Sort logs descending to ensure we see the most recent first
    const sortedLogs = [...auditLogs].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    
    // Scan all 'Password Reset Requested' logs
    const requests = sortedLogs.filter(log => log.action === 'Password Reset Requested');
    
    const tickets = [];
    for (const log of requests) {
      const detailsText = log.details || '';
      const match = detailsText.match(/RST-\d+/);
      const ticketId = match ? match[0] : null;
      if (ticketId) {
        // Find corresponding user in directory
        const usr = allUsers.find(u => u.id === log.userId);
        if (usr) {
          // Check if resolved by any newer actions
          const isResolved = sortedLogs.some(l => 
            l.userId === log.userId && 
            (l.action === 'Reset Password Admin' || l.action === 'User Self Password Change' || l.action === 'Activated User' || l.action === 'User Self Details Update') &&
            new Date(l.timestamp) > new Date(log.timestamp)
          );
          
          tickets.push({
            ticketId,
            userId: log.userId,
            username: usr.username,
            employeeName: usr.employeeName,
            user: usr,
            timestamp: log.timestamp,
            isResolved
          });
        }
      }
    }
    
    // De-duplicate by ticketId
    const seen = new Set();
    const uniqueTickets = [];
    for (const t of tickets) {
      if (!t.isResolved && !seen.has(t.ticketId)) {
        seen.add(t.ticketId);
        uniqueTickets.push(t);
      }
    }
    return uniqueTickets;
  }, [auditLogs, allUsers]);

  // Load audit logs on activation and layout changes
  useEffect(() => {
    fetchAuditLogs();
  }, [activeTab]);

  // Convert states to mock DDL rows for Postgres Visualizations
  const getTableRows = (tableName: string) => {
    switch (tableName) {
      case 'employees':
        return employees.slice(0, 5).map(e => ({
          id: e.id,
          name: e.name,
          department_id: e.department === 'Sewing' ? 'DEPT01' : 'DEPT03',
          line_number: e.lineNumber,
          designation: e.designation,
          skill_category: e.skillCategory,
          experience_years: e.experience,
          base_efficiency: e.baseEfficiency
        }));
      case 'attendance':
        return attendance.slice(0, 5).map(a => ({
          id: a.id,
          employee_id: a.employeeId,
          date: a.date,
          status: a.status,
          check_in_time: a.checkInTime || 'NULL',
          method: a.method,
          marked_by: a.markedBy
        }));
      case 'leave_requests':
        return leaveRequests.slice(0, 5).map(l => ({
          id: l.id,
          employee_id: l.employeeId,
          leave_type: l.leaveType,
          start_date: l.startDate,
          status: l.status,
          approved_by_supervisor: l.approvedBySupervisor || 'NULL',
          approved_by_hr: l.approvedByHR || 'NULL'
        }));
      case 'production_lines':
        return productionLines.map(l => ({
          id: l.id,
          supervisor_name: l.supervisor,
          target_quantity: l.targetQuantity,
          required_manpower: l.requiredManpower,
          bottleneck_operation: l.bottleneckOperation
        }));
      case 'worker_skills':
        return employees.slice(0, 3).flatMap(e => 
          e.skills.slice(0, 2).map(sk => ({
            employee_id: e.id,
            operation_name: sk.operationName,
            skill_level: sk.skillLevel,
            proficiency: sk.proficiency,
            training_status: sk.trainingStatus
          }))
        );
      default:
        return [];
    }
  };

  const currentMockRows = getTableRows(selectedTable);

  const handleCopyDDL = (ddl: string) => {
    navigator.clipboard.writeText(ddl);
    setCopiedDDL(selectedTable);
    setSystemLogs(prev => [`SQL DDL script copied for table "${selectedTable}"`, ...prev]);
    setTimeout(() => {
      setCopiedDDL(null);
    }, 3000);
  };

  const triggerReset = () => {
    setShowResetConfirm(true);
  };

  const triggerRecalculate = () => {
    recalculateRiskScores();
    setSystemLogs(prev => ['Triggered recalculateRiskScores() - updated worker absenteeism probabilities', ...prev]);
  };

  // Admin Create User submit callback
  const handleCreateUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setInfoFeedback(null);

    // Simple sanitizations
    if (!newEmpId.trim() || !newEmpName.trim()) {
      setInfoFeedback({ message: 'Employee ID and Full Name are strictly required registration parameters.', isError: true });
      return;
    }
    if (!newEmail.includes('@')) {
      setInfoFeedback({ message: 'Provide a valid corporate email format (e.g. employee@swm.com).', isError: true });
      return;
    }
    if (newPass.length < 6) {
      setInfoFeedback({ message: 'Secure passphrases must contain at least 6 alphanumeric characters.', isError: true });
      return;
    }
    if (newPass !== newPassConfirm) {
      setInfoFeedback({ message: 'Passwords and confirmation inputs do not match.', isError: true });
      return;
    }

    setIsProcessing(true);
    try {
      const payload = {
        employeeId: newEmpId.trim(),
        employeeName: newEmpName.trim(),
        username: newEmpId.trim(),
        email: newEmail.trim(),
        department: newDept,
        designation: newDesg,
        role: newRole,
        password: newPass,
        avatarUrl: newPhotoUrl.trim() || undefined
      };

      const res = await adminCreateUser(payload);
      if (res.success) {
        setInfoFeedback({ message: `Successfully registered new account for ${payload.employeeName}. Credentials committed to database ledger.`, isError: false });
        setSystemLogs(prev => [`[ADMIN] Registered new workspace account: username="${payload.employeeId}" role="${payload.role}"`, ...prev]);
        
        // Reset inputs
        setNewEmpId('');
        setNewEmpName('');
        setNewEmail('');
        setNewPass('');
        setNewPassConfirm('');
        setNewPhotoUrl('');
        
        // Refresh users in the context
        refreshState();
      } else {
        setInfoFeedback({ message: res.error || 'Failed to complete registration flow.', isError: true });
      }
    } catch (err: any) {
      setInfoFeedback({ message: err.message || 'Server returned network exception.', isError: true });
    } finally {
      setIsProcessing(false);
    }
  };

  // Toggle Lockout status
  const handleToggleStatus = async (userId: string, currentLocked: boolean) => {
    setInfoFeedback(null);
    setIsProcessing(true);
    try {
      const res = await updateUserStatus(userId, !currentLocked);
      if (res.success) {
        setInfoFeedback({ message: 'Account access clearance altered successfully.', isError: false });
        refreshState();
      } else {
        setInfoFeedback({ message: res.error || 'Failed to toggle account locks.', isError: true });
      }
    } catch (err: any) {
      setInfoFeedback({ message: 'Network operation failure.', isError: true });
    } finally {
      setIsProcessing(false);
    }
  };

  // Alter Role assignment
  const handleAssignRole = async (userId: string, selectedRole: string) => {
    setInfoFeedback(null);
    setIsProcessing(true);
    try {
      const res = await changeUserRole(userId, selectedRole);
      if (res.success) {
        setInfoFeedback({ message: `Assigned user role updated to ${selectedRole} successfully!`, isError: false });
        refreshState();
      } else {
        setInfoFeedback({ message: res.error || 'Identity alteration denied.', isError: true });
      }
    } catch (err: any) {
      setInfoFeedback({ message: 'Security query return failure.', isError: true });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDeleteUser = (userId: string) => {
    const usr = allUsers.find(u => u.id === userId);
    if (!usr) return;
    
    if (userId === currentUser?.id) {
      setInfoFeedback({ message: 'For security reasons, you cannot delete your own administration profile.', isError: true });
      return;
    }

    setUserToDelete(usr);
  };

  const confirmDeleteUser = async () => {
    if (!userToDelete) return;
    
    setInfoFeedback(null);
    setIsProcessing(true);
    const deletedName = userToDelete.employeeName;
    try {
      await deleteUserAccount(userToDelete.id);
      setInfoFeedback({ message: `Security profile for "${deletedName}" has been successfully deleted from the centralized active registry.`, isError: false });
    } catch (err: any) {
      setInfoFeedback({ message: err.message || 'Operation failed. Unable to delete user profile.', isError: true });
    } finally {
      setIsProcessing(false);
      setUserToDelete(null);
    }
  };



  return (
    <div id="admin_module_viewport" className="space-y-6">

      {/* Corporate Dashboard Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800 dark:text-neutral-100 font-display">
            System Administration & Control Tower
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Manage system directories, configure security clearance roles, inspect PostgreSQL relational structures, and evaluate live security logs
          </p>
        </div>
      </div>

      {/* Primary Module Menu Bars */}
      <div className="flex flex-wrap gap-1.5 border-b border-slate-200 dark:border-slate-800 pb-2">
        <button 
          type="button" 
          onClick={() => setActiveTab('database')}
          className={`px-4 py-2 text-xs font-semibold rounded-lg flex items-center space-x-1.5 transition ${
            activeTab === 'database' 
              ? 'bg-blue-600 text-white shadow-xs font-bold' 
              : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-850'
          }`}
        >
          <Database className="w-4 h-4" />
          <span>PostgreSQL Relational Schema</span>
        </button>

        <button 
          type="button" 
          onClick={() => setActiveTab('users')}
          className={`px-4 py-2 text-xs font-semibold rounded-lg flex items-center space-x-1.5 transition ${
            activeTab === 'users' 
              ? 'bg-blue-600 text-white shadow-xs font-bold' 
              : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-850'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>User Directory & RBAC Admin</span>
          {pendingResetTickets.length > 0 && (
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse block"></span>
          )}
        </button>

        <button 
          type="button" 
          onClick={() => setActiveTab('audit_logs')}
          className={`px-4 py-2 text-xs font-semibold rounded-lg flex items-center space-x-1.5 transition ${
            activeTab === 'audit_logs' 
              ? 'bg-blue-600 text-white shadow-xs font-bold' 
              : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-850'
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>Enterprise System Audit Trails</span>
        </button>

        <button 
          type="button" 
          onClick={() => setActiveTab('query')}
          className={`px-4 py-2 text-xs font-semibold rounded-lg flex items-center space-x-1.5 transition ${
            activeTab === 'query' 
              ? 'bg-blue-600 text-white shadow-xs font-bold' 
              : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-850'
          }`}
        >
          <Settings className="w-4 h-4" />
          <span>Maintenance Console</span>
        </button>
      </div>

      {/* Global Status feedback section */}
      {infoFeedback && (
        <div className={`p-4 rounded-xl border flex items-start space-x-3 text-xs font-sans ${
          infoFeedback.isError 
            ? 'bg-red-50/20 border-red-500/20 text-red-600 dark:text-red-400' 
            : 'bg-emerald-50/20 border-emerald-500/20 text-emerald-600 dark:text-emerald-450'
        }`}>
          {infoFeedback.isError ? <ShieldAlert className="w-5 h-5 shrink-0" /> : <ShieldCheck className="w-5 h-5 shrink-0" />}
          <span>{infoFeedback.message}</span>
        </div>
      )}

      {/* TWO COLUMN WORKSPACE GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* LEFT COLUMN: Main tab viewport */}
        <div className={`col-span-1 ${activeTab === 'database' ? 'lg:col-span-8' : 'lg:col-span-12'} space-y-6`}>
          <AnimatePresence mode="wait">
            
            {/* TAB 1: RELATIONAL SQL VISUALIZER */}
            {activeTab === 'database' && (
              <motion.div 
                key="database"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                className="bg-white dark:bg-[#121929] border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm space-y-4"
              >
                <div>
                  <h3 className="font-display font-semibold text-slate-800 dark:text-neutral-100 text-sm">
                    PostgreSQL Physical Model & ER Diagram
                  </h3>
                  <p className="text-xs text-slate-550 dark:text-slate-400 mt-1">
                    Select a table below to witness constraints mappings, indexes configurations, and compiled active database layouts.
                  </p>
                </div>

                <div className="space-y-4">
                  {/* Table lists selectors */}
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {SQL_TABLES.map(table => (
                      <button
                        key={table.name}
                        type="button"
                        onClick={() => setSelectedTable(table.name)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-2 transition ${
                          selectedTable === table.name
                            ? 'bg-blue-600 text-white font-bold'
                            : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 hover:bg-slate-205'
                        }`}
                      >
                        <Table className="w-3.5 h-3.5" />
                        <span>{table.name}</span>
                      </button>
                    ))}
                  </div>

                  {/* Display properties of selected SQL Table */}
                  {SQL_TABLES.some(t => t.name === selectedTable) && (
                    <div className="space-y-4 border-t border-slate-100 dark:border-slate-850 pt-4 text-xs font-sans">
                      <div>
                        <span className="font-bold text-slate-800 dark:text-slate-150 block">Table Description:</span>
                        <p className="text-slate-500 mt-0.5 leading-relaxed">{SQL_TABLES.find(t => t.name === selectedTable)?.description}</p>
                      </div>

                      {/* Columns list schema display */}
                      <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-lg bg-slate-50/50 dark:bg-slate-950/30">
                        <table className="w-full text-xs text-left">
                          <thead className="bg-slate-50 dark:bg-slate-950/60 font-bold uppercase tracking-wider text-[9px] text-slate-500 border-b border-slate-200 dark:border-slate-800">
                            <tr>
                              <th className="px-3 py-2">Column Name</th>
                              <th className="px-3 py-2">Data Type</th>
                              <th className="px-3 py-2">Key / Constraints</th>
                              <th className="px-3 py-2">Business Purpose</th>
                            </tr>
                          </thead>
                          <tbody className="font-mono text-slate-650 divide-y divide-slate-100 dark:divide-slate-850">
                            {SQL_TABLES.find(t => t.name === selectedTable)?.columns.map(col => (
                              <tr key={col.name} className="hover:bg-slate-100/30 dark:hover:bg-slate-800/10">
                                <td className="px-3 py-2 font-bold text-slate-800 dark:text-slate-200">{col.name}</td>
                                <td className="px-3 py-2 text-blue-600 dark:text-blue-400 font-semibold">{col.type}</td>
                                <td className="px-3 py-2 text-amber-650 dark:text-amber-500 font-semibold">{col.constraints || 'NULLABLE'}</td>
                                <td className="px-3 py-2 font-sans text-slate-450">{col.desc}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {/* Code shell container */}
                      <div className="space-y-1">
                        <div className="flex items-center justify-between col-span-2">
                          <span className="font-bold text-slate-450 block uppercase text-[10px] tracking-wider">PostgreSQL DDL script</span>
                          <button 
                            type="button" 
                            onClick={() => handleCopyDDL(SQL_TABLES.find(t => t.name === selectedTable)!.ddl)}
                            className="text-[10px] text-blue-600 hover:text-blue-850 dark:text-blue-400 hover:underline outline-none"
                          >
                            {copiedDDL === selectedTable ? '✔ DDL Copied!' : 'Copy CREATE script'}
                          </button>
                        </div>
                        <pre className="p-3 bg-black/95 text-emerald-400 font-mono text-[10.5px] rounded-lg overflow-x-auto select-all leading-relaxed">
                          {SQL_TABLES.find(t => t.name === selectedTable)?.ddl}
                        </pre>
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {/* TAB 2: PRIVILEGED DIRECTORY (DYNAMIC USER ACCOUNTS MANAGING) */}
            {activeTab === 'users' && (
              <motion.div 
                key="users"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                className="space-y-6"
              >
                {/* 0. Password Reset Ticket Redemption and Request Center */}
                <div id="password_reset_ticket_center" className="bg-gradient-to-r from-amber-500/5 to-orange-500/5 dark:from-amber-500/5 dark:to-orange-500/5 border border-amber-300/30 dark:border-amber-800/30 rounded-xl p-5 shadow-xs space-y-4">
                  <div className="flex items-center justify-between border-b border-amber-200/40 dark:border-slate-800 pb-3">
                    <div className="flex items-center space-x-2">
                      <Key className="w-5 h-5 text-amber-500 animate-pulse" />
                      <div>
                        <h4 className="font-semibold text-slate-900 dark:text-white text-xs uppercase tracking-wide">
                          Password Reset Request Center
                        </h4>
                        <p className="text-[10px] text-slate-500 mt-0.5">
                          Redeem ticket keys provided by users who clicked "Forgot Password" or approve pending access requests.
                        </p>
                      </div>
                    </div>
                    {pendingResetTickets.length > 0 && (
                      <span className="bg-amber-500 text-white text-[10px] font-extrabold px-2 py-0.5 rounded-full select-none animate-bounce">
                        {pendingResetTickets.length} Pending
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                    {/* Manual Redeem Form */}
                    <div className="md:col-span-1 space-y-3 md:border-r border-slate-100 dark:border-slate-850 pr-0 md:pr-4">
                      <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500 block select-none">
                        Identify & Redeem Ticket Key
                      </span>
                      
                      {ticketSearchError && (
                        <div className="p-2.5 rounded bg-red-500/10 border border-red-500/20 text-red-650 text-[11px] flex items-start space-x-1.5 animate-fade-in">
                          <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                          <span>{ticketSearchError}</span>
                        </div>
                      )}

                      <div className="space-y-2">
                        <div className="relative">
                          <input 
                            type="text"
                            value={ticketInput}
                            onChange={(e) => {
                              setTicketInput(e.target.value);
                              setTicketSearchError(null);
                            }}
                            placeholder="e.g. RST-410398"
                            className="w-full pl-3 pr-20 py-2 rounded-lg border border-slate-205 dark:border-slate-805 bg-white dark:bg-[#0D1221] text-xs font-mono uppercase focus:ring-2 focus:ring-blue-500/20 outline-none placeholder:text-slate-400"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const cleaned = ticketInput.trim().toUpperCase();
                              if (!cleaned) {
                                setTicketSearchError("Please insert a ticket ID.");
                                return;
                              }
                              // Search in pending tickets first
                              const matched = pendingResetTickets.find(t => t.ticketId.toUpperCase() === cleaned);
                              if (matched) {
                                setResetTargetUser(matched.user);
                                setCustomResetPassword('');
                                setErrorReset(null);
                                setTicketInput('');
                                return;
                              }
                              
                              // If not in ready unresolved index, search in all logs for any user's RST-ID
                              const foundInLogs = auditLogs.find(log => (log.details || '').toUpperCase().includes(cleaned));
                              if (foundInLogs) {
                                const usr = allUsers.find(u => u.id === foundInLogs.userId);
                                if (usr) {
                                  setResetTargetUser(usr);
                                  setCustomResetPassword('');
                                  setErrorReset(null);
                                  setTicketInput('');
                                  return;
                                }
                              }
                              
                              // Else check if it is general username or ID the admin input
                              const directUser = allUsers.find(u => u.username.toLowerCase() === cleaned.toLowerCase() || (u.employeeId && u.employeeId.toLowerCase() === cleaned.toLowerCase()));
                              if (directUser) {
                                setResetTargetUser(directUser);
                                setCustomResetPassword('');
                                setErrorReset(null);
                                setTicketInput('');
                                return;
                              }

                              setTicketSearchError("No password ticket matching that reference key found.");
                            }}
                            className="absolute right-1 top-1 bottom-1 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-[10px] font-bold uppercase transition"
                          >
                            Redeem
                          </button>
                        </div>
                        <p className="text-[10px] text-slate-500 leading-tight">
                          Paste the <code className="bg-slate-100 dark:bg-slate-800 px-1 font-semibold text-amber-600">RST-XXXXXX</code> key exactly as provided by the employee to instant-resolve their login request.
                        </p>
                      </div>
                    </div>

                    {/* Pending Queue list */}
                    <div className="md:col-span-2 flex flex-col h-full">
                      <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500 block select-none mb-2">
                        Access Request Queue Index ({pendingResetTickets.length})
                      </span>

                      {pendingResetTickets.length === 0 ? (
                        <div className="flex-1 min-h-[90px] flex flex-col items-center justify-center border border-dashed border-slate-205 dark:border-slate-805 rounded-xl bg-slate-50/50 dark:bg-[#0D1221]/20 p-4 text-center select-none">
                          <Check className="w-5 h-5 text-emerald-500 mb-1" />
                          <span className="text-xs font-semibold text-slate-600 dark:text-slate-350">
                            Zero Pending Access Requests
                          </span>
                          <span className="text-[10px] text-slate-450 max-w-sm mt-0.5">
                            All user authentication lockouts and password ticket registrations are currently fully validated.
                          </span>
                        </div>
                      ) : (
                        <div className="flex-1 max-h-[160px] overflow-y-auto space-y-1.5 pr-1 divide-y divide-slate-100 dark:divide-slate-850">
                          {pendingResetTickets.map((t) => (
                            <div 
                              key={t.ticketId} 
                              className="pt-2 first:pt-0 pb-1 flex items-center justify-between gap-4 text-xs"
                            >
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="font-mono text-xs font-bold text-blue-600 dark:text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded border border-blue-500/10">
                                    {t.ticketId}
                                  </span>
                                  <strong className="font-bold text-slate-800 dark:text-slate-200 uppercase truncate">
                                    {t.employeeName}
                                  </strong>
                                </div>
                                <div className="flex items-center gap-2 text-[10px] text-slate-450 mt-1">
                                  <span>Username: <strong className="font-semibold text-slate-600 dark:text-slate-350">{t.username}</strong></span>
                                  <span>•</span>
                                  <span>Requested: {new Date(t.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                </div>
                              </div>
                              <div className="shrink-0 flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setResetTargetUser(t.user);
                                    setCustomResetPassword('');
                                    setErrorReset(null);
                                  }}
                                  className="px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-slate-950 hover:text-white rounded font-bold text-[10.5px] transition shadow-xs flex items-center gap-1"
                                >
                                  <Key className="w-3 h-3" />
                                  <span>Approve Reset</span>
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* 1. Admin-Controlled Account Creation Form */}
                <div className="bg-white dark:bg-[#121929] border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
                  <div className="flex items-center space-x-2 border-b border-slate-100 dark:border-slate-850 pb-3">
                    <UserPlus className="w-4.5 h-4.5 text-blue-500" />
                    <div>
                      <h4 className="font-semibold text-slate-900 dark:text-white text-xs uppercase tracking-wide">
                        Admin-Controlled User Creation
                      </h4>
                      <p className="text-[10px] text-slate-450 mt-0.5">Register new operators and planning engineers securely from the system root.</p>
                    </div>
                  </div>

                  <form onSubmit={handleCreateUserSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-sans">
                    
                    {/* Username or Employee Id field */}
                    <div className="space-y-1">
                      <label className="font-semibold text-slate-700 dark:text-slate-300">Employee ID / Username (Database Key)</label>
                      <input 
                        type="text" 
                        value={newEmpId}
                        onChange={(e) => setNewEmpId(e.target.value)}
                        placeholder="e.g. EMP-101 or aslam_m"
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D1221]"
                      />
                    </div>

                    {/* Employee Full official Name */}
                    <div className="space-y-1">
                      <label className="font-semibold text-slate-700 dark:text-slate-300">Employee Name</label>
                      <input 
                        type="text" 
                        value={newEmpName}
                        onChange={(e) => setNewEmpName(e.target.value)}
                        placeholder="e.g. Aslam Mohammad"
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D1221]"
                      />
                    </div>

                    {/* Corporate Email Address */}
                    <div className="space-y-1">
                      <label className="font-semibold text-slate-700 dark:text-slate-300">Company Email Address</label>
                      <input 
                        type="email" 
                        value={newEmail}
                        onChange={(e) => setNewEmail(e.target.value)}
                        placeholder="e.g. aslam@swm.com"
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D1221]"
                      />
                    </div>

                    {/* Department Dropdown */}
                    <div className="space-y-1">
                      <label className="font-semibold text-slate-700 dark:text-slate-300">Default Assigned Department</label>
                      <select 
                        value={newDept} 
                        onChange={(e) => setNewDept(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D1221]"
                      >
                        <option value="Sewing Line 1">Sewing Line 1</option>
                        <option value="Sewing Line 2">Sewing Line 2</option>
                        <option value="Sewing Line 3">Sewing Line 3</option>
                        <option value="Sewing Line 4">Sewing Line 4</option>
                        <option value="Industrial Engineering">Industrial Engineering</option>
                        <option value="Human Resources">Human Resources</option>
                        <option value="Production Management">Production Management</option>
                        <option value="Quality Inspection">Quality Inspection</option>
                      </select>
                    </div>

                    {/* Designation Roster title */}
                    <div className="space-y-1">
                      <label className="font-semibold text-slate-700 dark:text-slate-300">Roster Designation</label>
                      <input 
                        type="text" 
                        value={newDesg} 
                        onChange={(e) => setNewDesg(e.target.value)}
                        placeholder="e.g. Chief Supervisor or IE Planner"
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D1221]"
                      />
                    </div>

                    {/* Selected Authorization Role mapping */}
                    <div className="space-y-1">
                      <label className="font-semibold text-slate-700 dark:text-slate-300">RBAC Clearance Role</label>
                      <select 
                        value={newRole} 
                        onChange={(e) => setNewRole(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D1221] font-bold text-blue-605"
                      >
                        <option value="Admin">Admin (Full Access & Schema Config)</option>
                        <option value="IE">IE (Planning & Configuration Assistants)</option>
                        <option value="HR">HR (Employee Database, Attendance, Leaves)</option>
                        <option value="Production Manager">Production Manager (Overviews, Reports)</option>
                        <option value="Supervisor">Supervisor (Line assignments, exceptions)</option>
                        <option value="Viewer">Viewer (Dashboard views only)</option>
                      </select>
                    </div>

                    {/* Password field */}
                    <div className="space-y-1">
                      <label className="font-semibold text-slate-700 dark:text-slate-300">Access Key Password (Encrypted)</label>
                      <input 
                        type="password" 
                        value={newPass} 
                        onChange={(e) => setNewPass(e.target.value)}
                        placeholder="Min 6 characters"
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D1221] font-mono"
                      />
                    </div>

                    {/* Password confirmation */}
                    <div className="space-y-1">
                      <label className="font-semibold text-slate-700 dark:text-slate-300">Confirm Password</label>
                      <input 
                        type="password" 
                        value={newPassConfirm} 
                        onChange={(e) => setNewPassConfirm(e.target.value)}
                        placeholder="Re-enter password"
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D1221] font-mono"
                      />
                    </div>

                    {/* Photo URL */}
                    <div className="space-y-1 md:col-span-2">
                      <label className="font-semibold text-slate-700 dark:text-slate-300 flex justify-between">
                        <span>Profile Photo Avatar URL</span>
                        <span className="text-[10px] text-slate-400">Optional</span>
                      </label>
                      <input 
                        type="text" 
                        value={newPhotoUrl} 
                        onChange={(e) => setNewPhotoUrl(e.target.value)}
                        placeholder="e.g. https://images.unsplash.com/photo-..."
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D1221] font-mono truncate"
                      />
                    </div>

                    <div className="md:col-span-2 flex justify-end pt-2">
                      <button
                        type="submit"
                        disabled={isProcessing}
                        className="px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-750 text-white font-semibold flex items-center space-x-1.5 transition disabled:opacity-50 shadow-md shadow-blue-500/10"
                      >
                        {isProcessing ? (
                          <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                        ) : (
                          <>
                            <UserPlus className="w-4 h-4" />
                            <span>Verify & Add Operator Account</span>
                          </>
                        )}
                      </button>
                    </div>

                  </form>
                </div>

                {/* 2. Active User Accounts List Table */}
                <div className="bg-white dark:bg-[#121929] border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
                  <div>
                    <h3 className="font-sans font-bold text-slate-800 dark:text-neutral-100 text-[15px]">
                      Authorized Accounts Directory Index ({allUsers.length})
                    </h3>
                    <p className="text-xs text-slate-500">Monitor active user sessions, reset credentials or toggles account locks immediately</p>
                  </div>

                  <div className="overflow-x-auto border border-slate-200/65 dark:border-slate-800/80 rounded-xl bg-white dark:bg-[#111827]">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-[#FAFBFD]/80 dark:bg-slate-950 font-bold uppercase tracking-wider text-[9.5px] text-slate-450 border-b border-slate-205 dark:border-slate-805">
                        <tr>
                          <th className="px-6 py-4">Employee / ID</th>
                          <th className="px-6 py-4">Clearance Role</th>
                          <th className="px-6 py-4">Scope Mapping</th>
                          <th className="px-6 py-4">Status</th>
                          <th className="px-6 py-4 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-850">
                        {allUsers.map(usr => {
                          // Clean up and format the scope mapping based on current department or default role fallback
                          const rawScope = usr.department || 'HQ Admin';
                          const displayScope = rawScope.length > 25 ? rawScope.substring(0, 24) + '...' : rawScope;

                          return (
                            <tr key={usr.id} className="hover:bg-slate-50/40 dark:hover:bg-slate-850/10 transition duration-150">
                              
                              {/* User Avatar & info */}
                              <td className="px-6 py-5">
                                <div className="flex items-center space-x-3">
                                  <div className="w-10 h-10 rounded-full overflow-hidden border border-slate-200/85 dark:border-slate-700 bg-slate-100 shrink-0 shadow-xs">
                                    <img 
                                      src={usr.avatarUrl || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=facearea&facepad=2&w=128&h=128&q=80'} 
                                      alt={usr.employeeName} 
                                      className="w-full h-full object-cover"
                                      referrerPolicy="no-referrer"
                                    />
                                  </div>
                                  <div className="min-w-0">
                                    <p className="font-bold text-slate-850 dark:text-slate-100 uppercase tracking-wide text-xs leading-tight">
                                      {usr.employeeName}
                                    </p>
                                    <span className="text-[11px] text-slate-500 mt-1 block select-none">
                                      Username: <span className="font-bold text-blue-600 dark:text-blue-400">{usr.username}</span>
                                    </span>
                                  </div>
                                </div>
                              </td>

                              {/* Role Select Control with custom dropdown chevron */}
                              <td className="px-6 py-5">
                                <select
                                  value={usr.role}
                                  onChange={(e) => handleAssignRole(usr.id, e.target.value)}
                                  className="appearance-none bg-white dark:bg-[#0D1221] border border-slate-250 dark:border-slate-800 rounded-lg py-2 px-3 pr-8 text-xs font-semibold text-slate-850 dark:text-white leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500/10 cursor-pointer bg-[url('data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2224%22%20height%3D%2224%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%23475569%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%253E%3Cpolyline%20points%3D%226%209%2012%2015%2018%209%22%3E%3C%2Fpolyline%3E%3C%2Fsvg%3E')] bg-[length:1em_1em] bg-[right_0.5rem_center] bg-no-repeat shadow-xs min-w-[130px]"
                                  disabled={usr.id === currentUser?.id} // Avoid locking self
                                >
                                  <option value="Admin">Admin</option>
                                  <option value="IE">IE</option>
                                  <option value="HR">HR</option>
                                  <option value="Production Manager">Production Manager</option>
                                  <option value="Supervisor">Supervisor</option>
                                  <option value="Viewer">Viewer</option>
                                </select>
                              </td>

                              {/* Scope Department */}
                              <td className="px-6 py-5">
                                <span className="block font-semibold text-slate-850 dark:text-slate-200 text-xs" title={rawScope}>
                                  {displayScope}
                                </span>
                              </td>

                              {/* Status and locks */}
                              <td className="px-6 py-5">
                                <span className={`inline-flex items-center px-3 py-1 rounded-full text-[9.5px] font-extrabold tracking-wider ${
                                  usr.locked 
                                    ? 'bg-[#FEF2F2] text-[#EF4444] border border-[#FCA5A5]' 
                                    : 'bg-[#ECFDF5] text-[#10B981] border border-[#A7F3D0]'
                                }`}>
                                  {usr.locked ? 'LOCKED' : 'ACTIVE'}
                                </span>
                              </td>

                              {/* Actions Column */}
                              <td className="px-6 py-5">
                                <div className="flex items-center justify-end gap-2.5 whitespace-nowrap">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setResetTargetUser(usr);
                                      setCustomResetPassword('');
                                      setErrorReset(null);
                                    }}
                                    title="Configure custom password or default-reset for this user"
                                    className="px-3 py-1.5 font-bold text-xs text-[#D97706] bg-[#FFFBEB] hover:bg-[#FEF3C7] border border-[#FDE68A] hover:border-[#FCD34D] rounded-lg transition"
                                  >
                                    Reset Password
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => handleToggleStatus(usr.id, !!usr.locked)}
                                    disabled={usr.id === currentUser?.id}
                                    title={usr.locked ? 'De-authorize account lockout' : 'Authorize active account lockout'}
                                    className={`px-3 py-1.5 font-semibold text-xs rounded-lg transition ${
                                      usr.locked
                                        ? 'text-[#10B981] bg-[#ECFDF5] hover:bg-[#D1FAE5] border border-[#A7F3D0] hover:border-[#34D399]'
                                        : 'text-[#EF4444] bg-[#FEF2F2] hover:bg-[#FEE2E2] border border-[#FCA5A5] hover:border-[#F87171] disabled:opacity-30 disabled:pointer-events-none'
                                    }`}
                                  >
                                    {usr.locked ? 'Unlock Account' : 'Lock Account'}
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => handleDeleteUser(usr.id)}
                                    disabled={usr.id === currentUser?.id}
                                    title={usr.id === currentUser?.id ? 'Self-deletion restricted' : 'Permanently delete this user profile'}
                                    className="p-1.5 font-semibold text-xs rounded-lg transition text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200 hover:border-rose-300 disabled:opacity-30 disabled:pointer-events-none flex items-center justify-center"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              </td>

                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

              </motion.div>
            )}

            {/* TAB 3: AUDIT TRAIL LOGGING */}
            {activeTab === 'audit_logs' && (
              <motion.div 
                key="audit_logs"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                className="bg-white dark:bg-[#121929] border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm space-y-4 font-sans"
              >
                <div className="flex justify-between items-center flex-wrap gap-2">
                  <div>
                    <h3 className="font-display font-semibold text-slate-800 dark:text-neutral-100 text-sm">
                      Corporate Ledger Security & Audit Logs
                    </h3>
                    <p className="text-xs text-slate-500 mt-1">Review critical workspace authorizations, passwords resets, and administrator interventions</p>
                  </div>
                  <button
                    type="button"
                    onClick={fetchAuditLogs}
                    className="flex items-center space-x-1 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 px-3 py-1.5 rounded-lg text-xs"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Query Logs</span>
                  </button>
                </div>

                {/* Audit trail table */}
                <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-lg">
                  <table className="w-full text-[11px] text-left">
                    <thead className="bg-slate-50 dark:bg-[#0D1221] font-bold uppercase tracking-wider text-[9px] text-slate-500 border-b border-slate-200 dark:border-slate-850">
                      <tr>
                        <th className="px-3 py-2.5">Time Stamp</th>
                        <th className="px-3 py-2.5">Operator (Target)</th>
                        <th className="px-3 py-2.5">Core Action</th>
                        <th className="px-3 py-2.5">Administrator Signature</th>
                        <th className="px-3 py-2.5 text-right font-mono">Ledger IP</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-850 font-mono text-slate-655">
                      {auditLogs.map(log => {
                        // Colorize specific log actions
                        const isFailed = (log.action || '').toLowerCase().includes('failed') || (log.action || '').toLowerCase().includes('lock');
                        const isReset = (log.action || '').toLowerCase().includes('reset') || (log.action || '').toLowerCase().includes('change');

                        return (
                          <tr key={log.id} className="hover:bg-slate-50 dark:hover:bg-slate-850/10 font-mono text-[10.5px]">
                            
                            {/* Date */}
                            <td className="px-3 py-2.5 text-slate-450 dark:text-slate-500 whitespace-nowrap">
                              {new Date(log.timestamp).toLocaleString()}
                            </td>

                            {/* User ID / Target ID */}
                            <td className="px-3 py-2.5 font-bold text-slate-750 dark:text-slate-300">
                              {log.userId}
                            </td>

                            {/* Action performed details */}
                            <td className="px-3 py-2.5">
                              <span className={`inline-flex px-1.5 py-0.5 rounded ${
                                isFailed 
                                  ? 'bg-rose-500/10 text-rose-500 font-bold' 
                                  : isReset 
                                    ? 'bg-amber-500/10 text-amber-600 dark:text-amber-500 font-bold' 
                                    : 'bg-blue-500/10 text-blue-500 font-semibold'
                              }`}>
                                {log.action}
                              </span>
                            </td>

                            {/* Admin Name */}
                            <td className="px-3 py-2.5 font-sans text-slate-800 dark:text-slate-200">
                              {log.adminName || 'Ledger Node Automatic'}
                            </td>

                            {/* Client Host details */}
                            <td className="px-3 py-2.5 text-right text-slate-450">
                              {log.clientIp || '127.0.0.1'}
                            </td>

                          </tr>
                        );
                      })}
                      {auditLogs.length === 0 && (
                        <tr>
                          <td colSpan={5} className="py-8 text-center text-slate-400 font-sans">
                            No persistent audit logs found in remote database.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </motion.div>
            )}

            {/* TAB 4: SYSTEM CALCULATE CONSOLE */}
            {activeTab === 'query' && (
              <motion.div 
                key="query"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                className="space-y-4 animate-fade-in"
              >
                <div className="bg-white dark:bg-[#121929] border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
                  <div>
                    <h3 className="font-display font-semibold text-slate-800 dark:text-neutral-100 text-sm">
                      Database Maintenance & Flush Controls
                    </h3>
                    <p className="text-xs text-slate-400">Restore dataset back to factory defaults or run model re-fitting calculations</p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-sans pt-2">
                    
                    <div className="p-4 border border-dashed border-red-200 bg-red-50/10 dark:border-red-950/20 rounded-xl space-y-2">
                      <span className="font-bold text-slate-700 dark:text-slate-350 block leading-tight">Hard Reset Registers</span>
                      <p className="text-slate-400 text-[11px] leading-relaxed">
                        Flush local storage registers and restore active rosters, leaves, line configurations, and user logins back to seed defaults.
                      </p>
                      <button 
                        type="button" 
                        onClick={triggerReset}
                        className="w-full py-2 bg-rose-600 hover:bg-rose-700 text-white rounded font-bold transition shadow-xs uppercase tracking-wide text-[10px]"
                      >
                        Reset Local Database
                      </button>
                    </div>

                    <div className="p-4 border border-dashed border-blue-200 bg-blue-50/10 dark:border-blue-950/20 rounded-xl space-y-2">
                      <span className="font-bold text-slate-700 dark:text-slate-350 block leading-tight">Postgres Absenteeism Fits</span>
                      <p className="text-slate-405 text-[11px] leading-relaxed">
                        Re-evaluate predictive risk arrays based on recent approved leave events and attendance trends.
                      </p>
                      <button 
                        type="button" 
                        onClick={triggerRecalculate}
                        className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded font-bold transition shadow-xs uppercase tracking-wide text-[10px]"
                      >
                        Recalculate Risk Matrices
                      </button>
                    </div>

                  </div>
                </div>
              </motion.div>
            )}

          </AnimatePresence>
        </div>

        {/* RIGHT COLUMN: Interactive Terminal log monitors */}
        {activeTab === 'database' && (
          <div className="col-span-1 lg:col-span-4 space-y-6 font-sans">
            
            {/* Active Relational Table Viewer rows list */}
            {activeTab === 'database' && (
              <div className="bg-white dark:bg-[#121929] border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm space-y-3">
                <div className="flex items-center space-x-1">
                  <Database className="w-4 h-4 text-blue-500 animate-pulse" />
                  <span className="font-display font-semibold text-xs text-slate-800 dark:text-neutral-100 whitespace-nowrap">
                    Live PostgreSQL Row Monitor
                  </span>
                </div>
                <p className="text-[10px] text-slate-450 leading-relaxed">
                  Relational query outputs pulled directly from State memory: <code className="bg-slate-100 dark:bg-slate-800 p-0.5 rounded font-mono font-bold text-blue-600 dark:text-blue-450">SELECT * FROM {selectedTable} LIMIT 5;</code>
                </p>

                <div className="bg-black text-emerald-400 p-3 rounded-lg font-mono text-[9.5px] max-h-[280px] overflow-y-auto custom-scrollbar border border-slate-850">
                  <pre className="whitespace-pre-wrap select-all font-mono leading-relaxed">
                    {JSON.stringify(currentMockRows, null, 2)}
                  </pre>
                </div>
              </div>
            )}

            {/* Terminal Console Logs */}
            <div className="bg-slate-950 text-slate-300 border border-slate-900 rounded-xl p-4 shadow-lg space-y-3">
              <div className="flex items-center space-x-1.5 border-b border-white/5 pb-2">
                <Server className="w-4 h-4 text-sky-450 animate-pulse" />
                <span className="font-mono text-[10px] text-sky-400 font-bold uppercase tracking-wider">
                  MES Primary Node Console
                </span>
              </div>

              <div className="space-y-1.5 max-h-[180px] overflow-y-auto custom-scrollbar text-[10px] font-mono leading-relaxed text-slate-400">
                {systemLogs.map((log, idx) => (
                  <div key={idx} className="flex space-x-1">
                    <span className="text-slate-650 font-bold">[2026-06-11]</span>
                    <span className="text-slate-250 truncate block" title={log}>{log}</span>
                  </div>
                ))}
              </div>
            </div>

          </div>
        )}

      </div>

      {/* Admin force Reset Finished Modal banner */}
      <AnimatePresence>
        {resetTargetUser && !resetFinishedCode && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white dark:bg-[#121929] rounded-xl shadow-xl w-full max-w-sm border border-slate-200 dark:border-slate-800 overflow-hidden"
            >
              <div className="px-5 py-4 bg-blue-600 text-white flex items-center justify-between">
                <h3 className="font-display font-bold text-xs tracking-wide uppercase flex items-center gap-2">
                  <Key className="w-4 h-4" />
                  <span>Configure User Password Reset</span>
                </h3>
                <button type="button" onClick={() => setResetTargetUser(null)} className="text-white hover:opacity-80">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={async (e) => {
                e.preventDefault();
                setErrorReset(null);
                setIsProcessing(true);
                try {
                  const finalPass = customResetPassword.trim() ? customResetPassword.trim() : 'SWM2026!';
                  if (customResetPassword.trim() && customResetPassword.trim().length < 6) {
                    setErrorReset('Password must be at least 6 characters in length.');
                    setIsProcessing(false);
                    return;
                  }
                  const res = await resetUserPassword(resetTargetUser.id, finalPass);
                  if (res.success) {
                    setResetFinishedCode(finalPass);
                    setUserPasswordResetTarget(resetTargetUser.id);
                    setSystemLogs(prev => [`[ADMIN] Reset password for User=${resetTargetUser.employeeName} to custom selection successfully`, ...prev]);
                    refreshState();
                    setResetTargetUser(null);
                  } else {
                    setErrorReset('Error returned during operation.');
                  }
                } catch (err: any) {
                  setErrorReset(err.message || 'Verification / Identity reset failed.');
                } finally {
                  setIsProcessing(false);
                }
              }} className="p-5 space-y-4 text-xs font-sans text-slate-600 dark:text-slate-350">
                <p className="font-semibold text-slate-850 dark:text-neutral-105 select-none">
                  Modifying passcode for user: <strong className="text-blue-600 dark:text-blue-400 font-bold uppercase">{resetTargetUser.employeeName}</strong>
                </p>

                {errorReset && (
                  <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-655 dark:text-red-405 text-xs flex items-start space-x-2">
                    <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                    <span>{errorReset}</span>
                  </div>
                )}

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">New Custom Password</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-405 pointer-events-none">
                      <Lock className="w-3.5 h-3.5" />
                    </div>
                    <input 
                      type="text" 
                      value={customResetPassword}
                      onChange={(e) => setCustomResetPassword(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-205 dark:border-slate-805 bg-slate-50 dark:bg-[#0D1221] text-xs font-mono"
                      placeholder="Leave blank to use default"
                    />
                  </div>
                  <p className="text-[10px] text-slate-450 mt-1">
                    If empty, password defaults to <code className="bg-slate-100 dark:bg-slate-800 p-0.5 font-semibold text-blue-600 font-mono">SWM2026!</code>.
                  </p>
                </div>

                <div className="pt-2 flex justify-end space-x-2">
                  <button 
                    type="button" 
                    onClick={() => setResetTargetUser(null)}
                    className="px-4 py-2 border border-slate-250 dark:border-slate-800 text-slate-600 dark:text-slate-350 rounded font-semibold text-xs hover:bg-slate-50 dark:hover:bg-slate-850"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit" 
                    disabled={isProcessing}
                    className="px-5 py-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-850 text-white rounded font-semibold text-xs disabled:opacity-50"
                  >
                    {isProcessing ? 'Updating...' : 'Apply Reset'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}

        {userPasswordResetTarget && resetFinishedCode && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white dark:bg-[#121929] rounded-xl shadow-xl w-full max-w-sm border border-slate-200 dark:border-slate-800 overflow-hidden"
            >
              <div className="px-5 py-4 bg-amber-600 text-white flex items-center justify-between">
                <h3 className="font-display font-bold text-xs tracking-wide uppercase flex items-center gap-2">
                  <Key className="w-4 h-4" />
                  <span>Credential Force Reset</span>
                </h3>
                <button type="button" onClick={() => setUserPasswordResetTarget(null)} className="text-white hover:opacity-80">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-5 space-y-4 text-xs font-sans text-slate-600 dark:text-slate-350">
                <p className="font-semibold text-slate-805 dark:text-neutral-100">
                  Password successfully reset for target ID: <code className="font-mono text-blue-600 bg-slate-100 dark:bg-slate-800 p-1 px-1.5 rounded">{userPasswordResetTarget}</code>
                </p>
                
                <div className="space-y-1.5 bg-slate-50 dark:bg-[#0D1221] border border-slate-150 dark:border-slate-800 p-4 rounded-xl text-center leading-normal">
                  <span className="text-[10px] text-slate-405 block font-bold uppercase tracking-wider">TEMPORARY PASSCODE</span>
                  <p className="text-lg font-bold font-mono text-emerald-600 dark:text-emerald-450 select-all">{resetFinishedCode}</p>
                </div>

                <div className="pt-2 flex justify-end">
                  <button 
                    type="button" 
                    onClick={() => setUserPasswordResetTarget(null)}
                    className="px-5 py-2 bg-blue-650 hover:bg-blue-700 text-white rounded font-semibold text-xs"
                  >
                    Close & Log Success
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Database Reset Action Confirmation */}
      <AnimatePresence>
        {showResetConfirm && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white dark:bg-slate-900 rounded-xl shadow-xl w-full max-w-sm border border-slate-200 dark:border-slate-800 overflow-hidden"
            >
              {/* Header */}
              <div className="px-5 py-4 bg-[#DC2626] text-white flex items-center justify-between">
                <h3 className="font-display font-bold text-xs tracking-wide uppercase flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4" />
                  <span>Restore Factory Registry</span>
                </h3>
                <button type="button" onClick={() => setShowResetConfirm(false)} className="text-white hover:opacity-80">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Content */}
              <div className="p-5 space-y-4 text-xs text-slate-600 dark:text-slate-350">
                <p className="font-semibold text-slate-800 dark:text-neutral-100">
                  Are you absolutely sure you want to reset the database?
                </p>
                <p className="leading-relaxed bg-red-50/20 dark:bg-red-955/10 p-3 border border-red-100/30 dark:border-rose-950/20 rounded-lg text-red-600 dark:text-red-405 font-medium">
                  Warning: All manually modified supervisor rosters, User accounts list changes, imported attendance sheets, leaves, line reallocations, and custom operator files will be permanently erased.
                </p>

                {/* Actions */}
                <div className="pt-2 flex justify-end space-x-3">
                  <button 
                    type="button" 
                    onClick={() => setShowResetConfirm(false)}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded font-semibold"
                  >
                    Cancel
                  </button>
                  <button 
                    type="button" 
                    onClick={async () => {
                      await resetDatabase();
                      setSystemLogs(prev => ['PostgreSQL database registry restored to seed defaults successfully.', ...prev]);
                      setShowResetConfirm(false);
                      refreshState();
                    }}
                    className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white rounded font-bold transition"
                  >
                    Reset Now
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {userToDelete && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white dark:bg-slate-900 rounded-xl shadow-xl w-full max-w-sm border border-slate-200 dark:border-slate-800 overflow-hidden"
            >
              {/* Header */}
              <div className="px-5 py-4 bg-[#EF4444] text-white flex items-center justify-between">
                <h3 className="font-display font-bold text-xs tracking-wide uppercase flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4" />
                  <span>Delete User Account</span>
                </h3>
                <button type="button" onClick={() => setUserToDelete(null)} className="text-white hover:opacity-80">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Content */}
              <div className="p-5 space-y-4 text-xs text-slate-600 dark:text-slate-350">
                <p className="font-semibold text-slate-800 dark:text-neutral-100">
                  Are you absolutely sure you want to permanently delete the profile of "{userToDelete.employeeName}" ({userToDelete.username})?
                </p>
                <p className="leading-relaxed bg-red-50/20 dark:bg-red-955/10 p-3 border border-red-100/30 dark:border-rose-950/20 rounded-lg text-red-600 dark:text-red-405 font-medium">
                  This will revoke all active session keys and permanently remove this user account from the registry.
                </p>

                {/* Actions */}
                <div className="pt-2 flex justify-end space-x-3">
                  <button 
                    type="button" 
                    onClick={() => setUserToDelete(null)}
                    disabled={isProcessing}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded font-semibold disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button 
                    type="button" 
                    onClick={confirmDeleteUser}
                    disabled={isProcessing}
                    className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white rounded font-bold transition flex items-center space-x-1.5 disabled:opacity-50"
                  >
                    {isProcessing ? (
                      <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                    ) : (
                      <span>Delete permanently</span>
                    )}
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
