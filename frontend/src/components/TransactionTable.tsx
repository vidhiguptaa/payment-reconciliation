import React from 'react';
import { FileImage, Inbox, ArrowUpDown, Filter } from 'lucide-react';

export interface Transaction {
  id: string;
  screenshot: string;
  amount: number | null;
  date: string | null;
  beneficiary: string | null;
  referenceNumber: string | null;
  confidence: number;
  status: 'Matched' | 'Possible Match' | 'Needs Review' | 'Unmatched';
}

interface TransactionTableProps {
  transactions?: Transaction[];
}

export const TransactionTable: React.FC<TransactionTableProps> = ({ transactions = [] }) => {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
      {/* Table Bar */}
      <div className="px-6 py-4 border-b border-slate-800 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-white flex items-center gap-2">
            <span>Reconciliation Transactions</span>
            <span className="text-xs font-normal text-slate-400 bg-slate-800 px-2 py-0.5 rounded-full border border-slate-700">
              {transactions.length} items
            </span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Extracted screenshot details reconciled against account statement records
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button className="flex items-center gap-1.5 text-xs text-slate-300 bg-slate-800 hover:bg-slate-700 border border-slate-700 px-3 py-1.5 rounded-lg transition-colors">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <span>Filter</span>
          </button>
          <button className="flex items-center gap-1.5 text-xs text-slate-300 bg-slate-800 hover:bg-slate-700 border border-slate-700 px-3 py-1.5 rounded-lg transition-colors">
            <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
            <span>Sort</span>
          </button>
        </div>
      </div>

      {/* Table Content */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs text-slate-300">
          <thead className="bg-slate-800/50 uppercase text-[11px] text-slate-400 font-semibold tracking-wider border-b border-slate-800">
            <tr>
              <th scope="col" className="px-6 py-3.5">Screenshot</th>
              <th scope="col" className="px-6 py-3.5">Amount</th>
              <th scope="col" className="px-6 py-3.5">Date</th>
              <th scope="col" className="px-6 py-3.5">Beneficiary</th>
              <th scope="col" className="px-6 py-3.5">Reference Number</th>
              <th scope="col" className="px-6 py-3.5">Confidence</th>
              <th scope="col" className="px-6 py-3.5">Status</th>
              <th scope="col" className="px-6 py-3.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {transactions.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-6 py-16 text-center">
                  <div className="max-w-md mx-auto flex flex-col items-center">
                    <div className="p-4 bg-slate-800/80 rounded-full border border-slate-700 mb-4 shadow-inner">
                      <Inbox className="w-8 h-8 text-sky-400" />
                    </div>
                    <h3 className="text-sm font-semibold text-slate-200">No Transactions Parsed Yet</h3>
                    <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                      Save WhatsApp payment screenshots into <code className="bg-slate-800 border border-slate-700 text-sky-300 px-1.5 py-0.5 rounded font-mono text-[11px]">/data/payment-screenshots</code> and bank statements into <code className="bg-slate-800 border border-slate-700 text-sky-300 px-1.5 py-0.5 rounded font-mono text-[11px]">/data/account-statements</code>.
                    </p>
                  </div>
                </td>
              </tr>
            ) : (
              transactions.map((tx) => (
                <tr key={tx.id} className="hover:bg-slate-800/40 transition-colors">
                  <td className="px-6 py-4 flex items-center gap-2">
                    <FileImage className="w-4 h-4 text-sky-400" />
                    <span className="font-mono text-slate-200">{tx.screenshot}</span>
                  </td>
                  <td className="px-6 py-4 font-semibold text-white">
                    {tx.amount ? `₹${tx.amount.toLocaleString('en-IN')}` : '-'}
                  </td>
                  <td className="px-6 py-4 text-slate-400">{tx.date || '-'}</td>
                  <td className="px-6 py-4 text-slate-200">{tx.beneficiary || '-'}</td>
                  <td className="px-6 py-4 font-mono text-slate-400">{tx.referenceNumber || '-'}</td>
                  <td className="px-6 py-4">{tx.confidence}%</td>
                  <td className="px-6 py-4">{tx.status}</td>
                  <td className="px-6 py-4 text-right">
                    <button className="text-sky-400 hover:text-sky-300 font-medium">View</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
