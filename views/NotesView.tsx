
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { 
  Search, 
  FolderOpen, 
  FileText, 
  Plus, 
  Trash2, 
  Tag, 
  Calendar, 
  Download, 
  RefreshCw,
  Filter,
  File as FileIcon,
  Inbox,
  PenTool,
  Loader2,
  ChevronRight,
  Eye,
  Info,
  Database,
  ScanLine,
  Check,
  X,
  Settings,
  Bell,
  Clock,
  FileSpreadsheet,
  FileType,
  Image as ImageIcon,
  Bold,
  Italic,
  Underline,
  Strikethrough,
  List,
  ListOrdered,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Type,
  Table as TableIcon,
  Indent,
  Outdent,
  Palette,
  Undo,
  Redo,
  ImagePlus,
  ArrowLeft,
  UploadCloud,
  FileArchive
} from 'lucide-react';
import { AppData, NoteDocument, DocCategory } from '../types';
import { DocumentService } from '../services/documentService';
import { VaultService } from '../services/vaultService';
import { DBService } from '../services/dbService';

interface Props {
  data: AppData;
  onUpdate: (data: AppData) => void;
}

const DEFAULT_CATEGORIES: DocCategory[] = ['Inbox', 'Steuern', 'Rechnungen', 'Versicherung', 'Bank', 'Wohnen', 'Arbeit', 'Privat', 'Fahrzeug', 'Verträge', 'Sonstiges'];

// --- HELPER: Strip HTML for Preview ---
const stripHtml = (html: string) => {
   const tmp = document.createElement("DIV");
   tmp.innerHTML = html;
   return tmp.textContent || tmp.innerText || "";
};

