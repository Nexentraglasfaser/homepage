import {describe,it,expect} from 'vitest';
import {appointmentTimes,plannedAppointment,compareAppointments} from '../src/operations-appointments';
import {isScheduled,type OperationRecord} from '../src/operations-model';
import {makeAppointmentPdf} from '../src/operations-export';
const record=(appointment='',date='2026-11-17',time='')=>({id:'test',project:'Dortmund',street:'Teststraße',number:'1',date,time,appointment,overrides:{},sources:[],conflicts:[],history:[],note:'',phone:'',phone2:'',customer:'',reference:'',nvt:'',pipe:'',units:'',ne4:''} as unknown as OperationRecord);
describe('appointment planning',()=>{
 it('reads existing windows and single starts',()=>{expect(appointmentTimes(record('Bestätigt: 9:10–10:00 Uhr'))).toEqual({start:'09:10',end:'10:00'});expect(appointmentTimes(record('ab 13:00 Uhr'))).toEqual({start:'13:00',end:''});});
 it('persists edits through the existing audited field, including cleared times',()=>{const r=record('alt 09:00–10:00','','11:00');r.overrides={date:'2026-11-18',appointment:plannedAppointment('2026-11-18','14:00','14:50','Zugang durch Mieter')};expect(appointmentTimes(r)).toEqual({start:'14:00',end:'14:50'});expect(isScheduled(r)).toBe(true);r.overrides.appointment=plannedAppointment('2026-11-18','','','Alt: 09:00');expect(appointmentTimes(r).start).toBe('');});
 it('validates date and time range',()=>{expect(()=>plannedAppointment('','09:00','','')).toThrow();expect(()=>plannedAppointment('2026-11-18','10:00','09:00','')).toThrow();});
 it('sorts dates then times, missing times last',()=>{const a=record('14:00'),b=record('08:00'),c=record(''),d=record('16:00','2026-11-16');expect([a,c,b,d].sort(compareAppointments)).toEqual([d,b,a,c]);});
 it('creates a chronological crew PDF',async()=>{const pdf=await makeAppointmentPdf([record('14:00'),record('08:00')]);const body=pdf.output();expect(body.startsWith('%PDF-')).toBe(true);expect(body.indexOf('08:00')).toBeLessThan(body.indexOf('14:00'));});
});
