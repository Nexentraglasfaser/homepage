import {useState} from 'react';
import {blownLength,type CableValues, type CableField} from './cable-measurement';

export function CableMeasurements({values,change,units,pipe,editable}:{
 values:CableValues; change:(key:CableField,value:string)=>void; units:string; pipe:string; editable:boolean;
}) {
 const [differentUnits,setDifferentUnits]=useState(Boolean(values.actualUnits));
 const distance=blownLength(values.meterStart,values.meterEnd);
 return <fieldset className="ops-edit-grid" disabled={!editable}>
  <legend>Kabel und Einblasstrecke</legend>
  <label>Startmarkierung am Kabel (m)<input inputMode="decimal" value={values.meterStart} onChange={e=>change('meterStart',e.target.value)}/></label>
  <label>Endmarkierung am Kabel (m)<input inputMode="decimal" value={values.meterEnd} onChange={e=>change('meterEnd',e.target.value)}/></label>
  <label>Eingeblasene Strecke<output>{distance===null?'—':distance.toLocaleString('de-DE')+' m'}</output></label>
  <label>Faseranzahl im Kabel<input inputMode="numeric" value={values.fiberCount} onChange={e=>change('fiberCount',e.target.value)}/></label>
  <label>Rohrfarbe vor Ort<input maxLength={1000} placeholder={pipe || 'Rohrfarbe eingeben'} value={values.actualPipe} onChange={e=>change('actualPipe',e.target.value)}/></label>
  <div><small>Wohneinheiten laut Plan: {units || 'nicht hinterlegt'}</small>
   <label><input type="checkbox" checked={differentUnits} onChange={e=>{setDifferentUnits(e.target.checked); if(!e.target.checked) change('actualUnits','');}}/> Abweichende Wohneinheiten</label>
   {differentUnits && <label>Tatsächliche Wohneinheiten<input inputMode="numeric" value={values.actualUnits} onChange={e=>change('actualUnits',e.target.value)}/></label>}
  </div>
 </fieldset>;
}
