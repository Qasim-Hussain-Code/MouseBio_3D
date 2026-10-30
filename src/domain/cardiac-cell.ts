import { createApicalModel, computeApicalRates, APICAL_STATE_COUNT, APICAL_ALGEBRAIC_COUNT, APICAL_STATE_METADATA, APICAL_STATE_INDICES, APICAL_SOURCE_C_SHA256, APICAL_SOURCE_STIMULUS, APICAL_STIMULUS_INDICES } from '../models/bondarenko-apical';

export type CardiacCellVariant = 'archived-source' | 'balanced-transition';
export interface CardiacCellOptions { variant?: CardiacCellVariant; durationMs?: number; pacingPeriodMs?: number; relativeTolerance?: number; }
export interface CardiacCellSample { readonly timeMs: number; readonly voltageMv: number; readonly calciumUm: number; readonly subspaceCalciumUm: number; }
export interface CardiacCellProgress { readonly fraction: number; readonly acceptedSteps: number; readonly rejectedSteps: number; }
export interface CardiacCellResult {
  readonly schemaVersion: 'mousebio.apical-simulation.v1'; readonly classification: 'parameterized';
  readonly source: { readonly title: string; readonly doi: string; readonly license: 'CC-BY-3.0'; readonly generatedCSha256: string; readonly variant: CardiacCellVariant; readonly transitionChange: string | null };
  readonly protocol: { readonly durationMs: number; readonly pacingPeriodMs: number; readonly startMs: number; readonly pulseDurationMs: number; readonly amplitudePaPerPf: number; readonly temperatureK: number; readonly modifiedPacing: boolean };
  readonly solver: { readonly method: string; readonly relativeTolerance: number; readonly absoluteTolerance: number; readonly outputStepMs: number; readonly acceptedSteps: number; readonly rejectedSteps: number; readonly rateEvaluations: number; readonly forcing: string; readonly stateClipping: false };
  readonly diagnostics: { readonly minimumDimensionlessState: number; readonly maximumDimensionlessState: number; readonly channelBoundsWarning: boolean };
  readonly samples: readonly CardiacCellSample[]; readonly limitations: readonly string[];
}
export const CARDIAC_CELL_LIMITATIONS = Object.freeze([
  'This is a published mouse apical ventricular-cell equation model with source-declared parameters at 298 K. It is not a measurement from the displayed mouse.',
  'Numerical agreement and convergence do not establish independent physiological validation, individual prediction or a validated treatment response.',
  'The model describes membrane voltage and intracellular calcium handling. It supplies no contraction mechanics, blood circulation, nerve activity or spatial cell anatomy.',
  'No accepted registration connects this independent cell model to an anatomical point, a vessel, a nerve or another source reference.',
]);
const OUTPUT_STEP = 0.1, ABS_TOL = 1e-9, MAX_STEPS = 750000, MAX_STEP = 0.05, MIN_STEP = 1e-9;
const A: readonly (readonly number[])[] = [[], [1/5], [3/40,9/40], [44/45,-56/15,32/9], [19372/6561,-25360/2187,64448/6561,-212/729], [9017/3168,-355/33,46732/5247,49/176,-5103/18656], [35/384,0,500/1113,125/192,-2187/6784,11/84]];
const B = [35/384,0,500/1113,125/192,-2187/6784,11/84,0];
const E = B.map((value, i) => value - [5179/57600,0,7571/16695,393/640,-92097/339200,187/2100,1/40][i]);
function requireCondition(value: unknown, message: string): asserts value { if (!value) throw new RangeError(message); }
function normalized(options: CardiacCellOptions) {
  requireCondition(options!==null && typeof options==='object' && !Array.isArray(options), 'The model options must be an object.');
  const variant=options.variant ?? 'balanced-transition';
  requireCondition(variant==='archived-source'||variant==='balanced-transition', 'The requested model variant is unavailable.');
  const durationMs=options.durationMs ?? 250, pacingPeriodMs=options.pacingPeriodMs ?? APICAL_SOURCE_STIMULUS.periodMs, relativeTolerance=options.relativeTolerance ?? 1e-7;
  requireCondition(Number.isFinite(durationMs) && durationMs >= 1 && durationMs <= 500, 'Model duration must be between 1 and 500 ms.');
  requireCondition(Number.isFinite(pacingPeriodMs) && pacingPeriodMs >= 20 && pacingPeriodMs <= 1000, 'Model pacing period must be between 20 and 1000 ms.');
  requireCondition(Number.isFinite(relativeTolerance) && relativeTolerance >= 1e-10 && relativeTolerance <= 1e-4, 'The solver tolerance is outside its supported range.');
  return {durationMs,pacingPeriodMs,relativeTolerance,variant};
}
const IMPLICIT_CHANNEL_GROUPS:readonly (readonly number[])[]=[[8,9,10],[11,12,13,14,15,16,17],[19,20,21,22,23,24,25,26]];
function admissible(state: Float64Array, variant: CardiacCellVariant): boolean {
  for(let i=0;i<state.length;i++) {
    const value=state[i]; if(!Number.isFinite(value)) return false;
    if(APICAL_STATE_METADATA[i].unit==='micromolar' && value <= 0) return false;
    if(variant==='balanced-transition' && APICAL_STATE_METADATA[i].unit==='dimensionless' && (value < -1e-6 || value > 1+1e-6)) return false;
  }
  if(variant==='balanced-transition')for(const group of IMPLICIT_CHANNEL_GROUPS){let complement=1;for(const i of group)complement-=state[i];if(complement < -1e-6 || complement > 1+1e-6)return false;}
  return true;
}

