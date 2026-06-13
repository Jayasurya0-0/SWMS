/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { useAppState } from '../contexts/StateContext';
import { Trophy, Award, CheckCircle2, ChevronRight, Sparkles, Star, Target } from 'lucide-react';
import { motion } from 'motion/react';
import { EmployeeAvatar } from './EmployeeAvatar';

export const RewardModule: React.FC = () => {
  const { employees } = useAppState();

  // Sort employees by attendancerate to create Leaderboard array
  const leaderboard = [...employees]
    .sort((a, b) => b.historicalAttendanceRate - a.historicalAttendanceRate)
    .slice(0, 10); // top 10

  // Helper to resolve Badge Award mapping details
  const getBadgeAward = (rate: number) => {
    if (rate >= 98) return { name: 'Platinum Shield', desc: '180 days perfect attend', color: 'text-blue-600 bg-blue-50 border-blue-200 dark:bg-blue-950/20 dark:text-blue-400' };
    if (rate >= 95) return { name: 'Diamond Star', desc: '90 days perfect roster', color: 'text-sky-600 bg-sky-50 border-sky-100 dark:bg-sky-955/20 dark:text-sky-400' };
    if (rate >= 92) return { name: 'Gold Medal', desc: '60 days attendance', color: 'text-amber-500 bg-amber-50 border-amber-100 dark:bg-amber-955/20 dark:text-amber-400' };
    if (rate >= 90) return { name: 'Bronze Token', desc: '30 days attendance', color: 'text-orange-500 bg-orange-50 border-orange-100 dark:bg-orange-955/20 dark:text-orange-300' };
    return null;
  };

  return (
    <div className="space-y-6">

      {/* Header layout */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800 dark:text-neutral-100 font-display">
            Operator Reward & Incentives Board
          </h2>
          <p className="text-xs text-slate-500">Gamification framework rewarding zero-absentees operators with mill recognition medals</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

        {/* Top Performers Leaderboard Table */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm col-span-1 lg:col-span-7 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Trophy className="w-5 h-5 text-amber-500" />
              <h3 className="font-display font-semibold text-slate-850 dark:text-neutral-105 text-sm">
                Top Perfect-Attendance Leaderboard
              </h3>
            </div>
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider font-mono">
              Floor Shift Roster ranking
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="text-[10px] uppercase font-bold text-slate-400 tracking-wider bg-slate-50 dark:bg-slate-950/60 border-b border-slate-200 dark:border-slate-850">
                <tr>
                  <th className="px-4 py-2 text-center">Rank</th>
                  <th className="px-4 py-2">Operator Info</th>
                  <th className="px-4 py-2 text-center">Roster Ratio</th>
                  <th className="px-4 py-2 text-right">Award Tier</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-850">
                {leaderboard.map((emp, idx) => {
                  const badge = getBadgeAward(emp.historicalAttendanceRate);
                  
                  return (
                    <tr key={emp.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/30">
                      <td className="px-4 py-3 text-center font-bold font-mono">
                        {idx === 0 ? '🏆 1' : idx === 1 ? '🥈 2' : idx === 2 ? '🥉 3' : `${idx + 1}`}
                      </td>
                      <td className="px-4 py-3 flex items-center space-x-2">
                        <EmployeeAvatar 
                          photoUrl={emp.photoUrl} 
                          name={emp.name} 
                          className="w-8 h-8 rounded-full" 
                        />
                        <div>
                          <span className="font-bold text-slate-800 dark:text-slate-200 block truncate">{emp.name}</span>
                          <span className="text-[10px] text-slate-400 block font-mono">ID: {emp.id}  Line {emp.lineNumber}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center font-mono font-bold text-emerald-500">
                        {emp.historicalAttendanceRate}%
                      </td>
                      <td className="px-4 py-3 text-right">
                        {badge ? (
                          <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${badge.color}`}>
                            {badge.name}
                          </span>
                        ) : (
                          <span className="text-slate-400 italic">--</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Incentives structure guidelines */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm col-span-1 lg:col-span-5 space-y-4">
          <div>
            <h3 className="font-display font-semibold text-slate-800 dark:text-neutral-100 text-sm">
              Reward Tier Criteria
            </h3>
            <p className="text-xs text-slate-400">Bonus incentives structure calculated dynamically upon monthly HR audits</p>
          </div>

          <div className="space-y-4.5 text-xs font-sans">
            {[
              { title: 'Platinum Level (180 Days Perfect)', desc: 'Provides ₹5,000 cash bonus + Floor Gold Framed Certificate.', icon: Trophy, color: 'text-blue-600 bg-blue-50 dark:bg-blue-950/20' },
              { title: 'Gold Level (90 Days Perfect)', desc: 'Fills ₹2,500 incentive bonus added directly to payout paycheck.', icon: Award, color: 'text-amber-500 bg-amber-50 dark:bg-amber-955/20' },
              { title: 'Silver Level (60 Days Perfect)', desc: 'Fills ₹1,000 incentive bonus + badge display on mill profile card.', icon: Star, color: 'text-blue-500 bg-blue-50 dark:bg-blue-955/20' },
              { title: 'Bronze Level (30 Days Perfect)', desc: 'Fills ₹500 attendance payout bonus.', icon: CheckCircle2, color: 'text-orange-505 bg-orange-50 dark:bg-orange-955/20' }
            ].map(item => (
              <div key={item.title} className="flex items-start space-x-3 p-3 border border-slate-102 dark:border-slate-800 rounded-xl">
                <div className={`p-2 rounded-lg ${item.color} flex-shrink-0`}>
                  <item.icon className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-bold text-slate-750 dark:text-slate-205">{item.title}</h4>
                  <p className="text-slate-405 leading-relaxed text-[11px] mt-0.5">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
