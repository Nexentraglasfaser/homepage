import {it,expect} from 'vitest';
import {requiresLogin,singleFlightFactory,authIdentityChanged} from '../src/session-recovery';
it('keeps sessions through offline, server and concurrent sync failures',()=>{
 for(const message of ['Failed to fetch','NetworkError','503 Service Unavailable','Anmeldung wurde geändert. Bitte erneut laden.'])expect(requiresLogin(new Error(message))).toBe(false);
 expect(requiresLogin(new Error('Zugang gesperrt oder Anmeldung abgelaufen. Bitte erneut anmelden.'))).toBe(true);
 expect(requiresLogin({code:'refresh_token_not_found'})).toBe(true);
});
it('uses one auth client for simultaneous startup calls',async()=>{
 let count=0;const get=singleFlightFactory(async()=>({id:++count}));const results=await Promise.all([get(),get(),get()]);expect(count).toBe(1);expect(results[0]).toBe(results[2]);
});
it('can recover from failed client initialization',async()=>{
 let count=0;const get=singleFlightFactory(async()=>{if(++count===1)throw Error('offline');return 'ready';});await expect(get()).rejects.toThrow();expect(await get()).toBe('ready');
});
it('does not discard a snapshot when returning to an already signed-in tab',()=>{
 expect(authIdentityChanged('SIGNED_IN','same','same')).toBe(false);
 expect(authIdentityChanged('TOKEN_REFRESHED','same','same')).toBe(false);
 expect(authIdentityChanged('SIGNED_IN','other','same')).toBe(true);
 expect(authIdentityChanged('SIGNED_OUT',undefined,'same')).toBe(true);
});
