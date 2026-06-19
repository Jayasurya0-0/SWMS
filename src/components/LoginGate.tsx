import React, { useState, useEffect } from 'react';
import { useAppState } from '../contexts/StateContext';
import { 
  User, Shield, Lock, Eye, EyeOff, AlertCircle, CheckCircle, 
  Settings, Server, Activity, HelpCircle, ArrowLeft, Cpu, Laptop
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export function LoginGate() {
  const { login, requestPasswordReset } = useAppState();

  // Authentication Mode states: 'login' | 'forgot' | 'forgot_success'
  const [mode, setMode] = useState<'login' | 'forgot' | 'forgot_success'>('login');
  
  // Login input values
  const [usernameOrEmpId, setUsernameOrEmpId] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Forgot password input values
  const [forgotInput, setForgotInput] = useState('');
  const [forgotTicketId, setForgotTicketId] = useState('');
  const [forgotMessage, setForgotMessage] = useState('');

  // UI state modifiers
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Load Saved Username if 'Remember Me' was chosen in a previous session
  useEffect(() => {
    const saved = localStorage.getItem('swm_saved_username');
    if (saved) {
      setUsernameOrEmpId(saved);
      setRememberMe(true);
    }
  }, []);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!usernameOrEmpId.trim()) {
      setErrorMessage('Please enter your Employee ID or registered Username.');
      return;
    }
    if (!password) {
      setErrorMessage('Please provide your security access password.');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await login(usernameOrEmpId.trim(), password);
      if (result.success) {
        if (rememberMe) {
          localStorage.setItem('swm_saved_username', usernameOrEmpId.trim());
        } else {
          localStorage.removeItem('swm_saved_username');
        }
        setSuccessMessage('Security clearance approved. Redirecting to active workspace...');
      } else {
        setErrorMessage(result.error || 'Identity verification failed.');
      }
    } catch (err: any) {
      setErrorMessage('Server connection timeout. Please verify local network status.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleForgotPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!forgotInput.trim()) {
      setErrorMessage('Please enter your Employee ID or registered Username to continue.');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await requestPasswordReset(forgotInput.trim());
      if (result.success) {
        setForgotTicketId(result.ticketId || '');
        setForgotMessage(result.message);
        setMode('forgot_success');
      } else {
        setErrorMessage(result.message || 'Lookup return no corresponding account entries.');
      }
    } catch (err: any) {
      setErrorMessage('Connection failed. Please request manual reset from Administrator Prakash Mehta.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div id="login_container" className="flex min-h-screen font-sans bg-slate-100 text-slate-950 dark:bg-[#0B0F19] transition-all">
      
      {/* 1. BRAND ILLUSTRATION PANEL (LEFT SIDE) */}
      <div id="login_left_panel" className="relative hidden w-1/2 lg:flex overflow-hidden bg-[#0A101D]">
        
        {/* Background Image overlay with heavy atmospheric industrial radial and linear gradients */}
        <div className="absolute inset-0 z-0">
          <img 
            src="https://images.unsplash.com/photo-1558449028-b53a39d100fc?auto=format&fit=crop&q=80&w=1200" 
            alt="Modern Textile Manufacturing Facility"
            className="object-cover w-full h-full opacity-35 filter brightness-75 contrast-125"
            referrerPolicy="no-referrer"
          />
          <div className="absolute inset-0 bg-gradient-to-tr from-slate-950 via-[#0C1221]/90 to-blue-900/30"></div>
          <div className="absolute inset-x-0 bottom-0 h-96 bg-gradient-to-t from-slate-950 via-[#0A101D]/70 to-transparent"></div>
        </div>

        {/* Branding & Decorative Micro elements */}
        <div className="relative z-10 flex flex-col justify-between w-full h-full p-12 text-white">
          
          {/* Top segment: Logotype header */}
          <div className="flex items-center space-x-3.5">
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 shadow-md shadow-blue-500/20">
              <Cpu className="w-5.5 h-5.5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight font-sans text-white">
                SWM
              </h1>
              <p className="text-[10px] text-slate-400 font-mono tracking-widest uppercase">Garment Manufacturing ERP/MES</p>
            </div>
          </div>

          {/* Middle segment: Dynamic Statistics Cards and Platform Features summary */}
          <div className="flex flex-col space-y-8 max-w-sm">
            <div className="space-y-3.5">
              <span className="inline-block px-2.5 py-1 text-[10px] font-semibold text-blue-400 uppercase tracking-widest bg-blue-500/10 rounded-full border border-blue-500/20">
                ACTIVE WORKFORCE LEDGER
              </span>
              <h2 className="text-3xl font-extrabold tracking-tight text-white font-sans leading-tight">
                Enterprise Command & Assembly Optimization
              </h2>
              <p className="text-sm text-slate-300 leading-relaxed font-sans">
                Real-time workforce deployment, dynamic bottleneck relief, skills mapping, and compliance automation tailored for global garment manufacturing hubs.
              </p>
            </div>

            {/* Glass-style mini stats board */}
            <div className="p-4 rounded-xl bg-white/5 border border-white/10 backdrop-blur-md grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <span className="text-[10px] text-slate-450 uppercase tracking-wider font-semibold">Line Balance Target</span>
                <p className="text-lg font-bold text-blue-400 font-mono">82.0% - 85%</p>
              </div>
              <div className="space-y-1">
                <span className="text-[10px] text-slate-450 uppercase tracking-wider font-semibold">Active Ledger Sync</span>
                <p className="text-lg font-bold text-emerald-400 font-mono">100% ONLINE</p>
              </div>
              <div className="col-span-2 pt-2 border-t border-white/5 flex items-center space-x-2 text-slate-400 text-xs">
                <Activity className="w-3.5 h-3.5 text-blue-400 animate-pulse-slow" />
                <span>Running fully integrated schema on Firestore Cloud</span>
              </div>
            </div>
          </div>

          {/* Bottom segment: Corporate signature & system tags */}
          <div className="flex items-center justify-between border-t border-white/10 pt-6">
            <div className="flex items-center space-x-2 text-slate-400 text-[11px] font-sans">
              <Server className="w-3.5 h-3.5" />
              <span>SWM Primary Node: Active</span>
            </div>
            <span className="text-[10px] text-slate-500 font-mono">BUILD-2026.06.11</span>
          </div>

        </div>
      </div>

      {/* 2. AUTHENTICATION CONTROLS (RIGHT SIDE CARD) */}
      <div id="login_right_panel" className="flex flex-col justify-between w-full lg:w-1/2 p-6 md:p-12 bg-slate-50 dark:bg-[#0B101D] sm:justify-center">
        
        {/* Mobile Header (Hidden on large desktops) */}
        <div className="flex items-center space-x-3.5 lg:hidden mb-12">
          <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-blue-600">
            <Cpu className="w-5 h-5 text-white" />
          </div>
          <div>
            <span className="text-base font-bold tracking-tight text-slate-900 dark:text-white">SWM</span>
            <p className="text-[9px] text-slate-500 font-mono">Garment ERP/MES</p>
          </div>
        </div>

        {/* Card and Form area */}
        <div className="max-w-md w-full mx-auto space-y-8 bg-white dark:bg-[#121929] p-8 md:p-10 rounded-2xl shadow-xl shadow-slate-200/50 dark:shadow-none border border-slate-200/60 dark:border-slate-800/80 backdrop-blur-sm self-center">
          
          <AnimatePresence mode="wait">
            
            {/* LOGIN FORM VIEW */}
            {mode === 'login' && (
              <motion.div
                key="login-view"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                transition={{ duration: 0.15 }}
                className="space-y-6"
              >
                {/* Header Titles */}
                <div className="space-y-2">
                  <h3 id="login_card_title" className="text-2xl font-bold tracking-tight text-slate-850 dark:text-white font-sans">
                    Welcome back
                  </h3>
                  <p id="login_card_subtitle" className="text-xs text-slate-500 dark:text-slate-400 font-sans">
                    Authorized workforce planning and dashboard controllers login
                  </p>
                </div>

                {/* Status Messages */}
                {errorMessage && (
                  <div className="p-3.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs flex items-start space-x-3">
                    <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                    <span>{errorMessage}</span>
                  </div>
                )}

                {successMessage && (
                  <div className="p-3.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs flex items-start space-x-3 animate-pulse">
                    <CheckCircle className="w-4 h-4 mt-0.5 shrink-0" />
                    <span>{successMessage}</span>
                  </div>
                )}

                {/* Form fields */}
                <form onSubmit={handleLoginSubmit} className="space-y-4">
                  
                  {/* employeeId / Username field */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 font-sans flex items-center justify-between">
                      <span>Employee ID / Username</span>
                      <span className="text-[10px] text-slate-450 dark:text-slate-500">Required</span>
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none text-slate-400 dark:text-slate-500">
                        <User className="w-4 h-4" />
                      </div>
                      <input 
                        type="text"
                        autoComplete="username"
                        value={usernameOrEmpId}
                        onChange={(e) => setUsernameOrEmpId(e.target.value)}
                        placeholder="e.g. EMP-101 or Username"
                        className="w-full pl-10 pr-3.5 py-2.5 rounded-lg border border-slate-250 dark:border-slate-800/85 bg-slate-50 dark:bg-[#0D1221] text-xs font-sans placeholder-slate-400 dark:placeholder-slate-600 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent transition-colors"
                      />
                    </div>
                  </div>

                  {/* Password field */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 font-sans flex items-center justify-between">
                      <span>Security Password</span>
                      <span className="text-[10px] text-slate-450 dark:text-slate-500">Required</span>
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none text-slate-400 dark:text-slate-500">
                        <Lock className="w-4 h-4" />
                      </div>
                      <input 
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="current-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••••••"
                        className="w-full pl-10 pr-10 py-2.5 rounded-lg border border-slate-250 dark:border-slate-800/85 bg-slate-50 dark:bg-[#0D1221] text-xs font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent transition-colors"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-305 transition"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Remember and Forgot controls row */}
                  <div className="flex items-center justify-between pt-1">
                    <label className="flex items-center space-x-2 cursor-pointer select-none">
                      <input 
                        type="checkbox"
                        checked={rememberMe}
                        onChange={(e) => setRememberMe(e.target.checked)}
                        className="w-4 h-4 text-blue-600 rounded border-slate-250 dark:border-slate-800 bg-slate-50 dark:bg-[#0D1221] focus:ring-blue-500/30"
                      />
                      <span className="text-xs text-slate-650 dark:text-slate-405 font-sans">Remember Me</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setErrorMessage(null);
                        setSuccessMessage(null);
                        setMode('forgot');
                      }}
                      className="text-xs font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-450 dark:hover:text-blue-350 transition font-sans"
                    >
                      Forgot password?
                    </button>
                  </div>

                  {/* Submit Button */}
                  <div className="pt-2">
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="w-full relative flex items-center justify-center space-x-2 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-indigo-650 text-white font-semibold text-xs transition duration-150 shadow-md shadow-blue-500/10 focus:outline-none disabled:opacity-50"
                    >
                      {isSubmitting ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                          <span>Authenticating...</span>
                        </>
                      ) : (
                        <span>Verify Security & Open Portal</span>
                      )}
                    </button>
                  </div>

                </form>

              </motion.div>
            )}

            {/* FORGOT PASSWORD FORM VIEW */}
            {mode === 'forgot' && (
              <motion.div
                key="forgot-view"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                transition={{ duration: 0.15 }}
                className="space-y-6"
              >
                {/* Back button link */}
                <button
                  type="button"
                  onClick={() => {
                    setErrorMessage(null);
                    setSuccessMessage(null);
                    setMode('login');
                  }}
                  className="inline-flex items-center space-x-1.5 text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 transition font-sans font-semibold"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Return to Login</span>
                </button>

                {/* Headers */}
                <div className="space-y-2">
                  <h3 className="text-2xl font-bold tracking-tight text-slate-855 dark:text-white font-sans">
                    Reset Security Password
                  </h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400 font-sans">
                    Submit your Employee ID or Username to generate an authorized reset ticket.
                  </p>
                </div>

                {/* Error Banner */}
                {errorMessage && (
                  <div className="p-3.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs flex items-start space-x-3">
                    <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                    <span>{errorMessage}</span>
                  </div>
                )}

                {/* Form fields */}
                <form onSubmit={handleForgotPasswordSubmit} className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-755 dark:text-slate-355 font-sans">
                      Target USERNAME or EMPLOYEE ID
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none text-slate-400">
                        <User className="w-4 h-4" />
                      </div>
                      <input 
                        type="text"
                        value={forgotInput}
                        onChange={(e) => setForgotInput(e.target.value)}
                        placeholder="e.g. EMP-101 or Username"
                        className="w-full pl-10 pr-3.5 py-2.5 rounded-lg border border-slate-250 dark:border-slate-800 bg-slate-50 dark:bg-[#0D1221] text-xs font-sans text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full relative flex items-center justify-center space-x-2 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 dark:bg-indigo-600 dark:hover:bg-indigo-650 text-white font-semibold text-xs transition disabled:opacity-50"
                  >
                    {isSubmitting ? (
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                    ) : (
                      <span>Submit Reset Request</span>
                    )}
                  </button>
                </form>

              </motion.div>
            )}

            {/* FORGOT PASSWORD TICKET TICKET-SUCCESS VIEW */}
            {mode === 'forgot_success' && (
              <motion.div
                key="forgot-success-view"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                transition={{ duration: 0.15 }}
                className="space-y-6 text-center"
              >
                <div className="mx-auto w-12 h-12 bg-emerald-500/10 text-emerald-500 rounded-full flex items-center justify-center border border-emerald-500/20">
                  <CheckCircle className="w-6 h-6" />
                </div>

                <div className="space-y-2">
                  <h3 className="text-xl font-bold tracking-tight text-slate-855 dark:text-white">
                    Reset Ticket Structured
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    A security ticket was generated and added to the audit log.
                  </p>
                </div>

                {/* Ticket Details Display Box */}
                <div className="bg-slate-50 dark:bg-[#0D1221] border border-slate-200/50 dark:border-slate-800/80 p-4 rounded-xl text-left space-y-2">
                  <div className="flex justify-between items-center pb-2 border-b border-slate-500/10">
                    <span className="text-[10px] text-slate-405 font-semibold font-mono">TICKET REF ID</span>
                    <span className="text-xs font-bold text-blue-600 dark:text-blue-400 font-mono">{forgotTicketId}</span>
                  </div>
                  <p className="text-[11px] text-slate-600 dark:text-slate-355 font-sans leading-relaxed">
                    {forgotMessage}
                  </p>
                </div>

                <div className="p-3 bg-blue-500/5 border border-blue-500/10 rounded-lg text-[10px] text-slate-500 dark:text-slate-405 text-left flex items-start space-x-2">
                  <HelpCircle className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                  <p className="font-sans leading-normal">
                    Give this ticket ID to Prakash Mehta (System Administrator) to approve and restore your access. By default, resets configured the password to <code className="font-mono bg-slate-200/50 dark:bg-slate-800 px-1 py-0.5 rounded text-blue-600 font-bold">SWM2026!</code>.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setForgotInput('');
                    setForgotTicketId('');
                    setForgotMessage('');
                    setMode('login');
                  }}
                  className="w-full py-2.5 rounded-lg border border-slate-250 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold text-xs transition font-sans"
                >
                  Return to login form
                </button>

              </motion.div>
            )}

          </AnimatePresence>

        </div>

        {/* Footer credits block */}
        <div className="text-center font-sans mt-8 lg:mt-0 text-[11px] text-slate-500 dark:text-slate-405 max-w-sm mx-auto self-center lg:self-auto">
          <span>SWM Security Node.</span>
          <p className="mt-0.5 text-[9px] text-slate-450 dark:text-slate-505">
            © 2026 SWM Corporation. All rights reserved. Supported standard browser frames.
          </p>
        </div>

      </div>

    </div>
  );
}
