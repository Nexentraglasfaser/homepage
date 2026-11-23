import {it,expect} from 'vitest';
import {isScheduled,type OperationRecord} from '../src/operations-model';
const record=(status:string,appointment:string)=>({project:'Münster',date:'',appointment:'',overrides:{status,date:'2026-11-23',appointment}} as OperationRecord);
it('shows explicitly scheduled jobs with free-text appointment notes',()=>{
 expect(isScheduled(record('Terminiert','23.11.2026, 11:00 Uhr – verbindlich bestätigt; Zugang geklärt.'))).toBe(true);
 expect(isScheduled(record('Intern geplant','23.11.2026 – flexibel zum Anklingeln, keine feste Kundenuhrzeit.'))).toBe(true);
});
it('continues excluding cancelled and completed jobs from the pending appointments list',()=>{
 expect(isScheduled(record('Terminiert','Termin abgesagt'))).toBe(false);
 expect(isScheduled(record('Fertiggestellt','Termin bestätigt'))).toBe(false);
 expect(isScheduled(record('Storniert','Termin bestätigt'))).toBe(false);
});
