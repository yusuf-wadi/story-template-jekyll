import type { Region } from '../types'

// Placeholder art (Task 12 replaces it): original left-facing silhouette, viewBox 0 0 800 800.
export const REGION_IDS: Record<Region, string> = {
  frontal: 'region-frontal',
  parietal: 'region-parietal',
  temporal: 'region-temporal',
  occipital: 'region-occipital',
  cerebellum: 'region-cerebellum',
}

const OUTLINE =
  'M300 150 C400 85 590 95 648 260 C690 380 645 480 590 540 L596 790 L400 790 L396 640 ' +
  'C340 642 280 622 252 592 C232 590 222 575 230 558 C212 550 210 538 220 528 ' +
  'C200 522 192 512 200 500 C186 494 190 480 204 470 C214 462 214 452 212 444 ' +
  'C196 440 176 430 168 420 C190 380 228 340 240 300 C248 240 262 180 300 150 Z'

const REGION_PATHS: Record<Region, string> = {
  frontal: 'M272 285 C280 200 335 145 412 128 L428 296 L335 330 C300 322 276 306 272 285 Z',
  parietal: 'M440 128 C520 128 580 170 600 235 L508 308 L444 296 Z',
  temporal: 'M338 345 L432 312 L498 326 L488 402 C440 432 380 424 342 398 Z',
  occipital: 'M520 322 L610 250 C632 305 626 365 596 412 L506 404 Z',
  cerebellum: 'M514 420 L592 428 C572 474 532 504 484 498 C474 470 486 442 514 420 Z',
}

const regions = (Object.keys(REGION_PATHS) as Region[])
  .map((r) => `<path id="${REGION_IDS[r]}" class="region" data-region="${r}" d="${REGION_PATHS[r]}"/>`)
  .join('')

export const HEAD_SVG =
  `<svg viewBox="0 0 800 800" xmlns="http://www.w3.org/2000/svg" role="group" aria-label="Head profile map">` +
  `<path class="head-outline" d="${OUTLINE}"/>${regions}</svg>`
