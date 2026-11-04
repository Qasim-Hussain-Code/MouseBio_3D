import type {ExcitableCableResult} from '../domain/excitable-cable';
export type PathSignalDisplay = {
  readonly referenceId:string;readonly kind:'flow';readonly pathRowIndex:number;readonly transitMs:number|null;readonly direction:1|-1;readonly playing:boolean;readonly playbackRate:number;
}|{
  readonly referenceId:string;readonly kind:'activity';readonly pathRowIndex:number;readonly result:ExcitableCableResult;readonly playing:boolean;readonly playbackRate:number;
};
