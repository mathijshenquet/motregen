import {readFileSync} from 'node:fs';
for(const dir of process.argv.slice(2)) {
 const prefix=dir+'/po-android-koud-spelend-run1';
 const capture=JSON.parse(readFileSync(prefix+'.cpu.json'));
 const raw=JSON.parse(readFileSync(prefix+'.raw.json'));
 const report=JSON.parse(readFileSync(prefix+'.json'));
 const events=capture.trace.traceEvents;
 const origin=capture.navigationStartSeconds*1e6;
 const workers=new Map(events.filter(event=>event.name==='TracingSessionIdForWorker').map(event=>[event.args.data.workerThreadId,event.args.data.url]));
 const threads=events.filter(event=>event.name==='thread_name'&&(event.args.name==='CrRendererMain'||workers.has(event.tid)));
 const payload=raw.requests.filter(request=>request.url.includes('.pmtiles')).at(-1);
 for(const [label,startMs,endMs] of [['vast',1300,3500],['na-tegel',payload.endMs,report.milestones.basemapReadyMs]]) {
  const start=origin+startMs*1000,end=origin+endMs*1000;
  const table=[];
  for(const thread of threads) {
   const tasks=events.filter(event=>event.tid===thread.tid&&event.name==='ThreadControllerImpl::RunTask'&&event.ph==='X'&&event.dur>0&&event.ts<end&&event.ts+event.dur>start);
   const cpuMs=tasks.reduce((sum,task)=>sum+(task.tdur??0)*Math.max(0,Math.min(end,task.ts+task.dur)-Math.max(start,task.ts))/task.dur,0)/1000;
   const wallMs=tasks.reduce((sum,task)=>sum+Math.max(0,Math.min(end,task.ts+task.dur)-Math.max(start,task.ts)),0)/1000;
   const partial=tasks.filter(task=>task.ts<start||task.ts+task.dur>end);
   table.push({thread:workers.get(thread.tid)?.split('/').at(-1)??thread.args.name,tid:thread.tid,CPUms:Math.round(cpuMs),taskWallMs:Math.round(wallMs),partialTasks:partial.length,partialCPUms:Math.round(partial.reduce((sum,task)=>sum+(task.tdur??0),0)/1000)});
   const profiles=events.filter(event=>event.name==='Profile'&&event.tid===thread.tid&&event.args.data.source==='Internal');
   for(const profile of profiles) {
    const chunks=events.filter(event=>event.name==='ProfileChunk'&&event.pid===profile.pid&&event.id===profile.id&&event.args.data.source==='Internal');
    const nodes=new Map(chunks.flatMap(chunk=>chunk.args.data.cpuProfile?.nodes??[]).map(node=>[node.id,node]));
    let clock=profile.args.data.startTime;
    const top=new Map();
    for(const chunk of chunks) {
     const samples=chunk.args.data.cpuProfile?.samples??[];
     for(let index=0;index<samples.length;index++) {
      clock+=chunk.args.data.timeDeltas[index];
      if(clock<start||clock>end)continue;
      const node=nodes.get(samples[index]);
      const name=node?.callFrame.functionName??'?';
      const group=top.get(name)??{name,samples:0,url:node?.callFrame.url,line:node?.callFrame.lineNumber,column:node?.callFrame.columnNumber};group.samples++;top.set(name,group);
     }
    }
    console.log('stacks',label,thread.tid,[...top.values()].sort((a,b)=>b.samples-a.samples).slice(0,6));
   }
  }
  console.log(dir,label,startMs,endMs);console.table(table);
  const groups=[...new Set(capture.scopeSamples.map(sample=>sample.cgroup))];
  for(const group of groups) {
   const samples=capture.scopeSamples.filter(sample=>sample.cgroup===group);
   function nearest(ms) {return samples.reduce((best,sample)=>Math.abs(sample.monotonicMs-ms)<Math.abs(best.monotonicMs-ms)?sample:best,samples[0]);}
   const first=nearest(start/1000),last=nearest(end/1000);
   if (report.meta.rendererCpuQuotaPercent === null) continue
   if (first.threads && last.threads) console.table(last.threads.map(thread => ({ tid: thread.tid, name: thread.name, observedCPUms: thread.cpuMs - (first.threads.find(startThread => startThread.tid === thread.tid)?.cpuMs ?? 0) })).filter(thread => thread.observedCPUms > 0))
   console.log('scope',group,{actualStartMs:first.monotonicMs-origin/1000,actualEndMs:last.monotonicMs-origin/1000,usageMs:(last.counters.usage_usec-first.counters.usage_usec)/1000,throttledMs:(last.counters.throttled_usec-first.counters.throttled_usec)/1000,throttledPeriods:last.counters.nr_throttled-first.counters.nr_throttled});
  }
 }
}
