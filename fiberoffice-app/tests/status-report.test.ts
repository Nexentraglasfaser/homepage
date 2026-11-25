import {it,expect} from 'vitest';
import {createStatusReport,reportState} from '../src/status-report';
import type {OperationRecord,OperationStatus} from '../src/operations-model';
const row=(status:OperationStatus)=>({project:'Musterstadt',street:'Musterweg',number:'1',units:'4',note:'',overrides:{status,actualUnits:'2',meterStart:'6000',meterEnd:'5800'}} as OperationRecord);
it('kennzeichnet Fehler, Teilleistung und Abschluss unabhängig von der Kabellänge',()=>{
 expect(reportState(row('Fehlerstelle')).ink).toBe('#BD161C');
 expect(reportState(row('Teilleistung')).ink).toBe('#805900');
 expect(reportState(row('Fertiggestellt')).ink).toBe('#226641');
});
it('erstellt einen projektbezogenen Tagesbericht mit Folgeseiten bei langen Bemerkungen',()=>{
 const r=row('Teilleistung');r.note='Dokumentierter Arbeitsschritt. '.repeat(500);
 const {pdf,name}=createStatusReport([r,row('Fertiggestellt')],'2026-11-25');
 expect(pdf.getNumberOfPages()).toBeGreaterThan(1);expect(name).toBe('Statusmeldung_Musterstadt_25.11.2026.pdf');
 expect(()=>createStatusReport([r,{...r,project:'Anderes Projekt'}],'2026-11-25')).toThrow();
});

it('gibt nur die berechnete Strecke in der fertigen PDF aus',()=>{
 const {pdf}=createStatusReport([row('Fertiggestellt')],'2026-11-25');
 const page=(pdf.internal as typeof pdf.internal & {pages:string[][]}).pages[1].join('\n');
 expect(page).toContain('Eingeblasene Strecke: 200 m');
 expect(page).not.toMatch(/6000 m|5800 m|Kabelzähler/);
});
