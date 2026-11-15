import {appointmentDate,classify,recordNote,type OperationRecord} from './operations-model';

export function normalizeSearch(value:string):string {
 return value.toLocaleLowerCase('de').replace(/ä/g,'ae').replace(/ö/g,'oe').replace(/ü/g,'ue').replace(/ß/g,'ss').normalize('NFKD').replace(/\p{M}/gu,'').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
}

export function matchesOperationSearch(r:OperationRecord,query:string):boolean {
 const terms=normalizeSearch(query).split(/\s+/).filter(Boolean);
 if(!terms.length)return true;
 const date=appointmentDate(r);
 const fields=[r.project,r.reference,r.street,r.number,r.city,r.postcode,r.customer,r.email,r.phone,r.phone2,r.nvt,r.pipe,r.units,r.ne4,classify(r).status,recordNote(r),r.overrides.appointment??r.appointment,date,date?date.split('-').reverse().join('.'): '',r.time,r.overrides.assignee,...r.sources.flatMap(s=>Object.values(s.fields)),...(r.attachments??[]).map(a=>a.name)];
 const text=normalizeSearch(fields.filter(Boolean).join(' '));
 // Compare phone numbers independently, so punctuation and spaces do not hide a match.
 const phones=[r.phone,r.phone2].filter(Boolean).map(p=>p.replace(/\D/g,''));
 const digits=query.replace(/\D/g,'');
 if(/^[+\d\s()./-]+$/.test(query.trim())&&digits.length>=5&&phones.some(p=>p.includes(digits)||p.replace(/^49/,'0').includes(digits)))return true;
 return terms.every(term=>text.includes(term));
}

export function operationSearchScore(r:OperationRecord,query:string):number {
 const q=normalizeSearch(query),terms=q.split(/\s+/).filter(Boolean);
 if(!terms.length)return 0;
 const street=normalizeSearch(r.street),number=normalizeSearch(r.number);
 const primary=normalizeSearch([r.street,r.number,r.customer,r.reference,r.project,r.nvt].join(' '));
 return (street&&q.includes(street)?40:0)+(number&&terms.includes(number)?30:0)+terms.filter(t=>primary.includes(t)).length;
}
