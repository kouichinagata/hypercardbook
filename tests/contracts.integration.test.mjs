import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
const owner='11111111-1111-4111-8111-111111111111';
const peer='22222222-2222-4222-8222-222222222222';
async function harness(t) {
 const root=path.resolve(import.meta.dirname,'..');
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'hcb-contract-'));
 await fs.symlink(path.join(root,'node_modules'),path.join(dir,'node_modules'));
 const key='contract-'+crypto.randomUUID();
 const template={id:'template',user_id:owner,title:'Contract',slug:'template',version:1,is_public:false,markdown_content:'---\nid: template\nplay_mode: card\nis_public: true\n---\n# Contract\n{{myMarkdownAIverifyConfirm}}\n{{yourMarkdownAIverifyConfirm}}'};
 const state={tables:{books:[template],markdown_verify:[],markdown_signatures:[]},objects:new Map(),users:{[owner]:{app_metadata:{plan:'pro'}},[peer]:{app_metadata:{plan:'free'}}}};
 globalThis[Symbol.for(key)]=state;
 t.after(async()=>{delete globalThis[Symbol.for(key)];await fs.rm(dir,{recursive:true,force:true});});
 const fixture=path.join(dir,'fixture.mjs');
 await fs.writeFile(fixture,`
 import { randomUUID } from 'node:crypto';
 const state=globalThis[Symbol.for(${JSON.stringify(key)})];
 export const env={PUBLIC_SUPABASE_URL:'https://test.invalid',HYPERCARDBOOK_SHARED_SECRET:'test-only-key',SUPABASE_SERVICE_ROLE_KEY:'test-only-key'};
 export const dev=false;
 export async function notifyOwnerSigned(){}
 export function createClient(){return client;}
 export const client={auth:{admin:{async getUserById(id){return{data:{user:state.users[id]||null},error:null}}}},storage:{from(){return {async upload(p,bytes){state.objects.set(p,bytes);return{}},getPublicUrl(p){return{data:{publicUrl:'https://test.invalid/'+p}}},async remove(paths){paths.forEach(p=>state.objects.delete(p));return{}}}}},from(table){
 let filters=[],sort=null,count=null,op=null,value;
 const execute=()=>{
 let rows=state.tables[table].filter(r=>filters.every(f=>f(r)));
 if(sort) rows.sort((a,b)=>String(a[sort]).localeCompare(String(b[sort])));
 if(count!==null)rows=rows.slice(0,count);
 if(op==='insert'){
  if(table==='markdown_verify'&&state.tables[table].some(r=>r.complete_key===value.complete_key))return{data:null,error:{code:'23505'}};
  const row={id:randomUUID(),version:1,signed_at:new Date().toISOString(),...value};state.tables[table].push(row);rows=[row];
 } else if(op==='update'){rows.forEach(r=>Object.assign(r,value));}
 else if(op==='delete'){state.tables[table]=state.tables[table].filter(r=>!rows.includes(r));}
 return{data:structuredClone(rows),error:null};
 };
 const q={select(){return q},eq(k,v){filters.push(r=>r[k]===v);return q},not(k,op,v){filters.push(r=>op==='is'?r[k]!==v:true);return q},neq(k,v){filters.push(r=>r[k]!==v);return q},in(k,vs){filters.push(r=>vs.includes(r[k]));return q},order(k){sort=k;return q},limit(n){count=n;return q},insert(v){op='insert';value=v;return q},update(v){op='update';value=v;return q},delete(){op='delete';return q},single(){const r=execute();return Promise.resolve({...r,data:r.data?.[0]||null})},maybeSingle(){return q.single()},then(resolve,reject){return Promise.resolve(execute()).then(resolve,reject)}};return q;
 }};
 `);
 const sources={verify:'src/lib/server/markdown-verify.ts',signatures:'src/lib/server/signatures.ts',contracts:'src/lib/server/contracts.ts',documents:'src/lib/server/paperoboDocuments.ts',route:'src/routes/api/paperobo/documents/+server.ts'};
 const files=Object.fromEntries(Object.keys(sources).map(k=>[k,path.join(dir,k+'.mjs')]));
 const replacements={'../plan.ts':path.join(root,'src/lib/plan.ts'),'$lib/plan':path.join(root,'src/lib/plan.ts'),'$env/dynamic/private':fixture,'$env/dynamic/public':fixture,'@supabase/supabase-js':fixture,'./paperoboNotice.ts':fixture,'$app/environment':fixture,'./markdown-verify.ts':files.verify,'$lib/server/markdown-verify':files.verify,'$lib/server/signatures':files.signatures,'$lib/server/contracts':files.contracts,'./contracts.ts':files.contracts,'$lib/signature/contract':path.join(root,'src/lib/signature/contract.ts'),'../signature/contract.ts':path.join(root,'src/lib/signature/contract.ts'),'$lib/server/paperoboDocuments':files.documents,'$lib/signature/markers':path.join(root,'src/lib/signature/markers.ts'),'$lib/content-origin':path.join(root,'src/lib/content-origin.ts'),'$lib/book-frontmatter':path.join(root,'src/lib/book-frontmatter.ts'),'./paperoboDocumentTicket':path.join(root,'src/lib/server/paperoboDocumentTicket.ts'),'../signature/fields.ts':path.join(root,'src/lib/signature/fields.ts'),'../signature/markers.ts':path.join(root,'src/lib/signature/markers.ts'),'../signature/signature-svg.ts':path.join(root,'src/lib/signature/signature-svg.ts'),'../signature/stamp-svg.ts':path.join(root,'src/lib/signature/stamp-svg.ts')};
 for(const [key,file]of Object.entries(sources)){
 let source=await fs.readFile(path.join(root,file),'utf8');
 for(const[from,to]of Object.entries(replacements))source=source.replaceAll("'"+from+"'",JSON.stringify(pathToFileURL(to).href));
 await fs.writeFile(files[key],ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText);
 }
 const route=(await import(pathToFileURL(files.route))).POST;
 const api=async body=>(await route({request:new Request('https://www.hypercardbook.org/api/paperobo/documents',{method:'POST',headers:{Authorization:'Bearer test-only-key'},body:JSON.stringify(body)}),url:new URL('https://www.hypercardbook.org/api/paperobo/documents')})).json();
 return{state,template,api,documents:await import(pathToFileURL(files.documents)),signatures:await import(pathToFileURL(files.signatures)),contracts:await import(pathToFileURL(files.contracts))};
}
const svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 240" width="600" height="240"><g fill="none" stroke="#111" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M1 1L20 20"/></g></svg>';
const seal='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 320"><circle cx="50" cy="50" r="40" fill="none" stroke="red"/></svg>';
test('contracts use ordinary attachment semantics and require real fields and a paid authenticated selector', async t => {
 const h=await harness(t);
 h.state.users[owner].app_metadata.plan='standard';
 const before=structuredClone(h.template);
 const result=await h.api({action:'read-contract',id:'template',userId:owner});
 // The template itself is never sent: the sender's own contract is made from it
 assert.notEqual(result.document.id,'template');assert.equal(result.document.isPublic,false);
 assert.match(result.document.source,/contract_source_id: template/);
 assert.deepEqual(h.template,before);assert.equal(h.state.tables.books.length,2);assert.equal(h.state.tables.markdown_verify.length,0);
 const contract=h.state.tables.books.find(b=>b.id===result.document.id);assert.equal(contract.user_id,owner);assert.equal(contract.is_public,false);
 // Sending an existing contract again sends that contract, not another copy
 assert.equal((await h.api({action:'read-contract',id:contract.id,userId:owner})).document.id,contract.id);assert.equal(h.state.tables.books.length,2);
 for(const source of ['No fields','`{{MarkdownAIverifyConfirm}}`','```\n{{MarkdownAIverifyConfirm}}\n```']) {
  h.template.markdown_content='---\nplay_mode: card\n---\n'+source;
  await assert.rejects(h.api({action:'read-contract',id:'template',userId:owner}),e=>e.status===400&&e.body.message==='This card has no MarkdownAIverifyConfirm fields.');
 }
 h.template.markdown_content=before.markdown_content;
 h.state.users[owner].app_metadata.plan='free';
 await assert.rejects(h.api({action:'read-contract',id:'template',userId:owner,plan:'pro'}),e=>e.status===403);
 assert.equal((await h.api({action:'read',id:'template',userId:owner})).document.id,'template');
});

