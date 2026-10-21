import test from 'node:test';
import assert from 'node:assert/strict';
import { CATEGORIES, initialState, createSkill, migrateState, normalizeLink, filterSkills, validateBackup } from '../dist/core.mjs';

const oldVault = () => {
  const s=initialState();delete s.uiVersion;
  s.categories=[{id:'cat-writing',name:'写作与内容',description:''},{id:'cat-code',name:'开发与编程',description:''},{id:'custom',name:'自定义',description:''}];
  s.skills=[createSkill({name:'旧登记',notes:'个人心得',categoryIds:['cat-writing']}),createSkill({name:'开发工具'}),createSkill({name:'未归类'})];
  s.skills[0].location='https://example.com/skill';s.skills[0].link='';s.skills[0].favorite=true;
  s.skills[1].categoryIds=['cat-code','custom'];s.skills[2].categoryIds=[];
  return s;
};
test('initial vault has the six requested categories in the requested order',()=>{
  assert.deepEqual(initialState().categories.map(c=>c.name),['写作内容','图像设计','视频音频','办公文档','网站应用','其他']);
  assert.equal(initialState().skills.length,0);
});
test('migration preserves records, personal notes and original metadata; remaps removed categories',()=>{
  const old=oldVault(),saved=structuredClone(old),next=migrateState(old);
  assert.equal(next.uiVersion,2);assert.equal(next.skills.length,3);
  assert.equal(next.skills[0].notes,'个人心得');assert.equal(next.skills[0].favorite,true);
  assert.equal(next.skills[0].link,'https://example.com/skill');
  assert.deepEqual(next.skills[0].categoryIds,['cat-writing']);
  assert.deepEqual(next.skills[1].categoryIds,['cat-other']);
  assert.deepEqual(next.skills[2].categoryIds,['cat-other']);
  assert.deepEqual(old,saved);assert.deepEqual(migrateState(next),next);
});
test('manual registration keeps the four visible fields and defaults an empty category to other',()=>{
  const s=createSkill({name:'  我的 skill  ',link:'https://example.com',notes:'我的个人备注',categoryIds:[]});
  assert.equal(s.name,'我的 skill');assert.equal(s.link,'https://example.com/');assert.equal(s.notes,'我的个人备注');
  assert.deepEqual(s.categoryIds,['cat-other']);
  assert.deepEqual(createSkill({name:'多分类',categoryIds:['cat-image','cat-video','cat-image']}).categoryIds,['cat-image','cat-video']);
});
test('links accept only complete http/https URLs and cannot execute scripts or open local files',()=>{
  assert.equal(normalizeLink(''), '');assert.equal(normalizeLink(' https://example.com/a?q=中文 '),'https://example.com/a?q=%E4%B8%AD%E6%96%87');
  for(const value of ['javascript:alert(1)','data:text/html,test','file:///C:/test','example.com','https://'])assert.throws(()=>normalizeLink(value));
});
test('search covers only name, link and personal notes, combined with the six categories',()=>{
  const state=initialState();state.skills=[createSkill({name:'imagegen',link:'https://example.com/art',notes:'封面制作',categoryIds:['cat-image']}),createSkill({name:'文档助手',notes:'周报整理',categoryIds:['cat-office']})];
  state.skills[0].description='旧隐藏说明';state.skills[0].tags=['旧标签'];
  assert.equal(filterSkills(state,{query:'IMAGEGEN'}).length,1);
  assert.equal(filterSkills(state,{query:'example.com',category:'cat-image'}).length,1);
  assert.equal(filterSkills(state,{query:'周报'}).length,1);
  assert.equal(filterSkills(state,{query:'旧隐藏说明'}).length,0);
  assert.equal(filterSkills(state,{query:'封面',category:'cat-office'}).length,0);
});
test('recently modified sort uses modification time, independently of creation time',()=>{
  const state=initialState();state.skills=[createSkill({name:'A'}),createSkill({name:'B'})];
  state.skills[0].createdAt='2020-01-01T00:00:00.000Z';state.skills[0].updatedAt='2026-10-22T00:00:00.000Z';
  state.skills[1].createdAt='2026-10-21T00:00:00.000Z';state.skills[1].updatedAt='2026-10-21T00:00:00.000Z';
  assert.equal(filterSkills(state,{sort:'updated'})[0].name,'A');
});
test('v2 backup round trip preserves links, notes, categories and empty vaults',()=>{
  const state=initialState();state.skills.push(createSkill({name:'资料工具',link:'https://example.com/tool',notes:'中文 <script>纯文本</script>',categoryIds:['cat-writing','cat-other']}));
  assert.deepEqual(validateBackup(JSON.parse(JSON.stringify({app:'skill-vault',data:state}))),state);
  const empty=initialState();assert.deepEqual(validateBackup(empty),empty);
});
test('old backups can be restored into the six-category layout without losing names or notes',()=>{
  const state=migrateState(validateBackup(oldVault()));
  assert.deepEqual(state.categories,CATEGORIES);assert.equal(state.skills[0].name,'旧登记');assert.equal(state.skills[0].notes,'个人心得');
});
test('invalid backups, script links, duplicate ids and broken categories are rejected',()=>{
  for(const mutate of [s=>{s.version=99;},s=>{s.skills[0].link='javascript:alert(1)';},s=>{s.skills.push({...s.skills[0]});},s=>{s.skills[0].categoryIds=['missing'];},s=>{s.skills[0].categoryIds=[];},s=>{s.categories.pop();}]){
    const state=initialState();state.skills.push(createSkill({name:'测试登记'}));mutate(state);assert.throws(()=>validateBackup(state));
  }
});
