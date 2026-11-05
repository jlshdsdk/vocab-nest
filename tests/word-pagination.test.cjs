const test=require('node:test'),assert=require('node:assert/strict');
const R=require('../js/relations.js');
for(const [count,pages,lastCount]of [[0,1,0],[1,1,1],[29,1,29],[30,1,30],[31,2,1],[60,2,30],[61,3,1]]){
  test('word notebook paginates '+count+' entries in pages of thirty',()=>{
    const items=Array.from({length:count},(_,i)=>i);
    const first=R.paginate(items,1,30),last=R.paginate(items,999,30);
    assert.equal(first.visible.length,Math.min(count,30));assert.equal(first.size,30);
    assert.equal(last.totalPages,pages);assert.equal(last.page,pages);assert.equal(last.visible.length,lastCount);
    if(count)assert.equal(last.visible.at(-1),count-1);
  });
}
test('a removed sixty-first word returns to page two and comparison defaults stay fifteen',()=>{
  assert.equal(R.paginate(Array.from({length:60},(_,i)=>i),3,30).page,2);
  assert.equal(R.paginate(Array.from({length:31},(_,i)=>i),1).visible.length,15);
});
