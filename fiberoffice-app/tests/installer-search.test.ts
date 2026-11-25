import {expect,it} from 'vitest';
import {matchesInstallerFilters} from '../src/installer-search';
import type {OperationRecord,OperationStatus} from '../src/operations-model';

function address(status:OperationStatus, appointment = '', project = 'Recklinghausen-Süd') {
 return {project, street:'Testweg', number:'7', sources:[], overrides:{status}, appointment, date:'',note:''} as unknown as OperationRecord;
}
it('kombiniert Projekt, offene Adressen ohne Termin und Textsuche',()=>{
 const rows=[address('Offen'),address('Offen','Terminiert'),address('Offen','Termin abgesagt'),address('Fehlerstelle'),address('Fertiggestellt'),address('Offen','','Münster')];
 expect(rows.filter(r=>matchesInstallerFilters(r,'Recklinghausen-Süd','Offen · ohne Termin','Testweg 7'))).toEqual([rows[0],rows[2]]);
 expect(matchesInstallerFilters(rows[0],'','Offen','Unbekannt')).toBe(false);
 expect(rows.filter(r=>matchesInstallerFilters(r,'','Alle Status',''))).toHaveLength(6);
});
it('unterscheidet offene Termine, terminierte Fehlerstellen und erledigte Anschlüsse mit Alttermin',()=>{
 const rows=[address('Offen','Terminiert'),address('Fehlerstelle','Terminiert'),address('Fertiggestellt','Terminiert')];
 expect(rows.filter(r=>matchesInstallerFilters(r,'','Offen · terminiert',''))).toEqual([rows[0]]);
 expect(rows.filter(r=>matchesInstallerFilters(r,'','Terminiert',''))).toEqual(rows.slice(0,2));
 expect(rows.filter(r=>matchesInstallerFilters(r,'','Fehlerstelle',''))).toEqual([rows[1]]);
 expect(rows.filter(r=>matchesInstallerFilters(r,'','Abgeschlossen',''))).toEqual([rows[2]]);
});

it('zeigt bei Spontanmontage nur offene Adressen ohne Termin oder hinterlegtes Datum im gewählten Projekt', async()=>{
 const {spontaneousJobs}=await import('../src/installer-search');
 const open=address('Offen');
 const rows=[open,address('Terminiert'),{...open,date:'2026-11-26'},address('Fehlerstelle'),address('Fertiggestellt'),address('Offen','','Münster')];
 expect(spontaneousJobs(rows,'Recklinghausen-Süd')).toEqual([open]);
 expect(spontaneousJobs(rows,'')).toEqual([]);
});