/** Bounded Dormand-Prince 5(4), with exact source stimulus phases separated at every edge. */
export function* integrateCardiacCell(options: CardiacCellOptions = {}): Generator<CardiacCellProgress,CardiacCellResult,void> {
  const {durationMs,pacingPeriodMs,relativeTolerance,variant}=normalized(options);
  const {states,constants}=createApicalModel(); constants[APICAL_STIMULUS_INDICES.periodMs]=pacingPeriodMs;
  requireCondition(admissible(states,variant), 'The source initial conditions are not admissible.');
  const edges=[0,durationMs];
  for(let on=APICAL_SOURCE_STIMULUS.startMs;on<durationMs;on+=pacingPeriodMs) {
    edges.push(on); const off=on+APICAL_SOURCE_STIMULUS.durationMs;if(off<durationMs)edges.push(off);
  }
  edges.sort((a,b)=>a-b);
  const boundaries=edges.filter((value,i)=>i===0||value-edges[i-1]>1e-10);
  const k=Array.from({length:7},()=>new Float64Array(APICAL_STATE_COUNT));
  const temporary=new Float64Array(APICAL_STATE_COUNT), candidate=new Float64Array(APICAL_STATE_COUNT), algebraic=new Float64Array(APICAL_ALGEBRAIC_COUNT);
  const samples: CardiacCellSample[]=[];
  let time=0, h=0.005, phase=0, accepted=0, rejected=0, evaluations=0, iterations=0, outputIndex=1;
  let minimumDimensionlessState=0,maximumDimensionlessState=1;
  const append=(t:number)=>samples.push(Object.freeze({timeMs:t,voltageMv:states[APICAL_STATE_INDICES.Vm],calciumUm:states[APICAL_STATE_INDICES.Cai],subspaceCalciumUm:states[APICAL_STATE_INDICES.Cass]}));
  append(0);
  while(time<durationMs-1e-12) {
    requireCondition(++iterations<=MAX_STEPS, 'The cell model exceeded its bounded solver budget.');
    while(phase+1<boundaries.length-1 && time>=boundaries[phase+1]-1e-12)phase++;
    const outputTime=Math.min(durationMs,outputIndex/10), target=Math.min(outputTime,boundaries[phase+1]);
    if(target-time<=1e-12) {time=target;if(Math.abs(time-outputTime)<=1e-12){append(outputTime);outputIndex++;}continue;}
    const step=Math.min(h,MAX_STEP,target-time);
    requireCondition(step>=MIN_STEP || target-time<MIN_STEP, 'The cell model requires an unsupported integration step.');
    // Time occurs only in the pinned stimulus expression. Its midpoint gives
    // the exact constant forcing on this continuous source subproblem.
    const phaseTime=(boundaries[phase]+boundaries[phase+1])/2;
    let valid=true;
    for(let stage=0;stage<7;stage++) {
      for(let i=0;i<states.length;i++) {
        let sum=0;for(let prior=0;prior<stage;prior++)sum+=A[stage][prior]*k[prior][i];
        temporary[i]=states[i]+step*sum;
      }
      computeApicalRates(phaseTime,temporary,k[stage],algebraic,constants);evaluations++;
      // Explicit mathematical variant: the archived IC_Na2 influx used its
      // own occupancy instead of C_Na2. This substitution restores the
      // closed channel's nonnegative transition generator. No value is clipped.
      if(variant==='balanced-transition')k[stage][25]+=algebraic[43]*(temporary[21]-temporary[25]);
      for(let i=0;i<states.length;i++)if(!Number.isFinite(k[stage][i])){valid=false;break;}
      if(!valid)break;
    }
    let error=0;
    if(valid) {
      for(let i=0;i<states.length;i++) {
        let sum=0,difference=0;for(let stage=0;stage<7;stage++){sum+=B[stage]*k[stage][i];difference+=E[stage]*k[stage][i];}
        candidate[i]=states[i]+step*sum;
        const scale=ABS_TOL+relativeTolerance*Math.max(Math.abs(states[i]),Math.abs(candidate[i]));
        error=Math.max(error,Math.abs(step*difference)/scale);
      }
      valid=Number.isFinite(error)&&admissible(candidate,variant);
    }
    if(valid && error<=1) {
      states.set(candidate);
      for(let i=0;i<states.length;i++)if(APICAL_STATE_METADATA[i].unit==='dimensionless'){
        minimumDimensionlessState=Math.min(minimumDimensionlessState,states[i]);maximumDimensionlessState=Math.max(maximumDimensionlessState,states[i]);
      }
      for(const group of IMPLICIT_CHANNEL_GROUPS){let complement=1;for(const i of group)complement-=states[i];minimumDimensionlessState=Math.min(minimumDimensionlessState,complement);maximumDimensionlessState=Math.max(maximumDimensionlessState,complement);}
      time+=step;if(Math.abs(time-target)<=1e-12)time=target;accepted++;
      if(Math.abs(time-outputTime)<=1e-12){append(outputTime);outputIndex++;}
      h=Math.min(MAX_STEP,step*(error===0?5:Math.max(0.2,Math.min(5,0.9*Math.pow(error,-0.2)))));
    } else {rejected++;h=step*(valid?Math.max(0.1,Math.min(0.5,0.9*Math.pow(error,-0.2))):0.25);}
    if(iterations%256===0)yield Object.freeze({fraction:time/durationMs,acceptedSteps:accepted,rejectedSteps:rejected});
  }
  requireCondition(samples.length===Math.ceil(durationMs/OUTPUT_STEP)+1 && samples.length<=5001, 'The model output grid is inconsistent.');
  return Object.freeze({schemaVersion:'mousebio.apical-simulation.v1',classification:'parameterized',
    source:Object.freeze({title:'Bondarenko et al. (2004), apical mouse ventricular cell',doi:'10.1152/ajpheart.00185.2003',license:'CC-BY-3.0',generatedCSha256:APICAL_SOURCE_C_SHA256,variant,transitionChange:variant==='balanced-transition'?'IC_Na2 derivative: gamma_Na4 * IC_Na2 replaced by gamma_Na4 * C_Na2; computational conservation correction, not independently physiologically validated':null}),
    protocol:Object.freeze({durationMs,pacingPeriodMs,startMs:APICAL_SOURCE_STIMULUS.startMs,pulseDurationMs:APICAL_SOURCE_STIMULUS.durationMs,amplitudePaPerPf:APICAL_SOURCE_STIMULUS.amplitudePaPerPf,temperatureK:APICAL_SOURCE_STIMULUS.temperatureK,modifiedPacing:pacingPeriodMs!==APICAL_SOURCE_STIMULUS.periodMs}),
    solver:Object.freeze({method:'Dormand-Prince 5(4)',relativeTolerance,absoluteTolerance:ABS_TOL,outputStepMs:OUTPUT_STEP,acceptedSteps:accepted,rejectedSteps:rejected,rateEvaluations:evaluations,forcing:'Separate continuous source stimulus phases, evaluated at each phase midpoint',stateClipping:false}),
    diagnostics:Object.freeze({minimumDimensionlessState,maximumDimensionlessState,channelBoundsWarning:minimumDimensionlessState< -1e-7||maximumDimensionlessState>1+1e-7}),
    samples:Object.freeze(samples),limitations:Object.freeze([...CARDIAC_CELL_LIMITATIONS, variant==='balanced-transition'?'This variant includes one explicitly documented mathematical transition substitution. It does not reproduce the archived equations exactly and has no independent physiological validation.':'The archived equations contain a nonconservative sodium-channel transition and can produce out-of-range channel states. These values are retained without clipping.'])});
}
export function simulateCardiacCell(options: CardiacCellOptions = {}): CardiacCellResult {
  const iterator=integrateCardiacCell(options);while(true){const next=iterator.next();if(next.done)return next.value;}
}
export async function runCardiacCell(options: CardiacCellOptions = {}, progress?:(value:CardiacCellProgress)=>void, signal?:AbortSignal):Promise<CardiacCellResult> {
  const iterator=integrateCardiacCell(options);
  while(true) {
    if(signal?.aborted)throw new DOMException('Aborted','AbortError');
    const next=iterator.next();if(next.done)return next.value;progress?.(next.value);
    await new Promise<void>((resolve)=>setTimeout(resolve,0));
  }
}
export function exportCardiacCellCsv(result:CardiacCellResult):string {
  const text=(value:string)=>/[",\r\n]/.test(value)?`"${value.replaceAll('"','""')}"`:value;
  const context=[result.source.variant,result.protocol.pacingPeriodMs,result.protocol.temperatureK,result.source.generatedCSha256,text(result.source.transitionChange??'Archived equations unchanged')];
  return ['time_ms,membrane_voltage_mV,cytosolic_calcium_uM,subspace_calcium_uM,equation_variant,pacing_period_ms,temperature_K,source_c_sha256,transition_change',...result.samples.map((s)=>[s.timeMs,s.voltageMv,s.calciumUm,s.subspaceCalciumUm,...context].join(','))].join('\n')+'\n';
}
