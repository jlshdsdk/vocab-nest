/* node tools/build-relation-lexicon.cjs /path/to/ecdict.csv
 * Only the selected licensed meanings are emitted, never the full 66 MB source.
 */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {terms}=require('../js/relations.js');
const root=path.resolve(__dirname,'..'),input=process.argv[2];
if(!input)throw Error('Usage: node tools/build-relation-lexicon.cjs <ecdict.csv>');
const groups=fs.readdirSync(path.join(root,'data/groups')).map(file=>JSON.parse(fs.readFileSync(path.join(root,'data/groups',file),'utf8')));
const wanted=new Set(),site=new Map();
for(const group of groups)for(const word of group.words){
  wanted.add(word.word.toLowerCase());site.set(word.word.toLowerCase(),word.definition);
  for(const kind of ['confusables','synonyms'])for(const relation of word[kind]||[])for(const word of terms(relation.word))wanted.add(word.toLowerCase());
}
const csv=fs.readFileSync(input,'utf8'),dictionary=new Map();
let row=[],cell='',quoted=false,header=null;
function consume(){
  row.push(cell);cell='';
  if(!header)header=row;
  else{
    const key=(row[0]||'').trim().toLowerCase(),translation=row[header.indexOf('translation')];
    if(wanted.has(key)&&translation)dictionary.set(key,translation.replace(/\\n/g,'\n').replace(/\r/g,'').trim());
  }
  row=[];
}
for(let i=0;i<csv.length;i++){
  const char=csv[i];
  if(quoted){if(char==='"'){if(csv[i+1]==='"'){cell+='"';i++;}else quoted=false;}else cell+=char;}
  else if(char==='"')quoted=true;
  else if(char===','){row.push(cell);cell='';}
  else if(char==='\n')consume();
  else if(char!=='\r')cell+=char;
}
if(cell||row.length)consume();
const overrides=JSON.parse(fs.readFileSync(path.join(__dirname,'relation-overrides.json'),'utf8'));
const entries={},missing=[];
for(const word of Array.from(wanted).sort()){
  if(site.has(word))entries[word]={definition:site.get(word),source:'site'};
  else if(overrides[word])entries[word]={...overrides[word],source:'curated'};
  else if(dictionary.has(word))entries[word]={definition:dictionary.get(word),source:'ECDICT'};
  else missing.push(word);
}
if(missing.length)throw Error('Missing explicit meanings: '+missing.join(', '));
const sourceHash=crypto.createHash('sha256').update(csv).digest('hex');
fs.writeFileSync(path.join(root,'data/relation-lexicon.json'),JSON.stringify({source:{name:'ECDICT',repository:'https://github.com/skywind3000/ECDICT',license:'MIT',sha256:sourceHash},entries})+'\n');
console.log(JSON.stringify({entries:Object.keys(entries).length,sourceHash,missing:missing.length}));
