export const cableFields = ['meterStart','meterEnd','fiberCount','actualPipe','actualUnits'] as const;
export type CableField = typeof cableFields[number];
export type CableValues = Record<CableField,string>;

export function cableValues(source: Partial<CableValues>): CableValues {
 return {
  meterStart:source.meterStart ?? '', meterEnd:source.meterEnd ?? '',
  fiberCount:source.fiberCount ?? '', actualPipe:source.actualPipe ?? '', actualUnits:source.actualUnits ?? ''
 };
}
const meterPattern = /^[0-9]{1,9}([.,][0-9]{1,3})?$/;
export function blownLength(start:string,end:string) {
 if (!meterPattern.test(start.trim()) || !meterPattern.test(end.trim())) return null;
 const millimeters = (value:string) => Math.round(Number(value.trim().replace(',','.')) * 1000);
 return Math.abs(millimeters(start) - millimeters(end)) / 1000;
}
export function cablePatch(values:CableValues, original:Partial<CableValues>) {
 const patch:Partial<CableValues> = {};
 for (const key of cableFields) {
  let value = values[key].trim();
  if (value && (key === 'meterStart' || key === 'meterEnd')) {
   if (!meterPattern.test(value)) throw Error('Bitte die Kabelmeter als positive Zahl oder 0 mit höchstens drei Nachkommastellen eingeben.');
   value = value.replace(',','.');
  }
  if (value && (key === 'fiberCount' || key === 'actualUnits') && !/^[1-9][0-9]{0,8}$/.test(value))
   throw Error(key === 'fiberCount' ? 'Bitte eine ganze Faseranzahl größer als 0 eingeben.' : 'Bitte die tatsächlichen Wohneinheiten als ganze Zahl größer als 0 eingeben.');
  if (value !== (original[key] ?? '')) patch[key] = value;
 }
 return patch;
}
