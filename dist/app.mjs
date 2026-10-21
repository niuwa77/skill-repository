import { VERSION, CATEGORIES, now, initialState, createSkill, normalizeLink, migrateState, filterSkills, validateBackup } from './core.mjs';
import { VaultStore } from './store.mjs';

const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const drawings = {
  writing:'<path d="M23 17h39l14 15v55H23z"/><path d="M61 17v16h15M33 43h29M33 54h20M33 65h24"/><path d="m65 71 15-36 9 4-15 36-11 9z"/><path d="m77 42 9 4M63 84l2-13"/>',
  image:'<rect x="16" y="24" width="66" height="57" rx="7"/><path d="m22 71 18-20 17 15 11-12 12 15"/><circle cx="63" cy="41" r="6"/><path d="m58 17 23-7 11 35-9 3M61 10l4-5M94 22l5-1"/>',
  video:'<rect x="15" y="32" width="70" height="51" rx="7"/><path d="m15 31-2-13 68-9 2 14zM29 17l8 11M47 14l8 11M65 12l8 11"/><path d="m43 46 20 11-20 13z"/><path d="M88 65V49l9-3v15M88 65c-8-3-11 6-5 8 4 1 6-3 5-8"/>',
  office:'<path d="M14 36h29l8 8h36v38H14z"/><path d="M27 37V17h42v28M36 26h22M36 33h17"/><path d="M14 50h73l-6 34H20z"/><rect x="40" y="60" width="24" height="8" rx="3"/>',
  web:'<rect x="13" y="19" width="77" height="62" rx="7"/><path d="M13 35h77M22 27h1M30 27h1M38 27h1M32 48l-8 9 8 9M69 48l8 9-8 9M57 45 46 71"/><path d="m78 73 17 8-8 2-3 8z"/>',
  other:'<path d="m18 40 33-15 32 15v39L50 94 18 79z"/><path d="m18 40 32 15 33-15M50 55v39M51 25V12M44 18l7-7 7 7"/><path d="m18 40-8 14 28 13 12-12 11 12 31-13-9-14"/>',
};
const linePaths = {
  home:'<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
  categories:'<path d="M3 8h18v12H3zM3 8V4h7l3 4"/>',
  search:'<circle cx="10" cy="10" r="6.5"/><path d="m15 15 6 6"/>',
  settings:'<path d="M4 6h16M4 12h16M4 18h16"/><circle cx="8" cy="6" r="2"/><circle cx="16" cy="12" r="2"/><circle cx="9" cy="18" r="2"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  arrow:'<path d="M5 12h14m-5-5 5 5-5 5"/>',
  link:'<path d="m9 8 3-3a5 5 0 0 1 7 7l-3 3M15 16l-3 3a5 5 0 0 1-7-7l3-3M8 16l8-8"/>',
  external:'<path d="M14 3h7v7M21 3 10 14M10 4H4v16h16v-6"/>',
  close:'<path d="m6 6 12 12M6 18 18 6"/>',
  download:'<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  upload:'<path d="M12 16V4m-5 5 5-5 5 5M4 16v5h16v-5"/>',
  edit:'<path d="m16 3 5 5L9 20H3v-6zM13 6l5 5"/>',
};
const icon = name => `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${linePaths[name] || linePaths.link}</svg>`;
const art = (category, cls='') => `<svg class="category-art ${cls}" viewBox="0 0 108 104" fill="#fff9e9" stroke="#221d14" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${drawings[category.replace('cat-','')] || drawings.other}</svg>`;
const mascot = `<svg class="box-mascot" viewBox="0 0 130 112" fill="none" stroke="#221d14" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path fill="#fff9e9" d="M29 35h76v58H29z"/><path fill="#fff9e9" d="m29 35 17-17h48l11 17z"/><path d="M29 54h76M50 18l-4 17M83 18l5 17"/><path fill="#fff9e9" d="M20 35h94v20H20z"/><path d="M48 73v4M82 73v4M58 84q8 7 15-1M14 81l7-5M111 67l8 4M35 98l-3 6M94 98l4 6"/></svg>`;
const button = (text,action,cls='secondary',attrs='') => `<button type="button" class="button ${cls}" data-action="${action}" ${attrs}>${text}</button>`;
const stamp = date => date ? new Date(date).toLocaleString('zh-CN',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}) : '尚未导出';
const categoryTags = skill => skill.categoryIds.map(id => `<span class="tag">${esc(CATEGORIES.find(c=>c.id===id)?.name || '其他')}</span>`).join('');
const store = new VaultStore();
const modal = $('#modal');
let state, route, busy=false, dialogRevision, toastTimer, searchTimer, restoreDraft;
const selected = new Set();

