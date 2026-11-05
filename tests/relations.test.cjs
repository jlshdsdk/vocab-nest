const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),modulePath=path.join(root,'js/relations.js'),R=fs.existsSync(modulePath)?require(modulePath):{};
test('both headwords receive explicit definitions instead of using comparison notes as translations',()=>{
  assert.equal(typeof R.resolvePair,'function');
  const dictionary={perceive:{definition:'v. 感知，察觉',source:'site'},receive:{definition:'v. 收到；接收',source:'ECDICT'}};
  const result=R.resolvePair('perceive','receive',dictionary);
  assert.deepEqual(result.map(item=>[item.word,item.definition]),[['perceive','v. 感知，察觉'],['receive','v. 收到；接收']]);
});
test('legacy two-word labels and spelling warnings are separated without changing favorite identity',()=>{
  assert.equal(typeof R.resolvePair,'function');
  const dictionary={blade:{definition:'n. 刀刃',source:'site'},blame:{definition:'v. 责备',source:'ECDICT'},nonsence:{definition:'非标准拼写，正确词形为 nonsense。',source:'curated',status:'spelling'}};
  assert.deepEqual(R.resolvePair('blade','blade 与 blame',dictionary).map(item=>item.word),['blade','blame']);
  const spelling=R.resolvePair('blade','nonsence 拼写错',dictionary);
  assert.equal(spelling[1].status,'spelling');assert.match(spelling[1].definition,/nonsense/);
});
test('all canonical and related terms are covered in per-group data without downloading a full dictionary',()=>{
  const dictionaryPath=path.join(root,'data/relation-lexicon.json');
  assert.equal(fs.existsSync(dictionaryPath),true,'supplemental lexicon not built');
  const dictionary=JSON.parse(fs.readFileSync(dictionaryPath,'utf8')).entries;
  for(const name of fs.readdirSync(path.join(root,'data/groups'))){
    const group=JSON.parse(fs.readFileSync(path.join(root,'data/groups',name),'utf8'));
    const local=JSON.parse(fs.readFileSync(path.join(root,'data/definitions',name),'utf8'));
    assert.equal(local.gid,group.id);
    for(const word of group.words){
      assert.equal(local.entries[word.word.toLowerCase()].definition,word.definition);
      for(const kind of ['confusables','synonyms'])for(const relation of word[kind]||[]){
        const rows=R.resolvePair(word.word,relation.word,local.entries);
        assert.ok(rows.length>=1);
        for(const row of rows){assert.ok(row.definition.trim().length>0,group.id+':'+word.word+' → '+relation.word);assert.notEqual(row.source,'missing');}
      }
    }
  }
  assert.match(dictionary.receive.definition,/收到|接收/);
  assert.match(dictionary.deceive.definition,/欺骗/);
});
