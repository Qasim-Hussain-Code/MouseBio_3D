import { runCardiacCell, type CardiacCellOptions } from '../domain/cardiac-cell';
self.onmessage=async(event:MessageEvent<{type:string;options:CardiacCellOptions}>)=>{
  if(event.data?.type!=='run')return;
  try { const result=await runCardiacCell(event.data.options,(progress)=>self.postMessage({type:'progress',progress}));self.postMessage({type:'result',result}); }
  catch { self.postMessage({type:'error',message:'The cell model could not complete within its numerical limits.'}); }
};
