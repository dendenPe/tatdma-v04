
import { PortfolioYear, PortfolioPosition, DayEntry, Trade, SalaryEntry } from '../types';

export class ImportService {
  
  // --- HELPER: CSV Zeile splitten (beachtet Anführungszeichen) ---
  private static splitCSV(str: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuote = false;
    for (let i = 0; i < str.length; i++) {
      const char = str[i];
      if (char === '"') {
        inQuote = !inQuote;
      } else if ((char === ',' || char === ';') && !inQuote) { // Support both comma and semicolon
        result.push(current.trim().replace(/^"|"$/g, ''));
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim().replace(/^"|"$/g, ''));
    return result;
  }

  private static parseNum(str: any): number {
    if (!str) return 0;
    // Remove ' and spaces
    let s = String(str).replace(/'/g, '').replace(/\s/g, '').trim();
    if (!s || s === '-' || s === '--') return 0;
    
    // Handle German format (1.000,00) vs US format (1,000.00) heuristic
    // If comma exists and is the last separator, replace with dot
    if (s.includes(',') && !s.includes('.')) {
        s = s.replace(',', '.');
    } else if (s.includes(',') && s.includes('.')) {
        // Assume 1.000,00 -> remove dot, replace comma
        if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
             s = s.replace(/\./g, '').replace(',', '.');
        } 
        // Assume 1,000.00 -> remove comma
        else {
             s = s.replace(/,/g, '');
        }
    }
    
    return parseFloat(s.replace(/[^\d.-]/g, '')) || 0;
  }

  // --- SALARY PARSER ---
  static parseSalaryCSV(csvText: string): Record<string, Record<string, SalaryEntry>> {
    console.log("🚀 Starte Salary CSV Parser...");
    const lines = csvText.split('\n');
    const result: Record<string, Record<string, SalaryEntry>> = {};
    
    if (lines.length < 2) return result;

    // Detect Headers
    const headerLine = lines[0];
    const headers = this.splitCSV(headerLine).map(h => h.toLowerCase().trim());
    
    // Mapping helper
    const findIdx = (keywords: string[]) => headers.findIndex(h => keywords.some(k => h.includes(k)));

    const colMap = {
        year: findIdx(['jahr', 'year']),
        month: findIdx(['monat', 'month']),
        monatslohn: findIdx(['monatslohn', 'grundlohn', 'salary']),
        familienzulage: findIdx(['familienzulage', 'kinderzulage', 'fazu']),
        pauschalspesen: findIdx(['pauschal', 'spesen']),
        aufrechnung: findIdx(['aufrechnung', 'privatanteil']),
        brutto: findIdx(['brutto', 'gross']),
        ahv: findIdx(['ahv', 'iv', 'eo']),
        alv: findIdx(['alv']),
        sozialfond: findIdx(['sozialfond', 'ktg', 'krankentaggeld']), // Often grouped
        bvg: findIdx(['bvg', 'pensionskasse', 'pk']),
        quellensteuer: findIdx(['quellensteuer', 'qst', 'tax']),
        abzuege: findIdx(['abzüge', 'deductions']),
        netto: findIdx(['netto', 'net']),
        korrektur: findIdx(['korrektur', 'correction']),
        auszahlung: findIdx(['auszahlung', 'payout']),
        kommentar: findIdx(['kommentar', 'bemerkung', 'comment'])
    };

    // Helper to normalize months (1, 01, Jan, Januar -> 01)
    const normalizeMonth = (m: string): string => {
        m = m.toLowerCase().trim();
        if (!isNaN(parseInt(m))) return String(parseInt(m)).padStart(2, '0');
        if (m.startsWith('jan')) return '01';
        if (m.startsWith('feb')) return '02';
        if (m.startsWith('mär') || m.startsWith('mar')) return '03';
        if (m.startsWith('apr')) return '04';
        if (m.startsWith('mai') || m.startsWith('may')) return '05';
        if (m.startsWith('jun')) return '06';
        if (m.startsWith('jul')) return '07';
        if (m.startsWith('aug')) return '08';
        if (m.startsWith('sep')) return '09';
        if (m.startsWith('okt') || m.startsWith('oct')) return '10';
        if (m.startsWith('nov')) return '11';
        if (m.startsWith('dez') || m.startsWith('dec')) return '12';
        return '00';
    };

    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        const cols = this.splitCSV(line);

        // Get Year and Month
        const year = colMap.year > -1 ? cols[colMap.year] : new Date().getFullYear().toString();
        const monthRaw = colMap.month > -1 ? cols[colMap.month] : '';
        const monthKey = normalizeMonth(monthRaw);

        if (monthKey === '00' || !year) continue;

        if (!result[year]) result[year] = {};

        const entry: SalaryEntry = {
            monatslohn: colMap.monatslohn > -1 ? this.parseNum(cols[colMap.monatslohn]) : 0,
            familienzulage: colMap.familienzulage > -1 ? this.parseNum(cols[colMap.familienzulage]) : 0,
            pauschalspesen: colMap.pauschalspesen > -1 ? this.parseNum(cols[colMap.pauschalspesen]) : 0,
            aufrechnung: colMap.aufrechnung > -1 ? this.parseNum(cols[colMap.aufrechnung]) : 0,
            brutto: colMap.brutto > -1 ? this.parseNum(cols[colMap.brutto]) : 0,
            ahv: colMap.ahv > -1 ? Math.abs(this.parseNum(cols[colMap.ahv])) : 0,
            alv: colMap.alv > -1 ? Math.abs(this.parseNum(cols[colMap.alv])) : 0,
            sozialfond: colMap.sozialfond > -1 ? Math.abs(this.parseNum(cols[colMap.sozialfond])) : 0,
            bvg: colMap.bvg > -1 ? Math.abs(this.parseNum(cols[colMap.bvg])) : 0,
            quellensteuer: colMap.quellensteuer > -1 ? Math.abs(this.parseNum(cols[colMap.quellensteuer])) : 0,
            abzuege: colMap.abzuege > -1 ? Math.abs(this.parseNum(cols[colMap.abzuege])) : 0,
            netto: colMap.netto > -1 ? this.parseNum(cols[colMap.netto]) : 0,
            korrektur: colMap.korrektur > -1 ? this.parseNum(cols[colMap.korrektur]) : 0,
            auszahlung: colMap.auszahlung > -1 ? this.parseNum(cols[colMap.auszahlung]) : 0,
            kommentar: colMap.kommentar > -1 ? cols[colMap.kommentar] : '',
        };

        // Recalculate logic to ensure consistency if columns were missing
        const calcBrutto = entry.brutto || (entry.monatslohn + entry.familienzulage + entry.pauschalspesen + entry.aufrechnung);
        const calcAbzuege = entry.abzuege || (entry.ahv + entry.alv + entry.sozialfond + entry.bvg + entry.quellensteuer);
        
        entry.brutto = calcBrutto;
        entry.abzuege = calcAbzuege;
        if (!entry.netto) entry.netto = calcBrutto - calcAbzuege;
        if (!entry.auszahlung) entry.auszahlung = entry.netto + entry.korrektur;

        result[year][monthKey] = entry;
    }

    return result;
  }

