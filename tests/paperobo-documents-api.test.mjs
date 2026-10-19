import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
const owner='11111111-1111-4111-8111-111111111111';
const other='22222222-2222-4222-8222-222222222222';
async function harness(t) {
    const root=path.resolve(import.meta.dirname,'..');
    const dir=await fs.mkdtemp(path.join(os.tmpdir(),'hcb-document-test-'));
    await fs.symlink(path.join(root,'node_modules'),path.join(dir,'node_modules'));
    const key='hcb-document-test-'+crypto.randomUUID();
    const rows=[['card','card',''],['miniapp','miniapp',''],['book','book',''],['graphic','book','layout: fill'],['hyperrobo','hyperrobo',''],['paperobo','paperobo',''],['scenario','book','source_app: hypertv'],['script','book','source_app: scriptbook'],['stack','stack','']].map(([id,mode,extra])=>({id,user_id:owner,title:id,slug:id,is_public:false,markdown_content:`---\nid: ${id}\nplay_mode: ${mode}\n${extra}\n---\n本文 ${id}`}));
    rows.push({id:'public',user_id:other,title:'Public Book',slug:'public',is_public:true,markdown_content:'---\nid: public\nplay_mode: book\nis_public: true\n---\n公開本文'});
    const state={rows,inserts:[],filters:[]};
    globalThis[Symbol.for(key)]=state;
    t.after(async()=>{delete globalThis[Symbol.for(key)];await fs.rm(dir,{recursive:true,force:true});});
    const fixture=path.join(dir,'fixture.mjs');
    await fs.writeFile(fixture,`
        const state=globalThis[Symbol.for(${JSON.stringify(key)})];
        export const env={PUBLIC_SUPABASE_URL:'https://test.invalid',HYPERCARDBOOK_SHARED_SECRET:'test-only-key',SUPABASE_SERVICE_ROLE_KEY:'test-only-service'};
        export const dev=false;
        export const PUBLIC_SUPABASE_URL='https://test.invalid';
        export function createClient(){return{from(){let list=state.rows;let insertion=null;const q={select(){return q},or(value){state.filters.push(value);const user=value.match(/user_id.eq.([^,]+)/)?.[1];if(user)list=list.filter(r=>r.user_id===user||r.is_public);return q},eq(key,value){list=list.filter(r=>r[key]===value);return q},order(){return q},range(a,b){list=list.slice(a,b+1);return q},insert(value){insertion=value;return q},single(){if(insertion){state.inserts.push(insertion);return Promise.resolve({data:{id:'copy-id'}})}return Promise.resolve({data:list[0]||null,error:list.length?null:{message:'missing'}})},then(resolve,reject){return Promise.resolve({data:list}).then(resolve,reject)}};return q}}}
    `);
    async function compile(name,destination,replacements) {
        let source=await fs.readFile(path.join(root,name),'utf8');
        for(const [from,to] of Object.entries(replacements))source=source.replaceAll("'"+from+"'",JSON.stringify(pathToFileURL(to).href));
        await fs.writeFile(path.join(dir,destination),ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText);
        return path.join(dir,destination);
    }
    const module=await compile('src/lib/server/paperoboDocuments.ts','documents.mjs',{'$env/dynamic/private':fixture,'$env/dynamic/public':fixture,'@supabase/supabase-js':fixture,'$app/environment':fixture,'$lib/content-origin':path.join(root,'src/lib/content-origin.ts'),'$lib/book-frontmatter':path.join(root,'src/lib/book-frontmatter.ts'),'./paperoboDocumentTicket':path.join(root,'src/lib/server/paperoboDocumentTicket.ts')});
    const route=await compile('src/routes/api/paperobo/documents/+server.ts','route.mjs',{'$lib/server/paperoboDocuments':module});
    const handler=(await import(pathToFileURL(route).href)).POST;
    const api=(body,secret='test-only-key')=>handler({request:new Request('https://www.hypercardbook.org/api/paperobo/documents',{method:'POST',headers:{authorization:'Bearer '+secret,'Content-Type':'application/json'},body:JSON.stringify(body)}),url:new URL('https://www.hypercardbook.org/api/paperobo/documents')});
    return {state,api,documents:await import(pathToFileURL(module).href)};
}
test('integration authenticates; selection separates all seven types and includes graphic books with books',async t=>{
    const h=await harness(t);
    await assert.rejects(h.api({action:'list',kind:'card',userId:owner},'invalid'),e=>e.status===401);
    for(const [kind,ids] of [['card',['card']],['book',['book','graphic','public']],['miniapp',['miniapp']],['hyperrobo',['hyperrobo']],['paperobo',['paperobo']],['scenariobook',['scenario']],['scriptbook',['script']]]){
        const body=await(await h.api({action:'list',kind,userId:owner})).json();
        assert.deepEqual(body.items.map(i=>i.id),ids);
        assert.ok(body.items.every(i=>i.coverUrl.startsWith('https://markdown.hypercardbook.org/paperobo/cover?ticket=')));
        assert.ok(body.items.every(i=>!('source' in i)));
    }
    const body=await(await h.api({action:'list',kind:'book',userId:other})).json();assert.deepEqual(body.items.map(i=>i.id),['public']);
    await assert.rejects(h.api({action:'read',id:'book',userId:other}),e=>e.status===404);
    const read=await(await h.api({action:'read',id:'book',userId:owner})).json();assert.match(read.document.source,/本文 book/);
});
test('private previews use expiring grants; download/add require current publication and copies are private',async t=>{
    const h=await harness(t);
    const open=await(await h.api({action:'open',id:'book',userId:other,selectedBy:owner})).json();
    const token=new URL(open.previewUrl).searchParams.get('paperobo_share');
    assert.equal((await h.documents.sharedDocument(token,'preview','book')).id,'book');
    await assert.rejects(h.documents.sharedDocument(token,'cover'),e=>e.status===403);
    await assert.rejects(h.documents.sharedDocument(token,'preview','public'),e=>e.status===403);
    for(const action of ['download','add'])await assert.rejects(h.api({action,id:'book',userId:owner}),e=>e.status===403);
    assert.equal(h.state.inserts.length,0);
    const download=await(await h.api({action:'download',id:'public',userId:owner})).json();assert.match(download.source,/公開本文/);
    assert.equal((await h.api({action:'add',id:'public',userId:owner})).status,200);
    const copy=h.state.inserts[0];assert.equal(copy.user_id,owner);assert.equal(copy.is_public,false);assert.equal(copy.published_at,null);assert.match(copy.markdown_content,/is_public: false/);assert.doesNotMatch(copy.markdown_content,/id: public/);
    h.state.rows.find(r=>r.id==='public').is_public=false;
    await assert.rejects(h.api({action:'download',id:'public',userId:owner}),e=>e.status===404);
});
