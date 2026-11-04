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
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'hcb-certificate-'));
 await fs.symlink(path.join(root,'node_modules'),path.join(dir,'node_modules'));
 const key='certificate-'+crypto.randomUUID();
 const template={id:'template',user_id:owner,title:'Certificate',slug:'template',version:1,is_public:false,markdown_content:'---\nid: template\nplay_mode: card\nis_public: true\n---\n# Certificate\n{{myMarkdownAIverify}}\n{{yourMarkdownAIverify}}'};
 const state={tables:{books:[template],markdown_verify:[],markdown_signatures:[]},objects:new Map(),failIssuance:false,failCompletion:false,users:{[owner]:{app_metadata:{plan:'pro'}},[peer]:{app_metadata:{plan:'free'}}}};
 globalThis[Symbol.for(key)]=state;
 t.after(async()=>{delete globalThis[Symbol.for(key)];await fs.rm(dir,{recursive:true,force:true});});
 const fixture=path.join(dir,'fixture.mjs');
 await fs.writeFile(fixture,`
 import { randomUUID } from 'node:crypto';
 const state=globalThis[Symbol.for(${JSON.stringify(key)})];
 export const env={PUBLIC_SUPABASE_URL:'https://test.invalid',HYPERCARDBOOK_SHARED_SECRET:'test-only-key',SUPABASE_SERVICE_ROLE_KEY:'test-only-key'};
 export const dev=false;
 export function createClient(){return client;}
 export const client={auth:{admin:{async getUserById(id){return{data:{user:state.users[id]||null},error:null}}}},storage:{from(){return {async upload(p,bytes){state.objects.set(p,bytes);return{}},getPublicUrl(p){return{data:{publicUrl:'https://test.invalid/'+p}}},async remove(paths){paths.forEach(p=>state.objects.delete(p));return{}}}}},from(table){
 let filters=[],sort=null,count=null,op=null,value;
 const execute=()=>{
 let rows=state.tables[table].filter(r=>filters.every(f=>f(r)));
 if(sort) rows.sort((a,b)=>String(a[sort]).localeCompare(String(b[sort])));
 if(count!==null)rows=rows.slice(0,count);
 if(op==='insert'){
  if(table==='markdown_verify'&&((value.complete_key.startsWith('certificate-issued:')&&state.failIssuance)||(!value.complete_key.startsWith('certificate-issued:')&&state.failCompletion)))return{data:null,error:{code:'XX000',message:'injected failure'}};
  if(table==='markdown_verify'&&state.tables[table].some(r=>r.complete_key===value.complete_key))return{data:null,error:{code:'23505'}};
  const row={id:randomUUID(),version:1,signed_at:new Date().toISOString(),...value};state.tables[table].push(row);rows=[row];
 } else if(op==='update'){rows.forEach(r=>Object.assign(r,value));}
 else if(op==='delete'){state.tables[table]=state.tables[table].filter(r=>!rows.includes(r));}
 return{data:structuredClone(rows),error:null};
 };
 const q={select(){return q},eq(k,v){filters.push(r=>r[k]===v);return q},not(k,op,v){filters.push(r=>op==='is'?r[k]!==v:true);return q},neq(k,v){filters.push(r=>r[k]!==v);return q},in(k,vs){filters.push(r=>vs.includes(r[k]));return q},order(k){sort=k;return q},limit(n){count=n;return q},insert(v){op='insert';value=v;return q},update(v){op='update';value=v;return q},delete(){op='delete';return q},single(){const r=execute();return Promise.resolve({...r,data:r.data?.[0]||null})},maybeSingle(){return q.single()},then(resolve,reject){return Promise.resolve(execute()).then(resolve,reject)}};return q;
 }};
 `);
 const sources={certificates:'src/lib/server/certificates.ts',verify:'src/lib/server/markdown-verify.ts',signatures:'src/lib/server/signatures.ts',contracts:'src/lib/server/contracts.ts',documents:'src/lib/server/paperoboDocuments.ts',route:'src/routes/api/paperobo/documents/+server.ts'};
 const files=Object.fromEntries(Object.keys(sources).map(k=>[k,path.join(dir,k+'.mjs')]));
 const replacements={'../plan.ts':path.join(root,'src/lib/plan.ts'),'$lib/plan':path.join(root,'src/lib/plan.ts'),'$env/dynamic/private':fixture,'$env/dynamic/public':fixture,'@supabase/supabase-js':fixture,'$app/environment':fixture,'./certificates.ts':files.certificates,'./markdown-verify.ts':files.verify,'$lib/server/markdown-verify':files.verify,'$lib/server/certificates':files.certificates,'$lib/server/signatures':files.signatures,'$lib/server/contracts':files.contracts,'./contracts.ts':files.contracts,'$lib/signature/contract':path.join(root,'src/lib/signature/contract.ts'),'../signature/contract.ts':path.join(root,'src/lib/signature/contract.ts'),'$lib/server/paperoboDocuments':files.documents,'$lib/signature/markers':path.join(root,'src/lib/signature/markers.ts'),'$lib/content-origin':path.join(root,'src/lib/content-origin.ts'),'$lib/book-frontmatter':path.join(root,'src/lib/book-frontmatter.ts'),'./paperoboDocumentTicket':path.join(root,'src/lib/server/paperoboDocumentTicket.ts'),'../signature/fields.ts':path.join(root,'src/lib/signature/fields.ts'),'../signature/markers.ts':path.join(root,'src/lib/signature/markers.ts'),'../signature/signature-svg.ts':path.join(root,'src/lib/signature/signature-svg.ts'),'../signature/stamp-svg.ts':path.join(root,'src/lib/signature/stamp-svg.ts')};
 for(const [key,file]of Object.entries(sources)){
 let source=await fs.readFile(path.join(root,file),'utf8');
 for(const[from,to]of Object.entries(replacements))source=source.replaceAll("'"+from+"'",JSON.stringify(pathToFileURL(to).href));
 await fs.writeFile(files[key],ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText);
 }
 const route=(await import(pathToFileURL(files.route))).POST;
 const api=async body=>(await route({request:new Request('https://www.hypercardbook.org/api/paperobo/documents',{method:'POST',headers:{Authorization:'Bearer test-only-key'},body:JSON.stringify(body)}),url:new URL('https://www.hypercardbook.org/api/paperobo/documents')})).json();
 return{state,template,api,documents:await import(pathToFileURL(files.documents)),certificates:await import(pathToFileURL(files.certificates)),signatures:await import(pathToFileURL(files.signatures)),contracts:await import(pathToFileURL(files.contracts))};
}
const svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 240" width="600" height="240"><g fill="none" stroke="#111" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M1 1L20 20"/></g></svg>';
const seal='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 320"><circle cx="50" cy="50" r="40" fill="none" stroke="red"/></svg>';
test('issuing rejects missing/code-only fields; copies stay private and every issuance has a durable original',async t=>{
 const h=await harness(t);const before=h.template.markdown_content;
 for(const body of ['No fields','`{{MarkdownAIverify}}`','```\n{{MarkdownAIverify}}\n```']){
 h.template.markdown_content='---\nplay_mode: card\n---\n'+body;
 await assert.rejects(h.api({action:'issue-certificate',id:'template',userId:owner}),e=>e.status===400);
 }
 assert.equal(h.state.tables.books.length,1);
 h.template.markdown_content=before;
 const {document:d}=await h.api({action:'issue-certificate',id:'template',userId:owner});
 assert.equal(h.template.markdown_content,before);assert.equal(d.isPublic,false);assert.match(d.source,/is_public: false/);assert.doesNotMatch(d.source,/is_public: true/);assert.match(d.source,/certificate_issuer:/);
 assert.equal(h.state.tables.markdown_verify.length,1);assert.equal(h.state.tables.markdown_verify[0].verify_id,d.certificateId);
 const share={id:d.id,userId:peer,selectedBy:owner,certificateId:d.certificateId};
 const open=await h.api({action:'open',...share});assert.equal(open.certificate.status,'pending');assert.equal(open.certificate.remaining,2);assert.equal(open.certificate.nextSlot.kind,'your');
 const token=new URL(open.previewUrl).searchParams.get('paperobo_share');assert.equal((await h.documents.sharedDocument(token,'preview',d.id)).id,d.id);
 const download=await h.api({action:'download',...share});assert.equal(download.source,d.source);
 await assert.rejects(h.api({action:'open',...share,certificateId:crypto.randomUUID()}),e=>e.status===404);
 await assert.rejects(h.api({action:'download',id:'template',userId:peer,selectedBy:owner}),e=>e.status===403);
});
test('a recipient completes the certificate; issuer cannot consume recipient fields; final downloads retain the sealed version',async t=>{
 const h=await harness(t);const{document:d}=await h.api({action:'issue-certificate',id:'template',userId:owner});
 const share={id:d.id,selectedBy:owner,certificateId:d.certificateId};
 await assert.rejects(h.api({action:'sign-certificate',...share,userId:owner,slot:1,kind:'your',baseVersion:1,svg}),e=>e.status===403);
 const stamp=await h.api({action:'stamp',...share,userId:owner,svg:seal,mode:'stamp'});assert.equal(stamp.remaining,1);
 await assert.rejects(h.api({action:'stamp',...share,userId:owner,svg:seal,mode:'stamp'}),e=>e.status===409);
 await assert.rejects(h.api({action:'sign-certificate',...share,userId:peer,slot:0,kind:'your',baseVersion:1,svg}),e=>e.status===409);
 const anonymous=await h.signatures.applySignature(h.signatures.adminClient(), {bookId:d.id,slot:0,kind:'your',baseVersion:2,svg,actor:{type:'guest',name:null}});assert.equal(anonymous.ok,false);assert.equal(anonymous.status,403);
 const pending=await h.api({action:'open',...share,userId:peer});assert.equal(pending.certificate.remaining,1);assert.equal(pending.certificate.nextSlot.version,2);
 await h.api({action:'sign-certificate',...share,userId:peer,slot:0,kind:'your',baseVersion:2,svg});
 const signed=await h.api({action:'open',...share,userId:peer});assert.equal(signed.certificate.status,'complete');assert.equal(signed.certificate.remaining,0);assert.equal(signed.hasSignMarkers,false);
 assert.equal(h.state.tables.markdown_verify.length,2);assert.equal(h.state.tables.markdown_signatures[1].signer_id,peer);
 const original=(await h.api({action:'download',...share,userId:peer})).source;
 h.state.tables.books.find(b=>b.id===d.id).markdown_content='tampered {{MarkdownAIverify}}';
 assert.equal((await h.api({action:'download',...share,userId:peer})).source,original);
 const token=new URL(signed.previewUrl).searchParams.get('paperobo_share');assert.equal((await h.documents.sharedDocument(token,'preview',d.id)).markdown_content,original);
 await assert.rejects(h.api({action:'stamp',...share,userId:peer,svg:seal,mode:'stamp'}),e=>e.status===409);
});
test('issuance failure never succeeds; completion failures stay unrecorded until a safe retry',async t=>{
 const h=await harness(t);h.state.failIssuance=true;
 await assert.rejects(h.api({action:'issue-certificate',id:'template',userId:owner}),e=>e.status===503);
 assert.equal(h.state.tables.books.length,1);assert.equal(h.state.tables.markdown_verify.length,0);
 h.state.failIssuance=false;const{document:d}=await h.api({action:'issue-certificate',id:'template',userId:owner});
 const share={id:d.id,selectedBy:owner,certificateId:d.certificateId};
 await h.api({action:'stamp',...share,userId:owner,svg:seal,mode:'stamp'});
 h.state.failCompletion=true;
 await h.api({action:'stamp',...share,userId:peer,svg:seal,mode:'stamp'});
 assert.equal((await h.api({action:'open',...share,userId:peer})).certificate.status,'recording');
 await assert.rejects(h.api({action:'download',...share,userId:peer}),e=>e.status===503);
 h.state.failCompletion=false;
 assert.equal((await h.api({action:'open',...share,userId:peer})).certificate.status,'complete');
 assert.equal((await h.api({action:'open',...share,userId:owner})).certificate.status,'complete');
 assert.equal(h.state.tables.markdown_verify.length,2);
});


