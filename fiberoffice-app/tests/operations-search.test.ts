import {expect,it} from 'vitest';
import {matchesOperationSearch as matches,operationSearchScore} from '../src/operations-search';
import type {OperationRecord} from '../src/operations-model';
const record={project:'Münster',reference:'12345',street:'Soester Straße',number:'28a',city:'Münster',postcode:'48155',customer:'Jürgen Müller',phone:'+49 173 1234567',phone2:'',nvt:'K2382',appointment:'',date:'2026-11-16',note:'Zugang über Hinterhof',sources:[],overrides:{status:'Fertiggestellt'},attachments:[{name:'Messprotokoll.pdf'}]} as unknown as OperationRecord;
it('finds terms across fields independent of order and German spelling',()=>{
 for(const q of ['28a soester','MUENSTER mueller','Straße 28a','48155','hinterhof','K2382','Messprotokoll','fertiggestellt','16.11.2026'])expect(matches(record,q),q).toBe(true);
 expect(matches(record,'Soester Dortmund')).toBe(false);
});
it('accepts empty queries and telephone formatting',()=>{
 for(const q of ['', '  ', '0173 1234567', '+49 (173) 123-4567','1731234567'])expect(matches(record,q),q).toBe(true);
 expect(matches(record,'0173 9999999')).toBe(false);
});

it('ranks a direct address above incidental source mentions',()=>{
 const other={...record,street:'Andere Straße',number:'4',sources:[{sheet:'Import',row:1,priority:1,status:'',appointment:'',date:'',time:'',note:'',fields:{note:'Soester Straße 28a'}}]} as OperationRecord;
 expect(operationSearchScore(record,'28a Soester Straße Münster')).toBeGreaterThan(operationSearchScore(other,'28a Soester Straße Münster'));
});
