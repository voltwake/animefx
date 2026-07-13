import * as anime from 'animejs';
export { defineMotionRoles } from './design.mjs';

if (!globalThis.anime) globalThis.anime = anime;
await import('./lib/anime-fx.js');

const AnimeFX = globalThis.AnimeFX;

export { AnimeFX };
export default AnimeFX;
