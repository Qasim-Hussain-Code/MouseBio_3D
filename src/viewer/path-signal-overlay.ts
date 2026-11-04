import * as THREE from 'three';
import {sourcePolylinePathBounds} from './polyline-focus';

export interface PathSignalOverlay {
  readonly group:THREE.Group; readonly pathRowIndex:number; readonly displayLength:number;
  readonly sourcePathDisplayLength:number; readonly fractions:readonly number[]; readonly bounds:THREE.Box3;
  readonly materials:readonly (THREE.PointsMaterial|THREE.LineBasicMaterial)[];
  updateFlow(progress:number,direction?:1|-1):boolean;
  updateActivity(values:readonly number[],min?:number,max?:number):boolean;
  dispose():void;
}
interface Segment {a:THREE.Vector3;b:THREE.Vector3;lo:number;hi:number;length:number;}
/** Data indicators on retained source segments. No vessel or nerve surface is generated. */
export function createPathSignalOverlay(region:THREE.LineSegments,pathRowIndex:number):PathSignalOverlay|null {
  try {
    if(!(region.material instanceof THREE.LineBasicMaterial))return null;
    const planes=region.material.clippingPlanes??[];
    const bounds=sourcePolylinePathBounds(region,pathRowIndex,planes);if(!bounds)return null;
    const position=region.geometry.getAttribute('position'),pairs=region.geometry.index!;
    const starts=region.userData.sourcePolylineSegmentStarts as readonly number[];
    const first=starts[pathRowIndex],last=starts[pathRowIndex+1],draw=region.geometry.drawRange;
    const drawEnd=Math.min(pairs.count,draw.start+draw.count),segments:Segment[]=[];
    const world=region.matrixWorld;let fullLength=0,retainedLength=0;
    for(let segment=first;segment<last;segment++){
      const offset=segment*2,a=new THREE.Vector3().fromBufferAttribute(position,pairs.getX(offset)),b=new THREE.Vector3().fromBufferAttribute(position,pairs.getX(offset+1));
      const aw=a.clone().applyMatrix4(world),bw=b.clone().applyMatrix4(world),length=aw.distanceTo(bw),start=fullLength;
      if(!Number.isFinite(length))return null;fullLength+=length;
      if(length===0||offset<draw.start||offset>=drawEnd)continue;
      let lower=0,upper=1;
      for(const plane of planes){
        const da=plane.distanceToPoint(aw),db=plane.distanceToPoint(bw);
        if(da<0&&db<0){upper=-1;break;}
        if((da<0)!==(db<0)){const crossing=da/(da-db);if(da<0)lower=Math.max(lower,crossing);else upper=Math.min(upper,crossing);}
      }
      if(upper<=lower)continue;
      const retained=length*(upper-lower);retainedLength+=retained;
      segments.push({a:a.clone().lerp(b,lower),b:a.clone().lerp(b,upper),lo:start+length*lower,hi:start+length*upper,length:retained});
    }
    if(!Number.isFinite(fullLength)||fullLength<=0||!Number.isFinite(retainedLength)||retainedLength<=0||!segments.length)return null;
    const fractions:number[]=[];const coordinates=new Float32Array(segments.length*6);
    segments.forEach((segment,i)=>{segment.lo/=fullLength;segment.hi/=fullLength;fractions.push(segment.lo,segment.hi);segment.a.toArray(coordinates,i*6);segment.b.toArray(coordinates,i*6+3);});
    if(!coordinates.every(Number.isFinite))return null;
    const group=new THREE.Group();group.name='Selected path model indicators';group.userData.isDisplayOverlay=true;
    const activityGeometry=new THREE.BufferGeometry();activityGeometry.setAttribute('position',new THREE.BufferAttribute(coordinates,3));
    const colors=new Float32Array(coordinates.length);activityGeometry.setAttribute('color',new THREE.BufferAttribute(colors,3));
    const materialOptions={clippingPlanes:planes.map(plane=>plane.clone()),transparent:true,opacity:1,depthWrite:false};
    const activityMaterial=new THREE.LineBasicMaterial({...materialOptions,vertexColors:true});
    const activity=new THREE.LineSegments(activityGeometry,activityMaterial);activity.name='Dimensionless cable activity';activity.visible=false;activity.raycast=()=>{};activity.renderOrder=4;
    const markerGeometry=new THREE.BufferGeometry();const markerPositions=new Float32Array(12*3);markerGeometry.setAttribute('position',new THREE.BufferAttribute(markerPositions,3));markerGeometry.setDrawRange(0,0);
    const markerMaterial=new THREE.PointsMaterial({...materialOptions,color:0xffc95e,size:5,sizeAttenuation:false});
    const markers=new THREE.Points(markerGeometry,markerMaterial);markers.name='Modeled flow tracers, not blood cells';markers.raycast=()=>{};markers.renderOrder=5;
    group.add(activity,markers);region.add(group);let disposed=false;
    const cold=new THREE.Color(0x4b879a),hot=new THREE.Color(0xffd65c),scratch=new THREE.Color();
    return Object.freeze({group,pathRowIndex,displayLength:retainedLength,sourcePathDisplayLength:fullLength,fractions:Object.freeze(fractions),bounds:bounds.clone(),materials:Object.freeze([markerMaterial,activityMaterial]),
      updateFlow(progress:number,direction:1|-1=1){
        if(disposed||!Number.isFinite(progress)||(direction!==1&&direction!==-1))return false;
        let count=0;
        for(let marker=0;marker<12;marker++){
          let fraction=((progress+marker/12)%1+1)%1;if(direction===-1)fraction=1-fraction;
          const segment=segments.find(value=>fraction>=value.lo&&fraction<=value.hi);if(!segment)continue;
          const point=segment.a.clone().lerp(segment.b,(fraction-segment.lo)/(segment.hi-segment.lo));point.toArray(markerPositions,count++*3);
        }
        markerGeometry.setDrawRange(0,count);markerGeometry.getAttribute('position').needsUpdate=true;colors.set(Array.from({length:colors.length},(_,index)=>[.76,.32,.38][index%3]));activityGeometry.getAttribute('color').needsUpdate=true;markers.visible=true;activity.visible=true;return true;
      },
      updateActivity(values:readonly number[],min=-2,max=2){
        if(disposed||!Array.isArray(values)||values.length<2||values.length>4096||!values.every(Number.isFinite)||!Number.isFinite(min)||!Number.isFinite(max)||max<=min)return false;
        const next=new Float32Array(colors.length);
        fractions.forEach((fraction,i)=>{const index=fraction*(values.length-1),left=Math.min(values.length-2,Math.floor(index));const value=values[left]+(values[left+1]-values[left])*(index-left);scratch.copy(cold).lerp(hot,Math.max(0,Math.min(1,(value-min)/(max-min))));scratch.toArray(next,i*3);});
        colors.set(next);activityGeometry.getAttribute('color').needsUpdate=true;activity.visible=true;markers.visible=false;return true;
      },
      dispose(){if(disposed)return;disposed=true;group.removeFromParent();activityGeometry.dispose();markerGeometry.dispose();activityMaterial.dispose();markerMaterial.dispose();},
    });
  } catch {return null;}
}
