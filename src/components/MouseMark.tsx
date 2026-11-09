import { useEffect, type CSSProperties } from 'react';
import { deployedPath } from '../domain/deployed-path';

/** The moving pictures of the mark: this mouse itself, whole, drawn from the living model with its coat. See public/atlas-living/LICENSE.md. */
const FRAMES = 96, FRAME_WIDTH = 144, FRAME_HEIGHT = 96, SECONDS_PER_FRAME = 0.125;
/** The icon of the browser tab has pictures of its own, seen from nearer the front so that the mouse fills the square. It changes slowly, because a tab is very small. */
const TAB_SHEET = deployedPath('/atlas-living/mouse-icon-moving.webp');
const TAB_FRAMES = 32, TAB_CELL = 64, TAB_SIZE = 32, TAB_SECONDS_PER_FRAME = 0.5;

/** The mark of MouseBio_3D: the whole mouse at ease, breathing, looking about, lifting its nose and taking two slow steps. Where motion is not wanted it keeps still. */
export function MouseMark({ height = 46 }: { readonly height?: number }) {
  const width = height * FRAME_WIDTH / FRAME_HEIGHT;
  return <span className="mouse-mark" style={{ '--mark-width': `${width}px`, '--mark-height': `${height}px`, '--mark-frames': FRAMES, '--mark-seconds': `${FRAMES * SECONDS_PER_FRAME}s` } as CSSProperties} aria-hidden="true" />;
}

/** The icon of the browser tab breathes and turns its head slowly. A browser slows this down by itself while the tab is in the background. */
export function useLivingTabIcon() {
  useEffect(() => {
    if (typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = TAB_SIZE;
    const context = canvas.getContext('2d');
    if (!link || !context) return;
    const sheet = new Image();
    let timer = 0, frame = 0;
    sheet.onload = () => {
      // Each picture is made once. After that only the link changes.
      context.imageSmoothingQuality = 'high';
      const pictures = Array.from({ length: TAB_FRAMES }, (_, index) => {
        context.clearRect(0, 0, TAB_SIZE, TAB_SIZE);
        context.drawImage(sheet, index * TAB_CELL, 0, TAB_CELL, TAB_CELL, 0, 0, TAB_SIZE, TAB_SIZE);
        return canvas.toDataURL('image/png');
      });
      timer = window.setInterval(() => { frame = (frame + 1) % TAB_FRAMES; link.href = pictures[frame]; }, TAB_SECONDS_PER_FRAME * 1000);
    };
    sheet.src = TAB_SHEET;
    return () => { sheet.onload = null; window.clearInterval(timer); };
  }, []);
}
