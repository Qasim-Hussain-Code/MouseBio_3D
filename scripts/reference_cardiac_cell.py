#!/usr/bin/env python3
"""Regenerate computed reference traces from pinned originals using SciPy.

Optional NumPy and SciPy must already be installed in the selected Python
environment. No download, experimental data or biological validation occurs.
Generated mathematical expressions and numerical traces retain CC BY 3.0.
The original orchestration and grammar-checking code is MIT.
"""
from pathlib import Path
import sys,json,hashlib,time
R=Path(__file__).resolve().parents[1];T=R/'.publication/apical-reference';T.mkdir(parents=True,exist_ok=True)
sys.path.insert(0,str(R/'scripts'))
from prepare_bondarenko import parse_c,pinned,RAW_C,C_BYTES,C_SHA256,XML_SHA256,REVISION,MODEL_URL

def py(node):
 kind=node[0]
 if kind=='number':return node[1]
 if kind=='time':return 'time_ms'
 if kind=='read':return f"{ {'STATES':'states','RATES':'rates','ALGEBRAIC':'algebraic','CONSTANTS':'constants'}[node[1]] }[{node[2]}]"
 if kind=='call':return 'math.'+node[1]+'('+','.join(py(x) for x in node[2])+')'
 if kind=='unary':return '('+node[1]+py(node[2])+')'
 if kind=='binary':return '('+py(node[2])+' '+{'&&':'and','||':'or'}.get(node[1],node[1])+' '+py(node[3])+')'
 return '('+py(node[2])+' if '+py(node[1])+' else '+py(node[3])+')'

body=RAW_C.read_bytes();pinned(body,C_BYTES,C_SHA256);parsed=parse_c(body)
assert all('time_ms' not in py(expr) or (array=='ALGEBRAIC' and index==0) for array,index,expr in parsed['computeRates'])
code=['# SPDX-License-Identifier: CC-BY-3.0','# Closed mathematical derivative from the pinned, reviewed expression tree.','import math','def initialize():',' states=[0.0]*41;constants=[0.0]*73']
for array,index,expression in parsed['initConsts']:
 code.append(f" { {'STATES':'states','CONSTANTS':'constants'}[array] }[{index}]={py(expression)}")
code+=[' return states,constants','def rates_at(time_ms,states,constants,balanced):',' rates=[0.0]*41;algebraic=[0.0]*71']
for array,index,expression in parsed['computeRates']:
 code.append(f" { {'RATES':'rates','ALGEBRAIC':'algebraic'}[array] }[{index}]={py(expression)}")
code+=[' if balanced:rates[25]+=algebraic[43]*(states[21]-states[25])',' return rates']
generated=T/'apical_closed_math.py';generated.write_text('\n'.join(code)+'\n')
sys.path.insert(0,str(T))
import numpy as np
import scipy
from scipy.integrate import solve_ivp
import apical_closed_math as model

times=np.arange(2501,dtype=float)/10
initial,constants=model.initialize();initial=np.asarray(initial)
edges=sorted([0.,250.]+[edge for n in range(4) for edge in (20.+71.43*n,20.5+71.43*n)])
def run(method,rtol,atol,max_step,balanced):
 states=initial.copy();values=np.full((41,len(times)),np.nan);evaluations=0;minimum=0.;maximum=1.;started=time.monotonic()
 for left,right in zip(edges,edges[1:]):
  phase_time=(left+right)/2
  def derivative(t,y):return model.rates_at(phase_time,y,constants,balanced)
  result=solve_ivp(derivative,(left,right),states,method=method,rtol=rtol,atol=atol,max_step=max_step,dense_output=True)
  assert result.success and result.status==0 and np.isfinite(result.y).all()
  indices=np.flatnonzero((times>=left-1e-10)&(times<=right+1e-10))
  values[:,indices]=result.sol(np.clip(times[indices],left,right))
  states=result.y[:,-1].copy();evaluations+=result.nfev
 assert np.isfinite(values).all() and np.all(values[[1,2,3,4,6,7,18,27]]>0)
 gates=values[[5,*range(8,18),*range(19,27),*range(28,41)]]
 gates=np.vstack([gates,*[1-values[group].sum(axis=0) for group in ([8,9,10],list(range(11,18)),list(range(19,27)))]])
 return values,{'method':method,'relativeTolerance':rtol,'absoluteTolerance':atol,'maximumStepMs':max_step,'rateEvaluations':evaluations,'dimensionlessIncludesImplicitComplements':True,'minimumDimensionlessState':float(gates.min()),'maximumDimensionlessState':float(gates.max()),'elapsedSeconds':time.monotonic()-started}

outputs={}
for name,balanced in [('archived-source',False),('balanced-transition',True)]:
 first,first_meta=run('BDF',1e-8,1e-10,0.1,balanced)
 second,second_meta=run('Radau',1e-9,1e-11,0.05,balanced)
 differences=np.max(np.abs(first[[0,1,2]]-second[[0,1,2]]),axis=1)
 assert differences[0]<0.01 and np.all(differences[1:]<0.001),differences
 outputs[name]={'reference':second_meta,'comparison':first_meta,'maximumBdfRadauDifference':dict(zip(('voltageMv','calciumUm','subspaceCalciumUm'),map(float,differences))),
                'samples':[[float(times[i]),float(second[0,i]),float(second[1,i]),float(second[2,i])] for i in range(len(times))]}
 print(json.dumps({'variant':name,'maximumBdfRadauDifference':outputs[name]['maximumBdfRadauDifference'],'reference':second_meta}),flush=True)
assert outputs['archived-source']['reference']['minimumDimensionlessState']< -1e-6
assert outputs['balanced-transition']['reference']['minimumDimensionlessState']>=-1e-7
fixture={'schemaVersion':'mousebio.apical-reference.v1','classification':'computed numerical reference, not experimental observations','license':'CC-BY-3.0',
 'source':{'modelUrl':MODEL_URL,'revision':REVISION,'cellmlSha256':XML_SHA256,'generatedCSha256':C_SHA256},
 'environment':{'python':sys.version.split()[0],'numpy':np.__version__,'scipy':scipy.__version__},
 'protocol':{'durationMs':250,'outputStepMs':0.1,'startMs':20,'periodMs':71.43,'pulseDurationMs':0.5,'amplitudePaPerPf':-80,'temperatureK':298},
 'forcing':'Separate continuous source stimulus phases, evaluated at each phase midpoint; source time occurs only in stimulus algebraic[0]',
 'equationTranslation':'Closed Python mathematical derivative from the same pinned expression tree; independent integration algorithms, not independent equation or biological validation',
 'stateClipping':False,'figureOrExperimentalValidationExecuted':False,'columns':['timeMs','voltageMv','calciumUm','subspaceCalciumUm'],'variants':outputs}
destination=R/'data/provenance/apical-numerical-reference.json';destination.write_text(json.dumps(fixture,separators=(',',':'),allow_nan=False)+'\n')
print(json.dumps({'fixtureBytes':destination.stat().st_size,'fixtureSha256':hashlib.sha256(destination.read_bytes()).hexdigest()}))
