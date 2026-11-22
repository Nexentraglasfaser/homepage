// Memory-only cache. Every use rechecks access and the server revision first.
export function createSnapshotSync<T,M>() {
 let cached:{token:string;data:T}|undefined;
 let generation=0;
 return {
  clear(){cached=undefined;generation++;},
  async read(stamp:()=>Promise<{token:string;me:M}>,fetchData:()=>Promise<T>){
   const started=generation;
   try{
    const state=await stamp();
    if(started!==generation)throw Error('Anmeldung wurde geändert. Bitte erneut laden.');
    if(cached?.token===state.token)return {data:cached.data,me:state.me};
    const data=await fetchData();
    if(started!==generation)throw Error('Anmeldung wurde geändert. Bitte erneut laden.');
    cached={token:state.token,data};
    return {data,me:state.me};
   }catch(e){cached=undefined;throw e;}
  }
 };
}