const NotesView: React.FC<Props> = ({ data, onUpdate }) => {
  const [selectedCat, setSelectedCat] = useState<string | 'All'>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [isReindexing, setIsReindexing] = useState(false);
  
  // UI States for Feedback
  const [scanMessage, setScanMessage] = useState<{text: string, type: 'success'|'info'|'warning'} | null>(null);
  const [lastScanTime, setLastScanTime] = useState<string | null>(null);
  
  // UI State for creating new category
  const [isCreatingCat, setIsCreatingCat] = useState(false);
  const [newCatName, setNewCatName] = useState('');

  // UI State for Managing Rules
  const [ruleModalCat, setRuleModalCat] = useState<string | null>(null);
  const [newKeyword, setNewKeyword] = useState('');
  
  // Editor Refs
  const editorRef = useRef<HTMLDivElement>(null);
  const lastNoteIdRef = useRef<string | null>(null);
  const mobileImportInputRef = useRef<HTMLInputElement>(null);
  const zipImportInputRef = useRef<HTMLInputElement>(null);

  // Derived Data
  const notesList = Object.values(data.notes || {}).sort((a, b) => new Date(b.created).getTime() - new Date(a.created).getTime());
  
  const availableCategories = useMemo(() => {
    const cats = new Set(DEFAULT_CATEGORIES);
    notesList.forEach(n => cats.add(n.category));
    return Array.from(cats).sort();
  }, [notesList]);

  const filteredNotes = useMemo(() => {
    return notesList.filter(note => {
      const matchesCat = selectedCat === 'All' || note.category === selectedCat;
      const cleanContent = stripHtml(note.content).toLowerCase();
      const matchesSearch = !searchQuery || 
        note.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
        cleanContent.includes(searchQuery.toLowerCase());
      return matchesCat && matchesSearch;
    });
  }, [notesList, selectedCat, searchQuery]);

  const selectedNote = selectedNoteId ? data.notes?.[selectedNoteId] : null;

  // --- AUTOMATIC SCAN ON MOUNT ---
  useEffect(() => {
    if (VaultService.isConnected()) {
        const timer = setTimeout(() => {
            if (!isScanning) {
                handleScanInbox(false); 
            }
        }, 800);
        return () => clearTimeout(timer);
    }
  }, []); 

  // --- EDITOR SYNC (Fix for Backwards Typing) ---
  useEffect(() => {
      if (selectedNoteId && data.notes[selectedNoteId] && data.notes[selectedNoteId].type === 'note' && editorRef.current) {
          const noteContent = data.notes[selectedNoteId].content;
          if (lastNoteIdRef.current !== selectedNoteId) {
              editorRef.current.innerHTML = noteContent;
              lastNoteIdRef.current = selectedNoteId;
          } 
          else if (editorRef.current.innerHTML !== noteContent) {
               if (document.activeElement !== editorRef.current) {
                   editorRef.current.innerHTML = noteContent;
               }
          }
      }
  }, [selectedNoteId, data.notes]);

  // --- SEARCH CONTEXT HELPER ---
  const renderNotePreview = (content: string, query: string) => {
      const cleanContent = stripHtml(content).replace(/\s+/g, ' ').trim();
      
      if (!query.trim()) {
          return <span className="text-gray-400">{cleanContent.substring(0, 90)}{cleanContent.length > 90 ? '...' : ''}</span>;
      }

      const idx = cleanContent.toLowerCase().indexOf(query.toLowerCase());
      if (idx === -1) return <span className="text-gray-400">{cleanContent.substring(0, 90)}...</span>;

      const padding = 35; 
      const start = Math.max(0, idx - padding);
      const end = Math.min(cleanContent.length, idx + query.length + padding);
      
      const snippet = cleanContent.substring(start, end);
      const parts = snippet.split(new RegExp(`(${query})`, 'gi'));

      return (
          <span className="text-gray-500">
              {start > 0 && "..."}
              {parts.map((part, i) => 
                  part.toLowerCase() === query.toLowerCase() 
                  ? <span key={i} className="bg-yellow-200 text-gray-900 font-bold px-0.5 rounded box-decoration-clone">{part}</span>
                  : part
              )}
              {end < cleanContent.length && "..."}
          </span>
      );
  };

  // --- RICH TEXT ACTIONS ---
  const execCmd = (command: string, value: string | undefined = undefined) => {
      document.execCommand(command, false, value);
      editorRef.current?.focus();
      handleEditorInput(); // Trigger Save
  };

  const handleEditorInput = () => {
      if (editorRef.current && selectedNoteId) {
          const html = editorRef.current.innerHTML;
          updateSelectedNote({ content: html });
      }
  };

  const insertImage = (file: File) => {
      const reader = new FileReader();
      reader.onload = (e) => {
          if (e.target?.result) {
              execCmd('insertImage', e.target.result as string);
          }
      };
      reader.readAsDataURL(file);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files?.[0]) {
          insertImage(e.target.files[0]);
          e.target.value = ''; // Reset
      }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
      if (e.clipboardData.files.length > 0) {
          const file = e.clipboardData.files[0];
          if (file.type.startsWith('image/')) {
              e.preventDefault();
              insertImage(file);
          }
      }
  };

  const insertTable = () => {
      const tableHTML = `
        <table style="width:100%; border-collapse: collapse; margin: 10px 0;">
          <tbody>
            <tr>
              <td style="border: 1px solid #ddd; padding: 8px;">Zelle 1</td>
              <td style="border: 1px solid #ddd; padding: 8px;">Zelle 2</td>
            </tr>
            <tr>
              <td style="border: 1px solid #ddd; padding: 8px;">Zelle 3</td>
              <td style="border: 1px solid #ddd; padding: 8px;">Zelle 4</td>
            </tr>
          </tbody>
        </table><p><br/></p>
      `;
      execCmd('insertHTML', tableHTML);
  };

  // Actions
  const handleScanInbox = async (isManual: boolean = true) => {
    // Desktop Vault Check
    if (!VaultService.isConnected()) {
        if (isManual) alert("Verwende den 'Import' Button auf mobilen Geräten.");
        return; 
    }

    const hasPermission = await VaultService.verifyPermission();
    if (!hasPermission && isManual) await VaultService.requestPermission();
    
    setIsScanning(true);
    if (!isManual) setScanMessage({ text: "Synchronisiere Inbox...", type: 'info' });

    try {
        const result = await DocumentService.scanInbox(data.notes || {}, data.categoryRules || {});
        setLastScanTime(new Date().toLocaleTimeString());

        if (result.movedCount > 0) {
            const newNotes = { ...(data.notes || {}) };
            result.newDocs.forEach(doc => { newNotes[doc.id] = doc; });
            onUpdate({ ...data, notes: newNotes });
            
            const msg = `${result.movedCount} Dateien importiert!`;
            setScanMessage({ text: msg, type: 'success' });
            if (isManual) alert(msg);
            setSelectedCat('Inbox'); 
            setTimeout(() => setScanMessage(null), 5000);
        } else {
            if (isManual) {
                alert("Keine neuen Dateien im _INBOX Ordner gefunden.");
                setScanMessage(null);
            } else {
                setScanMessage({ text: "Auto-Sync: Keine neuen Dateien", type: 'info' });
                setTimeout(() => setScanMessage(null), 2000); 
            }
        }
    } catch (e: any) {
        if (isManual) alert("Fehler beim Scannen: " + e.message);
    } finally {
        setIsScanning(false);
    }
  };

  const handleMobileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!e.target.files || e.target.files.length === 0) return;
      
      setIsScanning(true);
      setScanMessage({ text: "Importiere Dateien...", type: 'info' });

      try {
          const newDocs = await DocumentService.processManualUpload(e.target.files, data.categoryRules || {});
          
          if (newDocs.length > 0) {
              const newNotes = { ...(data.notes || {}) };
              for (const doc of newDocs) {
                  newNotes[doc.id] = doc;
              }

              onUpdate({ ...data, notes: newNotes });
              const msg = `${newDocs.length} Dateien erfolgreich importiert!`;
              setScanMessage({ text: msg, type: 'success' });
              setSelectedCat('Inbox');
          }
      } catch (err: any) {
          console.error(err);
          alert("Fehler beim Import: " + err.message);
      } finally {
          setIsScanning(false);
          setTimeout(() => setScanMessage(null), 3000);
          e.target.value = ''; // Reset input
      }
  };

  // NEW: HANDLE ZIP ARCHIVE IMPORT
  const handleZipImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      
      setIsScanning(true);
      setScanMessage({ text: "Entpacke Archiv...", type: 'info' });

      try {
          const newDocs = await DocumentService.processArchiveZip(file, data.categoryRules || {});
          
          if (newDocs.length > 0) {
              const newNotes = { ...(data.notes || {}) };
              for (const doc of newDocs) {
                  newNotes[doc.id] = doc;
              }
              onUpdate({ ...data, notes: newNotes });
              const msg = `${newDocs.length} Dateien aus ZIP wiederhergestellt!`;
              setScanMessage({ text: msg, type: 'success' });
              setSelectedCat('All');
          } else {
              alert("Keine gültigen Dateien im ZIP gefunden.");
              setScanMessage(null);
          }
      } catch (err: any) {
          console.error(err);
          alert("Fehler beim ZIP Import: " + err.message);
          setScanMessage(null);
      } finally {
          setIsScanning(false);
          setTimeout(() => setScanMessage(null), 4000);
          e.target.value = '';
      }
  };

  const handleReindex = async () => {
     if (!confirm("Vollständiger Re-Index?\nDas liest alle Dateien im _ARCHIVE Ordner neu ein.")) return;
     if (!VaultService.isConnected()) return;
     
     setIsReindexing(true);
     try {
         const recoveredDocs = await DocumentService.rebuildIndexFromVault();
         const currentMap = { ...(data.notes || {}) };
         let addedCount = 0;
         let updatedCount = 0;

         recoveredDocs.forEach(doc => {
             const existingEntry = Object.entries(currentMap).find(([_, val]) => val.filePath === doc.filePath);
             if (existingEntry) {
                 const [oldId, oldDoc] = existingEntry;
                 if (doc.content && doc.content.length > (oldDoc.content?.length || 0)) {
                    currentMap[oldId] = { ...oldDoc, content: doc.content, category: doc.category, year: doc.year };
                    updatedCount++;
                 }
             } else {
                 currentMap[doc.id] = doc;
                 addedCount++;
             }
         });
         onUpdate({ ...data, notes: currentMap });
         alert(`Index aktualisiert!\n\n${addedCount} neu, ${updatedCount} aktualisiert.`);
     } catch (e: any) {
         alert("Fehler: " + e.message);
     } finally {
         setIsReindexing(false);
     }
  };

  const createNote = () => {
    const id = `note_${Date.now()}`;
    const newNote: NoteDocument = {
        id,
        title: 'Neue Notiz',
        type: 'note',
        category: 'Privat',
        year: new Date().getFullYear().toString(),
        created: new Date().toISOString(),
        content: '<div>Hier starten...</div>',
        tags: []
    };
    onUpdate({ ...data, notes: { ...(data.notes || {}), [id]: newNote } });
    setSelectedNoteId(id);
  };

  const updateSelectedNote = (updates: Partial<NoteDocument>) => {
      if (!selectedNoteId) return;
      const updatedNote = { ...data.notes[selectedNoteId], ...updates };
      onUpdate({ ...data, notes: { ...data.notes, [selectedNoteId]: updatedNote } });
  };

  const changeCategory = async (newCat: DocCategory) => {
      if (!selectedNoteId || !selectedNote) return;
      if (!newCat.trim() || selectedNote.category === newCat) return;

      setIsCreatingCat(false);
      setNewCatName('');

      if (selectedNote.filePath && VaultService.isConnected()) {
          const updatedDoc = await DocumentService.moveFile(selectedNote, newCat);
          onUpdate({ ...data, notes: { ...data.notes, [selectedNoteId]: updatedDoc } });
      } else {
          updateSelectedNote({ category: newCat });
      }
  };

  const deleteNote = () => {
      if (!selectedNoteId) return;
      if (confirm("Notiz / Dokument wirklich löschen?")) {
          const newNotes = { ...data.notes };
          delete newNotes[selectedNoteId];
          onUpdate({ ...data, notes: newNotes });
          setSelectedNoteId(null);
      }
  };

  const openFile = async () => {
      if (!selectedNote) return;

      // 1. Try Vault (Desktop)
      if (selectedNote.filePath && VaultService.isConnected()) {
          const blob = await DocumentService.getFileFromVault(selectedNote.filePath);
          if (blob) {
              const url = URL.createObjectURL(blob);
              window.open(url, '_blank');
              return;
          }
      }

      // 2. Try IndexedDB (Mobile Import / Local)
      try {
          const blob = await DBService.getFile(selectedNote.id);
          if (blob) {
             const url = URL.createObjectURL(blob);
             window.open(url, '_blank');
             return;
          }
      } catch (e) { console.error(e); }

      alert("Datei nicht gefunden. (Nicht im Vault und nicht lokal gespeichert)");
  };

  const addKeyword = () => {
      if (!ruleModalCat || !newKeyword.trim()) return;
      const currentRules = data.categoryRules || {};
      const catRules = currentRules[ruleModalCat] || [];
      if (catRules.includes(newKeyword.trim())) { setNewKeyword(''); return; }
      const updatedRules = { ...currentRules, [ruleModalCat]: [...catRules, newKeyword.trim()] };
      onUpdate({ ...data, categoryRules: updatedRules });
      setNewKeyword('');
  };

  const removeKeyword = (keyword: string) => {
      if (!ruleModalCat) return;
      const currentRules = data.categoryRules || {};
      const catRules = currentRules[ruleModalCat] || [];
      const updatedRules = { ...currentRules, [ruleModalCat]: catRules.filter(k => k !== keyword) };
      onUpdate({ ...data, categoryRules: updatedRules });
  };

  const getIconForType = (type: NoteDocument['type']) => {
      switch(type) {
          case 'pdf': return <FileText size={16} className="text-red-500" />;
          case 'image': return <ImageIcon size={16} className="text-purple-500" />;
          case 'word': return <FileType size={16} className="text-blue-600" />;
          case 'excel': return <FileSpreadsheet size={16} className="text-green-600" />;
          case 'note': return <FileIcon size={16} className="text-gray-500" />;
          default: return <FileIcon size={16} className="text-gray-400" />;
      }
  };

  const getTypeLabel = (type: NoteDocument['type']) => {
      switch(type) {
          case 'pdf': return 'PDF Doku';
          case 'image': return 'Bild / Scan';
          case 'word': return 'Word / Pages';
          case 'excel': return 'Excel / CSV';
          case 'note': return 'Notiz';
          default: return 'Datei';
      }
  };

  return (
    <div className="flex flex-col md:flex-row h-[calc(100vh-8rem)] bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden relative">
      
      {/* 1. SIDEBAR (Desktop Only) / Mobile Toolbar */}
      <div className={`w-full md:w-64 bg-gray-50 border-r border-gray-100 flex flex-col ${selectedNoteId ? 'hidden md:flex' : 'flex'}`}>
         
         {/* Mobile Toolbar Header */}
         <div className="md:hidden p-3 border-b border-gray-100 flex gap-2">
            <select 
               value={selectedCat} 
               onChange={(e) => setSelectedCat(e.target.value)} 
               className="flex-1 bg-white border border-gray-200 rounded-lg px-2 py-2 text-sm font-bold"
            >
               <option value="All">Alle Kategorien</option>
               {availableCategories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            
            {/* ZIP Import Mobile */}
            <button 
                onClick={() => zipImportInputRef.current?.click()} 
                className="p-2 bg-purple-100 text-purple-600 rounded-lg shadow-sm"
                title="ZIP Archiv importieren"
            >
                <FileArchive size={20} />
            </button>
            <input type="file" ref={zipImportInputRef} accept=".zip" className="hidden" onChange={handleZipImport} />

            <button 
                onClick={() => mobileImportInputRef.current?.click()} 
                className="p-2 bg-[#16325c] text-white rounded-lg shadow-sm"
                title="Dateien importieren"
            >
                <UploadCloud size={20} />
            </button>
            <input type="file" ref={mobileImportInputRef} multiple className="hidden" onChange={handleMobileImport} />

            <button 
                onClick={createNote} 
                className="p-2 bg-blue-100 text-blue-600 rounded-lg shadow-sm"
            >
                <PenTool size={20} />
            </button>
         </div>

         {/* Desktop Create Button */}
         <div className="hidden md:block p-4 space-y-2">
            <button 
                onClick={createNote}
                className="w-full py-3 bg-[#16325c] text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-blue-900/10 hover:bg-blue-800 transition-all"
            >
                <PenTool size={16} /> Neue Notiz
            </button>
         </div>
         
         {/* Categories List (Desktop) */}
         <div className="hidden md:block flex-1 overflow-y-auto px-2 space-y-1">
            <button 
                onClick={() => setSelectedCat('All')}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-bold transition-colors ${selectedCat === 'All' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:bg-gray-100'}`}
            >
                <div className="flex items-center gap-2"><Inbox size={16}/> Alle Notizen</div>
                <span className="bg-gray-200 text-gray-500 px-1.5 py-0.5 rounded text-[10px]">{notesList.length}</span>
            </button>
            
            <div className="pt-4 pb-2 px-3 text-[10px] font-black text-gray-400 uppercase tracking-widest">Kategorien</div>
            {availableCategories.map(cat => (
                <div key={cat} className="group flex items-center gap-1 w-full px-1">
                    <button 
                        onClick={() => setSelectedCat(cat)}
                        className={`flex-1 flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-colors ${selectedCat === cat ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:bg-gray-100'}`}
                    >
                        <div className="flex items-center gap-2">
                            {cat === 'Inbox' ? <Inbox size={16} className="text-purple-500"/> : <FolderOpen size={16} className="text-amber-500"/>}
                            {cat}
                        </div>
                        <span className="text-[10px] text-gray-300">{notesList.filter(n => n.category === cat).length}</span>
                    </button>
                    {cat !== 'Inbox' && (
                        <button onClick={(e) => { e.stopPropagation(); setRuleModalCat(cat); }} className="p-2 text-gray-300 hover:text-blue-500 hover:bg-blue-50 rounded-lg opacity-0 group-hover:opacity-100 transition-all"><Tag size={12} /></button>
                    )}
                </div>
            ))}
         </div>

         {/* Desktop Vault/Scan Footer */}
         <div className="hidden md:block p-4 border-t border-gray-100 bg-gray-50 space-y-2 relative">
            {scanMessage && (
                <div className={`absolute bottom-full left-4 right-4 mb-2 p-3 text-xs font-bold rounded-xl shadow-lg flex items-center gap-2 z-20 ${scanMessage.type === 'warning' ? 'bg-orange-100 text-orange-700' : scanMessage.type === 'success' ? 'bg-green-500 text-white' : 'bg-blue-600 text-white'}`}>
                    {scanMessage.text}
                </div>
            )}
            
            {/* Desktop ZIP Import Button added here too */}
             <button onClick={() => zipImportInputRef.current?.click()} disabled={isScanning} className="w-full py-2.5 border border-purple-200 bg-purple-50 text-purple-600 rounded-xl font-bold text-xs flex items-center justify-center gap-2 hover:bg-purple-100 transition-all">
                <FileArchive size={14} /> ZIP Archiv Import
            </button>

            <button onClick={() => handleScanInbox(true)} disabled={isScanning} className={`w-full py-2.5 border border-gray-200 bg-white text-gray-600 rounded-xl font-bold text-xs flex items-center justify-center gap-2 hover:bg-gray-50 transition-all ${isScanning ? 'opacity-50 cursor-wait' : ''}`}>
                {isScanning ? <Loader2 size={14} className="animate-spin" /> : <ScanLine size={14} />} Inbox Scannen
            </button>
            <button onClick={handleReindex} disabled={isReindexing} className={`w-full py-2.5 border border-blue-200 bg-blue-50 text-blue-600 rounded-xl font-bold text-xs flex items-center justify-center gap-2 hover:bg-blue-100 transition-all ${isReindexing ? 'opacity-50 cursor-wait' : ''}`}>
                {isReindexing ? <Loader2 size={14} className="animate-spin" /> : <Database size={14} />} Archive Sync
            </button>
         </div>
      </div>

      {/* 2. NOTE LIST */}
      <div className={`w-full md:w-80 border-r border-gray-100 flex flex-col bg-white ${selectedNoteId ? 'hidden md:flex' : 'flex'}`}>
         <div className="p-4 border-b border-gray-50">
            <div className="relative">
                <Search size={16} className="absolute left-3 top-3 text-gray-400" />
                <input type="text" placeholder="Suchen..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full pl-9 pr-4 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-50 transition-all"/>
            </div>
         </div>
         <div className="flex-1 overflow-y-auto">
            {filteredNotes.map(note => (
                <div key={note.id} onClick={() => setSelectedNoteId(note.id)} className={`p-4 border-b border-gray-50 cursor-pointer hover:bg-gray-50 transition-colors ${selectedNoteId === note.id ? 'bg-blue-50/50 border-l-4 border-l-blue-500' : 'border-l-4 border-l-transparent'}`}>
                    <div className="flex items-start justify-between mb-1">
                        <h4 className={`font-bold text-sm truncate flex-1 ${selectedNoteId === note.id ? 'text-blue-700' : 'text-gray-800'}`}>{note.title}</h4>
                        {getIconForType(note.type)}
                    </div>
                    <div className="text-xs mb-2 h-10 leading-relaxed line-clamp-2">
                        {renderNotePreview(note.content, searchQuery)}
                    </div>
                    <div className="flex items-center justify-between">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium bg-gray-100 text-gray-500`}>{getTypeLabel(note.type)}</span>
                        <span className="text-[10px] text-gray-300">{new Date(note.created).toLocaleDateString()}</span>
                    </div>
                </div>
            ))}
            {filteredNotes.length === 0 && <div className="p-8 text-center text-gray-400 text-xs italic">Keine Dokumente gefunden.</div>}
         </div>
      </div>

      {/* 3. DETAIL / EDITOR - Mobile Overlay or Desktop Column */}
      <div className={`flex-1 flex flex-col bg-gray-50/30 ${selectedNoteId ? 'fixed inset-0 z-20 bg-white md:static' : 'hidden md:flex'}`}>
         {selectedNote ? (
             <>
                <div className="p-4 md:p-6 border-b border-gray-100 bg-white flex items-center justify-between shrink-0 safe-area-top">
                    <div className="flex items-center gap-3 flex-1 mr-4 overflow-hidden">
                        {/* Mobile Back Button */}
                        <button onClick={() => setSelectedNoteId(null)} className="md:hidden p-2 -ml-2 text-gray-500 hover:bg-gray-100 rounded-full">
                           <ArrowLeft size={20} />
                        </button>
                        
                        <div className="flex-1 min-w-0">
                            <input 
                                type="text" 
                                value={selectedNote.title} 
                                onChange={(e) => updateSelectedNote({ title: e.target.value })}
                                className="text-lg md:text-xl font-black text-gray-800 bg-transparent outline-none w-full placeholder-gray-300 truncate"
                                placeholder="Titel..."
                            />
                            <div className="flex items-center gap-2 mt-1 md:mt-2 h-8 overflow-x-auto no-scrollbar">
                                {isCreatingCat ? (
                                    <div className="flex items-center gap-1 animate-in slide-in-from-left-2 fade-in">
                                        <input type="text" autoFocus value={newCatName} onChange={(e) => setNewCatName(e.target.value)} placeholder="Neue Kat..." className="text-xs bg-white border border-blue-300 text-gray-700 px-2 py-1 rounded-lg outline-none w-24 md:w-32 shadow-sm" onKeyDown={(e) => { if(e.key === 'Enter') changeCategory(newCatName); if(e.key === 'Escape') setIsCreatingCat(false); }}/>
                                        <button onClick={() => changeCategory(newCatName)} className="p-1 bg-green-100 text-green-600 rounded hover:bg-green-200"><Check size={12}/></button>
                                        <button onClick={() => setIsCreatingCat(false)} className="p-1 bg-gray-100 text-gray-500 rounded hover:bg-gray-200"><X size={12}/></button>
                                    </div>
                                ) : (
                                    <>
                                        <select value={selectedNote.category} onChange={(e) => changeCategory(e.target.value as DocCategory)} className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-lg outline-none cursor-pointer font-bold border border-transparent hover:border-gray-300 transition-colors" title="Kategorie ändern">
                                            {availableCategories.map(c => <option key={c} value={c}>{c}</option>)}
                                        </select>
                                        <button onClick={() => { setIsCreatingCat(true); setNewCatName(''); }} className="p-1 text-blue-500 hover:bg-blue-50 rounded"><Plus size={14} /></button>
                                    </>
                                )}
                                <div className="w-px h-4 bg-gray-200 mx-1"></div>
                                <span className="text-[10px] text-gray-400 uppercase tracking-widest font-mono shrink-0">{selectedNote.year}</span>
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-1 md:gap-2">
                        {selectedNote.filePath && (
                            <button onClick={openFile} className="p-2 text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors" title="Dokument Öffnen"><Eye size={18} /></button>
                        )}
                        <button onClick={deleteNote} className="p-2 text-gray-400 hover:text-red-500 transition-colors"><Trash2 size={18} /></button>
                    </div>
                </div>
                
                <div className="flex-1 overflow-hidden relative flex flex-col">
                    {/* RICH TEXT EDITOR */}
                    {selectedNote.type === 'note' ? (
                        <div className="flex flex-col h-full bg-white">
                            {/* Toolbar */}
                            <div className="flex items-center gap-1 p-2 bg-gray-50 border-b border-gray-100 overflow-x-auto flex-nowrap shrink-0 no-scrollbar">
                                <button onClick={() => execCmd('undo')} className="p-1.5 hover:bg-gray-200 rounded text-gray-600" title="Rückgängig"><Undo size={14}/></button>
                                <button onClick={() => execCmd('redo')} className="p-1.5 hover:bg-gray-200 rounded text-gray-600 mr-2" title="Wiederholen"><Redo size={14}/></button>
                                
                                <div className="w-px h-4 bg-gray-300 mx-1"></div>

                                <button onClick={() => execCmd('bold')} className="p-1.5 hover:bg-gray-200 rounded text-gray-700 font-bold" title="Fett"><Bold size={14}/></button>
                                <button onClick={() => execCmd('italic')} className="p-1.5 hover:bg-gray-200 rounded text-gray-700 italic" title="Kursiv"><Italic size={14}/></button>
                                <button onClick={() => execCmd('underline')} className="p-1.5 hover:bg-gray-200 rounded text-gray-700 underline" title="Unterstrichen"><Underline size={14}/></button>
                                
                                <div className="w-px h-4 bg-gray-300 mx-1"></div>

                                <button onClick={() => execCmd('insertUnorderedList')} className="p-1.5 hover:bg-gray-200 rounded text-gray-600" title="Liste"><List size={14}/></button>
                                
                                <div className="w-px h-4 bg-gray-300 mx-1"></div>

                                <label className="p-1.5 hover:bg-gray-200 rounded text-gray-600 cursor-pointer flex items-center gap-1" title="Bild einfügen">
                                    <ImagePlus size={14}/>
                                    <input type="file" className="hidden" accept="image/*" onChange={handleImageUpload} />
                                </label>
                            </div>

                            {/* Editable Area */}
                            <div 
                                ref={editorRef}
                                contentEditable
                                onInput={handleEditorInput}
                                onPaste={handlePaste}
                                className="flex-1 p-4 md:p-8 outline-none overflow-y-auto text-gray-800 leading-relaxed text-sm prose max-w-none"
                                style={{ minHeight: '100px' }}
                            />
                            <div className="p-2 border-t border-gray-100 bg-gray-50 text-[10px] text-gray-400 flex justify-between safe-area-bottom">
                                <span>{stripHtml(selectedNote.content).length} Zeichen</span>
                            </div>
                        </div>
                    ) : (
                        // PREVIEW FOR FILES
                        <div className="flex-1 p-6 overflow-y-auto">
                           {selectedNote.type === 'pdf' || selectedNote.type === 'image' ? (
                                <div className="space-y-4">
                                    <div className="bg-blue-50 border border-blue-100 p-4 rounded-xl flex items-start gap-3">
                                        <Info size={20} className="text-blue-500 shrink-0 mt-0.5" />
                                        <div>
                                            <h5 className="text-sm font-bold text-blue-700">Archiviertes Dokument</h5>
                                            <p className="text-xs text-blue-600 mt-1">
                                                Datei: <span className="font-mono">{selectedNote.fileName}</span><br/>
                                                Pfad: <span className="font-mono">{selectedNote.filePath || '(Lokal gespeichert)'}</span>
                                            </p>
                                            {selectedNote.filePath && (
                                                <button onClick={openFile} className="mt-3 text-xs bg-blue-600 text-white px-4 py-2 rounded-lg font-bold hover:bg-blue-700 transition-colors">Dokument Ansehen</button>
                                            )}
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between"><h5 className="text-xs font-black text-gray-400 uppercase tracking-widest">Inhalt (Extrahierter Text / OCR)</h5></div>
                                        <textarea className="w-full h-96 p-4 bg-white border border-gray-200 rounded-xl text-xs font-mono text-gray-600 leading-relaxed outline-none resize-none" value={selectedNote.content} readOnly />
                                    </div>
                                </div>
                            ) : (
                                <div className="flex flex-col items-center justify-center h-full text-center space-y-6">
                                    <div className={`w-24 h-24 rounded-3xl flex items-center justify-center ${selectedNote.type === 'word' ? 'bg-blue-50 text-blue-600' : 'bg-green-50 text-green-600'}`}>
                                        {selectedNote.type === 'word' ? <FileType size={48} /> : <FileSpreadsheet size={48} />}
                                    </div>
                                    <div className="space-y-2">
                                        <h3 className="text-xl font-black text-gray-800">{selectedNote.type === 'word' ? 'Word Dokument' : 'Excel Tabelle'}</h3>
                                        <p className="text-sm text-gray-400 max-w-md mx-auto">Inhalt extrahiert:<br/><span className="font-mono text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded mt-2 inline-block max-w-xs truncate">{selectedNote.content.substring(0,50)}...</span></p>
                                    </div>
                                    {selectedNote.filePath && (
                                        <button onClick={openFile} className="px-8 py-3 bg-[#16325c] text-white rounded-xl font-bold shadow-xl flex items-center gap-2"><Download size={18} /> Datei Öffnen</button>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </div>
             </>
         ) : (
             <div className="flex-1 flex flex-col items-center justify-center text-gray-300 hidden md:flex">
                 <FileText size={64} className="mb-4 opacity-20" />
                 <p className="text-sm font-bold uppercase tracking-widest">Wähle eine Notiz</p>
             </div>
         )}
      </div>

      {/* MODAL: MANAGE RULES */}
      {ruleModalCat && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-gray-900/40 backdrop-blur-sm animate-in fade-in duration-200 p-4">
              <div className="bg-white rounded-2xl shadow-2xl p-6 w-96 max-w-full space-y-4 animate-in zoom-in-95 duration-200">
                  <div className="flex items-center justify-between border-b border-gray-100 pb-4">
                      <div className="flex items-center gap-2"><Tag size={18} className="text-blue-500" /><div><h3 className="font-bold text-gray-800">Stichwörter</h3><p className="text-xs text-gray-400">Für Kategorie: <span className="font-bold text-blue-600">{ruleModalCat}</span></p></div></div>
                      <button onClick={() => setRuleModalCat(null)} className="p-1 text-gray-400 hover:text-gray-600"><X size={20} /></button>
                  </div>
                  <div className="space-y-2">
                      <div className="flex gap-2"><input type="text" autoFocus placeholder="Neues Stichwort..." value={newKeyword} onChange={(e) => setNewKeyword(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addKeyword()} className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-100"/><button onClick={addKeyword} className="bg-blue-600 text-white px-3 rounded-lg hover:bg-blue-700"><Plus size={18}/></button></div>
                  </div>
                  <div className="max-h-60 overflow-y-auto space-y-1 py-2">
                      {(data.categoryRules?.[ruleModalCat] || []).map(keyword => (<div key={keyword} className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded-lg group"><span className="text-sm font-medium text-gray-700">{keyword}</span><button onClick={() => removeKeyword(keyword)} className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 size={14}/></button></div>))}
                      {(!data.categoryRules?.[ruleModalCat] || data.categoryRules[ruleModalCat].length === 0) && (<div className="text-center py-4 text-xs text-gray-300 italic">Keine eigenen Stichwörter definiert.</div>)}
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};

export default NotesView;
