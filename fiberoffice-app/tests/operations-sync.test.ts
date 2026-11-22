import {it,expect,vi} from 'vitest';
import {createSnapshotSync} from '../src/operations-sync';
it('unchanged polling transfers only a revision, while changes reload the snapshot',async()=>{
 const sync=createSnapshotSync();let token='first';const stamp=vi.fn(async()=>({token,me:{role:'gu'}})),data=vi.fn(async()=>({records:['address']}));
 await sync.read(stamp,data);await sync.read(stamp,data);expect(stamp).toHaveBeenCalledTimes(2);expect(data).toHaveBeenCalledTimes(1);
 token='updated';await sync.read(stamp,data);expect(data).toHaveBeenCalledTimes(2);
});
it('never returns cached data after a failed access check',async()=>{
 const sync=createSnapshotSync(),stamp=async()=>({token:'same',me:{}}),data=vi.fn(async()=>({secret:'private'}));await sync.read(stamp,data);
 await expect(sync.read(async()=>{throw Error('blocked');},data)).rejects.toThrow('blocked');
 await sync.read(stamp,data);expect(data).toHaveBeenCalledTimes(2);
});
it('account changes clear the cache and discard in-flight snapshots',async()=>{
 const sync=createSnapshotSync();let done!:(x:string)=>void;const pending=sync.read(async()=>({token:'old',me:{}}),()=>new Promise<string>(r=>done=r));await Promise.resolve();sync.clear();done('old customer data');await expect(pending).rejects.toThrow('Anmeldung');
 const fresh=await sync.read(async()=>({token:'new',me:{}}),async()=>'new customer data');expect(fresh.data).toBe('new customer data');
});
