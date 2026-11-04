/// <reference lib="webworker" />
import {runExcitableCable} from '../domain/excitable-cable';
self.onmessage=async(event:MessageEvent)=>{if(event.data?.type!=='run')return;try{const result=await runExcitableCable(event.data.options,progress=>self.postMessage({type:'progress',progress}));self.postMessage({type:'result',result});}catch{self.postMessage({type:'error'});}};
