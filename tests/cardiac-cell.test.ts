import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {simulateCardiacCell,runCardiacCell,exportCardiacCellCsv} from '../src/domain/cardiac-cell';
import {createApicalModel,computeApicalRates} from '../src/models/bondarenko-apical';

test('bounded deterministic integration preserves source protocol, initial state, units and explicit variant provenance',()=>{
  const result=simulateCardiacCell({durationMs:1});assert.deepEqual(result,simulateCardiacCell({durationMs:1}));
  assert.equal(result.classification,'parameterized');assert.equal(result.samples.length,11);
  assert.equal(result.samples[0].voltageMv,-82.4202);assert.equal(result.samples[0].calciumUm,0.115001);
  assert.equal(result.protocol.temperatureK,298);assert.equal(result.protocol.modifiedPacing,false);assert.equal(result.protocol.amplitudePaPerPf,-80);
  assert.equal(result.source.license,'CC-BY-3.0');assert.equal(result.source.variant,'balanced-transition');assert.ok(result.source.transitionChange);
  assert.equal(result.solver.stateClipping,false);assert.equal(result.diagnostics.channelBoundsWarning,false);
  assert.ok(Object.isFrozen(result)&&Object.isFrozen(result.samples)&&Object.isFrozen(result.samples[0]));
  const csv=exportCardiacCellCsv(result).trim().split('\n');assert.equal(csv.length,12);assert.ok(csv[0].endsWith('equation_variant,pacing_period_ms,temperature_K,source_c_sha256,transition_change'));
  assert.ok(csv.slice(1).every(row=>row.split(',').slice(0,4).every(value=>Number.isFinite(Number(value)))&&row.includes('balanced-transition,71.43,298,')&&row.includes(result.source.generatedCSha256)));
});
test('invalid protocol and solver inputs fail with bounded fixed errors',()=>{
  for(const durationMs of [0,501,NaN,Infinity])assert.throws(()=>simulateCardiacCell({durationMs}),RangeError);
  for(const pacingPeriodMs of [19,1001,NaN])assert.throws(()=>simulateCardiacCell({pacingPeriodMs}),RangeError);
  for(const relativeTolerance of [0,1e-11,1e-3,Infinity])assert.throws(()=>simulateCardiacCell({relativeTolerance}),RangeError);
  assert.throws(()=>simulateCardiacCell({variant:'unknown' as never}),RangeError);
  assert.equal(simulateCardiacCell({durationMs:1,pacingPeriodMs:100}).protocol.modifiedPacing,true);
});
test('asynchronous calculation reports progress and cancellation leaves no completed result',async()=>{
  const abort=new AbortController();let reports=0;
  await assert.rejects(runCardiacCell({durationMs:250},()=>{reports++;abort.abort();},abort.signal),{name:'AbortError'});assert.equal(reports,1);
  const already=new AbortController();already.abort();await assert.rejects(runCardiacCell({},undefined,already.signal),{name:'AbortError'});
});
test('the archived sodium-channel generator has a negative off-diagonal and the disclosed substitution restores its balance',()=>{
  const {states,constants}=createApicalModel();states[0]=20;
  const rates=new Float64Array(41),a=new Float64Array(71);const indices=Array.from({length:8},(_,i)=>i+19);
  const columns=(balanced:boolean)=>Array.from({length:9},(_,column)=>{
    for(const i of indices)states[i]=0;if(column<8)states[indices[column]]=1;
    computeApicalRates(0,states,rates,a,constants);
    if(balanced)rates[25]+=a[43]*(states[21]-states[25]);
    const explicit=indices.map(i=>rates[i]);return [...explicit,-explicit.reduce((sum,v)=>sum+v,0)];
  });
  const archived=columns(false),balanced=columns(true);
  assert.ok(archived[6][8]<-0.0089,'archived IC_Na2 column has a negative implicit C_Na3 influx');
  for(let column=0;column<9;column++){
    assert.ok(Math.abs(balanced[column].reduce((s,v)=>s+v,0))<1e-10);
    for(let row=0;row<9;row++)if(row!==column)assert.ok(balanced[column][row]>=-1e-10);
  }
});
test('both equation variants reproduce the independently integrated numerical reference without clipping',async()=>{
  const fixture=JSON.parse(await readFile(new URL('../data/provenance/apical-numerical-reference.json',import.meta.url),'utf8'));
  assert.equal(fixture.figureOrExperimentalValidationExecuted,false);assert.equal(fixture.stateClipping,false);
  for(const variant of ['archived-source','balanced-transition'] as const){
    const result=simulateCardiacCell({variant});const reference=fixture.variants[variant].samples;
    assert.equal(reference.length,result.samples.length);
    const errors=[0,0,0];result.samples.forEach((sample,i)=>{
      assert.equal(sample.timeMs,reference[i][0]);
      [sample.voltageMv,sample.calciumUm,sample.subspaceCalciumUm].forEach((value,j)=>{errors[j]=Math.max(errors[j],Math.abs(value-reference[i][j+1]));});
    });
    assert.ok(errors[0]<0.01,`voltage error ${errors[0]} mV`);assert.ok(errors[1]<0.001,`Cai error ${errors[1]} uM`);assert.ok(errors[2]<0.001,`Cass error ${errors[2]} uM`);
    assert.equal(result.diagnostics.channelBoundsWarning,variant==='archived-source');
    assert.equal(result.source.transitionChange===null,variant==='archived-source');
  }
});

test('maximum-duration modified pacing remains bounded and a tighter tolerance converges over the first paced response',()=>{
  const longest=simulateCardiacCell({durationMs:500,pacingPeriodMs:200});
  assert.equal(longest.samples.length,5001);assert.equal(longest.samples.at(-1)!.timeMs,500);assert.equal(longest.protocol.modifiedPacing,true);
  assert.equal(longest.diagnostics.channelBoundsWarning,false);assert.ok(longest.samples.every(s=>Number.isFinite(s.voltageMv)&&s.calciumUm>0&&s.subspaceCalciumUm>0));
  const standard=simulateCardiacCell({durationMs:100}),refined=simulateCardiacCell({durationMs:100,relativeTolerance:1e-8});
  assert.equal(standard.samples.length,refined.samples.length);
  let error=0;standard.samples.forEach((s,i)=>{error=Math.max(error,Math.abs(s.voltageMv-refined.samples[i].voltageMv));});assert.ok(error<0.005);
  assert.equal(refined.diagnostics.channelBoundsWarning,false);
});
