
import React, { useState, useEffect, useRef } from 'react';
import { 
  LayoutDashboard, 
  Calendar as CalendarIcon, 
  Briefcase, 
  Receipt, 
  BarChart3, 
  Settings, 
  Wallet,
  ShieldCheck,
  ShieldAlert,
  CalendarDays,
  Menu, 
  X,
  StickyNote
} from 'lucide-react';
import { AppData } from './types';
import { VaultService } from './services/vaultService';
import TradingView from './views/TradingView';
import CalendarView from './views/CalendarView';
import HoldingsView from './views/HoldingsView';
import SalaryView from './views/SalaryView';
import TaxView from './views/TaxView';
import StatisticsView from './views/StatisticsView';
import SystemView from './views/SystemView';
import NotesView from './views/NotesView';

const INITIAL_DATA: AppData = {
  trades: {},
  salary: {},
  tax: {
    personal: { name: '', address: '', zip: '', city: '', id: '' },
    expenses: [],
    balances: {}
  },
  portfolios: {
    'portfolio_1': { name: 'Hauptportfolio', years: {} }
  },
  currentPortfolioId: 'portfolio_1',
  notes: {},
  categoryRules: {}
};

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState('trading');
  const [data, setData] = useState<AppData>(INITIAL_DATA);
  const [vaultStatus, setVaultStatus] = useState<'none' | 'connected' | 'locked'>('none');
  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false); // Mobile State
  
  // Global Year State for specific tabs
  const [globalYear, setGlobalYear] = useState(new Date().getFullYear().toString());

  // Debounce ref for auto-save
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Load local data safely
    const saved = localStorage.getItem('tatdma_data');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setData(prev => ({
          ...prev,
          ...parsed,
          trades: parsed.trades || prev.trades,
          salary: parsed.salary || prev.salary,
          tax: { ...prev.tax, ...(parsed.tax || {}) },
          portfolios: parsed.portfolios || prev.portfolios,
          notes: parsed.notes || prev.notes,
          categoryRules: parsed.categoryRules || prev.categoryRules
        }));
      } catch (e) {
        console.error("Data corruption detected", e);
      }
    }

    // Init Vault
    VaultService.init().then(connected => {
      if (connected) setVaultStatus('connected');
      else VaultService.isConnected() ? setVaultStatus('locked') : setVaultStatus('none');
    });
  }, []);

  // Central Save Logic + Auto-Backup to Vault
  const saveToLocalStorage = (newData: AppData) => {
    setData(newData);
    localStorage.setItem('tatdma_data', JSON.stringify(newData));
    
    // Trigger Auto-Save to Vault if connected
    if (vaultStatus === 'connected') {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      setAutoSaveStatus('saving');
      
      saveTimeoutRef.current = setTimeout(async () => {
        try {
          const jsonBlob = new Blob([JSON.stringify(newData, null, 2)], { type: 'application/json' });
          await VaultService.writeFile('tatdma_autosave.json', jsonBlob);
          setAutoSaveStatus('saved');
          setTimeout(() => setAutoSaveStatus('idle'), 2000);
        } catch (e) {
          console.error("Auto-Backup failed", e);
          setAutoSaveStatus('idle'); // Fail silently in UI to not annoy user, but log it
        }
      }, 2000); // 2 seconds debounce
    }
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'trading': return <TradingView data={data} onUpdate={saveToLocalStorage} />;
      case 'calendar': return <CalendarView data={data} onUpdate={saveToLocalStorage} />;
      case 'holdings': return <HoldingsView data={data} onUpdate={saveToLocalStorage} globalYear={globalYear} />;
      case 'salary': return <SalaryView data={data} onUpdate={saveToLocalStorage} globalYear={globalYear} />;
      case 'tax': return <TaxView data={data} onUpdate={saveToLocalStorage} globalYear={globalYear} />;
      case 'notes': return <NotesView data={data} onUpdate={saveToLocalStorage} />;
      case 'stats': return <StatisticsView data={data} />;
      case 'system': return <SystemView data={data} onUpdate={saveToLocalStorage} />;
      default: return <TradingView data={data} onUpdate={saveToLocalStorage} />;
    }
  };

  const navItems = [
    { id: 'trading', label: 'Trading', icon: LayoutDashboard },
    { id: 'calendar', label: 'Kalender', icon: CalendarIcon },
    { id: 'holdings', label: 'Wertpapiere', icon: Wallet },
    { id: 'salary', label: 'Lohn/Gehalt', icon: Briefcase },
    { id: 'tax', label: 'Steuern', icon: Receipt },
    { id: 'notes', label: 'Notes & Docs', icon: StickyNote },
    { id: 'stats', label: 'Statistik', icon: BarChart3 },
    { id: 'system', label: 'System', icon: Settings },
  ];

  // Generate years list dynamically
  const currentYearNum = new Date().getFullYear();
  const availableYears = Array.from({ length: Math.max(2026 - 2023 + 1, currentYearNum - 2023 + 2) }, (_, i) => (2023 + i).toString());
  const showGlobalYearSelector = ['holdings', 'salary', 'tax'].includes(activeTab);

  const handleTabChange = (id: string) => {
    setActiveTab(id);
    setMobileMenuOpen(false);
  };

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50 text-gray-900 font-sans relative">
      
      {/* Mobile Menu Overlay */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-40 bg-gray-900/50 backdrop-blur-sm lg:hidden" onClick={() => setMobileMenuOpen(false)} />
      )}

      {/* Sidebar - Responsive: Fixed on Desktop, Slide-over on Mobile */}
      <aside className={`
        fixed lg:static inset-y-0 left-0 z-50 w-64 bg-[#16325c] flex-shrink-0 flex flex-col transition-transform duration-300 ease-in-out shadow-2xl lg:shadow-none
        ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        {/* Adjusted padding for Safe Area Top (Notch) */}
        <div className="p-6 pt-[calc(1.5rem+env(safe-area-inset-top))] flex items-center justify-between">
          <div>
            <h1 className="text-white text-xl font-bold flex items-center gap-2">
              TaTDMA <span className="text-[10px] bg-blue-500 px-1.5 py-0.5 rounded uppercase font-medium">v4</span>
            </h1>
            <p className="text-blue-200 text-xs mt-1 opacity-70">Trade, Tax & Docs</p>
          </div>
          <button onClick={() => setMobileMenuOpen(false)} className="lg:hidden text-white/70 hover:text-white">
            <X size={24} />
          </button>
        </div>

        <nav className="flex-1 mt-4 px-3 space-y-1 overflow-y-auto custom-scrollbar">
          {navItems.map(item => (
            <button
              key={item.id}
              onClick={() => handleTabChange(item.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                activeTab === item.id 
                ? 'bg-white/10 text-white font-semibold' 
                : 'text-blue-100 hover:bg-white/5 opacity-80 hover:opacity-100'
              }`}
            >
              <item.icon size={20} />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        {/* Vault Status Footer - Added padding bottom for Home Indicator on iOS */}
        <div className="p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] border-t border-white/10 space-y-2">
          {/* Auto Save Indicator */}
          {vaultStatus === 'connected' && (
             <div className="flex items-center justify-between text-[10px] text-blue-200 px-1">
                <span>Auto-Backup (JSON):</span>
                <span className={`flex items-center gap-1 font-bold ${
                   autoSaveStatus === 'saving' ? 'text-yellow-300' : 
                   autoSaveStatus === 'saved' ? 'text-green-400' : 'text-gray-400'
                }`}>
                   {autoSaveStatus === 'saving' ? '...' : autoSaveStatus === 'saved' ? 'OK' : 'Bereit'}
                </span>
             </div>
          )}

          <button 
            onClick={async () => {
              if (vaultStatus === 'locked') {
                const ok = await VaultService.requestPermission();
                if (ok) setVaultStatus('connected');
              } else if (vaultStatus === 'none') {
                const ok = await VaultService.connect();
                if (ok) setVaultStatus('connected');
              }
            }}
            className={`w-full flex items-center justify-between p-3 rounded-lg text-xs font-medium transition-all ${
              vaultStatus === 'connected' ? 'bg-green-500/20 text-green-400' :
              vaultStatus === 'locked' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-white/5 text-gray-400'
            }`}
          >
            <div className="flex items-center gap-2">
              {vaultStatus === 'connected' ? <ShieldCheck size={16} /> : <ShieldAlert size={16} />}
              <span>{vaultStatus === 'connected' ? 'Vault Aktiv' : vaultStatus === 'locked' ? 'Freigeben' : 'Kein Vault'}</span>
            </div>
            <div className={`w-2 h-2 rounded-full ${vaultStatus === 'connected' ? 'bg-green-400' : 'bg-red-400'}`} />
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 bg-gray-50 h-full">
        {/* Header with Safe Area Top Padding */}
        <header className="bg-white border-b border-gray-200 flex-shrink-0 z-10 sticky top-0 shadow-sm lg:shadow-none pt-[env(safe-area-inset-top)]">
          <div className="h-16 flex items-center justify-between px-4 lg:px-8">
            <div className="flex items-center gap-3">
               <button onClick={() => setMobileMenuOpen(true)} className="lg:hidden p-2 text-gray-600 hover:bg-gray-100 rounded-lg">
                  <Menu size={24} />
               </button>
               <h2 className="text-lg font-bold text-gray-700 capitalize truncate max-w-[150px] md:max-w-none">
                 {navItems.find(i => i.id === activeTab)?.label}
               </h2>
            </div>
            
            <div className="flex items-center gap-2 md:gap-6">
               {showGlobalYearSelector && (
                 <div className="flex items-center gap-2 bg-blue-50 px-2 py-1 md:px-3 md:py-1.5 rounded-lg border border-blue-100 animate-in fade-in duration-300">
                   <CalendarDays size={16} className="text-blue-500 hidden md:block"/>
                   <span className="text-xs font-bold text-gray-500 uppercase tracking-wide hidden md:block">Jahr:</span>
                   <select 
                     value={globalYear}
                     onChange={(e) => setGlobalYear(e.target.value)}
                     className="bg-transparent font-black text-blue-700 text-sm outline-none cursor-pointer"
                   >
                     {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
                   </select>
                 </div>
               )}
               
               <span className="text-xs text-gray-400 font-mono hidden md:block">
                 {new Date().toLocaleDateString('de-DE', { day: '2-digit', month: 'long', year: 'numeric' })}
               </span>
            </div>
          </div>
        </header>

        <section className="flex-1 overflow-y-auto p-4 md:p-8 overscroll-contain pb-[calc(2rem+env(safe-area-inset-bottom))]">
          {renderContent()}
        </section>
      </main>
    </div>
  );
};

export default App;
