/* Test-only boundary: each isolated page keeps its own storage, requests share an in-memory cloud. */
const originalCloudFetch=window.fetch.bind(window);
let cloudRequestSequence=0;
const cloudSession=crypto.randomUUID();
window.fetch=(input,options)=>{
  const url=new URL(typeof input==='string'?input:input.url,location.href);
  if(url.origin==='https://textdb.online'){
    const mocked=new URL('__test_cloud__/'+url.pathname.slice(1),new URL('./',location.href));
    mocked.searchParams.set('uncached-test-request',cloudSession+'-'+(++cloudRequestSequence));
    return originalCloudFetch(mocked.href,options);
  }
  return originalCloudFetch(input,options);
};
