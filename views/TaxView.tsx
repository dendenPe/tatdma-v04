
import React, { useState, useRef, useEffect } from 'react';
import { 
  FileDown, 
  User, 
  Receipt, 
  Landmark, 
  Plus, 
  Trash2, 
  CreditCard, 
  Calculator,
  Briefcase,
  Wallet,
  Info,
  CheckCircle2,
  FileText,
  X,
  Save,
  FileUp,
  ShieldCheck,
  Baby,
  Heart,
  MapPin,
  ClipboardList,
  CalendarCheck,
  CalendarDays,
  Paperclip,
  TrendingUp,
  ArrowRight,
  Settings,
  ChevronRight,
  MessageSquare,
  Euro,
  Database
} from 'lucide-react';
import { AppData, TaxExpense, BankBalance, SalaryEntry, ChildDetails, AlimonyDetails } from '../types';
import { DBService } from '../services/dbService';
import { PdfGenService, PdfExportOptions } from '../services/pdfGenService';

interface Props {
  data: AppData;
  onUpdate: (data: AppData) => void;
  globalYear: string;
}

const TaxView: React.FC<Props> = ({ data, onUpdate, globalYear }) => {
  const [activeSubTab, setActiveSubTab] = useState<'personal' | 'expenses' | 'balances' | 'summary' | 'message'>('personal');
  const [selectedYear, setSelectedYear] = useState(globalYear);
  const [specialExpenseModalIdx, setSpecialExpenseModalIdx] = useState<number | null>(null);
  
  // Sync with global year
  useEffect(() => {
    setSelectedYear(globalYear);
  }, [globalYear]);

  // PDF Export Modal State
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportOpts, setExportOpts] = useState<PdfExportOptions>({
    includePersonal: true,
    includeMessage: true,
    includeSalary: true,
    includeAssets: true,
    includeExpenses: true,
    includeTradingProof: false,
    includeReceipts: true
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const legacyImportRef = useRef<HTMLInputElement>(null); // Ref für Legacy Import

  const updatePersonal = (field: string, value: string) => {
    onUpdate({
      ...data,
      tax: { ...data.tax, personal: { ...data.tax.personal, [field]: value } }
    });
  };

  const updateMessage = (msg: string) => {
    onUpdate({
      ...data,
      tax: { 
        ...data.tax, 
        messageToAuthorities: { ...(data.tax.messageToAuthorities || {}), [selectedYear]: msg } 
      }
    });
  };

  const handleGeneratePdf = async () => {
    setShowExportModal(false);
    await PdfGenService.generateTaxPDF(data, selectedYear, exportOpts);
  };

  // --- LEGACY IMPORT LOGIC ---
  const handleLegacyJsonImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const oldData = JSON.parse(text);

        // Validierung: Einfache Prüfung ob es wie die alte Struktur aussieht
        if (!oldData.expenses && !oldData.personal) {
          alert("Das scheint keine gültige Steuer-Datei zu sein (Format nicht erkannt).");
          return;
        }

        const newData = { ...data };
        let importCount = 0;
        
        // 1. Personalien übernehmen
        if (oldData.personal) {
            newData.tax.personal = { ...newData.tax.personal, ...oldData.personal };
        }

        // 2. Balances übernehmen (Merging)
        if (oldData.balances) {
            Object.keys(oldData.balances).forEach(y => {
                if (!newData.tax.balances[y]) newData.tax.balances[y] = { ubs: 0, comdirect: 0, ibkr: 0 };
                // Map old fields to new
                const oldBal = oldData.balances[y];
                newData.tax.balances[y] = {
                    ...newData.tax.balances[y],
                    ubs: oldBal.ubs || 0,
                    comdirect: oldBal.comdirect || 0,
                    comdirectEUR: oldBal.comdirectEUR || 0,
                    ibkr: oldBal.ibkr || 0
                };
            });
        }

        // 3. Remarks -> Message
        if (oldData.remarks) {
            if (!newData.tax.messageToAuthorities) newData.tax.messageToAuthorities = {};
            // If explicit year in remarks logic existed, use it, otherwise attach to current selected year or import logic
            // In old JSON 'remarks' was a string at root. Let's add it to the import year.
            newData.tax.messageToAuthorities[selectedYear] = oldData.remarks;
        }

        // 4. Expenses MAPPING (Complex part)
        if (Array.isArray(oldData.expenses)) {
            const newExpenses: TaxExpense[] = [];

            oldData.expenses.forEach((exp: any) => {
                // Determine Category Mapping
                let newCat: any = exp.cat;
                if (exp.cat === 'Unterhalt') newCat = 'Alimente'; // Altes Naming fixen
                if (exp.cat === 'Krankenkasse') newCat = 'Krankenkassenprämien';
                
                // Construct basic object
                const newExp: TaxExpense = {
                    desc: exp.desc || '',
                    amount: parseFloat(exp.amount) || 0,
                    year: exp.year || selectedYear,
                    cat: newCat,
                    currency: exp.currency || 'CHF',
                    rate: exp.rate || 1,
                    taxRelevant: true, // Default to true for imported
                    receipts: [] // Wir können keine Bilder importieren, da diese nicht im JSON sind
                };

                // Map 'details' to 'childDetails' or 'alimonyDetails'
                if (exp.details) {
                    const d = exp.details;
                    
                    // Helper to split name
                    const splitName = (fullName: string) => {
                        const parts = (fullName || '').split(' ');
                        return { 
                            vorname: parts[0] || '', 
                            nachname: parts.slice(1).join(' ') || '' 
                        };
                    };

                    // Case A: Kindesunterhalt (hat childName in details)
                    if (d.childName) {
                        newExp.cat = 'Kindesunterhalt';
                        const childNames = splitName(d.childName);
                        const recNames = splitName(d.recName);
                        
                        // Parse date properly or default
                        const dob = d.childDob ? d.childDob.split('T')[0] : '';

                        newExp.childDetails = {
                            vorname: childNames.vorname,
                            nachname: childNames.nachname,
                            geburtsdatum: dob,
                            schule_ausbildung: '',
                            konfession: 'andere',
                            haushalt: false, // Default assumption if external payment
                            empfaenger_vorname: recNames.vorname,
                            empfaenger_name: recNames.nachname,
                            empfaenger_ort: d.recAddress || '', 
                            paymentFrequency: d.frequency === '12' ? 'fix' : 'individuell',
                            monthlyAmounts: Array.isArray(d.monthlyAmounts) && d.monthlyAmounts.length === 12 
                                ? d.monthlyAmounts 
                                : Array(12).fill(d.baseAmount || 0),
                            currency: exp.currency || 'CHF'
                        };
                    } 
                    // Case B: Alimente/Unterhalt (nur recName, kein childName)
                    else if (d.recName || newCat === 'Alimente' || newCat === 'Unterhalt') {
                         newExp.cat = 'Alimente';
                         const recNames = splitName(d.recName || exp.desc); // Fallback to desc if no recName
                         
                         newExp.alimonyDetails = {
                             empfaenger_vorname: recNames.vorname,
                             empfaenger_name: recNames.nachname,
                             empfaenger_ort: d.recAddress || '',
                             getrennt_seit: '',
                             paymentFrequency: d.frequency === '12' ? 'fix' : 'individuell',
                             monthlyAmounts: Array.isArray(d.monthlyAmounts) && d.monthlyAmounts.length === 12 
                                ? d.monthlyAmounts 
                                : Array(12).fill(d.baseAmount || 0),
                             currency: exp.currency || 'CHF'
                         };
                    }
                }

                newExpenses.push(newExp);
                importCount++;
            });

            // Merge: Append new expenses to existing ones
            // We verify to not duplicate exact same objects if possible, but simplest is append
            newData.tax.expenses = [...newData.tax.expenses, ...newExpenses];
        }

        onUpdate(newData);
        alert(`Import erfolgreich!\n\nPersonalien aktualisiert.\n${importCount} Ausgaben importiert.`);
      } catch (err) {
        console.error(err);
        alert("Fehler beim Lesen der JSON Datei. Ist das Format korrekt?");
      }
      e.target.value = ''; // Reset input
    };
    reader.readAsText(file);
  };

  const addExpense = () => {
    const newExpense: TaxExpense = {
      desc: '',
      amount: 0,
      year: selectedYear,
      cat: 'Berufsauslagen',
      currency: 'CHF',
      rate: 1,
      receipts: [],
      taxRelevant: true
    };
    onUpdate({
      ...data,
      tax: { ...data.tax, expenses: [...data.tax.expenses, newExpense] }
    });
  };

  const updateExpense = (index: number, field: keyof TaxExpense, value: any) => {
    const newExpenses = [...data.tax.expenses];
    
    // Auto-Logic: Alimony & Child Support are always tax relevant
    if (field === 'cat' && (value === 'Alimente' || value === 'Kindesunterhalt')) {
       newExpenses[index] = { ...newExpenses[index], [field]: value, taxRelevant: true };
    } else {
       newExpenses[index] = { ...newExpenses[index], [field]: value };
    }
    
    // Auto-init special details if category changes
    if (field === 'cat' && (value === 'Alimente' || value === 'Kindesunterhalt')) {
      if (value === 'Alimente' && !newExpenses[index].alimonyDetails) {
        newExpenses[index].alimonyDetails = { 
          empfaenger_name: '', empfaenger_vorname: '', empfaenger_ort: '', getrennt_seit: '', 
          paymentFrequency: 'fix', monthlyAmounts: Array(12).fill(0), currency: 'CHF' 
        };
      } else if (value === 'Kindesunterhalt' && !newExpenses[index].childDetails) {
        newExpenses[index].childDetails = { 
          vorname: '', nachname: '', geburtsdatum: '', schule_ausbildung: '', konfession: 'andere', 
          haushalt: true, paymentFrequency: 'fix', monthlyAmounts: Array(12).fill(0), currency: 'CHF',
          empfaenger_vorname: '', empfaenger_name: '', empfaenger_ort: ''
        };
      }
      setSpecialExpenseModalIdx(index);
    }
    onUpdate({ ...data, tax: { ...data.tax, expenses: newExpenses } });
  };

  // Helper to update multiple fields at once to avoid race conditions and handle auto-description
  const updateSpecialExpenseFull = (idx: number, updates: Partial<TaxExpense>) => {
    const newExpenses = [...data.tax.expenses];
    newExpenses[idx] = { ...newExpenses[idx], ...updates };
    onUpdate({ ...data, tax: { ...data.tax, expenses: newExpenses } });
  };

  const handleDetailChange = (idx: number, type: 'childDetails' | 'alimonyDetails', newDetails: any) => {
      // 1. Generate Description automatically
      let newDesc = data.tax.expenses[idx].desc;
      
      if (type === 'alimonyDetails') {
          const vorname = newDetails.empfaenger_vorname || '';
          const nachname = newDetails.empfaenger_name || '';
          if (vorname || nachname) {
              newDesc = `Alimente an ${vorname} ${nachname}`.trim();
          }
      } else if (type === 'childDetails') {
          const kind = newDetails.vorname || 'Kind';
          const vorname = newDetails.empfaenger_vorname || '';
          const nachname = newDetails.empfaenger_name || '';
          if (vorname || nachname) {
              newDesc = `Unterhalt für ${kind} (an ${vorname} ${nachname})`.trim();
          }
      }

      // 2. Update Everything
      updateSpecialExpenseFull(idx, {
          [type]: newDetails,
          desc: newDesc
      });
  };

  const handleAmountChange = (idx: number, type: 'childDetails' | 'alimonyDetails', monthlyAmounts: number[]) => {
      // Calculate Total
      const totalAmount = monthlyAmounts.reduce((a, b) => a + b, 0);
      
      const currentDetails = data.tax.expenses[idx][type];
      
      updateSpecialExpenseFull(idx, {
          amount: totalAmount,
          [type]: { ...currentDetails, monthlyAmounts }
      });
  };

  const removeExpense = (index: number) => {
    if (confirm("Diesen Eintrag wirklich löschen?")) {
        const newExpenses = data.tax.expenses.filter((_, i) => i !== index);
        onUpdate({ ...data, tax: { ...data.tax, expenses: newExpenses } });
    }
  };

  const handleReceiptUpload = async (index: number, files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    const id = `receipt_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    await DBService.saveFile(id, file);
    
    const newExpenses = [...data.tax.expenses];
    // Safety check: ensure receipts array exists
    newExpenses[index].receipts = [...(newExpenses[index].receipts || []), id];
    onUpdate({ ...data, tax: { ...data.tax, expenses: newExpenses } });
  };

  const getConvertedCHF = (exp: TaxExpense) => {
    const rate = exp.currency === 'USD' ? (data.tax.rateUSD || 0.85) : 
                 exp.currency === 'EUR' ? (data.tax.rateEUR || 0.94) : 1;
    return exp.amount * rate;
  };

  const getIBKRCashCHF = () => {
    const portfolio = data.portfolios[data.currentPortfolioId];
    if (!portfolio || !portfolio.years[selectedYear]) return 0;
    const yearData = portfolio.years[selectedYear];
    const usdToChf = yearData.exchangeRates['USD_CHF'] || 0.88;
    const eurToUsd = yearData.exchangeRates['EUR_USD'] || 1.07;
    const cashList = Object.entries(yearData.cash || {});
    const totalUSD = cashList.reduce((sum, [curr, amt]) => {
      let valUSD = 0;
      if (curr === 'USD') valUSD = amt;
      else if (curr === 'CHF') valUSD = amt / usdToChf;
      else if (curr === 'EUR') valUSD = amt * eurToUsd;
      else {
        const dynamicRate = yearData.exchangeRates[`${curr}_USD`];
        valUSD = dynamicRate ? amt * dynamicRate : amt;
      }
      return sum + valUSD;
    }, 0);
    return totalUSD * usdToChf;
  };

  const ibkrCashCHF = getIBKRCashCHF();
  const currentYearBalance = data.tax.balances[selectedYear] || { ubs: 0, comdirect: 0, comdirectEUR: 0, ibkr: 0 };
  
  const getSalarySummary = () => {
    const yearSalary = Object.values(data.salary[selectedYear] || {}) as SalaryEntry[];
    return {
      brutto: yearSalary.reduce((s, e) => s + (Number(e.brutto) || 0), 0),
      qst: yearSalary.reduce((s, e) => s + (Number(e.quellensteuer) || 0), 0),
      netto: yearSalary.reduce((s, e) => s + (Number(e.netto) || 0), 0),
    };
  };

  const salSum = getSalarySummary();
  const yearExpenses = data.tax.expenses.filter(e => e.year === selectedYear);
  const totalRelevantExpenses = yearExpenses
    .filter(e => e.taxRelevant)
    .reduce((s, e) => s + getConvertedCHF(e), 0);

  const months = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
  
  // Generate years list dynamically (2023 up to current year + 1)
  const currentYearNum = new Date().getFullYear();
  const availableYears = Array.from({ length: Math.max(2026 - 2023 + 1, currentYearNum - 2023 + 2) }, (_, i) => (2023 + i).toString());

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-24">
      {/* Sub Navigation */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-2 rounded-2xl border border-gray-100 shadow-sm">
        <div className="flex p-1 gap-1 flex-wrap">
          {[
            { id: 'personal', label: 'Persönlich', icon: User },
            { id: 'expenses', label: 'Abzüge & Alimente', icon: Receipt },
            { id: 'balances', label: 'Vermögen', icon: Landmark },
            { id: 'message', label: 'Nachricht Steueramt', icon: MessageSquare },
            { id: 'summary', label: 'Abschluss', icon: Calculator },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveSubTab(tab.id as any)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black transition-all ${
                activeSubTab === tab.id 
                ? 'bg-[#16325c] text-white shadow-lg' 
                : 'text-gray-400 hover:bg-gray-50'
              }`}
            >
              <tab.icon size={14} />
              {tab.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-4 px-4">
          
          {/* LEGACY IMPORT BUTTON */}
          <label className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg cursor-pointer transition-colors" title="Importiere alte JSON mit Ausgaben">
            <Database size={14} />
            <span className="text-[10px] font-black uppercase tracking-wide">Legacy JSON</span>
            <input type="file" ref={legacyImportRef} className="hidden" accept=".json" onChange={handleLegacyJsonImport} />
          </label>

          <div className="flex items-center gap-2 border-l border-gray-200 pl-4">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Steuerjahr:</label>
            <select 
              value={selectedYear} 
              onChange={(e) => setSelectedYear(e.target.value)}
              className="text-xs font-black text-blue-600 outline-none bg-transparent cursor-pointer"
            >
              {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </div>
      </div>

      {activeSubTab === 'message' && (
        <div className="animate-in fade-in duration-300">
           <div className="bg-white p-8 rounded-2xl border border-gray-100 shadow-sm space-y-4">
              <div className="flex items-center gap-3 mb-2">
                 <div className="p-3 bg-amber-50 text-amber-600 rounded-xl"><MessageSquare size={20}/></div>
                 <div>
                    <h3 className="font-black text-gray-800 tracking-tight">Nachricht an das Steueramt</h3>
                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Wird auf eine separate Seite im PDF gedruckt</p>
                 </div>
              </div>
              <textarea 
                value={data.tax.messageToAuthorities?.[selectedYear] || ''}
                onChange={(e) => updateMessage(e.target.value)}
                placeholder="Sehr geehrte Damen und Herren, anbei finden Sie meine Steuerunterlagen für das Jahr..."
                className="w-full h-96 p-6 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-4 focus:ring-amber-50 text-sm leading-relaxed text-gray-700 resize-none font-medium"
              />
           </div>
        </div>
      )}

      {/* Expenses Tab */}
      {activeSubTab === 'expenses' && (
        <div className="space-y-6 animate-in fade-in duration-300">
          <div className="flex items-center justify-between bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
            <div className="flex items-center gap-3">
               <div className="p-3 bg-blue-50 text-blue-600 rounded-xl"><Receipt size={20}/></div>
               <div>
                  <h3 className="font-black text-gray-800 tracking-tight">Abzüge {selectedYear}</h3>
                  <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Berufsauslagen, Versicherungen & Alimente</p>
               </div>
            </div>
            <button onClick={addExpense} className="px-6 py-3 bg-[#16325c] text-white rounded-xl text-xs font-black uppercase tracking-widest flex items-center gap-2 hover:bg-blue-800 transition-all shadow-xl shadow-blue-900/10">
               <Plus size={16} /> Beleg hinzufügen
            </button>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
             <div className="overflow-x-auto">
                <table className="w-full text-left min-w-[1000px]">
                    <thead className="bg-gray-50 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] border-b border-gray-100">
                    <tr>
                        <th className="px-6 py-4">Beschreibung</th>
                        <th className="px-6 py-4">Kategorie</th>
                        <th className="px-6 py-4 text-center">Relevant?</th>
                        <th className="px-6 py-4 text-right">Betrag</th>
                        <th className="px-6 py-4 text-center">Währ.</th>
                        <th className="px-6 py-4 text-right text-blue-600">Wert (CHF)</th>
                        <th className="px-6 py-4 text-center">Beleg</th>
                        <th className="px-6 py-4 text-right">Löschen</th>
                    </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                    {yearExpenses.map((exp, idx) => {
                        const realIdx = data.tax.expenses.indexOf(exp);
                        const isSpecial = exp.cat === 'Alimente' || exp.cat === 'Kindesunterhalt';
                        const isLockedRelevant = isSpecial; // Alimony is always relevant
                        // Safely access receipts with fallback
                        const hasReceipts = (exp.receipts || []).length > 0;

                        return (
                            <tr key={realIdx} className={`hover:bg-gray-50/50 transition-colors ${!exp.taxRelevant ? 'opacity-50' : ''}`}>
                            <td className="px-6 py-4 flex items-center gap-2">
                                <input 
                                    type="text" 
                                    value={exp.desc} 
                                    onChange={(e) => updateExpense(realIdx, 'desc', e.target.value)} 
                                    className="w-full bg-transparent font-bold text-gray-800 outline-none text-sm placeholder-gray-300" 
                                    placeholder="Belegname..."
                                    style={{ colorScheme: 'light' }}
                                />
                                {isSpecial && (
                                    <button onClick={() => setSpecialExpenseModalIdx(realIdx)} className="p-1.5 text-blue-500 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors">
                                    <Settings size={14} />
                                    </button>
                                )}
                            </td>
                            <td className="px-6 py-4">
                                <select 
                                    value={exp.cat} 
                                    onChange={(e) => updateExpense(realIdx, 'cat', e.target.value)} 
                                    className="bg-transparent text-[10px] font-black uppercase text-blue-600 outline-none cursor-pointer max-w-[150px]"
                                >
                                    <option value="Berufsauslagen">Berufsauslagen (SH 15.1)</option>
                                    <option value="Weiterbildung">Weiterbildung (SH 16.1)</option>
                                    <option value="Krankenkassenprämien">Krankenkassenprämien</option>
                                    <option value="Versicherung">Versicherung</option>
                                    <option value="Alimente">Alimente (Ziff. 33.1)</option>
                                    <option value="Kindesunterhalt">Kindesunterhalt (Ziff. 33.2)</option>
                                    <option value="Hardware/Büro">Hardware / Büro</option>
                                    <option value="Sonstiges">Sonstiges</option>
                                </select>
                            </td>
                            <td className="px-6 py-4 text-center">
                                <input 
                                    type="checkbox" 
                                    checked={exp.taxRelevant} 
                                    disabled={isLockedRelevant}
                                    onChange={(e) => updateExpense(realIdx, 'taxRelevant', e.target.checked)}
                                    className={`w-4 h-4 rounded text-blue-600 focus:ring-blue-500 ${isLockedRelevant ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
                                />
                            </td>
                            <td className="px-6 py-4 text-right">
                                <input 
                                    type="number" 
                                    value={exp.amount} 
                                    onChange={(e) => updateExpense(realIdx, 'amount', parseFloat(e.target.value) || 0)} 
                                    className="w-24 text-right bg-transparent font-black text-gray-800 outline-none"
                                    style={{ colorScheme: 'light' }}
                                />
                            </td>
                            <td className="px-6 py-4 text-center text-xs font-bold text-gray-400">{exp.currency}</td>
                            <td className="px-6 py-4 text-right font-black text-blue-600">
                                {getConvertedCHF(exp).toLocaleString('de-CH', { minimumFractionDigits: 2 })}
                            </td>
                            <td className="px-6 py-4 text-center">
                                <label className={`cursor-pointer transition-all ${hasReceipts ? 'text-green-500' : 'text-gray-400 hover:text-blue-500'}`}>
                                    <Paperclip size={18} />
                                    <input type="file" className="hidden" onChange={(e) => handleReceiptUpload(realIdx, e.target.files)} />
                                </label>
                            </td>
                            <td className="px-6 py-4 text-right">
                                <button onClick={() => removeExpense(realIdx)} className="text-gray-400 hover:text-red-500 transition-colors" title="Eintrag löschen">
                                    <Trash2 size={16} />
                                </button>
                            </td>
                            </tr>
                        );
                    })}
                    {yearExpenses.length === 0 && (
                        <tr><td colSpan={8} className="px-6 py-12 text-center text-gray-300 font-bold italic text-xs uppercase">Keine Abzüge für {selectedYear} erfasst</td></tr>
                    )}
                    </tbody>
                </table>
             </div>
          </div>
        </div>
      )}

      {/* Special Expense Modal Code */}
      {specialExpenseModalIdx !== null && (
           <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm animate-in fade-in duration-200">
           <div className="bg-white w-full max-w-4xl rounded-[32px] shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-300">
              <div className="p-8 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
                <div className="flex items-center gap-5">
                   <div className="w-14 h-14 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-lg">
                      {data.tax.expenses[specialExpenseModalIdx].cat === 'Kindesunterhalt' ? <Baby size={30} /> : <Heart size={30} />}
                   </div>
                   <div>
                      <h3 className="text-xl font-black text-gray-800 tracking-tight">Details: {data.tax.expenses[specialExpenseModalIdx].cat}</h3>
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.15em] mt-0.5 italic">Steuerjahr {selectedYear} • Kanton Schaffhausen</p>
                   </div>
                </div>
                <button onClick={() => setSpecialExpenseModalIdx(null)} className="p-3 hover:bg-gray-200 rounded-2xl transition-all text-gray-400"><X size={24} /></button>
              </div>

              <div className="flex-1 overflow-y-auto p-10 space-y-10">
                 {/* ... (Modal content for alimony/child - same as before) ... */}
                 {data.tax.expenses[specialExpenseModalIdx].cat === 'Kindesunterhalt' ? (
                   <div className="space-y-10">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                         <div className="space-y-6">
                            <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2"><User size={14} /> Personalien des Kindes</h4>
                            <div className="grid grid-cols-2 gap-4">
                               <div className="space-y-1">
                                  <label className="text-[10px] font-bold text-gray-400 uppercase">Vorname</label>
                                  <input type="text" value={data.tax.expenses[specialExpenseModalIdx].childDetails?.vorname || ''} onChange={(e) => {
                                    const updated = { ...data.tax.expenses[specialExpenseModalIdx].childDetails!, vorname: e.target.value };
                                    handleDetailChange(specialExpenseModalIdx, 'childDetails', updated);
                                  }} className="w-full px-5 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold outline-none focus:ring-4 focus:ring-blue-100 transition-all"/>
                               </div>
                               <div className="space-y-1">
                                  <label className="text-[10px] font-bold text-gray-400 uppercase">Nachname</label>
                                  <input type="text" value={data.tax.expenses[specialExpenseModalIdx].childDetails?.nachname || ''} onChange={(e) => {
                                    const updated = { ...data.tax.expenses[specialExpenseModalIdx].childDetails!, nachname: e.target.value };
                                    handleDetailChange(specialExpenseModalIdx, 'childDetails', updated);
                                  }} className="w-full px-5 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold outline-none focus:ring-4 focus:ring-blue-100 transition-all"/>
                               </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                               <div className="space-y-1">
                                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Geburtsdatum</label>
                                  <input type="date" value={data.tax.expenses[specialExpenseModalIdx].childDetails?.geburtsdatum || ''} onChange={(e) => {
                                    const updated = { ...data.tax.expenses[specialExpenseModalIdx].childDetails!, geburtsdatum: e.target.value };
                                    handleDetailChange(specialExpenseModalIdx, 'childDetails', updated);
                                  }} className="w-full px-5 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold outline-none"/>
                               </div>
                               <div className="space-y-1">
                                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Konfession</label>
                                  <select value={data.tax.expenses[specialExpenseModalIdx].childDetails?.konfession || 'andere'} onChange={(e) => {
                                    const updated = { ...data.tax.expenses[specialExpenseModalIdx].childDetails!, konfession: e.target.value };
                                    handleDetailChange(specialExpenseModalIdx, 'childDetails', updated);
                                  }} className="w-full px-5 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold outline-none">
                                     <option value="rk">Römisch-Katholisch</option>
                                     <option value="ref">Evangelisch-Ref.</option>
                                     <option value="andere">Andere / Keine</option>
                                  </select>
                               </div>
                            </div>
                         </div>
                         <div className="space-y-6">
                            <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2"><MapPin size={14} /> Aufenthalt & Ausbildung</h4>
                            <div className="space-y-1">
                               <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Aktuelle Schule / Ausbildung</label>
                               <input type="text" value={data.tax.expenses[specialExpenseModalIdx].childDetails?.schule_ausbildung || ''} onChange={(e) => {
                                 const updated = { ...data.tax.expenses[specialExpenseModalIdx].childDetails!, schule_ausbildung: e.target.value };
                                 handleDetailChange(specialExpenseModalIdx, 'childDetails', updated);
                               }} className="w-full px-5 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold outline-none"/>
                            </div>
                            <div className="flex items-center gap-4 pt-2">
                               <button 
                                 onClick={() => {
                                   const updated = { ...data.tax.expenses[specialExpenseModalIdx].childDetails!, haushalt: !data.tax.expenses[specialExpenseModalIdx].childDetails?.haushalt };
                                   handleDetailChange(specialExpenseModalIdx, 'childDetails', updated);
                                 }}
                                 className={`flex-1 px-5 py-4 rounded-xl border-2 transition-all flex items-center justify-center gap-3 font-black text-[10px] uppercase tracking-widest ${
                                   data.tax.expenses[specialExpenseModalIdx].childDetails?.haushalt ? 'bg-blue-50 border-blue-600 text-blue-600' : 'bg-gray-50 border-gray-100 text-gray-400'
                                 }`}
                               >
                                  {data.tax.expenses[specialExpenseModalIdx].childDetails?.haushalt ? <CheckCircle2 size={16}/> : <X size={16}/>}
                                  Im eigenen Haushalt
                               </button>
                            </div>
                         </div>
                      </div>
                      <div className="space-y-6 p-8 bg-blue-50/30 rounded-[28px] border border-blue-100/50">
                         <h4 className="text-[10px] font-black text-blue-500 uppercase tracking-widest flex items-center gap-2"><Heart size={14} /> Zahlungsempfänger (z.B. anderer Elternteil)</h4>
                         <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div className="space-y-1">
                               <label className="text-[10px] font-bold text-gray-400 uppercase">Vorname Empfänger</label>
                               <input type="text" value={data.tax.expenses[specialExpenseModalIdx].childDetails?.empfaenger_vorname || ''} onChange={(e) => {
                                 const updated = { ...data.tax.expenses[specialExpenseModalIdx].childDetails!, empfaenger_vorname: e.target.value };
                                 handleDetailChange(specialExpenseModalIdx, 'childDetails', updated);
                               }} className="w-full px-5 py-3 bg-white border border-gray-200 rounded-xl text-sm font-bold outline-none focus:ring-4 focus:ring-blue-100 transition-all"/>
                            </div>
                            <div className="space-y-1">
                               <label className="text-[10px] font-bold text-gray-400 uppercase">Nachname Empfänger</label>
                               <input type="text" value={data.tax.expenses[specialExpenseModalIdx].childDetails?.empfaenger_name || ''} onChange={(e) => {
                                 const updated = { ...data.tax.expenses[specialExpenseModalIdx].childDetails!, empfaenger_name: e.target.value };
                                 handleDetailChange(specialExpenseModalIdx, 'childDetails', updated);
                               }} className="w-full px-5 py-3 bg-white border border-gray-200 rounded-xl text-sm font-bold outline-none focus:ring-4 focus:ring-blue-100 transition-all"/>
                            </div>
                            <div className="space-y-1">
                               <label className="text-[10px] font-bold text-gray-400 uppercase">Wohnort Empfänger</label>
                               <input type="text" value={data.tax.expenses[specialExpenseModalIdx].childDetails?.empfaenger_ort || ''} onChange={(e) => {
                                 const updated = { ...data.tax.expenses[specialExpenseModalIdx].childDetails!, empfaenger_ort: e.target.value };
                                 handleDetailChange(specialExpenseModalIdx, 'childDetails', updated);
                               }} className="w-full px-5 py-3 bg-white border border-gray-200 rounded-xl text-sm font-bold outline-none focus:ring-4 focus:ring-blue-100 transition-all"/>
                            </div>
                         </div>
                      </div>
                   </div>
                 ) : (
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                      <div className="space-y-6">
                         <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2"><User size={14} /> Empfänger der Alimente</h4>
                         <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1">
                               <label className="text-[10px] font-bold text-gray-400 uppercase">Vorname</label>
                               <input type="text" value={data.tax.expenses[specialExpenseModalIdx].alimonyDetails?.empfaenger_vorname || ''} onChange={(e) => {
                                 const updated = { ...data.tax.expenses[specialExpenseModalIdx].alimonyDetails!, empfaenger_vorname: e.target.value };
                                 handleDetailChange(specialExpenseModalIdx, 'alimonyDetails', updated);
                               }} className="w-full px-5 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold outline-none focus:ring-4 focus:ring-blue-100"/>
                            </div>
                            <div className="space-y-1">
                               <label className="text-[10px] font-bold text-gray-400 uppercase">Nachname</label>
                               <input type="text" value={data.tax.expenses[specialExpenseModalIdx].alimonyDetails?.empfaenger_name || ''} onChange={(e) => {
                                 const updated = { ...data.tax.expenses[specialExpenseModalIdx].alimonyDetails!, empfaenger_name: e.target.value };
                                 handleDetailChange(specialExpenseModalIdx, 'alimonyDetails', updated);
                               }} className="w-full px-5 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold outline-none focus:ring-4 focus:ring-blue-100"/>
                            </div>
                         </div>
                         <div className="space-y-1">
                            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Wohnort Empfänger</label>
                            <input type="text" value={data.tax.expenses[specialExpenseModalIdx].alimonyDetails?.empfaenger_ort || ''} onChange={(e) => {
                              const updated = { ...data.tax.expenses[specialExpenseModalIdx].alimonyDetails!, empfaenger_ort: e.target.value };
                              handleDetailChange(specialExpenseModalIdx, 'alimonyDetails', updated);
                            }} className="w-full px-5 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold outline-none"/>
                         </div>
                      </div>
                      <div className="space-y-6">
                         <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2"><CalendarCheck size={14} /> Trennung / Dauer</h4>
                         <div className="space-y-1">
                            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Getrennt seit (Datum)</label>
                            <input type="date" value={data.tax.expenses[specialExpenseModalIdx].alimonyDetails?.getrennt_seit || ''} onChange={(e) => {
                              const updated = { ...data.tax.expenses[specialExpenseModalIdx].alimonyDetails!, getrennt_seit: e.target.value };
                              handleDetailChange(specialExpenseModalIdx, 'alimonyDetails', updated);
                            }} className="w-full px-5 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold outline-none"/>
                         </div>
                      </div>
                   </div>
                 )}

                 <div className="space-y-8 bg-gray-50/50 p-8 rounded-[32px] border border-gray-100">
                    <div className="flex items-center justify-between">
                       <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2"><Calculator size={14} /> Jährlicher Zahlungsnachweis</h4>
                       <div className="flex gap-2">
                          {['fix', 'individuell'].map(freq => (
                            <button 
                              key={freq}
                              onClick={() => {
                                const target = data.tax.expenses[specialExpenseModalIdx!].cat === 'Kindesunterhalt' ? 'childDetails' : 'alimonyDetails';
                                const currentDetails = data.tax.expenses[specialExpenseModalIdx!][target];
                                updateExpense(specialExpenseModalIdx!, target, { ...currentDetails, paymentFrequency: freq });
                              }}
                              className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                                (data.tax.expenses[specialExpenseModalIdx!].childDetails?.paymentFrequency || data.tax.expenses[specialExpenseModalIdx!].alimonyDetails?.paymentFrequency) === freq
                                ? 'bg-blue-600 text-white shadow-lg'
                                : 'bg-white text-gray-400 border border-gray-100 hover:bg-gray-50'
                              }`}
                            >
                               {freq}
                            </button>
                          ))}
                       </div>
                    </div>

                    <div className="grid grid-cols-3 md:grid-cols-6 gap-5">
                       {months.map((m, mIdx) => {
                          const targetKey = data.tax.expenses[specialExpenseModalIdx!].cat === 'Kindesunterhalt' ? 'childDetails' : 'alimonyDetails';
                          const details = data.tax.expenses[specialExpenseModalIdx!][targetKey];
                          const amount = details?.monthlyAmounts[mIdx] || 0;
                          const isFix = details?.paymentFrequency === 'fix';

                          return (
                            <div key={m} className="space-y-2">
                               <label className="text-[10px] font-bold text-gray-400 uppercase text-center block tracking-widest">{m}</label>
                               <input 
                                 type="number" 
                                 disabled={isFix && mIdx > 0}
                                 value={amount}
                                 onChange={(e) => {
                                   const newVal = parseFloat(e.target.value) || 0;
                                   const newAmounts = [...details!.monthlyAmounts];
                                   if (isFix) {
                                     newAmounts.fill(newVal);
                                   } else {
                                     newAmounts[mIdx] = newVal;
                                   }
                                   handleAmountChange(specialExpenseModalIdx!, targetKey, newAmounts);
                                 }}
                                 className={`w-full text-center py-4 rounded-2xl text-sm font-black border transition-all ${
                                   isFix && mIdx > 0 ? 'bg-gray-100 text-gray-300 border-gray-100' : 'bg-white text-blue-900 border-gray-200 focus:ring-4 focus:ring-blue-100 outline-none'
                                 }`}
                               />
                            </div>
                          );
                       })}
                    </div>
                 </div>
              </div>

              <div className="p-8 border-t border-gray-100 bg-white flex justify-end gap-4">
                 <button 
                   onClick={() => setSpecialExpenseModalIdx(null)}
                   className="px-10 py-4 bg-[#16325c] text-white rounded-2xl font-black text-xs uppercase tracking-[0.2em] shadow-2xl shadow-blue-900/20 hover:bg-blue-800 transition-all flex items-center gap-3"
                 >
                   <CheckCircle2 size={18} /> Details Speichern
                 </button>
              </div>
           </div>
        </div>
      )}

      {/* Export Modal */}
      {showExportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm animate-in fade-in duration-200">
           <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl p-6 space-y-4 animate-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col">
              <div className="text-center shrink-0">
                 <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-2">
                    <FileDown size={24} />
                 </div>
                 <h3 className="text-xl font-black text-gray-800">Report erstellen</h3>
                 <p className="text-gray-400 text-xs mt-1">Wähle die Inhalte für den PDF-Export aus.</p>
              </div>

              <div className="space-y-3 overflow-y-auto pr-2 custom-scrollbar">
                 {[
                   { id: 'includePersonal', label: 'Deckblatt & Personalien' },
                   { id: 'includeMessage', label: 'Nachricht an Steueramt' },
                   { id: 'includeSalary', label: 'Lohnausweis Daten (Ziff. 100ff)' },
                   { id: 'includeAssets', label: 'Wertschriften & Vermögen (Ziff. 400)' },
                   { id: 'includeExpenses', label: 'Abzüge (Beruf, Alimente etc.)' },
                   { id: 'includeTradingProof', label: 'Trading Logbuch (Nachweis Privatvermögen)' },
                   { id: 'includeReceipts', label: 'Anhänge / Belege (Bilder)' }
                 ].map(opt => (
                   <label key={opt.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl cursor-pointer hover:bg-blue-50 transition-colors">
                      <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all shrink-0 ${exportOpts[opt.id as keyof PdfExportOptions] ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-gray-300'}`}>
                         {exportOpts[opt.id as keyof PdfExportOptions] && <CheckCircle2 size={14} />}
                      </div>
                      <input 
                        type="checkbox" 
                        className="hidden" 
                        checked={exportOpts[opt.id as keyof PdfExportOptions]} 
                        onChange={() => setExportOpts({...exportOpts, [opt.id]: !exportOpts[opt.id as keyof PdfExportOptions]})}
                      />
                      <span className="font-bold text-gray-700 text-xs">{opt.label}</span>
                   </label>
                 ))}
              </div>

              <div className="flex gap-3 pt-2 shrink-0">
                 <button onClick={() => setShowExportModal(false)} className="flex-1 py-3 text-gray-500 font-bold hover:bg-gray-100 rounded-xl transition-colors text-xs">Abbrechen</button>
                 <button onClick={handleGeneratePdf} className="flex-1 py-3 bg-[#16325c] text-white font-black rounded-xl shadow-lg hover:bg-blue-800 transition-all flex items-center justify-center gap-2 text-xs">
                    <FileDown size={16} /> PDF Generieren
                 </button>
              </div>
           </div>
        </div>
      )}

      {/* Rest of view... */}
      {activeSubTab === 'balances' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-in fade-in duration-300">
           <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
             <div className="p-4 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
               <div className="flex items-center gap-2"><Landmark size={16} className="text-blue-500" /><h3 className="font-bold text-gray-700 uppercase tracking-tight text-[10px]">UBS (Bank)</h3></div>
               <span className="text-[9px] font-black text-blue-400 uppercase bg-blue-50 px-1.5 py-0.5 rounded">Ziff. 30.1</span>
             </div>
             <div className="p-6">
               <input type="number" value={currentYearBalance.ubs || 0} onChange={(e) => {
                 const newBalances = { ...data.tax.balances };
                 if (!newBalances[selectedYear]) newBalances[selectedYear] = { ubs: 0, comdirect: 0, ibkr: 0 };
                 newBalances[selectedYear].ubs = parseFloat(e.target.value) || 0;
                 onUpdate({...data, tax: {...data.tax, balances: newBalances}});
               }} className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-lg font-black text-gray-800 outline-none"/>
             </div>
           </div>
           
           {/* COMDIRECT CARD UPDATED FOR EUR INPUT */}
           <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
             <div className="p-4 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
               <div className="flex items-center gap-2"><CreditCard size={16} className="text-blue-500" /><h3 className="font-bold text-gray-700 uppercase tracking-tight text-[10px]">Comdirect</h3></div>
               <span className="text-[9px] font-black text-blue-400 uppercase bg-blue-50 px-1.5 py-0.5 rounded">EUR Basis</span>
             </div>
             <div className="p-6 space-y-3">
               <div className="flex items-center gap-2">
                 <Euro size={16} className="text-gray-400" />
                 <input 
                   type="number" 
                   value={currentYearBalance.comdirectEUR || 0} 
                   onChange={(e) => {
                     const newBalances = { ...data.tax.balances };
                     if (!newBalances[selectedYear]) newBalances[selectedYear] = { ubs: 0, comdirect: 0, ibkr: 0 };
                     newBalances[selectedYear].comdirectEUR = parseFloat(e.target.value) || 0;
                     onUpdate({...data, tax: {...data.tax, balances: newBalances}});
                   }} 
                   className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-lg font-black text-gray-800 outline-none focus:ring-2 focus:ring-blue-100 transition-all"
                   placeholder="0.00"
                 />
               </div>
               <div className="pt-3 border-t border-gray-100 flex justify-between items-center">
                 <span className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">In CHF (Steuerwert):</span>
                 <span className="font-black text-blue-600">
                   {((currentYearBalance.comdirectEUR || 0) * (data.tax.rateEUR || 0.94)).toLocaleString('de-CH', { minimumFractionDigits: 2 })}
                 </span>
               </div>
             </div>
           </div>

           <div className="bg-[#16325c] rounded-2xl shadow-xl overflow-hidden text-white">
             <div className="p-4 bg-white/10 border-b border-white/10 flex items-center justify-between">
               <div className="flex items-center gap-2"><Wallet size={16} className="text-blue-300" /><h3 className="font-bold text-blue-100 uppercase tracking-tight text-[10px]">IBKR Cash (Auto)</h3></div>
             </div>
             <div className="p-6">
               <div className="text-2xl font-black">{ibkrCashCHF.toLocaleString('de-CH', { minimumFractionDigits: 2 })} <span className="text-xs opacity-50">CHF</span></div>
               <p className="text-[9px] text-blue-300/60 mt-1 italic font-bold">Synchronisiert von Wertpapiere-Tab</p>
             </div>
           </div>
        </div>
      )}

      {/* Summary Tab (Same as previous) */}
      {activeSubTab === 'summary' && (
        <div className="space-y-8 animate-in fade-in duration-500">
           {/* ... Summary Content ... */}
           <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-8 space-y-6">
                 <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] flex items-center gap-2"><TrendingUp size={14} className="text-green-500"/> Einkommen</h4>
                 <div className="space-y-4">
                    <div className="flex justify-between items-center"><span className="text-sm font-bold text-gray-500">Lohn Brutto</span><span className="font-black text-gray-800">{salSum.brutto.toLocaleString('de-CH')} CHF</span></div>
                    <div className="flex justify-between items-center"><span className="text-sm font-bold text-gray-500">Quellensteuer</span><span className="font-black text-red-500">-{salSum.qst.toLocaleString('de-CH')} CHF</span></div>
                    <div className="h-px bg-gray-50"/>
                    <div className="flex justify-between items-center"><span className="text-sm font-black text-[#16325c]">Netto Lohn</span><span className="text-lg font-black text-[#16325c]">{salSum.netto.toLocaleString('de-CH')} CHF</span></div>
                 </div>
              </div>
              <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-8 space-y-6">
                 <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] flex items-center gap-2"><Receipt size={14} className="text-blue-500"/> Total Abzüge</h4>
                 <div className="space-y-4">
                    <div className="flex justify-between items-center"><span className="text-sm font-bold text-gray-500">Beruf / Vers. / Alimente</span><span className="font-black text-gray-800">{totalRelevantExpenses.toLocaleString('de-CH')} CHF</span></div>
                    <div className="h-px bg-gray-50"/>
                    <div className="flex justify-between items-center"><span className="text-sm font-black text-blue-600">Total Steuerabzug</span><span className="text-lg font-black text-blue-600">{totalRelevantExpenses.toLocaleString('de-CH')} CHF</span></div>
                 </div>
              </div>
           </div>
           
           <div className="flex justify-end pt-8 border-t border-gray-200">
              <button 
                onClick={() => setShowExportModal(true)}
                className="px-12 py-5 bg-blue-600 text-white font-black text-sm uppercase tracking-widest rounded-2xl shadow-2xl shadow-blue-500/30 hover:scale-105 transition-transform flex items-center gap-3"
              >
                <FileDown size={20} /> Report Generieren
              </button>
           </div>
        </div>
      )}

      {/* Personal Tab (Same as previous) */}
      {activeSubTab === 'personal' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in fade-in duration-300">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4">
            <h3 className="font-bold text-gray-700 uppercase tracking-tight text-xs flex items-center gap-2"><User size={16} className="text-blue-500" /> Steuerpflichtiger</h3>
            <div className="space-y-4">
               <div className="space-y-1"><label className="text-[10px] uppercase font-bold text-gray-400">Name / Vorname</label><input type="text" value={data.tax.personal.name} onChange={(e) => updatePersonal('name', e.target.value)} className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-medium outline-none"/></div>
               <div className="space-y-1"><label className="text-[10px] uppercase font-bold text-gray-400">PID-Nummer</label><input type="text" value={data.tax.personal.id} onChange={(e) => updatePersonal('id', e.target.value)} className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-medium outline-none"/></div>
               <div className="space-y-1"><label className="text-[10px] uppercase font-bold text-gray-400">Adresse</label><input type="text" value={data.tax.personal.address} onChange={(e) => updatePersonal('address', e.target.value)} className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-medium outline-none"/></div>
               <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-1 space-y-1"><label className="text-[10px] uppercase font-bold text-gray-400">PLZ</label><input type="text" value={data.tax.personal.zip} onChange={(e) => updatePersonal('zip', e.target.value)} className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-medium outline-none"/></div>
                  <div className="col-span-2 space-y-1"><label className="text-[10px] uppercase font-bold text-gray-400">Ort</label><input type="text" value={data.tax.personal.city} onChange={(e) => updatePersonal('city', e.target.value)} className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-medium outline-none"/></div>
               </div>
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4">
            <h3 className="font-bold text-gray-700 uppercase tracking-tight text-xs flex items-center gap-2"><Landmark size={16} className="text-amber-500" /> Währungsfaktoren</h3>
            <div className="space-y-4">
              <div className="space-y-1"><label className="text-[10px] uppercase font-bold text-gray-400">USD ➔ CHF</label><input type="number" step="0.0001" value={data.tax.rateUSD || 0.8500} onChange={(e) => onUpdate({...data, tax: {...data.tax, rateUSD: parseFloat(e.target.value)}})} className="w-full px-4 py-3 bg-blue-50/50 border border-blue-100 rounded-lg text-lg font-black text-blue-900 outline-none"/></div>
              <div className="space-y-1"><label className="text-[10px] uppercase font-bold text-gray-400">EUR ➔ CHF</label><input type="number" step="0.0001" value={data.tax.rateEUR || 0.9400} onChange={(e) => onUpdate({...data, tax: {...data.tax, rateEUR: parseFloat(e.target.value)}})} className="w-full px-4 py-3 bg-purple-50/50 border border-purple-100 rounded-lg text-lg font-black text-purple-900 outline-none"/></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TaxView;
