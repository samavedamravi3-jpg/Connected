import {test} from 'node:test';
import assert from 'node:assert/strict';
import {isDiscoverable,scrubLocation,hiddenFor,isBlockedPair,visibleRequests,canTransition,counterpart} from '../lib/visibility.ts';

const A='user-a',B='user-b',C='user-c';
const pending=(id:string,sender:string,recipient:string)=>({id,sender,recipient,status:'pending'});

test('discovery closes exactly at the one-hour boundary',()=>{const now=1_000_000;assert.equal(isDiscoverable(now+1,now),true);assert.equal(isDiscoverable(now,now),false);assert.equal(isDiscoverable(0,now),false);});

test('expired profile loses its stored coarse location but keeps other fields',()=>{const data={name:'Ana',goal:'Find a mentor',latitude:40.74,longitude:-73.99,discovery:true};const s=scrubLocation(data);assert.equal(s.latitude,null);assert.equal(s.longitude,null);assert.equal(s.discovery,false);assert.equal(s.name,'Ana');assert.equal(data.latitude,40.74,'input is not mutated');});

test('blocks hide people in both directions and only for the people involved',()=>{const blocks=[{userId:A,personId:B}];assert.deepEqual([...hiddenFor(blocks,A)],[B]);assert.deepEqual([...hiddenFor(blocks,B)],[A]);assert.equal(hiddenFor(blocks,C).size,0);assert.equal(isBlockedPair(blocks,A,B),true);assert.equal(isBlockedPair(blocks,B,A),true);assert.equal(isBlockedPair(blocks,A,C),false);});

test('conversations with a blocked counterpart are hidden from both sides',()=>{const reqs=[pending('1',B,A),pending('2',A,C),pending('3',B,C)];const blocks=[{userId:A,personId:B}];assert.deepEqual(visibleRequests(reqs,blocks,A).map(r=>r.id),['2']);assert.deepEqual(visibleRequests(reqs,blocks,B).map(r=>r.id),['3']);assert.deepEqual(visibleRequests(reqs,blocks,C).map(r=>r.id),['2','3']);});

test('a user never sees requests they are not part of',()=>{assert.deepEqual(visibleRequests([pending('x',B,C)],[],A),[]);assert.equal(counterpart(pending('y',A,B),A),B);assert.equal(counterpart(pending('y',A,B),B),A);});

test('request transitions are limited to the right participant',()=>{const r=pending('1',A,B);assert.equal(canTransition(r,A,'cancelled',[]),true);assert.equal(canTransition(r,B,'cancelled',[]),false);assert.equal(canTransition(r,B,'accepted',[]),true);assert.equal(canTransition(r,B,'declined',[]),true);assert.equal(canTransition(r,A,'accepted',[]),false,'sender cannot accept own request');assert.equal(canTransition(r,C,'declined',[]),false,'outsider cannot act');assert.equal(canTransition({...r,status:'accepted'},B,'declined',[]),false,'only pending requests move');assert.equal(canTransition(undefined,B,'accepted',[]),false);});

test('a block in either direction prevents acceptance but still allows clean-up',()=>{const r=pending('1',A,B);for(const blocks of [[{userId:A,personId:B}],[{userId:B,personId:A}]]){assert.equal(canTransition(r,B,'accepted',blocks),false);assert.equal(canTransition(r,B,'declined',blocks),true);assert.equal(canTransition(r,A,'cancelled',blocks),true);}assert.equal(canTransition(r,B,'accepted',[{userId:A,personId:C}]),true,'unrelated blocks do not interfere');});