test('a completed contract is copied once to each other signer, privately, with the signatures',async t=>{
 const h=await harness(t);
 const {document:d}=await h.api({action:'read-contract',id:'template',userId:owner});
 const client=h.signatures.adminClient();
 const mine=await h.signatures.applySignature(client,{bookId:d.id,slot:0,kind:'my',baseVersion:1,svg,actor:{type:'owner',userId:owner}});
 assert.equal(mine.ok,true);assert.equal(h.state.tables.books.length,2);
 const yours=await h.signatures.applySignature(client,{bookId:d.id,slot:0,kind:'your',baseVersion:mine.version,svg,actor:{type:'guest',name:null,userId:peer}});
 assert.equal(yours.ok,true);
 const copies=h.state.tables.books.filter(b=>b.user_id===peer);
 assert.equal(copies.length,1);assert.equal(copies[0].slug,`signed-${d.id}-${peer}`);assert.equal(copies[0].is_public,false);
 assert.match(copies[0].markdown_content,/id: signed-/);assert.equal((copies[0].markdown_content.match(/MarkdownAIverify:/g)||[]).length,2);
 assert.equal(h.state.tables.books.filter(b=>b.user_id===owner&&b.slug.startsWith('signed-')).length,0);
 await h.contracts.copySignedContractToSigners(client,d.id,yours.markdown);
 assert.equal(h.state.tables.books.filter(b=>b.user_id===peer).length,1);
});

