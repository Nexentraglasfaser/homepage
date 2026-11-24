import {it,expect,vi} from 'vitest';
import {dayJobs,berlinToday} from '../src/StaffDay';
import type {OperationRecord} from '../src/operations-model';
const job=(id:string,date:string,time:string,extra:Partial<OperationRecord>={})=>({id,date,time,appointment:'Terminiert',overrides:{},project:'Dortmund',street:'Testweg',number:id,...extra} as OperationRecord);
it('shows all list appointments, including completed jobs, with overrides and time ordering',()=>{
 const rows=[job('1','2026-11-24','10:00'),job('2','2026-11-24','08:00',{overrides:{status:'Fertiggestellt'}}),job('3','2026-11-23','07:00'),job('4','2026-11-24','09:00',{overrides:{date:''}}),job('5','2026-11-24','09:00',{project:'Münster'})];
 expect(dayJobs(rows,'2026-11-24','').map(r=>r.id)).toEqual(['2','5','1']);
 expect(dayJobs(rows,'2026-11-24','Dortmund').map(r=>r.id)).toEqual(['2','1']);
});
it('uses the German working date at midnight independent of the device timezone',()=>{vi.useFakeTimers();try{vi.setSystemTime(new Date('2026-11-22T23:30:00Z'));expect(berlinToday()).toBe('2026-11-23');}finally{vi.useRealTimers();}});

it('exports only selected-day jobs and keeps site directions and technical notes',async()=>{
 const {makeAppointmentPdf}=await import('../src/operations-export');
 const rows=[job('11','2026-11-24','09:30',{customer:'Testkontakt',phone:'0123456',phone2:'',nvt:'5',pipe:'blau',units:'3',note:'NVT-STANDORT: Am Suedpark 39; Kassette A1; Faser 1',conflicts:[]}),job('12','2026-11-25','10:00'),job('13','2026-11-24','11:00',{project:'Muenster'})];
 const pdf=await makeAppointmentPdf(dayJobs(rows,'2026-11-24','Dortmund'));
 const body=pdf.output();expect(body).toContain('Testkontakt');expect(body).toContain('NVT-STANDORT: Am Suedpark 39');expect(body).toContain('Kassette A1');expect(body).not.toContain('Testweg 12');expect(body).not.toContain('Testweg 13');
});
