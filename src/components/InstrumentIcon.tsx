import type { LabToolId } from '../domain/dissection-lab';

const PATHS: Readonly<Record<LabToolId, React.ReactNode>> = {
  hand: <path d="M8 13V6a1.5 1.5 0 0 1 3 0v5m0-1V4.5a1.5 1.5 0 0 1 3 0V11m0-5.5a1.5 1.5 0 0 1 3 0V12m0-3.5a1.5 1.5 0 0 1 3 0V15c0 3.5-2.5 6-6 6h-1.2c-2 0-3.3-.8-4.4-2.4L4.2 14a1.5 1.5 0 0 1 2.3-1.8L8 13.8" />,
  scalpel: <><path d="m4 20 8.5-8.5" /><path d="m12.5 11.5 2-2 5.5-5.5c.5 2.5-.7 6-3.2 8.2-1.3 1.2-2.7 1.5-4.3-.7Z" /></>,
  scissors: <><circle cx="6" cy="18" r="2.6" /><circle cx="6" cy="6" r="2.6" /><path d="M8.2 7.5 20 17M8.2 16.5 20 7" /></>,
  forceps: <><path d="M12 3 9.8 12 12 21" /><path d="M12 3l2.2 9L12 21" /><path d="M10.6 8.5h2.8" /></>,
  probe: <><circle cx="19" cy="5" r="1.4" /><path d="m18 6-9 9" /><path d="m9.5 14.5-5 5" strokeWidth="3" /></>,
  'bone-cutter': <><circle cx="6" cy="19" r="2.2" /><circle cx="14" cy="20" r="2.2" /><path d="M7.5 17.5 11 10l3-6M12.5 18 11 10 9 4" strokeWidth="2.2" /></>,
  ligature: <><path d="M4 12c3-2.5 5-2.5 8 0s5 2.5 8 0" /><path d="M9.5 8.5c-1.4 1.2-1.4 5.8 0 7 1.4-1.2 1.4-5.8 0-7ZM14.5 8.5c-1.4 1.2-1.4 5.8 0 7 1.4-1.2 1.4-5.8 0-7Z" /></>,
  suture: <><path d="M5 14c0-5 4-9 9-9 2 0 3.5.4 5 1.5" /><path d="M5 14l-1.5 2.5L6 16" /><path d="M19 6.5c1.5 3-3 8-7 9s-5 3-3 5" /></>,
  pin: <><circle cx="12" cy="6" r="2.8" /><path d="m12 8.8.2 12.2" /></>,
  swab: <><ellipse cx="17.5" cy="6.5" rx="2.4" ry="3.6" transform="rotate(45 17.5 6.5)" /><path d="M15.5 8.5 4 20" /></>,
  syringe: <><path d="m3.5 20.5 5-5" /><path d="m7 12 5 5 7-7-5-5Z" /><path d="m17 3 4 4M15.5 7.5 19 4" /></>,
};

/** A small drawing of an instrument for the tray. */
export function InstrumentIcon({ tool, size = 22 }: { readonly tool: LabToolId; readonly size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{PATHS[tool]}</svg>;
}