  // --- PORTFOLIO PARSER (HOLDINGS) ---
  static parseIBKRPortfolioCSV(csvText: string, currentRates: Record<string, number>): PortfolioYear {
    console.log("🚀 Starte IBKR Parser (Tax Edition)...");
    const lines = csvText.split('\n');
    let reportStartDate = '';
    let reportEndDate = '';
    
    // Kopie der Rates erstellen
    const newRates = { ...currentRates };

    // Suche nach Datum
    for (let i = 0; i < Math.min(lines.length, 20); i++) {
        const line = lines[i].trim();
        if (line.includes('Statement,Header')) {
            const parts = line.split(',');
            for (let j = 0; j < parts.length; j++) {
                if (parts[j].includes('Period') && parts[j+1]) {
                    const dateRange = parts[j+1].trim();
                    const match = dateRange.match(/(\d{4}-\d{2}-\d{2})\s*-\s*(\d{4}-\d{2}-\d{2})/);
                    if (match) {
                        reportStartDate = match[1];
                        reportEndDate = match[2];
                    }
                }
            }
        }
    }

    const positions: Record<string, PortfolioPosition> = {};
    const cash: Record<string, number> = {};
    let totalDividendsUSD = 0;
    let totalWithholdingTaxUSD = 0;
    
    let colMap: Record<string, number> = {}; 
    let currentSection = "";

    const getIdx = (keys: string[]) => {
        for (const key of keys) if (colMap.hasOwnProperty(key)) return colMap[key];
        return -1;
    };

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        const cols = this.splitCSV(line);
        if (cols.length < 3) continue;

        if (cols[1] === 'Header') {
            currentSection = cols[0].trim();
            colMap = {}; 
            for (let c = 2; c < cols.length; c++) colMap[cols[c].trim()] = c;
            continue; 
        }

        if (cols[1] === 'Data') {
            // 1. POSITIONEN (Offene)
            if (currentSection === "Offene Positionen" || currentSection === "Open Positions") {
                const idxCat = getIdx(['Vermögenswertkategorie', 'Asset Class']);
                if (idxCat > -1 && cols[idxCat] !== 'Aktien' && cols[idxCat] !== 'Stocks') continue;

                const idxSym = getIdx(['Symbol']);
                if (idxSym > -1) {
                    const sym = cols[idxSym];
                    if (!sym || sym.startsWith('Total') || sym === 'Gesamt') continue;

                    if (!positions[sym]) {
                        positions[sym] = { 
                            symbol: sym, qty: 0, val: 0, unReal: 0, real: 0, cost: 0, close: 0, currency: 'USD' 
                        };
                    }
                    
                    const idxQty = getIdx(['Menge', 'Quantity']);
                    const idxVal = getIdx(['Wert', 'Value']);
                    const idxUnreal = getIdx(['Unrealisierter G/V', 'Unrealized PnL']);
                    const idxCost = getIdx(['Einstands Kurs', 'Cost Price', 'Kostenbasis', 'Cost Basis']);
                    const idxPrice = getIdx(['Schlusskurs', 'Close Price']);
                    const idxCurr = getIdx(['Währung', 'Currency']);

                    if (idxQty > -1) positions[sym].qty = this.parseNum(cols[idxQty]);
                    if (idxVal > -1) positions[sym].val = this.parseNum(cols[idxVal]);
                    if (idxUnreal > -1) positions[sym].unReal = this.parseNum(cols[idxUnreal]);
                    if (idxCost > -1) positions[sym].cost = this.parseNum(cols[idxCost]);
                    if (idxPrice > -1) positions[sym].close = this.parseNum(cols[idxPrice]);
                    if (idxCurr > -1) positions[sym].currency = cols[idxCurr];
                }
            }

            // 1b. REALISIERTE PERFORMANCE (Geschlossene Positionen erfassen)
            else if (currentSection.includes('realisierten und unrealisierten Performance') || currentSection === "Realized & Unrealized Performance Summary") {
                 const idxSym = getIdx(['Symbol']);
                 const idxReal = getIdx(['Realisiert Gesamt', 'Realized Total', 'Total Realized']);
                 
                 if (idxSym > -1 && idxReal > -1) {
                     const sym = cols[idxSym];
                     const real = this.parseNum(cols[idxReal]);
                     
                     if (sym && sym !== 'Gesamt' && !sym.startsWith('Total') && sym !== 'Total') {
                         if (!positions[sym]) {
                             // Wenn Position nicht existiert (da Menge 0), neu anlegen als geschlossen
                             positions[sym] = { 
                                 symbol: sym, qty: 0, val: 0, unReal: 0, real: real, cost: 0, close: 0, currency: 'USD' // PnL Summary ist meist in Base Currency (USD)
                             };
                         } else {
                             // Existierende Position updaten
                             positions[sym].real = real;
                         }
                     }
                 }
            }

            // 2. CASH REPORT (Strict Filtering)
            else if (currentSection.includes("Bargeld") || currentSection === "Cash-Bericht" || currentSection === "Cash Report") {
                const idxDesc = getIdx(['Währungsübersicht', 'Feldname', 'Beschreibung', 'Field Name', 'Description']);
                const idxCurr = getIdx(['Währung', 'Currency']);
                const idxAmount = getIdx(['Gesamt', 'Total', 'Schlusssaldo', 'Ending Cash']);
                
                if (idxCurr > -1 && idxAmount > -1) {
                    const desc = idxDesc > -1 ? cols[idxDesc] : '';
                    const curr = cols[idxCurr];
                    const amount = this.parseNum(cols[idxAmount]);
                    
                    // Filter: Nur Zeilen, die wirklich den Endsaldo beschreiben
                    const isEndingBalance = desc.includes('Endbarsaldo') || desc.includes('Ending Cash') || desc.includes('Ending Settled Cash');

                    if (isEndingBalance && curr && curr.length === 3 && amount !== 0 && !curr.includes('Base')) {
                        cash[curr] = amount;
                        
                        // Check for missing rates
                        if (curr !== 'USD') {
                            const pairKey = `${curr}_USD`;
                            if (newRates[pairKey] === undefined) {
                                newRates[pairKey] = 0; 
                            }
                        }
                    }
                }
            }

            // 3. DEVISENPOSITIONEN / FOREX POSITIONS (For Rates)
            else if (currentSection === "Devisenpositionen" || currentSection === "Forex Positions") {
                 const idxAsset = getIdx(['Beschreibung', 'Description', 'Symbol']); // Usually holds 'CHF', 'JPY'
                 const idxRate = getIdx(['Schlusskurs', 'Close Price', 'Close']);
                 
                 if (idxAsset > -1 && idxRate > -1) {
                     const assetCurr = cols[idxAsset]; // e.g. "CHF"
                     const rate = this.parseNum(cols[idxRate]); // e.g. 1.2613
                     
                     if (assetCurr && rate && assetCurr !== 'USD' && assetCurr.length === 3) {
                          newRates[`${assetCurr}_USD`] = rate;
                     }
                 }
            }

            // 4. WECHSELKURSE (Legacy Fallback)
            else if (currentSection === "Wechselkurse" || currentSection === "Exchange Rates") {
                 const idxFrom = getIdx(['Währung', 'Currency']); 
                 const idxRate = getIdx(['Rate', 'Kurs']); 
                 if (idxFrom > -1 && idxRate > -1) {
                     const curr = cols[idxFrom];
                     const rate = this.parseNum(cols[idxRate]);
                     if (curr && rate && curr !== 'USD') {
                         newRates[`${curr}_USD`] = rate;
                     }
                 }
            }

            // 5. DIVIDENDEN & STEUERN
            else if (currentSection === "Cash-Bericht" || currentSection === "Veränderung des NAV" || currentSection === "Change in NAV") {
                const idxDesc = getIdx(['Währungsübersicht', 'Feldname', 'Beschreibung', 'Field Name', 'Description']);
                const idxVal = getIdx(['Betrag', 'Feldwert', 'Value', 'Amount']); 
                const valColIndex = idxVal > -1 ? idxVal : 3; 
                
                if (idxDesc > -1) {
                    const desc = cols[idxDesc];
                    const val = this.parseNum(cols[valColIndex]);
                    
                    // Dividenden
                    if ((desc.includes('Dividenden') || desc.includes('Dividends')) && !desc.includes('Zahlung anstelle')) {
                        if(val > 0) totalDividendsUSD += val;
                    }
                    else if (desc.includes('Zahlung anstelle von Dividenden') || desc.includes('Payment in Lieu')) {
                         if(val > 0) totalDividendsUSD += val;
                    }

                    // Steuern
                    if (desc.includes('Quellensteuer') || desc.includes('Withholding Tax')) {
                        totalWithholdingTaxUSD += Math.abs(val);
                    }
                }
            }
        }
    }

