import React from 'react';
import { Image, CheckCircle2, HelpCircle, AlertTriangle, XCircle } from 'lucide-react';

interface StatsProps {
  totalScreenshots?: number;
  matched?: number;
  possibleMatches?: number;
  needsReview?: number;
  unmatched?: number;
}

export const StatsOverview: React.FC<StatsProps> = ({
  totalScreenshots = 0,
  matched = 0,
  possibleMatches = 0,
  needsReview = 0,
  unmatched = 0,
}) => {
  const stats = [
    {
      title: 'Total Screenshots',
      value: totalScreenshots,
      icon: Image,
      color: 'text-slate-200',
      bgColor: 'bg-slate-800/60 border-slate-700/60',
      iconColor: 'text-slate-400',
    },
    {
      title: 'Matched',
      value: matched,
      icon: CheckCircle2,
      color: 'text-emerald-400',
      bgColor: 'bg-emerald-950/30 border-emerald-800/40',
      iconColor: 'text-emerald-400',
    },
    {
      title: 'Possible Matches',
      value: possibleMatches,
      icon: HelpCircle,
      color: 'text-amber-400',
      bgColor: 'bg-amber-950/30 border-amber-800/40',
      iconColor: 'text-amber-400',
    },
    {
      title: 'Needs Review',
      value: needsReview,
      icon: AlertTriangle,
      color: 'text-orange-400',
      bgColor: 'bg-orange-950/30 border-orange-800/40',
      iconColor: 'text-orange-400',
    },
    {
      title: 'Unmatched',
      value: unmatched,
      icon: XCircle,
      color: 'text-rose-400',
      bgColor: 'bg-rose-950/30 border-rose-800/40',
      iconColor: 'text-rose-400',
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
      {stats.map((stat, idx) => {
        const Icon = stat.icon;
        return (
          <div
            key={idx}
            className={`p-4 rounded-xl border ${stat.bgColor} shadow-sm backdrop-blur-sm transition-all duration-200 hover:scale-[1.02]`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-400">{stat.title}</span>
              <Icon className={`w-4 h-4 ${stat.iconColor}`} />
            </div>
            <div className="mt-3 flex items-baseline justify-between">
              <span className={`text-2xl font-bold tracking-tight ${stat.color}`}>
                {stat.value}
              </span>
              <span className="text-[10px] text-slate-500 font-mono">LIVE</span>
            </div>
          </div>
        );
      })}
    </div>
  );
};
