# Checklist funzioni — dal sito di riferimento a Kerf

Ricavata visitando ogni pagina del sito di riferimento (home, /app, /app/pools,
/app/history, /app/status, /docs), aprendo il pannello route, provando filtri,
"Refresh quote", "Simulate exact call", e leggendo le API pubbliche documentate.

Legenda: `[x]` replicato · `[m]` replicato con dati finti (modulo `src/lib/data`)

## Globale
- [x] Link "Salta al contenuto" (skip link)
- [x] Header marketing: logo→home, nav Prodotto / Metodo / Trasparenza / Token / Docs
- [x] Pillola token con contract address abbreviato → sezione token
- [x] Link profilo X
- [x] Pulsante "Apri il terminale"
- [x] Menu mobile (pulsante Menu con pannello a comparsa)
- [x] Footer: tagline, disclaimer legale, nav (Scanner, Docs, Pool, Integrazioni, Storico, Stato, Token, Explorer ↗, X ↗), riga chain + copyright
- [x] Titoli pagina per ogni route, favicon/icona
- [x] Header terminale: nav Scanner / Pool / Storico / Stato / Docs, pillola token, X, pulsante wallet con stato
- [m] Barra di stato terminale: rete, blocco head, gas (gwei), latenza RPC, stato executor

## Home
- [x] Hero: occhiello, titolo, sottotitolo, CTA "Apri il terminale" + "Scopri il metodo", nota "nessun wallet per esplorare"
- [x] Illustrazione a 4 passi (Scan / Simulate / Execute / Verify) con nota "illustrazione"
- [x] 4 sezioni di processo, ognuna con titolo, testo, 3 punti, pannello esplicativo
- [m] Stato executor letto nella sezione Execute
- [x] CTA dopo il processo: terminale + storico
- [m] Anteprima live del terminale: pool e route più vicine alla parità, blocco, spiegazione spread grezzo vs idoneo
- [m] Prodotto: 3 strumenti (Scanner, Simulazione, Esecuzione) con stato live e link
- [m] Trasparenza: 5 capacità (scan, quote, simulate, execute, history) con stato
- [m] Tabella integrazioni (ruolo, stato, dettaglio, link explorer)
- [x] Link a stato live e note integrazioni
- [m] Token: contract address, pulsante Copia, link explorer, stato LIVE, fatti on-chain (nome, simbolo, decimali, supply, mercato) al blocco
- [x] Testo "a cosa NON serve il token"
- [x] CTA finale

