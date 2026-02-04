
import * as pdfjsLib from 'pdfjs-dist';
// @ts-ignore
import { createWorker } from 'tesseract.js';
// @ts-ignore
import * as mammoth from 'mammoth';
// @ts-ignore
import * as XLSX from 'xlsx';
import JSZip from 'jszip';

import { NoteDocument, DocCategory, AppData } from '../types';
import { VaultService } from './vaultService';
import { DBService } from './dbService';

// Set Worker manually for vite/browser environment
// @ts-ignore
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://esm.sh/pdfjs-dist@4.0.379/build/pdf.worker.min.mjs';

export class DocumentService {

  // Keywords for auto-categorization
  private static defaultRules: Record<string, DocCategory> = {
    'steuer': 'Steuern', 'tax': 'Steuern', 'kreisschreiben': 'Steuern', 'steuererklärung': 'Steuern',
    'rechnung': 'Rechnungen', 'invoice': 'Rechnungen', 'zahlung': 'Rechnungen', 'bill': 'Rechnungen', 'quittung': 'Rechnungen',
    'versicherung': 'Versicherung', 'police': 'Versicherung', 'helsana': 'Versicherung', 'zürich': 'Versicherung', 'axa': 'Versicherung', 'swica': 'Versicherung',
    'ubs': 'Bank', 'kontoauszug': 'Bank', 'depot': 'Bank', 'ibkr': 'Bank', 'comdirect': 'Bank', 'postfinance': 'Bank',
    'miete': 'Wohnen', 'strom': 'Wohnen', 'nebenkosten': 'Wohnen', 'internet': 'Wohnen', 'swisscom': 'Wohnen', 'upc': 'Wohnen', 'sunrise': 'Wohnen',
    'lohn': 'Arbeit', 'gehalt': 'Arbeit', 'arbeitgeber': 'Arbeit', 'arbeitsvertrag': 'Arbeit', 'lohnabrechnung': 'Arbeit',
    'auto': 'Fahrzeug', 'garage': 'Fahrzeug', 'tcs': 'Fahrzeug', 'strassenverkehrsamt': 'Fahrzeug', 'leasing': 'Fahrzeug',
    'vertrag': 'Verträge', 'kündigung': 'Verträge', 'vereinbarung': 'Verträge'
  };

  /**
   * Helper: Führt OCR auf einem Blob (Bild) aus
   */
  static async performOCR(blob: Blob): Promise<string> {
      try {
          console.log("Starte OCR...");
          const worker = await createWorker('deu'); // Lade Deutsch
          const ret = await worker.recognize(blob);
          await worker.terminate();
          return ret.data.text;
      } catch (e) {
          console.error("OCR Fehler:", e);
          return "";
      }
  }

  /**
   * Extracts text from Word documents (.docx) using Mammoth
   */
  static async extractTextFromWord(file: File | Blob): Promise<string> {
      try {
          const arrayBuffer = await file.arrayBuffer();
          
          // Fix: Mammoth Import Handling for Vite
          // @ts-ignore
          let lib = mammoth;
          // @ts-ignore
          if (lib.default) lib = lib.default;

          if (!lib || !lib.extractRawText) {
             console.error("Mammoth Lib not loaded correctly", lib);
             return "Fehler: Word-Library nicht geladen.";
          }

          const result = await lib.extractRawText({ arrayBuffer: arrayBuffer });
          
          if (result.messages && result.messages.length > 0) {
              console.warn("Word Warnings:", result.messages);
          }
          
          return result.value || "";
      } catch (e) {
          console.error("Word Parse Exception:", e);
          return "";
      }
  }

