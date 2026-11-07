import {test} from 'node:test';
import assert from 'node:assert/strict';
import {coarseLocation,distanceKm,matchPerson,blankProfile,people,NYC} from '../lib/network.ts';
test('discovery rounds precise GPS and bounds the approximation',()=>{const exact:[number,number]=[40.74151237,-73.98954321];const rounded=coarseLocation(...exact);assert.notDeepEqual(rounded,exact);assert.deepEqual(rounded,[40.74,-73.99]);assert.ok(distanceKm(exact,rounded)<.4);});
test('distance filtering distinguishes NYC participants from another city',()=>{for(const p of people)assert.ok(distanceKm(NYC,[p.lat,p.lng])<2);assert.ok(distanceKm(NYC,[35.2271,-80.8431])>800);});
test('banking goal ranks an available finance helper above an unrelated profile',()=>{const p={...blankProfile,goal:'Get my first banking internship',industry:'Finance',interests:['Internship advice']};const banker=people.find(p=>p.id==='demo-james')!;const designer=people.find(p=>p.id==='demo-maya')!;assert.ok(matchPerson(banker,p).score>matchPerson(designer,p).score);assert.match(matchPerson(banker,p).reason,/internship advice/);assert.doesNotMatch(matchPerson(banker,p).reason,/hiring|referral|guarantee/);});
