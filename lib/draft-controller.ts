type Saved<T> = { draft: { payload:T; version:number } | null };
type Snapshot<T> = { value:T; status:string; loaded:boolean; conflict:boolean; dirty:boolean };

// Each controller owns an immutable study/name transport. A late load or save
// can never overwrite another brand's draft after navigation.
export class DraftController<T extends Record<string,unknown>> {
  snapshot:Snapshot<T>;
  private listeners=new Set<()=>void>();
  private version=0;
  private revision=0;
  private pending:Promise<void>|null=null;
  private loading:Promise<void>|null=null;
  private stopped=false;
  private initial:T; private read:()=>Promise<Saved<T>>; private write:(payload:T,version:number)=>Promise<{version:number}>; private enabled:boolean;
  constructor(initial:T,read:()=>Promise<Saved<T>>,write:(payload:T,version:number)=>Promise<{version:number}>,enabled=true){
    this.initial=initial;this.read=read;this.write=write;this.enabled=enabled;
    this.snapshot={value:initial,status:enabled?"Loading draft…":"",loaded:!enabled,conflict:false,dirty:false};
  }
  subscribe=(listener:()=>void)=>{this.listeners.add(listener);return()=>{this.listeners.delete(listener);};};
  private emit(patch:Partial<Snapshot<T>>){this.snapshot={...this.snapshot,...patch};for(const listener of this.listeners)listener();}
  load(){
    if(!this.enabled||this.snapshot.loaded)return Promise.resolve();
    if(this.loading)return this.loading;
    this.loading=(async()=>{try{const data=await this.read();this.version=data.draft?.version||0;this.emit({loaded:true,...(!this.snapshot.dirty&&data.draft?{value:data.draft.payload}:{}),status:this.snapshot.dirty?"Unsaved changes":data.draft?"Saved draft restored":"Draft ready"});if(this.snapshot.dirty)await this.flush();}catch(e){this.emit({loaded:true,conflict:true,status:(e as Error).message});}})();
    return this.loading;
  }
  update(next:T|((value:T)=>T)) { this.revision++;this.stopped=false;this.emit({value:typeof next==="function"?next(this.snapshot.value):next,dirty:true,status:"Unsaved changes"}); }
  flush=async()=>{
    if(!this.enabled||!this.snapshot.loaded||this.snapshot.conflict||this.stopped)return;
    if(this.pending)return this.pending;
    this.pending=(async()=>{while(this.snapshot.dirty&&!this.snapshot.conflict&&!this.stopped){const revision=this.revision,payload=this.snapshot.value;this.emit({status:"Saving draft…"});try{const data=await this.write(payload,this.version);this.version=data.version;if(revision===this.revision)this.emit({dirty:false,status:"Draft saved"});}catch(e){this.emit({conflict:true,status:(e as Error).message});}}})();
    try{await this.pending;}finally{this.pending=null;}
  };
  reload=async()=>{
    await this.pending;const revision=this.revision;
    const data=await this.read();if(revision!==this.revision)throw new Error("The draft changed while reloading. Your edits are preserved.");
    this.version=data.draft?.version||0;this.stopped=false;this.emit({value:data.draft?.payload||this.initial,loaded:true,dirty:false,conflict:false,status:"Latest saved draft loaded"});
  };
  clear=async()=>{
    if(!this.enabled)return;
    await this.load();this.stopped=true;await this.pending;
    if(this.snapshot.conflict)throw new Error("Resolve the saved draft conflict before clearing it.");
    const revision=this.revision;
    try{const result=await this.write(this.initial,this.version);this.version=result.version;this.stopped=false;if(revision===this.revision)this.emit({value:this.initial,dirty:false,status:"Draft cleared"});else await this.flush();}catch(e){this.emit({conflict:true,status:(e as Error).message});throw e;}
  };
}
