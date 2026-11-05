const test=require('node:test'),assert=require('node:assert/strict');
const R=require('../js/relations.js');
for(const [count,lastPage,lastCount]of [[0,1,0],[1,1,1],[15,1,15],[16,2,1],[30,2,15],[31,3,1]]){
  test('comparison pagination handles '+count+' entries with 15 per page',()=>{
    assert.equal(typeof R.paginate,'function');
    const items=Array.from({length:count},(_,i)=>({key:String(i)}));
    const first=R.paginate(items,1),last=R.paginate(items,999);
    assert.equal(first.visible.length,Math.min(15,count));assert.equal(first.page,1);
    assert.equal(last.totalPages,lastPage);assert.equal(last.page,lastPage);assert.equal(last.visible.length,lastCount);
    assert.equal(last.total,count);
    if(count)assert.equal(last.visible.at(-1).key,String(count-1));
  });
}
test('deleting the last entry of the last page clamps to the previous valid page',()=>{
  assert.equal(typeof R.paginate,'function');
  const result=R.paginate(Array.from({length:30},(_,i)=>i),3);
  assert.equal(result.page,2);assert.deepEqual(result.visible,Array.from({length:15},(_,i)=>i+15));
});
test('invalid comparison page numbers normalize to the first page',()=>{
  assert.equal(typeof R.paginate,'function');
  for(const value of [NaN,Infinity,0,-3,undefined,'invalid'])assert.equal(R.paginate([1,2],value).page,1);
});
