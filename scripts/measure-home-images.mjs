// Portable entrypoint for the original before/after audit. Measurement loop is unchanged.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
const { values } = parseArgs({ options: {
 source: { type: 'string', default: fileURLToPath(new URL('..', import.meta.url)) },
 out: { type: 'string' },
 baseURL: { type: 'string', default: 'http://127.0.0.1:3187' },
 help: { type: 'boolean', default: false },
} });
if (values.help) {
 console.log('Usage: node scripts/measure-home-images.mjs --source <checkout-with-node_modules> --out <new-output-directory> [--baseURL http://127.0.0.1:3187]');
 process.exit(0);
}
if (!values.out) throw new Error('--out <new-output-directory> is required');
const source = path.resolve(values.source);
const out = path.resolve(values.out);
// Fail rather than overwrite an existing baseline. Never load env files.
fs.mkdirSync(out, { recursive: false });
const resolveFromSource = createRequire(path.join(source, 'package.json')).resolve;
const { chromium, devices } = (await import(pathToFileURL(resolveFromSource('@playwright/test')).href)).default;
const { default: sharp } = await import(pathToFileURL(resolveFromSource('sharp')).href);
const origin = values.baseURL;
(async()=>{
 const browser=await chromium.launch();
 for(const [name,options] of [['desktop',{viewport:{width:1440,height:900},deviceScaleFactor:1}],['mobile',{...devices['iPhone 12'],viewport:{width:390,height:844},deviceScaleFactor:3}]]){
 const context=await browser.newContext(options); const page=await context.newPage(); const cdp=await context.newCDPSession(page);
 await cdp.send('Network.enable'); await cdp.send('Network.setCacheDisabled',{cacheDisabled:false});
 let phase='initial'; const requests=new Map(); const errors=[];
 cdp.on('Network.requestWillBeSent',e=>requests.set(e.requestId,{id:e.requestId,url:e.request.url,type:e.type,phase,priority:e.request.initialPriority,initiator:e.initiator.type}));
 cdp.on('Network.responseReceived',e=>Object.assign(requests.get(e.requestId)||{},{status:e.response.status,mimeType:e.response.mimeType,fromDiskCache:e.response.fromDiskCache,fromServiceWorker:e.response.fromServiceWorker,headers:e.response.headers}));
 cdp.on('Network.loadingFinished',e=>Object.assign(requests.get(e.requestId)||{},{transferredBytes:e.encodedDataLength,finished:true}));
 cdp.on('Network.loadingFailed',e=>Object.assign(requests.get(e.requestId)||{},{error:e.errorText}));
 page.on('pageerror',e=>errors.push(e.message));
 const pause=()=>page.waitForTimeout(1500);
 const snapshot=async()=>page.evaluate(()=>({scrollY,viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio},height:document.documentElement.scrollHeight,images:[...document.images].map(i=>{const r=i.getBoundingClientRect(),c=getComputedStyle(i);return {url:i.currentSrc,src:i.getAttribute('src'),alt:i.alt,naturalWidth:i.naturalWidth,naturalHeight:i.naturalHeight,renderedWidth:r.width,renderedHeight:r.height,top:r.top+scrollY,left:r.left,loading:i.loading,fetchPriority:i.fetchPriority,sizes:i.sizes,complete:i.complete,display:c.display,visibility:c.visibility,objectFit:c.objectFit,inViewport:r.bottom>0&&r.top<innerHeight&&r.width>0&&r.height>0,sources:[...(i.parentElement?.querySelectorAll('source')||[])].map(s=>({media:s.media,sizes:s.sizes,srcset:s.srcset}))}}),cssImages:[...document.querySelectorAll('*')].flatMap(e=>['', '::before','::after'].flatMap(p=>{const c=getComputedStyle(e,p||null);return /url\(/.test(c.backgroundImage+' '+c.content+' '+c.listStyleImage)?[{tag:e.tagName,class:e.className,pseudo:p,background:c.backgroundImage,content:c.content,list:c.listStyleImage}]:[]})),resources:performance.getEntriesByType('resource').map(r=>({url:r.name,initiator:r.initiatorType,transferSize:r.transferSize,encodedBodySize:r.encodedBodySize,decodedBodySize:r.decodedBodySize}))}));
 await page.goto(origin,{waitUntil:'networkidle'}); await pause(); const initial=await snapshot();
 await page.screenshot({path:path.join(out,name+'-initial.png')});
 phase='scroll'; const steps=[];
 for(let y=0;y<await page.evaluate(()=>document.documentElement.scrollHeight);y+=Math.floor(options.viewport.height*.7)) {await page.evaluate(y=>scrollTo(0,y),y);await page.waitForTimeout(350);steps.push({y,at:Date.now()});}
 await pause(); const full=await snapshot();
 await page.screenshot({path:path.join(out,name+'-full-page.png'),fullPage:true});
 phase='lightbox'; const lightbox=[];
 const buttons=page.locator('.gallery-thumb');
 for(let i=0;i<await buttons.count();i++){await buttons.nth(i).click();await pause();lightbox.push(await snapshot());await page.locator('.gallery-close').click();}
 await pause();
 const imageRequests=[...requests.values()].filter(r=>r.type==='Image'||r.mimeType?.startsWith('image/'));
 for(const r of imageRequests){try{const {body,base64Encoded}=await cdp.send('Network.getResponseBody',{requestId:r.id});const b=Buffer.from(body,base64Encoded?'base64':'utf8');const m=await sharp(b).metadata();r.bodyBytes=b.length;r.pixelWidth=m.width;r.pixelHeight=m.height;}catch(e){r.dimensionError=e.message;}}
 const data={timestamp:new Date().toISOString(),origin,browser:browser.version(),device:name,options,conditions:{freshContext:true,cacheEnabled:true,throttling:'none; localhost; no CPU throttling',initialWait:'networkidle plus 1500ms',scroll:'70% viewport every 350ms then 1500ms',lightbox:'each thumbnail independently opened for 1500ms after full scroll',productionEnvironment:false},initial,full,lightbox,steps,imageRequests,allRequests:[...requests.values()],errors};
 fs.writeFileSync(path.join(out,name+'-baseline.json'),JSON.stringify(data,null,2));
 console.log(name,JSON.stringify(['initial','scroll','lightbox'].map(phase=>{const rs=imageRequests.filter(r=>r.phase===phase);return {phase,count:rs.length,transferredBytes:rs.reduce((s,r)=>s+(r.transferredBytes||0),0),bodyBytes:rs.reduce((s,r)=>s+(r.bodyBytes||0),0)}})));
 await context.close();
 }await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
