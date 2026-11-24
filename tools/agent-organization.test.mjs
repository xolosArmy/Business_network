import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const data=JSON.parse(read('data/agent-identities.json'));
const page=read('organizacion-agentica/index.html');
test('three exact unique public TXIDs, without false proof of block inclusion',()=>{
 assert.equal(data.identities.length,3);
 assert.equal(new Set(data.identities.map(i=>i.txid)).size,3);
 for (const item of data.identities){
  assert.match(item.txid,/^[0-9a-f]{64}$/);
  assert.ok(page.includes(item.txid));
  assert.ok(page.includes('https://explorer.e.cash/tx/'+item.txid));
  assert.ok(page.includes('id="'+item.slug+'"'));
 }
 assert.equal(data.independentBlockVerification,false);
 assert.ok(page.includes('no se ha realizado aquí una comprobación independiente'));
});
test('indexable, accessible directory with identity and human authority boundaries',()=>{
 assert.ok(page.includes('lang="es"'));
 assert.ok(page.includes('id="contenido"'));
 assert.equal((page.match(/<h1\b/g)||[]).length,1);
 assert.ok(page.includes('href="https://xolosarmy.xyz/organizacion-agentica/"'));
 assert.ok(page.includes('independencia de criterio'));
 assert.ok(page.includes('Fernando conserva la autoridad final'));
 assert.ok(!page.includes('@hotmail.com'));
 assert.ok(!page.includes('tepoztli@muse.ai'));
});
test('directory linked in shared navigation, portal and sitemap',()=>{
 assert.ok(read('components/navigation.html').includes('/organizacion-agentica/'));
 assert.ok(read('components/footer.html').includes('/organizacion-agentica/'));
 assert.ok(read('index.html').includes('09 / EQUIPO Y MEMORIA'));
 assert.equal(read('sitemap.xml').split('https://xolosarmy.xyz/organizacion-agentica/').length-1,1);
});