test('Free hosts can sign and invite recipients without a verification record; recording follows the owner, including promotions', async t => {
 const h=await harness(t);
 for(const plan of ['free','standard','pro','enterprise','promotion']) {
  h.state.users[owner].app_metadata=plan==='promotion'?{plan:'free',promotion_plan:'standard',promotion_expires_at:'2099-01-01'}:{plan};
  const id='ordinary-'+plan;
  h.state.tables.books.push({...h.template,id,slug:id,version:1,markdown_content:'{{myMarkdownAIverifyConfirm}}\n{{yourMarkdownAIverifyConfirm}}'});
  const first=await h.signatures.applySignature(h.signatures.adminClient(),{bookId:id,slot:0,kind:'my',baseVersion:1,svg,actor:{type:'owner',userId:owner}});
  assert.equal(first.ok,true);assert.equal(h.state.tables.markdown_verify.filter(r=>r.book_id===id).length,0);
  const last=await h.signatures.applySignature(h.signatures.adminClient(),{bookId:id,slot:0,kind:'your',baseVersion:2,svg,actor:{type:'guest',name:null,userId:peer}});
  assert.equal(last.ok,true);assert.doesNotMatch(last.markdown,/{{/);
  assert.equal(h.state.tables.markdown_signatures.filter(r=>r.book_id===id).length,2);
  assert.equal(h.state.tables.markdown_verify.filter(r=>r.book_id===id).length,plan==='free'?0:1);
 }
 // A paying signer cannot turn a Free-owned request into a recorded document.
 h.state.users[owner].app_metadata={plan:'free'};h.state.users[peer].app_metadata={plan:'pro'};
 h.state.tables.books.push({...h.template,id:'free-host',slug:'free-host',version:1,markdown_content:'{{yourMarkdownAIverifyConfirm}}'});
 const stamped=await h.signatures.applyStamp(h.signatures.adminClient(),{bookId:'free-host',svg:seal,mode:'stamp',userId:peer});
 assert.equal(stamped.ok,true);assert.equal(stamped.complete,true);
 assert.equal(h.state.tables.markdown_verify.filter(r=>r.book_id==='free-host').length,0);
});

test('changeable fields are saved when changed and with any signature; only the last Confirm signature records Verify; changeable parts stay changeable after it', async t => {
 const h=await harness(t);const client=h.signatures.adminClient();const S=h.signatures;
 h.state.tables.books.push({...h.template,id:'mixed',slug:'mixed',version:1,markdown_content:'Name: {{MarkdownAIinput}}\nCode: {{MarkdownAIinputConfirm}}\n{{MarkdownAIverify}}\n{{yourMarkdownAIverifyConfirm}}'});
 const book=()=>h.state.tables.books.find(b=>b.id==='mixed');
 const records=()=>h.state.tables.markdown_verify.filter(r=>r.book_id==='mixed').length;
 const early=await S.applySignature(client,{bookId:'mixed',slot:0,kind:'your',baseVersion:1,svg,fields:['Taro'],actor:{type:'guest',name:null}});
 assert.equal(early.ok,false);assert.equal(early.error,'Fill in every field before the last signature.');
 // A changeable field is saved each time it changes
 const typed=await S.applyField(client,{bookId:'mixed',index:0,value:'Ichiro',actor:{type:'guest',name:null}});
 assert.equal(typed.ok,true);assert.match(typed.markdown,/Name: \{\{MarkdownAIinput=Ichiro\}\}/);
 assert.equal((await S.applyField(client,{bookId:'mixed',index:1,value:'A1',actor:{type:'owner',userId:owner}})).ok,true);
 const re=await S.applySignature(client,{bookId:'mixed',slot:0,kind:'any',baseVersion:3,svg,changeable:true,fields:['Taro'],actor:{type:'guest',name:null}});
 assert.equal(re.ok,true);assert.match(re.markdown,/Name: \{\{MarkdownAIinput=Taro\}\}/);assert.match(re.markdown,/\{\{MarkdownAIverify=https?:\/\/[^}]+\}\}/);assert.equal(records(),0);
 const bad=await S.applySignature(client,{bookId:'mixed',slot:0,kind:'your',baseVersion:4,svg,fields:['Taro','extra'],actor:{type:'guest',name:null}});
 assert.equal(bad.ok,false);assert.equal(bad.status,400);
 const last=await S.applySignature(client,{bookId:'mixed',slot:0,kind:'your',baseVersion:4,svg,fields:['Jiro'],actor:{type:'guest',name:null}});
 assert.equal(last.ok,true);assert.match(last.markdown,/Name: \{\{MarkdownAIinput=Jiro\}\}/);assert.equal(records(),1);
 assert.match(h.state.tables.markdown_verify.find(r=>r.book_id==='mixed').markdown,/MarkdownAIinput=Jiro/);
 // After completion the changeable signature can be signed again and still saves the fields, without a second record
 const after=await S.applySignature(client,{bookId:'mixed',slot:0,kind:'any',baseVersion:5,svg,changeable:true,fields:['Saburo'],actor:{type:'guest',name:null}});
 assert.equal(after.ok,true);assert.match(book().markdown_content,/Name: \{\{MarkdownAIinput=Saburo\}\}/);assert.equal(records(),1);
 // ...and a changeable field can still be saved on its own after completion
 const late=await S.applyField(client,{bookId:'mixed',index:0,value:'Shiro',actor:{type:'guest',name:null}});
 assert.equal(late.ok,true);assert.match(book().markdown_content,/Name: \{\{MarkdownAIinput=Shiro\}\}/);assert.equal(records(),1);
});
