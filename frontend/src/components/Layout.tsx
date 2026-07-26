import React from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { LogOut, Layers, User } from 'lucide-react';
import { api } from '../services/api';

export const Layout: React.FC = () => {
  const navigate = useNavigate();
  const currentUser = api.auth.getCurrentUser();

  const handleLogout = () => {
    api.auth.logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col font-sans">
      {/* Navigation Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            {/* Logo */}
            <div className="flex items-center gap-2 cursor-pointer" onClick={() => navigate('/')}>
              <div className="bg-indigo-600 text-white p-2 rounded-lg flex items-center justify-center">
                <Layers className="h-5 w-5" />
              </div>
              <span className="font-semibold text-lg text-slate-900 tracking-tight">ReconFlow</span>
              <span className="bg-slate-100 text-slate-600 text-xs px-2 py-0.5 rounded-full border border-slate-200">Web</span>
            </div>

            {/* Session Info / Actions */}
            <div className="flex items-center gap-6">
              {currentUser && (
                <div className="hidden md:flex items-center gap-2 text-slate-600 text-sm">
                  <div className="bg-slate-100 p-1.5 rounded-full flex items-center justify-center text-slate-600 border border-slate-200">
                    <User className="h-4 w-4" />
                  </div>
                  <span className="font-medium text-slate-700">{currentUser.email}</span>
                </div>
              )}

              <button
                onClick={handleLogout}
                className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 transition-colors py-1.5 px-3 rounded-md hover:bg-slate-50 border border-transparent hover:border-slate-200"
              >
                <LogOut className="h-4 w-4" />
                <span>Sign Out</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-grow max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Outlet />
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-xs text-slate-400">
          ReconFlow Payment Reconciliation Engine. Built for speed and accuracy.
        </div>
      </footer>
    </div>
  );
};
export default Layout;
