import test from 'node:test';
import assert from 'node:assert/strict';
import { workspaceView } from '../public/workspace-state.js';
const base = { account:null, online:false, busy:false, gameRunning:false, libraryLoaded:false };
test('unloaded library prompts connection instead of claiming it is empty', () => {
 const view = workspaceView(base);
 assert.equal(view.emptyAction, 'CONNECT MY PC ↗');
 assert.notEqual(view.emptyTitle, workspaceView({...base, libraryLoaded:true}).emptyTitle);
 assert.equal(view.canSave, false);
});
test('signed-out connected companion allows library management but no transfer', () => {
 const view = workspaceView({...base, online:true, libraryLoaded:true});
 assert.equal(view.emptyAction, 'REFRESH ACCOUNT ↻');
 assert.equal(view.canDelete, true);
 assert.equal(view.canApply, false);
});
test('verified account enables saving while game and busy states protect transfers', () => {
 const ready = {...base, account:{name:'Example'}, online:true, libraryLoaded:true};
 assert.equal(workspaceView(ready).canApply, true);
 assert.equal(workspaceView(ready).emptyAction, '+ SAVE CURRENT SETTINGS');
 assert.equal(workspaceView({...ready, gameRunning:true}).canApply, false);
 const busy = workspaceView({...ready, busy:true});
 assert.equal(busy.canApply, false);
 assert.equal(busy.canSave, false);
 assert.equal(busy.canDelete, false);
});