test('contracts use ordinary attachment semantics and require real fields and a paid authenticated selector', async t => {
 const h=await harness(t);
 h.state.users[owner].app_metadata.plan='standard';
 const before=structuredClone(h.template);
 const result=await h.api({action:'read-contract',id:'template',userId:owner});
 // The template itself is never sent: the sender's own contract is made from it
 assert.notEqual(result.document.id,'template');assert.equal(result.document.certificateId,undefined);assert.equal(result.document.isPublic,false);
 assert.match(result.document.source,/contract_source_id: template/);
 assert.deepEqual(h.template,before);assert.equal(h.state.tables.books.length,2);assert.equal(h.state.tables.markdown_verify.length,0);
 const contract=h.state.tables.books.find(b=>b.id===result.document.id);assert.equal(contract.user_id,owner);assert.equal(contract.is_public,false);
 // Sending an existing contract again sends that contract, not another copy
 assert.equal((await h.api({action:'read-contract',id:contract.id,userId:owner})).document.id,contract.id);assert.equal(h.state.tables.books.length,2);
 await assert.rejects(h.api({action:'issue-certificate',id:'template',userId:owner}),e=>e.status===403);
 for(const source of ['No fields','`{{MarkdownAIverify}}`','```\n{{MarkdownAIverify}}\n```']) {
  h.template.markdown_content='---\nplay_mode: card\n---\n'+source;
  await assert.rejects(h.api({action:'read-contract',id:'template',userId:owner}),e=>e.status===400&&e.body.message==='This card has no MarkdownAIverify fields.');
 }
 h.template.markdown_content=before.markdown_content;
 h.state.users[owner].app_metadata.plan='free';
 for(const action of ['read-contract','issue-certificate'])await assert.rejects(h.api({action,id:'template',userId:owner,plan:'pro'}),e=>e.status===403);
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
  h.state.tables.books.push({...h.template,id,slug:id,version:1,markdown_content:'{{myMarkdownAIverify}}\n{{yourMarkdownAIverify}}'});
  const first=await h.signatures.applySignature(h.signatures.adminClient(),{bookId:id,slot:0,kind:'my',baseVersion:1,svg,actor:{type:'owner',userId:owner}});
  assert.equal(first.ok,true);assert.equal(h.state.tables.markdown_verify.filter(r=>r.book_id===id).length,0);
  const last=await h.signatures.applySignature(h.signatures.adminClient(),{bookId:id,slot:0,kind:'your',baseVersion:2,svg,actor:{type:'guest',name:null,userId:peer}});
  assert.equal(last.ok,true);assert.doesNotMatch(last.markdown,/{{/);
  assert.equal(h.state.tables.markdown_signatures.filter(r=>r.book_id===id).length,2);
  assert.equal(h.state.tables.markdown_verify.filter(r=>r.book_id===id).length,plan==='free'?0:1);
 }
 // A paying signer cannot turn a Free-owned request into a recorded document.
 h.state.users[owner].app_metadata={plan:'free'};h.state.users[peer].app_metadata={plan:'pro'};
 h.state.tables.books.push({...h.template,id:'free-host',slug:'free-host',version:1,markdown_content:'{{yourMarkdownAIverify}}'});
 const stamped=await h.signatures.applyStamp(h.signatures.adminClient(),{bookId:'free-host',svg:seal,mode:'stamp',userId:peer});
 assert.equal(stamped.ok,true);assert.equal(stamped.complete,true);
 assert.equal(h.state.tables.markdown_verify.filter(r=>r.book_id==='free-host').length,0);
});

test('a recorded issuance retains recording entitlement after its issuer downgrades', async t => {
 const h=await harness(t);const {document:d}=await h.api({action:'issue-certificate',id:'template',userId:owner});
 h.state.users[owner].app_metadata.plan='free';
 await h.api({action:'stamp',id:d.id,userId:owner,selectedBy:owner,certificateId:d.certificateId,svg:seal,mode:'stamp'});
 await h.api({action:'sign-certificate',id:d.id,userId:peer,selectedBy:owner,certificateId:d.certificateId,svg,slot:0,kind:'your',baseVersion:2});
 assert.equal((await h.api({action:'open',id:d.id,userId:peer,selectedBy:owner,certificateId:d.certificateId})).certificate.status,'complete');
});