    // Summary calculation (Applying Rates)
    let totalValue = 0;
    let totalUnreal = 0;
    let totalRealized = 0;

    Object.values(positions).forEach(p => {
        let rate = 1;
        // Apply rate only for value calculation if not USD. 
        // Note: Realized PnL from summary section is typically already in Base (USD).
        if (p.currency !== 'USD') {
            rate = newRates[`${p.currency}_USD`] || 0;
        }
        
        totalValue += p.val * rate;
        totalUnreal += p.unReal * rate;
        totalRealized += p.real; // Realized PnL usually imported as USD from summary
    });

    return {
        positions,
        cash,
        summary: {
            totalValue,
            unrealized: totalUnreal,
            realized: totalRealized,
            dividends: totalDividendsUSD,
            tax: totalWithholdingTaxUSD
        },
        lastUpdate: new Date().toISOString(),
        exchangeRates: newRates
    };
  }

  // --- TRADES PARSER (FUTURES - FIFO MATCHING) ---
  static parseIBKRTradesCSV(csvText: string): Record<string, DayEntry> {
    const rows = csvText.split('\n').map(r => r.trim()).filter(r => r);
    if (rows.length < 2) return {};

    // 1. Header parsing to find indices
    const header = rows[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
    
    // Map column names to indices
    const colIdx = {
      symbol: header.findIndex(h => h === 'Symbol'),
      side: header.findIndex(h => h === 'Side'),
      qty: header.findIndex(h => h === 'Qty'),
      price: header.findIndex(h => h === 'Fill Price'),
      time: header.findIndex(h => h === 'Time'),
      netAmount: header.findIndex(h => h === 'Net Amount'),
      commission: header.findIndex(h => h === 'Commission')
    };

    if (colIdx.time === -1 || colIdx.price === -1 || colIdx.side === -1) {
       console.error("Critical columns missing in CSV");
       return {};
    }

    interface Execution {
      symbol: string;
      side: 'Buy' | 'Sell';
      qty: number;
      price: number;
      time: Date;
      fee: number;
      multiplier: number;
      contract: string; // "Mar20 '26"
    }

    // 2. Parse all raw executions
    const executions: Execution[] = [];
    
    for(let i=1; i<rows.length; i++) {
        const cols = this.splitCSV(rows[i]);
        if (cols.length < 5) continue;

        const timeStr = cols[colIdx.time];
        const dateObj = new Date(timeStr);
        if(isNaN(dateObj.getTime())) continue;

        const contract = cols[colIdx.symbol];
        const side = cols[colIdx.side] as 'Buy' | 'Sell';
        const qty = Math.abs(parseFloat(cols[colIdx.qty]));
        const price = parseFloat(cols[colIdx.price]);
        const netAmount = parseFloat(cols[colIdx.netAmount]); // Cash Value
        const fee = parseFloat(cols[colIdx.commission] || '0');

        // Detect Multiplier: NetAmount / (Price * Qty). 
        // e.g., 345300 / (6906 * 1) = 50.
        let multiplier = 1;
        if (price > 0 && qty > 0 && netAmount !== 0) {
           multiplier = Math.abs(Math.round(Math.abs(netAmount) / (price * qty)));
        }

        // Detect Instrument Symbol from Multiplier/Price
        // Standard NQ is 20, ES is 50, MES is 5, MNQ is 2.
        let symbol = contract; // Default
        if (multiplier === 50) symbol = "ES";
        else if (multiplier === 20) symbol = "NQ";
        else if (multiplier === 5) symbol = "MES";
        else if (multiplier === 2) symbol = "MNQ";

        executions.push({
            symbol,
            contract,
            side,
            qty,
            price,
            time: dateObj,
            fee,
            multiplier
        });
    }

    // 3. Sort executions by time (ASC) to play them back
    executions.sort((a, b) => a.time.getTime() - b.time.getTime());

    // 4. Group by Day for the output
    const days: Record<string, DayEntry> = {};
    
    // 5. FIFO Matching Logic per Symbol
    // We need to maintain Open Positions across the entire CSV timeline, 
    // but the app stores data PER DAY. 
    // Simplified Approach: We try to match trades occurring ON THE SAME DAY.
    // Leftover opens are logged as "Open Positions".
    
    const openLongs: Record<string, Execution[]> = {}; // Key: Symbol
    const openShorts: Record<string, Execution[]> = {};

    executions.forEach(ex => {
        const dateKey = ex.time.toISOString().split('T')[0];
        if (!days[dateKey]) {
            days[dateKey] = {
                total: 0,
                note: '',
                trades: [],
                screenshots: [],
                fees: 0
            };
        }

        // Add fee to day total immediately
        days[dateKey].fees = (days[dateKey].fees || 0) + ex.fee;
        
        // Prepare Stack Keys
        if (!openLongs[ex.symbol]) openLongs[ex.symbol] = [];
        if (!openShorts[ex.symbol]) openShorts[ex.symbol] = [];

        let qtyToMatch = ex.qty;

        if (ex.side === 'Buy') {
            // Check if we have shorts to cover (Buy to Cover)
            const shorts = openShorts[ex.symbol];
            
            while (qtyToMatch > 0 && shorts.length > 0) {
                const openShort = shorts[0]; // FIFO: Take first
                const matchQty = Math.min(qtyToMatch, openShort.qty);
                
                // Calculate PnL: (Sell Price - Buy Price) * Qty * Mult
                const pnl = (openShort.price - ex.price) * matchQty * ex.multiplier;
                
                // Create Trade Record
                const trade: Trade = {
                   pnl: pnl,
                   fee: (openShort.fee * (matchQty/openShort.qty)) + (ex.fee * (matchQty/ex.qty)), // Pro-rated fees
                   inst: ex.symbol,
                   qty: matchQty,
                   start: openShort.time.toTimeString().slice(0, 5),
                   end: ex.time.toTimeString().slice(0, 5),
                   tag: 'Match',
                   strategy: 'Short-Cont.' // Covered a short
                };
                days[dateKey].trades.push(trade);
                days[dateKey].total += pnl;

                // Adjust quantities
                qtyToMatch -= matchQty;
                openShort.qty -= matchQty;
                if (openShort.qty < 0.0001) shorts.shift(); // Remove fully closed
            }

            // If still qty left, it's a new Long Open
            if (qtyToMatch > 0) {
                openLongs[ex.symbol].push({ ...ex, qty: qtyToMatch });
            }

        } else { // Sell
            // Check if we have longs to sell (Sell to Close)
            const longs = openLongs[ex.symbol];
            
            while (qtyToMatch > 0 && longs.length > 0) {
                const openLong = longs[0]; // FIFO
                const matchQty = Math.min(qtyToMatch, openLong.qty);
                
                // Calculate PnL: (Sell Price - Buy Price) * Qty * Mult
                const pnl = (ex.price - openLong.price) * matchQty * ex.multiplier;
                
                const trade: Trade = {
                   pnl: pnl,
                   fee: (openLong.fee * (matchQty/openLong.qty)) + (ex.fee * (matchQty/ex.qty)),
                   inst: ex.symbol,
                   qty: matchQty,
                   start: openLong.time.toTimeString().slice(0, 5),
                   end: ex.time.toTimeString().slice(0, 5),
                   tag: 'Match',
                   strategy: 'Long-Cont.' // Closed a long
                };
                days[dateKey].trades.push(trade);
                days[dateKey].total += pnl;

                qtyToMatch -= matchQty;
                openLong.qty -= matchQty;
                if (openLong.qty < 0.0001) longs.shift();
            }

            if (qtyToMatch > 0) {
                openShorts[ex.symbol].push({ ...ex, qty: qtyToMatch });
            }
        }
    });

    // 6. Final Clean up
    Object.keys(days).forEach(d => {
       days[d].total = days[d].total - (days[d].fees || 0);
    });

    return days;
  }
}
