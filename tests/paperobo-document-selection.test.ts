import test from 'node:test';
import assert from 'node:assert/strict';
import { readDocumentSelection, matchesDocumentSelection, selectionPublicType } from '../src/lib/paperobo-document-selection.ts';
const params = {paperobo_select:'card',request_id:'11111111-1111-4111-8111-111111111111',paperobo_origin:'https://paperobo.hypercardbook.org',limit:'3'};
const url = (change={}) => new URL('https://www.hypercardbook.org/?'+new URLSearchParams({...params,...change}));
test('selection handoff accepts only PapeRobo origins, bounded limits and a request id',()=>{
    assert.deepEqual(readDocumentSelection(url()),{category:'card',requestId:params.request_id,origin:params.paperobo_origin,limit:3});
    for(const change of [{paperobo_origin:'https://evil.example'},{paperobo_origin:'https://paperobo.hypercardbook.org.evil.example'},{limit:'0'},{limit:'5'},{limit:'1.5'},{request_id:''},{paperobo_select:'unknown'}])assert.equal(readDocumentSelection(url(change)),null);
    assert.equal(readDocumentSelection(url({paperobo_origin:'http://localhost:5180'})),null);
    assert.ok(readDocumentSelection(url({paperobo_origin:'http://localhost:5180'}),true));
});
test('the existing shelf filters Card/MiniApp and the four content types; ordinary and graphic books remain books',()=>{
    const rows=[{playMode:'card'},{playMode:'miniapp'},{playMode:'book'},{playMode:'book',isGraphicBook:true},{playMode:'hyperrobo'},{playMode:'paperobo'},{playMode:'book',sourceApp:'hypertv'},{playMode:'book',sourceApp:'scriptbook'},{playMode:'stack'}];
    for(const [kind,indices] of [['card',[0]],['miniapp',[1]],['book',[2,3,7]],['hyperrobo',[4]],['paperobo',[5]],['scenariobook',[6]]])assert.deepEqual(rows.flatMap((row,index)=>matchesDocumentSelection(row,kind as any)?[index]:[]),indices);
    assert.ok(rows.every(row=>!matchesDocumentSelection(row,null)));
    assert.equal(selectionPublicType('scenariobook'),'hypertv');
    assert.equal(selectionPublicType('book'),'book');
});
