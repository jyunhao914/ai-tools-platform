const assert=require('node:assert/strict'),fs=require('fs');
const {page,isPublic}=require('./card-pages');
const sample={id:'test',title:'A < B',type:'article',permission:'public',visible:true,content:'preview',extra:JSON.stringify({content:'<p>Complete article with <a href=\\"assets/example.png\\">image</a></p>'})};
assert(page(sample).includes('Complete article'));
assert(page(sample).includes('<base href="https://jyunhao914.github.io/ai-tools-platform/">'));
assert(page(sample).includes('rel="canonical"'));
assert(!page(sample).includes('location.replace'));
for(const restricted of [{permission:'student'},{permission:'admin'},{visible:false},{hidden:true},{archived:true}]){const c={...sample,...restricted};assert(!isPublic(c));assert(page(c).includes('noindex'));assert(!page(c).includes('Complete article'));}
for(const c of JSON.parse(fs.readFileSync('data.json')).cards){assert.equal(fs.readFileSync('cards/'+c.id+'.html','utf8'),page(c));const ld=page(c).match(/<script type="application\/ld\+json">(.*?)<\/script>/s);if(isPublic(c))JSON.parse(ld[1]);}
console.log('Static page content, canonical, JSON-LD, visibility and renderer parity passed.');
