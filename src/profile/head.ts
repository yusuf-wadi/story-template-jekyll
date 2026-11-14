import type { Region } from '../types'

export const REGION_IDS: Record<Region, string> = {
  frontal: 'region-frontal',
  parietal: 'region-parietal',
  temporal: 'region-temporal',
  occipital: 'region-occipital',
  cerebellum: 'region-cerebellum',
}

// "Profile Silhouette 02" by Mcbdixon, Wikimedia Commons, CC0. Source coords are the original 1080 box;
// everything below lives in one <g> that maps it into viewBox 0 0 800 800 (faces left).
const OUTLINE =
  'M 381 111 C 290.742188 131 258.256958 173.328369 233 219 C 209.460953 261.565186 241 290 241 290 C 241 290 225.391724 346.727905 228 363 C 230.555466 378.942627 249.335938 401.777344 233 439 C 221.263794 465.741821 225.526825 460.752625 210 492 C 199.94957 512.226257 212.108795 545.22998 236 540 C 269.261719 532.71875 239.633469 564.495605 241 574 C 245.282516 603.7854 282.284485 591.303894 261 595 C 251.94838 596.571838 246.385864 617.030273 255 623 C 272.800629 635.336121 278.460938 633.023438 273 657 C 270.342529 668.667725 275.779938 696.075317 288 707 C 307.898438 724.789063 330.2164 705.687134 350 707 C 372.986511 708.525391 429.4375 689.28125 445 700 C 460.5625 710.71875 481.914063 731.046875 467 774 C 452.085938 816.953125 384 882 384 882 C 384 882 590.265625 903.476563 685 868 C 779.734375 832.523438 855 729 855 729 C 855 729 802.432373 697.126831 778 697 C 745.469666 696.831177 693.862915 620.80957 708 630 C 727.167969 642.460938 702.955444 535.537415 724 493 C 748.386719 443.707031 794.585938 341.925781 778 260 C 767.085083 206.085999 698.351563 139.683594 638 115 C 585.250916 93.425781 479.417175 89.192017 381 111 Z'

export const HEAD_TRANSFORM = 'translate(-74.8 -38.3) scale(0.88)'

// Circuit-board outlines: orthogonal edges with 45° chamfers only (no free curves). Source coords.
const REGION_PATHS: Record<Region, string> = {
  frontal: 'M302 252 L398 156 L470 156 L470 372 L410 372 L392 354 L330 354 L302 326 Z',
  parietal: 'M487 150 L604 150 L626 172 L626 372 L505 372 L487 354 Z',
  temporal: 'M330 392 L625 392 L625 446 L591 480 L418 480 L400 462 L370 462 L330 422 Z',
  occipital: 'M642 174 L690 174 L736 220 L736 384 L690 430 L690 452 L642 452 Z',
  cerebellum: 'M624 482 L668 482 L696 510 L696 544 L668 572 L628 572 L602 546 L602 504 Z',
}

const regions = (Object.keys(REGION_PATHS) as Region[])
  .map((r) => `<path id="${REGION_IDS[r]}" class="region" data-region="${r}" d="${REGION_PATHS[r]}"/>`)
  .join('')

export const HEAD_SVG =
  `<svg viewBox="0 0 800 800" xmlns="http://www.w3.org/2000/svg" role="group" aria-label="Head profile map">` +
  `<g transform="${HEAD_TRANSFORM}"><path class="head-outline" d="${OUTLINE}"/>${regions}</g></svg>`