function notify(message,error=false) {
  clearTimeout(toastTimer); $('#toast').textContent=message; $('#toast').className=error?'show error':'show';
  toastTimer=setTimeout(()=>{$('#toast').className='';},error?8000:4000);
}
function readRoute() {
  const [page,query]=location.hash.slice(1).split('?');
  route={page:['home','categories','search','settings'].includes(page)?page:'home',params:new URLSearchParams(query||'')};
}
function go(page,params={}) {
  const query=new URLSearchParams(Object.entries(params).filter(([,value])=>value!==''&&value!==null&&value!==undefined));
  const hash=page+(query.size?'?'+query:'');
  if (location.hash==='#'+hash) render(); else location.hash=hash;
}
function filter(key,value) {
  const params=Object.fromEntries(route.params); delete params.page;
  if (value) params[key]=value; else delete params[key]; go(route.page,params);
}
function viewFilters() {
  const category=route.params.get('category');
  return {query:route.params.get('q')||'',category:CATEGORIES.some(c=>c.id===category)?category:'',sort:route.params.get('sort')==='updated'?'updated':'name'};
}
function heading(title,copy,action='') {
  return `<header class="page-header"><div><h1>${title}</h1><p>${copy}</p></div>${action?`<div class="actions">${action}</div>`:''}</header>`;
}
function sidebar() {
  const links=[['home','首页总览'],['categories','功能分类'],['search','skill 搜索'],['settings','数据与设置']];
  $('#sidebar').innerHTML=`<a class="brand" href="#home"><img src="./mark.svg" width="43" height="43" alt=""><span>Skill仓库<small>我的灵感工具箱</small></span></a><nav>${links.map(([page,label])=>`<a href="#${page}" class="nav-link ${route.page===page?'active':''}" ${route.page===page?'aria-current="page"':''}>${icon(page)}<span>${label}</span>${route.page===page?icon('arrow'):''}</a>`).join('')}</nav><div class="sidebar-note">${mascot}<p>好用的工具，<br>也值得有个家。</p></div><span class="sidebar-edition">个人工具箱 · v1.2</span>`;
}
function home() {
  return heading('首页总览','给每一个好用的 skill，留个位置。',button(`${icon('plus')}登记 skill`,'new','primary'))+
  `<section class="home-search-area" aria-label="搜索 skill"><form id="home-search" class="home-search">${icon('search')}<label class="sr-only" for="home-query">搜索 skill</label><input id="home-query" type="search" name="q" placeholder="今天需要哪一个 skill？" autocomplete="off"><kbd>Ctrl K</kbd><button type="submit" class="search-go" aria-label="开始搜索">${icon('arrow')}</button></form><div class="search-hint"><span>按名称、链接或个人备注查找</span><a href="#search">查看全部 ${icon('arrow')}</a></div></section>
  <section aria-labelledby="shelf-title"><div class="section-heading"><div><h2 id="shelf-title">按用途，翻翻工具箱</h2><p>你的 ${state.skills.length} 个 skill，分门别类放好。</p></div><span class="total-label">6 个分类</span></div>
  <div class="category-grid">${CATEGORIES.map(c=>{const count=state.skills.filter(s=>s.categoryIds.includes(c.id)).length;return `<a class="category-card" href="#search?category=${c.id}"><div class="card-art-row">${art(c.id)}<span class="card-count">${count}<small>个 skill</small></span></div><div class="card-bottom"><span><strong>${c.name}</strong><span>${c.description}</span></span><span class="round-arrow">${icon('arrow')}</span></div></a>`;}).join('')}</div></section>`;
}
function blank(title,copy,action='') {
  return `<div class="empty-state">${mascot}<h3>${title}</h3><p>${copy}</p>${action}</div>`;
}
function row(s,bulk=false) {
  let host=''; try {host=s.link?new URL(s.link).hostname:'';} catch {}
  return `<div class="skill-row ${bulk?'bulk-row':''} ${selected.has(s.id)?'selected':''}">${bulk?`<input type="checkbox" data-select="${esc(s.id)}" aria-label="选择 ${esc(s.name)}" ${selected.has(s.id)?'checked':''}>`:''}<button type="button" class="skill-identity" data-action="detail" data-id="${esc(s.id)}"><strong>${esc(s.name)}</strong><span>${esc(s.notes || '还没有个人备注')}</span><span class="row-tags">${categoryTags(s)}</span></button><div class="skill-link">${s.link?`<a href="${esc(s.link)}" target="_blank" rel="noopener noreferrer" title="${esc(s.link)}" aria-label="打开 ${esc(s.name)} 的链接"><span>${esc(host)}</span>${icon('external')}</a>`:'<span class="muted small">尚未添加链接</span>'}</div></div>`;
}
function results(bulk=false) {
  const items=filterSkills(state,viewFilters()),lastPage=Math.max(1,Math.ceil(items.length/30));
  const page=Math.min(lastPage,Math.max(1,Number(route.params.get('page'))||1)),visible=items.slice((page-1)*30,page*30);
  return `<div class="results-bar"><span>${items.length} 个 skill</span>${bulk?`<label class="check-inline"><input type="checkbox" id="select-page" ${visible.length&&visible.every(s=>selected.has(s.id))?'checked':''} ${visible.length?'':'disabled'}>选择本页</label>`:'<span class="small muted">点击名称查看登记</span>'}</div>${bulk&&selected.size?`<div class="bulk-toolbar"><span>已选择 ${selected.size} 个</span>${button('设置分类','bulk')}${button('清除选择','clear-selection','text-button')}</div>`:''}<div class="skill-list">${visible.length?visible.map(s=>row(s,bulk)).join(''):blank(state.skills.length?'这里暂时没有 skill':'工具箱，等你放进第一个 skill',state.skills.length?'换个关键词，或看看其他分类。':'记下名称、链接和使用心得，下次就能轻松找到。',state.skills.length?button('查看全部','clear-filters'):button(`${icon('plus')}登记第一个 skill`,'new','primary'))}</div>${items.length>30?`<div class="pagination"><span>${(page-1)*30+1}–${Math.min(page*30,items.length)} / ${items.length}</span><div class="actions">${button('上一页','page','secondary',`data-page="${page-1}" ${page===1?'disabled':''}`)}${button('下一页','page','secondary',`data-page="${page+1}" ${page===lastPage?'disabled':''}`)}</div></div>`:''}`;
}
function searchInput(id,placeholder,value='') {
  return `<div class="filter-search">${icon('search')}<label class="sr-only" for="${id}">${placeholder}</label><input id="${id}" type="search" placeholder="${placeholder}" value="${esc(value)}" autocomplete="off"></div>`;
}
function search() {
  const f=viewFilters();
  return heading('skill 搜索','找个好工具，让手头的事轻松一点。',button(`${icon('plus')}登记 skill`,'new','primary'))+
  `<section class="search-tools" aria-label="搜索与筛选">${searchInput('list-query','搜索名称、链接或个人备注',f.query)}<div class="filter-row"><label class="sr-only" for="category-filter">功能分类</label><select id="category-filter" data-filter="category"><option value="">全部分类</option>${CATEGORIES.map(c=>`<option value="${c.id}" ${f.category===c.id?'selected':''}>${c.name}</option>`).join('')}</select><label class="sr-only" for="sort-filter">排序方式</label><select id="sort-filter" data-filter="sort"><option value="name" ${f.sort==='name'?'selected':''}>名称排序</option><option value="updated" ${f.sort==='updated'?'selected':''}>最近修改</option></select>${(f.query||f.category)?button('清除筛选','clear-filters','text-button'):''}</div></section>${results()}`;
}
function categories() {
  const f=viewFilters(),category=CATEGORIES.find(c=>c.id===f.category);
  return heading('功能分类','六个小分区，把工具整理得明明白白。',button(`${icon('plus')}登记 skill`,'new','primary'))+
  `<div class="classification-layout"><section class="category-directory" aria-label="分类目录"><h2>我的分类</h2><a href="#categories" class="directory-link ${!category?'active':''}"><span>全部 skill</span><span>${state.skills.length}</span></a>${CATEGORIES.map(c=>`<a href="#categories?category=${c.id}" class="directory-link ${f.category===c.id?'active':''}"><span>${c.name}</span><span>${state.skills.filter(s=>s.categoryIds.includes(c.id)).length}</span></a>`).join('')}<p>一个 skill 可以属于多个分类。</p></section><section class="classification-main"><div class="category-title">${category?art(category.id,'small-art'):''}<div><h2>${category?.name || '全部 skill'}</h2><p>${category?.description || '选择几个 skill，一起整理分类。'}</p></div></div>${searchInput('category-query','搜索当前分类',f.query)}${results(true)}</section></div>`;
}
function settings() {
  return heading('数据与设置','把你的工具箱，好好留存。')+
  `<section class="settings-section"><div class="settings-label"><h2>备份与恢复</h2><p>打包保存名称、链接、个人备注和分类，随时带走你的工具箱。</p></div><div class="settings-panel"><div class="setting-line"><span>最近导出</span><strong>${stamp(state.settings.lastExportAt)}</strong></div><div class="actions">${button(`${icon('download')}导出备份`,'export','primary')}${button(`${icon('upload')}恢复备份`,'restore')}</div><p>恢复前会先展示备份内容，确认后才替换当前登记。</p></div></section>
  <section class="settings-section"><div class="settings-label"><h2>登记说明</h2><p>登记后自动保存，继续使用时请打开同一浏览器和固定地址。</p></div><div class="settings-panel"><div class="setting-line"><span>全部登记</span><strong>${state.skills.length} 个 skill</strong></div><div class="setting-line"><span>分类方式</span><strong>6 个固定分类 · 支持多选</strong></div><p>没有选择分类的登记，会自动放进“其他”。清除浏览器的网站数据会移除登记，请保留备份文件。</p></div></section>
  <section class="settings-section"><div class="settings-label"><h2>清空登记</h2><p>需要重新整理时，可以清空所有 skill 登记。六个分类会保留。</p></div><div class="settings-panel"><p class="before-action">这项操作需要输入确认文字，建议先导出备份。</p>${button('清空全部登记','reset','danger')}</div></section>`;
}
function render() {
  if(!state)return;
  const active=document.activeElement,id=active?.id,pos=active?.selectionStart;
  readRoute(); sidebar();
  for(const id of selected) if(!state.skills.some(s=>s.id===id))selected.delete(id);
  $('#main').innerHTML=({home,search,categories,settings})[route.page]();
  document.title=`${({home:'首页总览',categories:'功能分类',search:'skill 搜索',settings:'数据与设置'})[route.page]} · Skill仓库`;
  if(id&&document.getElementById(id)){const field=document.getElementById(id);field.focus({preventScroll:true});if(field.type==='search'&&typeof pos==='number')field.setSelectionRange(pos,pos);}
}
async function commit(mutate,message,revision=state.revision) {
  if(busy)return false; busy=true;document.body.classList.add('saving');
  try{state=await store.change(revision,mutate);render();if(message)notify(message);return true;}
  catch(error){try{state=await store.read();render();}catch{} const copy=error.name==='QuotaExceededError'?'空间不足，修改尚未保存。请先导出备份。':error.message;notify(copy,true);const el=modal.querySelector('.form-error');if(el)el.textContent=copy;return false;}
  finally{busy=false;document.body.classList.remove('saving');}
}
function openModal(title,body,footer='',className='') {
  if(modal.open)modal.close();dialogRevision=state.revision;modal.className=className;
  modal.innerHTML=`<div class="modal-head"><h2 id="modal-title">${title}</h2>${button(icon('close'),'close','icon-button','aria-label="关闭弹窗"')}</div>${body}${footer}`;modal.showModal();
}
function checks(ids=[]) {
  return `<div class="checkbox-grid">${CATEGORIES.map(c=>`<label class="checkbox-option"><input type="checkbox" name="categoryIds" value="${c.id}" ${ids.includes(c.id)?'checked':''}>${c.name}</label>`).join('')}</div>`;
}
function skillForm(id='') {
  const s=state.skills.find(s=>s.id===id);
  openModal(s?'编辑 skill':'登记一个 skill',`<form id="skill-form" data-id="${esc(id)}"><div class="modal-body form-stack"><label>skill 名称<input name="name" required maxlength="200" value="${esc(s?.name||'')}" placeholder="这个好工具叫什么？" autofocus></label><label>skill 链接<input name="link" type="url" maxlength="3000" value="${esc(s?.link||'')}" placeholder="https://…"></label><label>个人备注<textarea name="notes" rows="4" maxlength="20000" placeholder="适合做什么？记下你的使用心得。">${esc(s?.notes||'')}</textarea></label><fieldset><legend>分类 <span>可多选；不选则放入其他</span></legend>${checks(s?.categoryIds||[])}</fieldset><p class="form-error" role="alert"></p></div><div class="modal-footer">${button('取消','close')}<button type="submit" class="button primary">保存登记 ${icon('arrow')}</button></div></form>`);
}
function detail(id) {
  const s=state.skills.find(s=>s.id===id);if(!s)return;
  openModal(esc(s.name),`<div class="modal-body detail-body"><div class="tag-list">${categoryTags(s)}</div><h3>skill 链接</h3>${s.link?`<div class="detail-link"><a href="${esc(s.link)}" target="_blank" rel="noopener noreferrer">${esc(s.link)} ${icon('external')}</a>${button('复制','copy','text-button',`data-id="${esc(s.id)}"`)}</div>`:'<p class="muted">还没有添加链接。</p>'}<h3>个人备注</h3><p class="notes">${esc(s.notes||'还没有备注，记下第一条使用心得吧。')}</p></div>`,`<div class="modal-footer split">${button('删除登记','delete','danger-text',`data-id="${esc(s.id)}"`)}${button(`${icon('edit')}编辑登记`,'edit','primary',`data-id="${esc(s.id)}"`)}</div>`);
}
function confirmation(title,copy,action,id='',phrase='') {
  openModal(title,`<form id="confirm-form" data-confirm="${action}" data-id="${esc(id)}"><div class="modal-body form-stack"><p>${copy}</p>${phrase?`<label>请输入“${phrase}”确认<input name="phrase" data-expected="${phrase}" required autocomplete="off" autofocus></label>`:''}<p class="form-error" role="alert"></p></div><div class="modal-footer">${button('取消','close')}<button type="submit" class="button ${action==='restore'?'primary':'danger'}">${action==='restore'?'确认恢复':'确认删除'}</button></div></form>`,'','small-modal');
}
function download(data,name) {
  const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
}
async function restore(file) {
  if(!file)return;
  try{if(file.size>50*1024*1024)throw new Error('备份文件超过 50 MB。');restoreDraft=migrateState(validateBackup(JSON.parse(await file.text())));confirmation('恢复工具箱备份',`备份包含 <strong>${restoreDraft.skills.length} 个 skill</strong>，恢复后使用当前六个分类。确认后会替换现有 ${state.skills.length} 条登记。`,'restore','','恢复');}
  catch(error){restoreDraft=null;notify(error instanceof SyntaxError?'这不是有效的 JSON 备份文件。':error.message,true);}
}
document.addEventListener('click',async event=>{
  if(event.target.closest('.skip-link')){event.preventDefault();$('#main').focus();return;}
  const target=event.target.closest('[data-action]');if(!target||target.disabled)return;
  const {action,id}=target.dataset;
  try{switch(action){
    case'close':modal.close();break;
    case'new':skillForm();break;
    case'edit':skillForm(id);break;
    case'detail':detail(id);break;
    case'copy':await navigator.clipboard.writeText(state.skills.find(s=>s.id===id)?.link||'');notify('链接已复制。');break;
    case'delete':confirmation('删除这条登记',`确定删除“${esc(state.skills.find(s=>s.id===id)?.name)}”？这条登记的链接和备注也会移除。`,'delete',id);break;
    case'clear-filters':selected.clear();go(route.page);break;
    case'clear-selection':selected.clear();render();break;
    case'page':filter('page',target.dataset.page);break;
    case'bulk':openModal(`整理 ${selected.size} 个 skill`,`<form id="bulk-form"><div class="modal-body form-stack"><label>整理方式<select name="mode"><option value="add">添加分类，保留已有分类</option><option value="replace">替换为所选分类</option></select></label><fieldset><legend>选择分类</legend>${checks()}</fieldset><p class="form-error" role="alert"></p></div><div class="modal-footer">${button('取消','close')}<button class="button primary">保存分类</button></div></form>`);break;
    case'export':if(await commit(s=>{s.settings.lastExportAt=now();return s;})){download({app:'skill-vault',version:VERSION,exportedAt:state.settings.lastExportAt,data:state},`Skill仓库-备份-${state.settings.lastExportAt.replace(/[:.]/g,'-')}.json`);notify('备份已生成，请保留下载的 JSON 文件。');}break;
    case'restore':$('#backup-input').value='';$('#backup-input').click();break;
    case'reset':confirmation('清空全部登记',`将清空 ${state.skills.length} 个 skill 的登记、链接和个人备注，六个分类会保留。`,'reset','','清空');break;
  }}catch(error){notify(error.message||'操作未完成，请重试。',true);}
});
document.addEventListener('submit',async event=>{
  const form=event.target;if(!(form instanceof HTMLFormElement))return;event.preventDefault();const data=new FormData(form);
  if(form.id==='home-search'){go('search',{q:String(data.get('q')||'').trim()});return;}
  let success=false;const revision=dialogRevision;
  try{
    if(form.id==='skill-form'){
      const draft=createSkill({name:data.get('name'),link:data.get('link'),notes:data.get('notes')||'',categoryIds:data.getAll('categoryIds')});
      success=await commit(s=>{const existing=s.skills.find(s=>s.id===form.dataset.id);if(existing)Object.assign(existing,{name:draft.name,link:draft.link,notes:draft.notes,categoryIds:draft.categoryIds,updatedAt:now()});else{if(s.skills.length>=20000)throw new Error('登记数量已达到 20,000 条上限。');s.skills.push(draft);}return s;},'skill 已放回工具箱。',revision);
    }else if(form.id==='bulk-form'){
      const ids=data.getAll('categoryIds'),replace=data.get('mode')==='replace';if(!ids.length)throw new Error('请至少选择一个分类。');
      success=await commit(s=>{s.skills.filter(s=>selected.has(s.id)).forEach(s=>{s.categoryIds=replace?ids:[...new Set([...s.categoryIds,...ids])];s.updatedAt=now();});return s;},'分类已整理好。',revision);if(success){selected.clear();render();}
    }else if(form.id==='confirm-form'){
      const expected=form.elements.phrase?.dataset.expected;if(expected&&String(data.get('phrase')||'').trim()!==expected)throw new Error(`请输入“${expected}”确认。`);
      const action=form.dataset.confirm;
      success=await commit(s=>{if(action==='delete')s.skills=s.skills.filter(s=>s.id!==form.dataset.id);if(action==='reset')return initialState();if(action==='restore'){if(!restoreDraft)throw new Error('请重新选择备份文件。');return structuredClone(restoreDraft);}return s;},action==='restore'?'备份已恢复。':action==='reset'?'登记已清空，六个分类已保留。':'登记已删除。',revision);
      if(success){selected.clear();if(action!=='delete')go('home');}
    }
    if(success)modal.close();
  }catch(error){const el=form.querySelector('.form-error');if(el)el.textContent=error.message;else notify(error.message,true);}
});
document.addEventListener('input',event=>{
  if(['list-query','category-query'].includes(event.target.id)){clearTimeout(searchTimer);const value=event.target.value;searchTimer=setTimeout(()=>filter('q',value),180);}
});
document.addEventListener('change',event=>{
  const el=event.target;
  if(el.dataset.filter)filter(el.dataset.filter,el.value);
  if(el.dataset.select){el.checked?selected.add(el.dataset.select):selected.delete(el.dataset.select);render();}
  if(el.id==='select-page'){const items=filterSkills(state,viewFilters()),page=Math.min(Math.max(1,Math.ceil(items.length/30)),Math.max(1,Number(route.params.get('page'))||1));items.slice((page-1)*30,page*30).forEach(s=>el.checked?selected.add(s.id):selected.delete(s.id));render();}
  if(el.id==='backup-input')restore(el.files[0]);
});
modal.addEventListener('click',event=>{if(event.target===modal){const r=modal.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)modal.close();}});
document.addEventListener('keydown',event=>{if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'){event.preventDefault();if(modal.open)return;if(route.page==='home')$('#home-query').focus();else if(route.page==='search')$('#list-query').focus();else{go('search');setTimeout(()=>$('#list-query')?.focus(),0);}}});
window.addEventListener('hashchange',()=>{selected.clear();clearTimeout(searchTimer);render();window.scrollTo(0,0);});
window.addEventListener('focus',async()=>{if(!state||busy)return;try{const fresh=await store.read();if(fresh.revision!==state.revision){state=fresh;render();}}catch{}});
async function boot(){
  try{state=await store.open();render();if(store.channel)store.channel.onmessage=async()=>{state=await store.read();render();if(modal.open)notify('另一页面更新了登记，保存时会核对数据版本。');};}
  catch(error){$('#main').innerHTML=`<div class="loading"><h1>暂时打不开工具箱</h1><p>请允许浏览器保存此地址的网站数据，再重新打开。</p><p>${esc(error.message)}</p><button id="retry" class="button primary">重试</button></div>`;$('#retry').onclick=()=>location.reload();}
}
boot();