## Terminale — Scanner (/app)
- [m] KPI: stime idonee, cicli quotati, candidati classificati, pool instradabili, conversione gas (+ nota sorgente)
- [x] Pulsante "Aggiorna scansione" con stato "Aggiornamento…"
- [x] Filtro regolamento: USDG / WETH
- [x] Filtro pool per ciclo: solo 2 / ≤3 / ≤4
- [x] Filtro asset (select di tutti gli asset verificati)
- [x] Filtro venue: V2 / V3 (toggle)
- [x] "Altri filtri": size min/max, netto stimato min, impatto max (bps), età quote max (s)
- [m] Banner stato: "nessuna route idonea" / "N idonee", badge STALE/FRESCO, rete, blocco, età lettura, nota
- [m] Tabella cicli quotati: route con hop (venue+fee), size, spread grezzo, impatto, risultato quotato, gas stimato, netto stimato, stato, età quote
- [x] Ordinamento per colonna (netto stimato di default)
- [m] Riepilogo "perché le route non sono idonee" con conteggi e spiegazioni
- [m] Pool esclusi dal routing (inattivi, dust, hollow, non sondati, v4) + link esploratore pool
- [x] Selezione riga → pannello route (URL condivisibile con parametri route)
- [x] Pannello route: intestazione route, n. pool, asset di regolamento, pulsante chiudi (anche Esc)
- [m] Badge di stato della route (quote scaduta, risultato negativo, gas > profitto, simulazione fallita, idonea)
- [x] Importo flash con ½× e 2×
- [x] Tolleranza profitto (90/75/50/25 %)
- [x] Deadline (30 s, 1, 2, 5, 10 min)
- [x] Soglia minima di profitto (vuoto = gas stimato)
- [m] "Aggiorna quote" e "Simula chiamata esatta"
- [m] Contabilità costi completa (spread, flash, output, fee pool, fee flash, risultato, fee protocollo, prima del gas, gas, gas nell'asset, netto, minimo richiesto) con blocco/età/scadenza
- [m] Hop per hop (pool, tokenIn→out, importi, tick attraversati)
- [m] Risultato simulazione: esito, modalità, istante, blocco (link), revert decodificato, gas, condizione minimo, deadline residua, calldata
- [x] Invalidazione della simulazione se cambiano importo/tolleranza/deadline/soglia/wallet o se invecchia
- [m] Checklist esecuzione (wallet connesso, rete giusta, executor verificato, gas sufficiente, quote fresca, simulazione coerente)
- [m] "Rivedi ed esegui": conferma, stati transazione (ri-simulata → attesa wallet → inviata → pending → confermata/revertita, rifiutata)
- [x] Avviso "una simulazione riuscita non è una garanzia"

## Terminale — Pool (/app/pools)
- [x] Ricerca (simbolo, nome o indirizzo 0x)
- [x] Filtro asset
- [x] Filtro coppia: Tutte / Stock-quote / Stock-stock / WETH-USDG
- [x] Filtro venue: Tutte / V2 / V3
- [m] Filtro idoneità con conteggi (instradabile, inattivo, dust, hollow, non sondato, senza valore USD)
- [m] Tabella pool: coppia, venue+fee, prezzo spot, prezzo USD, profondità +1 %, esito probe, stato, link explorer
- [x] Pulsante aggiorna
- [m] Sezione pool v4 "elencati, non supportati" con spiegazione, checkbox "includi fee LP > 10 %", tabella paginata

## Terminale — Storico (/app/history)
- [x] Toggle "Il mio wallet" / "Tutte le esecuzioni"
- [m] Tabella esecuzioni: ora, chiamante, route/pool, importo, proventi, fee, gas, netto (solo se stesso asset), stato conferma (L2 / safe / finalizzato), tx link
- [x] Export CSV (unità base esatte)
- [x] Paginazione
- [x] Stato vuoto se nessuna esecuzione / wallet non connesso

## Terminale — Stato (/app/status)
- [m] Rete: nome, chainId, tipo RPC, explorer, head/safe/finalized con età, gas price, latenza
- [m] Adattatori (V2, V3, v4) con stato e dettaglio
- [m] Executor: indirizzo, versione, fee protocollo, pausa, owner, fee recipient, controlli ✓/✕
- [m] Modalità simulazione
- [m] Provenienza registro (rete, DEX, token, snapshot pool, snapshot v4, oracoli)
- [x] Pulsante aggiorna

## Docs (/docs)
- [x] Indice laterale con 12 sezioni e ancore (sticky su desktop, a scorrimento su mobile)
- [x] Panoramica, Rete (tabella), Asset e pool, Prezzi e quote, Contabilità costi (tabella), Simulazione, Executor, Transazioni e storico, Integrazioni (tabella), Token, Limiti, Interfaccia sviluppatori (firma contratto + tabella endpoint)

## API (stessa interfaccia per sviluppatori)
- [m] GET /api/markets
- [m] GET /api/pools/v4
- [m] GET /api/routes?settlement=&maxHops=&token=
- [m] POST /api/quote (con `simulate: true`)
- [m] GET /api/activity?caller=&page=&limit=
- [m] GET /api/status
- [m] GET /api/token

## Stato finale
Tutte le voci sopra sono spuntate: `[x]` funziona così com'è, `[m]` funziona con i dati demo di `src/lib/data/mock.ts` e passa al backend reale impostando `KERF_DATA_SOURCE=http`.

## Non replicato (vedi README)
- Letture on-chain reali (multicall, QuoterV2, eth_call, eth_estimateGas, eventi, tag safe/finalized): sostituite dal modulo dati.
- Invio reale della transazione all'executor: `src/lib/execution.ts` simula gli stati.
- Il contratto executor e il token stesso (non fanno parte del sito).
