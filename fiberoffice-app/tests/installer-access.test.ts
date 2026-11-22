import {expect,it} from 'vitest';
import {canUseInstallerApp,installerLoginEmail} from '../src/installer-access';
import {dayJobs} from '../src/StaffDay';
import type {OperationRecord} from '../src/operations-model';
it('limits the app to installers and administrative preview',()=>{
 expect(canUseInstallerApp('installer')).toBe(true);
 expect(canUseInstallerApp('admin')).toBe(true);
 for(const role of ['gu','nu','planner','','unknown'])expect(canUseInstallerApp(role)).toBe(false);
});
it('does not turn a cleared day filter into a list of unscheduled customers',()=>{
 expect(dayJobs([{id:'example',date:'',overrides:{},project:'Demo'} as OperationRecord],'','')).toEqual([]);
});

it('resolves the requested crew login while preserving personal email logins',()=>{
 expect(installerLoginEmail(' Nexentra ')).toBe('monteur@nexentra.de');
 expect(installerLoginEmail('PERSON@EXAMPLE.ORG')).toBe('person@example.org');
 expect(installerLoginEmail('unknown')).toBe('unknown');
});
