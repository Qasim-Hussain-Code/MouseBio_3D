/**
 * Where the walking mouse goes. It is an illustration, and none of these numbers is a measurement of a mouse: the pace, the turns and the length of each outing are
 * chosen for viewing. The mouse walks on a flat floor, goes from place to place in view, stops now and then, leaves the view, and later comes back in from a corner.
 *
 * Everything here is on the floor of the stage, the room in which the viewer stands. The stage is not the coordinate system of the model: the viewer keeps the model where it
 * is and moves the camera by the opposite amount, so that nothing in the model has to know that it has walked anywhere.
 */
export type FloorPoint = readonly [number, number];

/** Where the mouse is on the floor of the stage, in metres, and the way it faces, in radians. */
export interface StagePose {
  readonly x: number;
  readonly y: number;
  readonly heading: number;
}

export const STAGE_START: StagePose = Object.freeze({ x: 0, y: 0, heading: 0 });

/** A point given along the mouse, forwards, and across it, to its side, as a point of the floor of the stage. */
export function stagePoint(pose: StagePose, forward: number, side: number): FloorPoint {
  const c = Math.cos(pose.heading), s = Math.sin(pose.heading);
  return [pose.x + forward * c - side * s, pose.y + forward * s + side * c];
}

/** A point of the floor of the stage, as how far it lies ahead of the mouse and to its side. */
export function bodyPoint(pose: StagePose, x: number, y: number): FloorPoint {
  const c = Math.cos(pose.heading), s = Math.sin(pose.heading), dx = x - pose.x, dy = y - pose.y;
  return [dx * c + dy * s, -dx * s + dy * c];
}

/**
 * A point fixed to the viewer is carried along when the mouse moves from one pose to the next, because the model stays still: where it now lies in the coordinates of the model.
 * The coordinates of the model are those of a mouse at the start of the stage.
 */
export function carried(from: StagePose, to: StagePose, forward: number, side: number): FloorPoint {
  const [x, y] = stagePoint(from, forward, side);
  return bodyPoint(to, x, y);
}

export const WANDER = Object.freeze({
  /** The fastest turn, in radians per second. */
  turnRate: 0.85,
  /** Near enough to a goal to have reached it, in metres. */
  arrival: 0.012,
  /** How long a stop lasts, in seconds, at the least and more. */
  stop: [1.2, 2.6] as const,
  /** The share of arrivals at which it stops for a while. */
  stopShare: 0.45,
  /** How long it stays out of view before it comes back, in seconds. */
  away: [1.5, 3.5] as const,
  /** How many places it visits before it leaves, at the least and more. */
  visits: [1, 3] as const,
  /** How far it gets to walk before it gives up on a goal it cannot reach, in metres. */
  patience: 1.2,
  /** How much faster it goes for a while after being touched. */
  startledPace: 2.1,
  startledSeconds: 2.4,
  /** The share of stops at which it sits up and washes, how long that lasts, in seconds, and how long it stands between washes when it is not walking. */
  sitShare: 0.55,
  sit: [3.2, 2.6] as const,
  sitEvery: [9, 16] as const,
});

export type WanderMode = 'still' | 'going' | 'stopped' | 'away';

export interface WanderState {
  readonly pose: StagePose;
  readonly mode: WanderMode;
  readonly goal: FloorPoint | null;
  /** Seconds left of a stop, or out of view. */
  readonly wait: number;
  /** Places still to visit before leaving. */
  readonly visitsLeft: number;
  /** The goal lies out of view: reaching it, or passing out of view, ends the outing. */
  readonly leaving: boolean;
  /** Metres walked towards the present goal. */
  readonly walked: number;
  /** Rest on arrival, as after a click on the floor or when asked to stand. */
  readonly restAfter: boolean;
  /** Seconds left of going faster after being touched. */
  readonly startled: number;
  /** The turn being made, in radians per second, so that the head can lead it. */
  readonly turning: number;
  /** Seconds left of sitting up to wash. */
  readonly sitLeft: number;
  /** Seconds until it next sits up, when it is standing and not walking. */
  readonly nextSit: number;
}

export const WANDER_START: WanderState = Object.freeze({ pose: STAGE_START, mode: 'still', goal: null, wait: 0, visitsLeft: 0, leaving: false, walked: 0, restAfter: false, startled: 0, turning: 0, sitLeft: 0, nextSit: 7 });

/** What the viewer knows about the view. Places are points of the floor of the stage. */
export interface WanderView {
  readonly inView: boolean;
  readonly random: () => number;
  /** A place on the floor that is well inside the view. */
  inside(): FloorPoint;
  /** A place on the floor out of the view, by the nearest way out or another. */
  outside(): FloorPoint;
  /** A place out of the view near a corner, chosen at random, and a place inside to walk to from there. */
  entry(): { readonly at: FloorPoint; readonly goal: FloorPoint };
}

const between = (random: () => number, range: readonly [number, number]) => range[0] + random() * range[1];
const wrap = (angle: number) => { const turn = (angle + Math.PI) % (2 * Math.PI); return (turn < 0 ? turn + 2 * Math.PI : turn) - Math.PI; };

/** How much of the walking pace the mouse should be at, in this state. It eases there, and the distance it travels follows its steps. */
export const wantsToStep = (state: WanderState) => state.mode === 'going';

/** It sits up to wash only while it is not going anywhere. */
export const wantsToSit = (state: WanderState) => state.sitLeft > 0 && state.mode !== 'going' && state.mode !== 'away';

/** How much faster than the walking pace it steps. */
export const paceOf = (state: WanderState) => state.startled > 0 ? WANDER.startledPace : 1;