  /**
   * Extracts text from Excel spreadsheets (.xlsx, .xls) using SheetJS
   */
  static async extractTextFromExcel(file: File | Blob): Promise<string> {
      try {
          const arrayBuffer = await file.arrayBuffer();
          // @ts-ignore
          const wb = XLSX.read(arrayBuffer, { type: 'array' });
          
          let fullText = "";
          // Limit to first 3 sheets
          const limit = Math.min(wb.SheetNames.length, 3);
          
          for(let i=0; i<limit; i++) {
              const sheetName = wb.SheetNames[i];
              const ws = wb.Sheets[sheetName];
              // @ts-ignore
              const txt = XLSX.utils.sheet_to_txt(ws); // Try simple text first
              // @ts-ignore
              const csv = XLSX.utils.sheet_to_csv(ws); // Fallback usually better structure
              
              fullText += `--- Blatt: ${sheetName} ---\n${csv || txt}\n`;
          }
          return fullText;
      } catch (e) {
          console.error("Excel Parse Error:", e);
          return "";
      }
  }

  /**
   * Reads a PDF File from Blob/File and extracts text.
   */
  static async extractTextFromPdf(file: File | Blob): Promise<string> {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
      const pdf = await loadingTask.promise;
      
      let fullText = '';
      const maxPages = Math.min(pdf.numPages, 3); 
      
      for (let i = 1; i <= maxPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        // @ts-ignore
        const pageText = textContent.items.map(item => item.str).join(' ');
        fullText += pageText + ' ';
      }

      // OCR Fallback if empty (Scans)
      if (fullText.trim().length < 50) {
          const page = await pdf.getPage(1);
          const viewport = page.getViewport({ scale: 2.0 });
          const canvas = document.createElement('canvas');
          const context = canvas.getContext('2d');
          
          if (context) {
              canvas.height = viewport.height;
              canvas.width = viewport.width;
              await page.render({ canvasContext: context, viewport: viewport } as any).promise;
              
              const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
              if (blob) {
                  const ocrText = await this.performOCR(blob);
                  fullText += "\n[OCR RESULT]\n" + ocrText;
              }
          }
      }
      
      return fullText;
    } catch (e) {
      console.error("PDF Parse Error:", e);
      return "";
    }
  }

  /**
   * Guess category based on text content
   */
  static categorizeText(text: string, filename: string, userRules: Record<string, string[]> = {}): DocCategory {
    const lowerText = (text + " " + filename).toLowerCase();
    const scores: Record<string, number> = {};

    const addScore = (keyword: string, category: string) => {
        const lowerKey = keyword.toLowerCase();
        if (lowerText.includes(lowerKey)) {
            const points = lowerKey.length;
            scores[category] = (scores[category] || 0) + points;
        }
    };

    // Default Rules
    for (const [keyword, cat] of Object.entries(this.defaultRules)) addScore(keyword, cat);
    // User Rules
    for (const [cat, keywords] of Object.entries(userRules)) {
        if (Array.isArray(keywords)) keywords.forEach(k => addScore(k, cat));
    }

    let bestCat = 'Sonstiges';
    let maxScore = 0;

    for (const [cat, score] of Object.entries(scores)) {
        if (score > maxScore) {
            maxScore = score;
            bestCat = cat;
        }
    }

    return bestCat;
  }

  static extractYear(text: string): string {
    const simpleYear = text.match(/(202[0-9])/);
    return simpleYear ? simpleYear[0] : new Date().getFullYear().toString();
  }

  /**
   * Process a single file into a NoteDocument (Shared Logic)
   * If forcedMetadata is provided, it skips auto-categorization/year guess
   */
  static async processFile(file: File | Blob, userRules: Record<string, string[]> = {}, fileNameOverride?: string, forcedMetadata?: { year?: string, category?: string }): Promise<NoteDocument> {
    const name = fileNameOverride || (file as File).name || 'Unknown';
    const ext = name.split('.').pop()?.toLowerCase() || '';
    let content = "";
    let docType: NoteDocument['type'] = 'other';

    if (file.type === 'application/pdf' || ext === 'pdf') {
        docType = 'pdf';
        content = await this.extractTextFromPdf(file);
    } 
    else if (file.type.startsWith('image/') || ['jpg', 'jpeg', 'png', 'heic'].includes(ext)) {
        docType = 'image';
        content = await this.performOCR(file);
    }
    else if (['doc', 'docx'].includes(ext)) {
        docType = 'word';
        content = await this.extractTextFromWord(file);
        if (!content) content = name;
    }
    else if (['xls', 'xlsx', 'csv'].includes(ext)) {
        docType = 'excel';
        content = await this.extractTextFromExcel(file);
        if (!content) content = name;
    }
    else if (['pages'].includes(ext)) {
        docType = 'word'; 
        content = `Apple Pages: ${name}`;
    }
    else if (['txt', 'md', 'json', 'log'].includes(ext)) {
        docType = 'note';
        try { content = await file.text(); } catch {}
    }
    else {
        content = name;
    }

    const category = forcedMetadata?.category || this.categorizeText(content, name, userRules);
    const year = forcedMetadata?.year || this.extractYear(content) || new Date().getFullYear().toString();
    const id = `doc_${Date.now()}_${Math.random().toString(36).substr(2,5)}`;

    return {
        id,
        title: name,
        type: docType,
        category,
        year,
        created: new Date().toISOString(),
        content: content,
        fileName: name,
        // No filePath for manual uploads, implies local storage only
        tags: [],
        isNew: true
    };
  }

  /**
   * MANUAL IMPORT (Mobile / Non-Vault)
   * SAVES FILE TO INDEXEDDB
   */
  static async processManualUpload(files: FileList, userRules: Record<string, string[]> = {}): Promise<NoteDocument[]> {
      const docs: NoteDocument[] = [];
      for (let i = 0; i < files.length; i++) {
          try {
              const file = files[i];
              const doc = await this.processFile(file, userRules);
              
              // CRITICAL for Mobile: Save binary to DB so we can open it later
              await DBService.saveFile(doc.id, file);
              
              docs.push(doc);
          } catch (e) {
              console.error(`Failed to process ${files[i].name}`, e);
          }
      }
      return docs;
  }

  /**
   * IMPORT FROM ZIP ARCHIVE (Mobile Folder Import)
   */
  static async processArchiveZip(zipFile: File, userRules: Record<string, string[]> = {}): Promise<NoteDocument[]> {
      const zip = await JSZip.loadAsync(zipFile);
      const docs: NoteDocument[] = [];

      for (const [relativePath, entry] of Object.entries(zip.files)) {
          const zipEntry = entry as JSZip.JSZipObject;
          if (zipEntry.dir) continue;
          if (relativePath.includes('__MACOSX') || relativePath.includes('.DS_Store')) continue;
          
          // Try to extract metadata from path: e.g., "_ARCHIVE/2023/Rechnungen/file.pdf"
          const parts = relativePath.split('/');
          const fileName = parts.pop() || relativePath;
          
          let forcedMetadata: { year?: string, category?: string } | undefined = undefined;
          
          // Simple heuristic: if we find a year and a known category in path
          let foundYear = undefined;
          let foundCat = undefined;

          // Check parts for Year
          for(const p of parts) {
             if (p.match(/^202[0-9]$/)) foundYear = p;
          }

          // Check parts for Category
          for(const p of parts) {
             const lowerP = p.toLowerCase();
             // Check against default rules values
             const knownCats = Object.values(this.defaultRules);
             // Or check if path part matches a known category name directly
             if (knownCats.includes(p)) foundCat = p;
             
             // Check keys
             if (!foundCat) {
                 for(const [key, val] of Object.entries(this.defaultRules)) {
                     if (lowerP.includes(key)) { foundCat = val; break; }
                 }
             }
          }

          if (foundYear || foundCat) {
              forcedMetadata = { year: foundYear, category: foundCat };
          }

          try {
              const blob = await zipEntry.async("blob");
              // Create a File-like object or just pass blob
              const doc = await this.processFile(blob, userRules, fileName, forcedMetadata);
              
              // Save to IDB
              await DBService.saveFile(doc.id, blob);
              
              docs.push(doc);
          } catch (e) {
              console.error(`Failed to process zip entry ${relativePath}`, e);
          }
      }
      
      return docs;
  }

  /**
   * Scans Inbox (Desktop Vault only)
   */
  static async scanInbox(
      currentNotes: Record<string, NoteDocument>, 
      userRules: Record<string, string[]> = {}
  ): Promise<{ newDocs: NoteDocument[], movedCount: number }> {
    if (!VaultService.isConnected()) throw new Error("Vault not connected");

    const root = await VaultService.getDirHandle();
    if (!root) throw new Error("No Vault Root");

    // @ts-ignore
    const inboxHandle = await root.getDirectoryHandle('_INBOX', { create: true });
    // @ts-ignore
    const archiveHandle = await root.getDirectoryHandle('_ARCHIVE', { create: true });

    const newDocs: NoteDocument[] = [];
    let movedCount = 0;

    // @ts-ignore
    for await (const entry of inboxHandle.values()) {
        if (entry.kind === 'file' && entry.name !== '.DS_Store') {
            const fileHandle = entry as FileSystemFileHandle;
            const file = await fileHandle.getFile();
            
            if (file.size > 50 * 1024 * 1024) continue;

            try {
                // Reuse processFile logic
                const doc = await this.processFile(file, userRules);
                
                // --- VAULT SPECIFIC: MOVE FILE ---
                // @ts-ignore
                const yearDir = await archiveHandle.getDirectoryHandle(doc.year, { create: true });
                // @ts-ignore
                const catDir = await yearDir.getDirectoryHandle(doc.category, { create: true });
                // @ts-ignore
                const newFileHandle = await catDir.getFileHandle(file.name, { create: true });
                // @ts-ignore
                const writable = await newFileHandle.createWritable();
                await writable.write(file);
                await writable.close();
                // @ts-ignore
                await inboxHandle.removeEntry(file.name);

                // Add path
                doc.filePath = `_ARCHIVE/${doc.year}/${doc.category}/${file.name}`;
                
                newDocs.push(doc);
                movedCount++;

            } catch (err) {
                console.error(`Failed to move ${file.name}`, err);
            }
        }
    }

    return { newDocs, movedCount };
  }

  // ... (Rest of RebuildIndex / Move / Get methods remain same)
  /**
   * Rebuilds Index and forces re-read of content for existing files
   */
  static async rebuildIndexFromVault(): Promise<NoteDocument[]> {
    if (!VaultService.isConnected()) throw new Error("Vault not connected");
    const root = await VaultService.getDirHandle();
    if (!root) throw new Error("No Vault Root");

    const recoveredDocs: NoteDocument[] = [];

    try {
        // @ts-ignore
        const archiveHandle = await root.getDirectoryHandle('_ARCHIVE');
        
        // @ts-ignore
        for await (const yearEntry of archiveHandle.values()) {
            if (yearEntry.kind === 'directory') {
                const year = yearEntry.name;
                const yearHandle = yearEntry as FileSystemDirectoryHandle;
                
                // @ts-ignore
                for await (const catEntry of yearHandle.values()) {
                    if (catEntry.kind === 'directory') {
                        const category = catEntry.name as DocCategory;
                        const catHandle = catEntry as FileSystemDirectoryHandle;

                        // @ts-ignore
                        for await (const fileEntry of catHandle.values()) {
                            if (fileEntry.kind === 'file' && fileEntry.name !== '.DS_Store') {
                                const fileHandle = fileEntry as FileSystemFileHandle;
                                const file = await fileHandle.getFile();
                                const ext = file.name.split('.').pop()?.toLowerCase() || '';
                                
                                let docType: NoteDocument['type'] = 'other';
                                if (['pdf'].includes(ext)) docType = 'pdf';
                                else if (['jpg','jpeg','png','heic'].includes(ext)) docType = 'image';
                                else if (['doc','docx'].includes(ext)) docType = 'word';
                                else if (['pages'].includes(ext)) docType = 'word';
                                else if (['xls','xlsx','csv','numbers'].includes(ext)) docType = 'excel';
                                else if (['txt','md'].includes(ext)) docType = 'note';

                                // FORCE RE-READ CONTENT
                                let content = "";
                                try {
                                    if (docType === 'word' && ['doc', 'docx'].includes(ext)) {
                                        content = await this.extractTextFromWord(file);
                                    } 
                                    else if (docType === 'excel' && ['xls', 'xlsx'].includes(ext)) {
                                        content = await this.extractTextFromExcel(file);
                                    }
                                    else if (docType === 'pdf') {
                                        content = await this.extractTextFromPdf(file);
                                    }
                                } catch (e) {
                                    console.warn("Content Extract Error on Rebuild", e);
                                }

                                if (!content || content.length < 5) content = `Datei: ${file.name}`;

                                const id = `rec_${year}_${category}_${file.name.replace(/\W/g,'')}`;
                                
                                recoveredDocs.push({
                                    id,
                                    title: file.name,
                                    type: docType,
                                    category,
                                    year,
                                    created: new Date(file.lastModified).toISOString(),
                                    content: content,
                                    fileName: file.name,
                                    filePath: `_ARCHIVE/${year}/${category}/${file.name}`,
                                    tags: [],
                                    isNew: false
                                });
                            }
                        }
                    }
                }
            }
        }
    } catch (e) {
        console.warn("Archive Error", e);
    }
    
    return recoveredDocs;
  }

  static async moveFile(doc: NoteDocument, newCategory: DocCategory): Promise<NoteDocument> {
      if (!VaultService.isConnected() || !doc.filePath) return { ...doc, category: newCategory };
      if (doc.category === newCategory) return doc; 

      try {
          const root = await VaultService.getDirHandle();
          if(!root) throw new Error("No Vault");

          const oldBlob = await this.getFileFromVault(doc.filePath);
          if (!oldBlob) throw new Error("Quelldatei nicht gefunden");

          // @ts-ignore
          const archiveHandle = await root.getDirectoryHandle('_ARCHIVE');
          // @ts-ignore
          const yearHandle = await archiveHandle.getDirectoryHandle(doc.year, { create: true });
          // @ts-ignore
          const newCatHandle = await yearHandle.getDirectoryHandle(newCategory, { create: true });
          
          // @ts-ignore
          const newFileHandle = await newCatHandle.getFileHandle(doc.fileName, { create: true });
          // @ts-ignore
          const writable = await newFileHandle.createWritable();
          await writable.write(oldBlob);
          await writable.close();

          const oldPathParts = doc.filePath.split('/'); 
          // @ts-ignore
          const oldCatHandle = await yearHandle.getDirectoryHandle(doc.category);
          // @ts-ignore
          await oldCatHandle.removeEntry(doc.fileName);

          return {
              ...doc,
              category: newCategory,
              filePath: `_ARCHIVE/${doc.year}/${newCategory}/${doc.fileName}`
          };

      } catch (e) {
          console.error("Move File Error", e);
          return doc; 
      }
  }

  static async getFileFromVault(filePath: string): Promise<Blob | null> {
      if (!VaultService.isConnected()) return null;
      if (!filePath) return null;

      try {
          const parts = filePath.split('/');
          let currentDir = await VaultService.getDirHandle();
          
          for (let i = 0; i < parts.length - 1; i++) {
              if(!currentDir) return null;
              // @ts-ignore
              currentDir = await currentDir.getDirectoryHandle(parts[i]);
          }

          // @ts-ignore
          const fileHandle = await currentDir.getFileHandle(parts[parts.length - 1]);
          return await fileHandle.getFile();

      } catch (e) {
          console.error("File fetch failed", e);
          return null;
      }
  }
}
