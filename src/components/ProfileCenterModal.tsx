import React, { useState } from 'react';
import { useAppState } from '../contexts/StateContext';
import { 
  X, User, Shield, Key, AlertCircle, CheckCircle, 
  Mail, Bookmark, Briefcase, Calendar, Clock, LogOut, Image as ImageIcon, Award,
  Lock
} from 'lucide-react';
import { motion } from 'motion/react';

interface ProfileCenterProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ProfileCenterModal({ isOpen, onClose }: ProfileCenterProps) {
  const { currentUser, logout, changeUserPassword, updateUserProfile } = useAppState();

  const [activeTab, setActiveTab] = useState<'details' | 'security'>('details');

  // Personal Info Edit state
  const [employeeName, setEmployeeName] = useState(currentUser?.employeeName || '');
  const [email, setEmail] = useState(currentUser?.email || '');
  const [avatarUrl, setAvatarUrl] = useState(currentUser?.avatarUrl || '');

  // Password Change state
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Status feedback state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [successText, setSuccessText] = useState<string | null>(null);

  if (!isOpen || !currentUser) return null;

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorText(null);
    setSuccessText(null);

    if (!employeeName.trim()) {
      setErrorText('Please specify a valid full name.');
      return;
    }
    if (!email.trim() || !email.includes('@')) {
      setErrorText('Please specify a valid corporate email address.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await updateUserProfile({
        employeeName: employeeName.trim(),
        email: email.trim(),
        avatarUrl: avatarUrl.trim() || undefined
      });
      if (res.success) {
        setSuccessText('Profile information updated successfully!');
      } else {
        setErrorText(res.error || 'Failed to update details.');
      }
    } catch (err: any) {
      setErrorText(err.message || 'Server error.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChangePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorText(null);
    setSuccessText(null);

    if (!oldPassword) {
      setErrorText('Please enter your current active password.');
      return;
    }
    if (newPassword.length < 6) {
      setErrorText('Your new password must be at least 6 characters in length.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setErrorText('Confirm password does not match your new password.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await changeUserPassword(oldPassword, newPassword);
      if (res.success) {
        setSuccessText('Password changed successfully! Keep it safe.');
        setOldPassword('');
        setNewPassword('');
        setConfirmPassword('');
      } else {
        setErrorText(res.error || 'Verification of old password failed.');
      }
    } catch (err: any) {
      setErrorText(err.message || 'Server connection error.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div id="profile_center_backdrop" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        transition={{ duration: 0.16, ease: 'easeOut' }}
        className="relative w-full max-w-2xl bg-white dark:bg-[#121929] border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden text-slate-800 dark:text-slate-100 flex flex-col md:flex-row h-[550px] md:h-[480px]"
      >
        
        {/* LEFT BAR: User Snapshot & Side Tabs */}
        <div className="w-full md:w-1/3 bg-slate-50 dark:bg-[#0D1221] p-6 flex flex-col justify-between border-b md:border-b-0 md:border-r border-slate-200 dark:border-slate-800 shrink-0">
          
          <div className="space-y-6">
            {/* Session User Profile Badge */}
            <div className="text-center space-y-3">
              <div className="relative mx-auto w-20 h-20 rounded-full overflow-hidden border-2 border-blue-500/30 shadow-md">
                <img 
                  src={currentUser.avatarUrl || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=facearea&facepad=2&w=256&h=256&q=80'} 
                  alt={currentUser.employeeName}
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
              </div>
              <div>
                <h4 className="text-sm font-bold tracking-tight text-slate-900 dark:text-white leading-tight uppercase truncate">
                  {currentUser.employeeName}
                </h4>
                <p className="text-[10px] font-semibold text-slate-505 tracking-wider uppercase mt-0.5 truncate bg-slate-200/50 dark:bg-slate-800 inline-block px-2 py-0.5 rounded">
                  {currentUser.role}
                </p>
              </div>
            </div>

            {/* Menu options buttons */}
            <div className="space-y-1.5 pt-2">
              <button
                type="button"
                onClick={() => {
                  setErrorText(null);
                  setSuccessText(null);
                  setActiveTab('details');
                }}
                className={`w-full text-left px-3.5 py-2.5 rounded-lg text-xs font-semibold flex items-center space-x-2.5 transition border ${
                  activeTab === 'details'
                    ? 'bg-blue-600 text-white border-blue-600 font-bold'
                    : 'text-slate-600 dark:text-slate-355 border-transparent hover:bg-slate-200/50 dark:hover:bg-slate-800'
                }`}
              >
                <User className="w-4 h-4" />
                <span>Personal Information</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setErrorText(null);
                  setSuccessText(null);
                  setActiveTab('security');
                }}
                className={`w-full text-left px-3.5 py-2.5 rounded-lg text-xs font-semibold flex items-center space-x-2.5 transition border ${
                  activeTab === 'security'
                    ? 'bg-blue-600 text-white border-blue-600 font-bold'
                    : 'text-slate-600 dark:text-slate-355 border-transparent hover:bg-slate-200/50 dark:hover:bg-slate-800'
                }`}
              >
                <Key className="w-4 h-4" />
                <span>Security Credentials</span>
              </button>
            </div>
          </div>

          {/* Log Out option button */}
          <button
            type="button"
            onClick={() => {
              onClose();
              logout();
            }}
            className="w-full mt-6 py-2.5 rounded-lg border border-red-500/10 hover:bg-red-500/5 hover:border-red-500/25 text-red-655 dark:text-red-405 font-semibold text-xs flex items-center justify-center space-x-2 transition"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Secure Logout</span>
          </button>

        </div>

        {/* RIGHT AREA: Active tab content controls */}
        <div className="flex-1 flex flex-col min-w-0 bg-white dark:bg-[#121929]">
          
          {/* Header Segment */}
          <div className="p-4 md:p-6 border-b border-slate-250 dark:border-slate-800/80 flex justify-between items-center shrink-0">
            <div>
              <h3 className="text-base font-bold tracking-tight text-slate-900 dark:text-white">
                {activeTab === 'details' ? 'Profile Details Editor' : 'Account Security Management'}
              </h3>
              <p className="text-[11px] text-slate-500">
                {activeTab === 'details' ? 'Update your digital workspace profile card' : 'Re-verify credentials and alter passwords'}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            >
              <X className="w-4.5 h-4.5" />
            </button>
          </div>

          {/* Scrollable form dashboard body */}
          <div className="flex-1 p-6 overflow-y-auto custom-scrollbar space-y-4">
            
            {/* Status alerts */}
            {errorText && (
              <div className="p-3.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-655 dark:text-red-405 text-xs flex items-start space-x-2">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{errorText}</span>
              </div>
            )}

            {successText && (
              <div className="p-3.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-655 dark:text-emerald-405 text-xs flex items-start space-x-2">
                <CheckCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{successText}</span>
              </div>
            )}

            {/* TAB 1: DETAILS */}
            {activeTab === 'details' && (
              <form onSubmit={handleUpdateProfile} className="space-y-4 text-xs font-sans">
                
                {/* Visual Metadata section (Display-Only fields) */}
                <div className="grid grid-cols-2 gap-3 bg-slate-50 dark:bg-[#0D1221] border border-slate-200/50 dark:border-slate-850 p-4 rounded-xl">
                  <div className="space-y-0.5">
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-semibold">Employee Serial</span>
                    <p className="text-xs font-bold text-slate-800 dark:text-slate-100 font-mono">{currentUser.employeeId || currentUser.id}</p>
                  </div>
                  <div className="space-y-0.5">
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-semibold">User Role</span>
                    <p className="text-xs font-bold text-slate-800 dark:text-slate-100">{currentUser.role}</p>
                  </div>
                  <div className="space-y-0.5 mt-2">
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-semibold">Assigned Department</span>
                    <p className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">{currentUser.department || 'Garment Hub'}</p>
                  </div>
                  <div className="space-y-0.5 mt-2">
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-semibold">Designation Title</span>
                    <p className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">{currentUser.designation || 'Staff Operator'}</p>
                  </div>
                </div>

                {/* Editable input segments */}
                <div id="login_form_fields" className="space-y-3.5">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Employee Name</label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400 pointer-events-none">
                        <User className="w-3.5 h-3.5" />
                      </div>
                      <input 
                        type="text" 
                        value={employeeName}
                        onChange={(e) => setEmployeeName(e.target.value)}
                        className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-205 dark:border-slate-805 bg-slate-50 dark:bg-[#0D1221] text-xs"
                        placeholder="Employee Full Name"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Corporate Email Address</label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400 pointer-events-none">
                        <Mail className="w-3.5 h-3.5" />
                      </div>
                      <input 
                        type="email" 
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-205 dark:border-slate-805 bg-slate-50 dark:bg-[#0D1221] text-xs"
                        placeholder="email@company.com"
                      />
                    </div>
                  </div>

                  {/* Interactive Photo Update Widget */}
                  <div className="space-y-2.5 border border-dashed border-slate-200 dark:border-slate-800 p-3.5 rounded-xl bg-slate-50/50 dark:bg-[#0D1221]/40">
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block">Fast Profile Photo Update</label>
                    
                    <div className="flex flex-col sm:flex-row items-center gap-4">
                      {/* Avatar Preview & Upload Area */}
                      <div 
                        onClick={() => document.getElementById('avatar-file-input')?.click()}
                        className="relative group w-14 h-14 rounded-full overflow-hidden border border-slate-250 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 cursor-pointer shadow-xs shrink-0 transition hover:border-blue-500 hover:ring-2 hover:ring-blue-500/20"
                        title="Click to Choose custom local photo"
                      >
                        <img 
                          src={avatarUrl || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=facearea&facepad=2&w=128&h=128&q=80'} 
                          alt="Select" 
                          className="w-full h-full object-cover transition duration-200 group-hover:brightness-[0.4]"
                          referrerPolicy="no-referrer"
                        />
                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition duration-200 text-white text-[9px] font-semibold text-center leading-tight p-0.5 select-none">
                          Upload Photo
                        </div>
                      </div>

                      {/* Hidden File Input */}
                      <input 
                        id="avatar-file-input"
                        type="file" 
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            if (file.size > 1024 * 1024) { // Limit to 1MB
                              setErrorText('Photo file exceeds 1MB limit. Please choose a smaller image.');
                              return;
                            }
                            const reader = new FileReader();
                            reader.onload = (event) => {
                              const result = event.target?.result as string;
                              if (result) {
                                setAvatarUrl(result);
                                setSuccessText('Local image loaded successfully! Click Save to apply.');
                              }
                            };
                            reader.readAsDataURL(file);
                          }
                        }}
                      />

                      {/* Presets and Guidelines */}
                      <div className="flex-1 space-y-1.5 w-full">
                        <span className="text-[10px] uppercase font-bold tracking-wider text-slate-450 block select-none">Preset Options:</span>
                        <div className="flex flex-wrap gap-1.5">
                          {[
                            'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=facearea&facepad=2&w=128&h=128&q=80',
                            'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=facearea&facepad=2&w=128&h=128&q=80',
                            'https://images.unsplash.com/photo-1599566150163-29194dcaad36?auto=format&fit=facearea&facepad=2&w=128&h=128&q=80',
                            'https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?auto=format&fit=facearea&facepad=2&w=128&h=128&q=80',
                            'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?auto=format&fit=facearea&facepad=2&w=128&h=128&q=80',
                            'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=facearea&facepad=2&w=128&h=128&q=80'
                          ].map((url, i) => (
                            <button
                              key={i}
                              type="button"
                              onClick={() => {
                                setAvatarUrl(url);
                                setSuccessText('Preset loaded. Click save to apply changes.');
                              }}
                              className={`w-7 h-7 rounded-full overflow-hidden border transition ${
                                avatarUrl === url 
                                  ? 'border-blue-600 scale-110 ring-2 ring-blue-500/20' 
                                  : 'border-slate-200 dark:border-slate-800 hover:scale-105 hover:border-slate-400'
                              }`}
                            >
                              <img src={url} alt={`Preset ${i+1}`} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex justify-between">
                      <span>Profile Image URL</span>
                      <span className="text-[10px] text-slate-400">Optional</span>
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400 pointer-events-none">
                        <ImageIcon className="w-3.5 h-3.5" />
                      </div>
                      <input 
                        type="text" 
                        value={avatarUrl}
                        onChange={(e) => setAvatarUrl(e.target.value)}
                        className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-205 dark:border-slate-805 bg-slate-50 dark:bg-[#0D1221] text-xs font-mono truncate"
                        placeholder="https://images.unsplash.com/photo-..."
                      />
                    </div>
                  </div>
                </div>

                <div className="flex justify-end pt-3">
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-5 py-2 select-none font-semibold rounded-lg text-white bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-750 transition disabled:opacity-50 text-xs shadow-xs"
                  >
                    {isSubmitting ? 'Saving modifications...' : 'Apply Information Saved'}
                  </button>
                </div>

              </form>
            )}

            {/* TAB 2: SECURITY PASSWORD ALTER */}
            {activeTab === 'security' && (
              <form onSubmit={handleChangePasswordSubmit} className="space-y-4 text-xs font-sans">
                
                <div className="p-3 bg-slate-50 dark:bg-[#0C1221] border border-slate-250 dark:border-slate-850 rounded-xl text-slate-500 dark:text-slate-405 leading-relaxed text-[11px]">
                  Change your active control credentials. Your master passcode must strictly exceed 6 characters and never utilize simple identifiers.
                </div>

                <div className="space-y-3.5 pt-1">
                  
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Current Security Passcode</label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400 pointer-events-none">
                        <Lock className="w-3.5 h-3.5" />
                      </div>
                      <input 
                        type="password" 
                        value={oldPassword}
                        onChange={(e) => setOldPassword(e.target.value)}
                        className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-205 dark:border-slate-855 bg-slate-50 dark:bg-[#0D1221] font-mono text-xs"
                        placeholder="••••••••••••"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">New Password Configuration</label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400 pointer-events-none">
                        <Lock className="w-3.5 h-3.5" />
                      </div>
                      <input 
                        type="password" 
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-205 dark:border-slate-855 bg-slate-50 dark:bg-[#0D1221] font-mono text-xs"
                        placeholder="••••••••••••"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Confirm Target Password</label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400 pointer-events-none">
                        <Lock className="w-3.5 h-3.5" />
                      </div>
                      <input 
                        type="password" 
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-205 dark:border-slate-855 bg-slate-50 dark:bg-[#0D1221] font-mono text-xs"
                        placeholder="••••••••••••"
                      />
                    </div>
                  </div>

                </div>

                <div className="flex justify-end pt-3">
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-5 py-2 font-semibold rounded-lg text-white bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-750 transition disabled:opacity-50 text-xs shadow-xs"
                  >
                    {isSubmitting ? 'Updating credentials...' : 'Authenticate & Reset Passcode'}
                  </button>
                </div>

              </form>
            )}

          </div>

          {/* Footer of modal */}
          <div className="px-6 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D1221] text-[10px] text-slate-450 dark:text-slate-505 flex justify-between items-center shrink-0">
            <span>Last Login Session: {currentUser.lastLogin ? new Date(currentUser.lastLogin).toLocaleString() : 'First time login'}</span>
            <span>ID: {currentUser.id}</span>
          </div>

        </div>

      </motion.div>
    </div>
  );
}