/** Facing a place, from a pose. */
export const headingTo = (pose: Pick<StagePose, 'x' | 'y'>, point: FloorPoint) => Math.atan2(point[1] - pose.y, point[0] - pose.x);

/**
 * One step of the mouse's outing. `travel` is how far its legs have carried it in these seconds, which is decided by its steps, so that its feet do not slide.
 * With `wander` false it does not start anywhere new, and if it is out of view it comes back into view and stops there, so that it is never left out of sight.
 */
export function stepWander(state: WanderState, seconds: number, travel: number, wander: boolean, view: WanderView): WanderState {
  const startled = Math.max(0, state.startled - seconds);
  const { pose } = state;
  switch (state.mode) {
    case 'still':
      if (!view.inView && !wander) return comeBack(state, view, true);
      if (!wander) {
        if (state.sitLeft > 0) return { ...state, sitLeft: Math.max(0, state.sitLeft - seconds), startled, turning: 0 };
        const nextSit = state.nextSit - seconds;
        return nextSit > 0 ? { ...state, nextSit, startled, turning: 0 } : { ...state, nextSit: between(view.random, WANDER.sitEvery), sitLeft: between(view.random, WANDER.sit), startled, turning: 0 };
      }
      return nextGoal({ ...state, sitLeft: 0, visitsLeft: state.visitsLeft > 0 ? state.visitsLeft : Math.floor(between(view.random, WANDER.visits)) + 1, restAfter: false, startled, turning: 0 }, view);
    case 'stopped': {
      if (!wander && !state.restAfter) return { ...state, mode: 'still', goal: null, startled, turning: 0 };
      const wait = state.wait - seconds, sitLeft = Math.max(0, state.sitLeft - seconds);
      return wait > 0 ? { ...state, wait, sitLeft, startled, turning: 0 } : nextGoal({ ...state, wait: 0, sitLeft: 0, startled, turning: 0 }, view);
    }
    case 'away': {
      // Something has brought it back into view, such as a reset of the view: it does not jump away from where it is seen.
      if (view.inView) return { ...state, mode: 'still', wait: 0, startled: 0, turning: 0 };
      const wait = state.wait - seconds;
      if (!wander || wait <= 0) return comeBack({ ...state, startled: 0 }, view, !wander);
      return { ...state, wait, turning: 0 };
    }
    case 'going': {
      if (!state.goal) return { ...state, mode: 'still', startled, turning: 0 };
      // Asked to stand, it stops where it is, as long as that is in view.
      if (!wander && !state.restAfter && view.inView) return { ...state, mode: 'still', goal: null, leaving: false, startled, turning: 0 };
      const wanted = headingTo(pose, state.goal);
      const off = wrap(wanted - pose.heading);
      const most = WANDER.turnRate * Math.max(seconds, 0);
      const turn = Math.max(-most, Math.min(most, off));
      const heading = wrap(pose.heading + turn);
      const moved: StagePose = { x: pose.x + Math.cos(heading) * travel, y: pose.y + Math.sin(heading) * travel, heading };
      const walked = state.walked + travel;
      const now: WanderState = { ...state, pose: moved, walked, startled, turning: seconds > 0 ? turn / seconds : 0 };
      if (state.leaving && !view.inView) return { ...now, mode: 'away', goal: null, leaving: false, wait: between(view.random, WANDER.away), turning: 0 };
      const reached = Math.hypot(state.goal[0] - moved.x, state.goal[1] - moved.y) < WANDER.arrival;
      if (!reached && walked < WANDER.patience) return now;
      // A goal out of view that was reached in view: it was not far enough, so it goes on.
      if (state.leaving) return { ...now, goal: view.outside(), walked: 0 };
      if (state.restAfter) return { ...now, mode: 'still', goal: null, restAfter: false, turning: 0 };
      if (view.random() < WANDER.stopShare) {
        // A stop may be a wash: it sits down again a moment before it goes on.
        const sitLeft = view.random() < WANDER.sitShare ? between(view.random, WANDER.sit) : 0;
        return { ...now, mode: 'stopped', goal: null, wait: sitLeft > 0 ? sitLeft + 0.8 : between(view.random, WANDER.stop), sitLeft, turning: 0 };
      }
      return nextGoal({ ...now, turning: 0 }, view);
    }
  }
}

function nextGoal(state: WanderState, view: WanderView): WanderState {
  if (state.visitsLeft <= 0) return { ...state, mode: 'going', goal: view.outside(), leaving: true, walked: 0, restAfter: false };
  return { ...state, mode: 'going', goal: view.inside(), leaving: false, walked: 0, visitsLeft: state.visitsLeft - 1, restAfter: false };
}

/** Back into the view, from a corner, walking towards a place inside. */
function comeBack(state: WanderState, view: WanderView, rest: boolean): WanderState {
  const { at, goal } = view.entry();
  const pose: StagePose = { x: at[0], y: at[1], heading: headingTo({ x: at[0], y: at[1] }, goal) };
  return { ...state, pose, mode: 'going', goal, leaving: false, walked: 0, wait: 0, visitsLeft: rest ? 0 : Math.floor(between(view.random, WANDER.visits)) + 1, restAfter: rest, turning: 0 };
}

/** Go to a place on the floor, and stop there. */
export const goToFloor = (state: WanderState, point: FloorPoint): WanderState => ({ ...state, mode: 'going', goal: point, leaving: false, walked: 0, restAfter: true });

/** It has been touched: it goes faster for a while. */
export const startle = (state: WanderState): WanderState => ({ ...state, startled: WANDER.startledSeconds, sitLeft: 0 });
