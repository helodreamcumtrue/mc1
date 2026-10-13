/* Playable character looks. Every skin is drawn from a handful of colours, so adding one is easy:
   copy an entry, change the colours, and list which extras it wears. */
(function () {
'use strict';
const BL = window.BL;

const SKINS = [
  { id: 'lakshay', name: 'Lakshay', tag: 'Default', plaid: true, ripped: true, jacket: true, extras: [],
    c: { skin: '#c99874', hair: '#5a3a26', jacket: '#7a1f2b', shirt: '#16171c', pants: '#93a8b8', shoes: '#f0f0f0', eye: '#1b1b1b' } },
  { id: 'explorer', name: 'Explorer', tag: 'Treks & trails', jacket: true, extras: ['hat', 'pack'],
    c: { skin: '#d4a37b', hair: '#1d1a18', jacket: '#a89a6a', shirt: '#efe6d0', pants: '#6b6a45', shoes: '#5a3b24', hat: '#7b5a34', pack: '#6a4a2a', eye: '#1b1b1b' } },
  { id: 'kurta', name: 'Kurta', tag: 'Festival day', extras: ['kurta', 'scarf'],
    c: { skin: '#b98560', hair: '#17130f', jacket: '#f3ead3', shirt: '#f3ead3', pants: '#fbfbf7', shoes: '#3a2a1c', scarf: '#e8812b', eye: '#1b1b1b' } },
  { id: 'mountaineer', name: 'Mountaineer', tag: 'Snow ready', jacket: true, puffer: true, extras: ['beanie', 'goggles', 'pack'],
    c: { skin: '#e0b190', hair: '#3b2a20', jacket: '#c8352d', shirt: '#2a2d34', pants: '#23262d', shoes: '#444b55', beanie: '#8a8f98', goggle: '#27323f', pack: '#2d6a8f', eye: '#1b1b1b' } },
  { id: 'photographer', name: 'Photographer', tag: 'Always shooting', jacket: true, vest: true, extras: ['cap', 'camera'],
    c: { skin: '#c78f6a', hair: '#2b1d14', jacket: '#59683a', shirt: '#f4f4f4', pants: '#2f3b52', shoes: '#e8e8e8', cap: '#1f2f55', cam: '#16171a', lens: '#3b4a63', eye: '#1b1b1b' } }
];

// give every colour a texture tile (the atlas builder paints them)
for (const sk of SKINS) {
  sk.t = {};
  for (const k in sk.c) {
    let pat = 'plain';
    if (k === 'jacket' && sk.plaid) pat = 'plaid';
    else if (k === 'jacket' && sk.puffer) pat = 'puffer';
    else if (k === 'pants' && sk.id === 'lakshay') pat = 'denim';
    sk.t[k] = BL.colorTile('sk.' + sk.id + '.' + k, sk.c[k], pat, k === 'skin' ? 6 : 10);
  }
}
BL.SKINS = SKINS;
})();
