/* Test-only driver: real Chromium, a local static server, and no user profile. */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const {execFile} = require('node:child_process');
const {promisify} = require('node:util');
const exec = promisify(execFile);
const root = path.resolve(__dirname,'..');
const cli = process.env.AGENT_BROWSER_CLI || path.join(path.dirname(process.execPath),'node_modules/agent-browser/bin/agent-browser.js');
const nativeCandidate=path.join(path.dirname(cli),'agent-browser-win32-x64.exe');
const nativeCli=path.extname(cli)==='.exe'?cli:(!process.env.AGENT_BROWSER_CLI&&process.platform==='win32'&&fs.existsSync(nativeCandidate)?nativeCandidate:null);
async function browserFixture(t,options={}) {
  let sourceRef=options.ref||null;
  let originOffline=false;
  let futureWorker=false;
  const sourceCache=new Map();
  const requests=[];
  const server = http.createServer(async(req,res)=>{
    if(originOffline){res.destroy();return;}
    const name = decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\/vocab-nest\//,'/');
    requests.push(name);
    if(options.controlPage&&name==='/__test_control__'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><title>test control</title>');return;}
    if(options.cloud&&name.startsWith('/__test_cloud__/')){await options.cloud(req,res,name.slice('/__test_cloud__/'.length));return;}
    const file = path.resolve(root,'.'+(name==='/'?'/index.html':name));
    if (!file.startsWith(root+path.sep)) {res.writeHead(404);res.end('not found');return;}
    const mime = {'.html':'text/html; charset=utf-8','.js':'application/javascript','.css':'text/css','.json':'application/json','.woff2':'font/woff2','.webp':'image/webp','.png':'image/png','.webmanifest':'application/manifest+json'};
    res.setHeader('Content-Type',mime[path.extname(file)] || 'application/octet-stream');
    if(options.cacheSeconds)res.setHeader('Cache-Control','public, max-age='+options.cacheSeconds);
    if(sourceRef){
      const key=sourceRef+':'+path.relative(root,file).replaceAll(path.sep,'/');
      try{
        if(!sourceCache.has(key)){const result=await exec('git',['show',key],{cwd:root,encoding:null,maxBuffer:12*1024*1024,windowsHide:true});sourceCache.set(key,result.stdout);}
        res.end(sourceCache.get(key));
      }catch(e){res.writeHead(404);res.end('not found');}
    }else{
      if(!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end('not found');return;}
      if(futureWorker&&name==='/sw.js'){res.end(fs.readFileSync(file,'utf8').replace(/var CACHE='[^']+';/,"var CACHE='vocab-nest-test-future';"));return;}
      if(options.cloud&&options.initScript&&path.extname(file)==='.html'){
        const initializer=fs.readFileSync(options.initScript,'utf8');
        res.end(fs.readFileSync(file,'utf8').replace('<head>','<head><script>'+initializer+'</script>'));return;
      }
      fs.createReadStream(file).pipe(res);
    }
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const url = 'http://127.0.0.1:'+server.address().port+'/vocab-nest/';
  const session = 'selene-test-'+process.pid+'-'+Math.random().toString(36).slice(2,7);
  async function call(...args) {
    const {stdout} = await exec(nativeCli||process.execPath,[...(nativeCli?[]:[cli]),'--json','--session',session,...args],{timeout:45000,maxBuffer:4*1024*1024,windowsHide:true});
    const result = JSON.parse(stdout.trim());
    if (result.success===false) throw Error(JSON.stringify(result.error));
    return result.data;
  }
  const evaluate = async source => {const data=await call('eval','-b',Buffer.from(source).toString('base64'));return data.result;};
  t.after(async()=>{try{await call('close');}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}});
  const launch=['--headed','false','--args','--no-proxy-server'];
  if(options.initScript&&!options.cloud)launch.push('--init-script',options.initScript);
  await call(...launch,'open',url);
  if(options.cloud)await call('network','route','https://textdb.online/**','--abort');
  return {url,call,evaluate,requests,setRef:ref=>{sourceRef=ref;},setOriginOffline:value=>{originOffline=value;},setFutureWorker:value=>{futureWorker=value;},wait:condition=>call('wait','--fn',condition)};
}
module.exports = {browserFixture};
