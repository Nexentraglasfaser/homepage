import {expect,it} from 'vitest';
import {blownLength,cablePatch,cableValues} from '../src/cable-measurement';

it('berechnet Meter in beiden Richtungen und unterscheidet null Meter von fehlenden Angaben',()=>{
 for(const [start,end,expected] of [['6000','5800',200],['5800','6000',200],['0','200',200],['25','25',0],['2,3','2.1',0.2],['','10',null],['x','10',null]] as const)
  expect(blownLength(start,end)).toBe(expected);
});
it('behält Planwerte bei und erlaubt die Rücknahme einer Abweichung',()=>{
 const original={actualUnits:'2',fiberCount:'12'};
 expect(cablePatch(cableValues(original),original)).toEqual({});
 expect(cablePatch({...cableValues(original),actualUnits:'',meterStart:'0,5',fiberCount:'7'},original)).toEqual({actualUnits:'',meterStart:'0.5',fiberCount:'7'});
 expect(()=>cablePatch({...cableValues({}),fiberCount:'1.5'},{})).toThrow();
});
