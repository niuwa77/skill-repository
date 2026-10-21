export const VERSION = 1;
export const uid = () => crypto.randomUUID();
export const now = () => new Date().toISOString();
const definitions = [
  ['writing', '写作内容', '把灵感写成好内容'],
  ['image', '图像设计', '让画面更有想法'],
  ['video', '视频音频', '让声音和故事动起来'],
  ['office', '办公文档', '把日常工作理清楚'],
  ['web', '网站应用', '把想法变成小应用'],
  ['other', '其他', '好工具，都有位置'],
];
export const CATEGORIES = definitions.map(([id,name,description]) => ({id:`cat-${id}`,name,description}));
export function initialState() {
  return { version: VERSION, uiVersion: 2, revision: 0, skills: [], sources: [],
    categories: structuredClone(CATEGORIES),
    settings: {lastExportAt: null}, updatedAt: now() };
}
export function normalizeLink(value) {
  const link = String(value || '').trim();
  if (!link) return '';
  let url;
  try {url = new URL(link);} catch {throw new Error('请填写完整的 skill 链接，例如 https://github.com/…');}
  if (!['https:','http:'].includes(url.protocol)) throw new Error('skill 链接需要以 https:// 或 http:// 开头。');
  if (link.length > 3000) throw new Error('skill 链接不能超过 3000 个字符。');
  return url.href;
}
export function migrateState(input) {
  const state = structuredClone(input);
  if (state.uiVersion === 2) return state;
  const oldCategories = new Map(state.categories.map(c => [c.id,c.name.replace(/与/g,'')]));
  const allowed = new Set(CATEGORIES.map(c => c.id));
  for (const skill of state.skills) {
    // Retain legacy metadata for old backups; expose only the four requested fields.
    const mapped = (skill.categoryIds || []).map(id => allowed.has(id) ? id : CATEGORIES.find(c => c.name === oldCategories.get(id))?.id || 'cat-other');
    skill.categoryIds = [...new Set(mapped.length ? mapped : ['cat-other'])];
    try {skill.link = normalizeLink(skill.link || (/^https?:\/\//i.test(skill.location || '') ? skill.location : ''));} catch {skill.link = '';}
  }
  state.categories = structuredClone(CATEGORIES);
  state.uiVersion = 2;
  return state;
}
export function createSkill({name,link = '',notes = '',categoryIds = []}) {
  name = String(name || '').trim();
  if (!name || name.length > 200) throw new Error('请填写 1–200 个字符的 skill 名称。');
  notes = String(notes).trim();
  if (notes.length > 20000) throw new Error('个人备注不能超过 20,000 个字符。');
  const ids = [...new Set(categoryIds)];
  if (ids.some(id => !CATEGORIES.some(c => c.id === id))) throw new Error('请选择现有分类。');
  const stamp = now();
  return {id:uid(),name,link:normalizeLink(link),notes,categoryIds:ids.length ? ids : ['cat-other'],
    description:'',tags:[],favorite:false,sourceId:null,relativePath:'',location:'',importedName:'',importedDescription:'',missing:false,
    createdAt:stamp,updatedAt:stamp,scannedAt:null};
}
const clean = (s) => String(s ?? '').replace(/\u0000/g, '').trim();
function scalar(s) {
  s = s.trim();
  if (s.startsWith('"') && s.endsWith('"')) {
    try { return JSON.parse(s); } catch { return s.slice(1, -1); }
  }
  if (s.startsWith("'") && s.endsWith("'")) return s.slice(1, -1).replace(/''/g, "'");
  return s.replace(/\s+#.*$/, '');
}
// Read only the two text fields we need. YAML is never executed or evaluated.
export function parseSkill(text, relativePath) {
  text = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  const front = text.match(/^---[ \t]*\n([\s\S]*?)\n---[ \t]*(?:\n|$)/);
  const metadata = {};
  if (front) {
    const lines = front[1].split('\n');
    for (let i = 0; i < lines.length; i++) {
      const match = lines[i].match(/^(name|description):\s*(.*)$/);
      if (!match) continue;
      const key = match[1], first = match[2];
      const rest = [];
      while (i + 1 < lines.length && (/^[ \t]+\S/.test(lines[i + 1]) || !lines[i + 1].trim())) rest.push(lines[++i]);
      if (/^[>|][+-]?\s*$/.test(first)) {
        const indent = Math.min(...rest.filter(s => s.trim()).map(s => s.match(/^\s*/)[0].length));
        const value = rest.map(s => s.slice(Number.isFinite(indent) ? indent : 0)).join('\n').trim();
        metadata[key] = first.startsWith('>') ? value.replace(/([^\n])\n(?=[^\n])/g, '$1 ') : value;
      } else metadata[key] = scalar([first, ...rest.map(s => s.trim())].join(' '));
    }
  }
  const body = front ? text.slice(front[0].length).trim() : text.trim();
  const parent = relativePath.replace(/\\/g, '/').split('/').slice(-2, -1)[0];
  const heading = body.match(/^#\s+(.+)$/m)?.[1];
  const paragraph = body.split(/\n\s*\n/).find(p => p.trim() && !/^\s*(#|```|---|\|)/.test(p));
  return {name: clean(metadata.name || heading || parent || '未命名 skill').slice(0, 200),
    description: clean(metadata.description || paragraph || '').slice(0, 8000),
    relativePath: clean(relativePath).replace(/\\/g, '/')};
}
export function planImport(state, entries, sourceId) {
  const existing = new Map(state.skills.filter(s => sourceId && s.sourceId === sourceId).map(s => [s.relativePath, s]));
  const seen = new Set(entries.map(e => e.relativePath));
  return {added: entries.filter(e => !existing.has(e.relativePath)).length,
    updated: entries.filter(e => existing.has(e.relativePath)).length,
    missing: [...existing.values()].filter(s => !seen.has(s.relativePath)).length};
}
export function mergeImport(state, entries, sourceId, sourceName, stamp = now()) {
  let source = state.sources.find(s => s.id === sourceId);
  if (!source) {source = {id: sourceId, name: sourceName, scannedAt: stamp}; state.sources.push(source);}
  source.scannedAt = stamp;
  const byPath = new Map(state.skills.filter(s => s.sourceId === sourceId).map(s => [s.relativePath, s]));
  const seen = new Set();
  for (const entry of entries) {
    if (seen.has(entry.relativePath)) continue;
    seen.add(entry.relativePath);
    const old = byPath.get(entry.relativePath);
    if (old) {
      if (old.name === old.importedName) old.name = entry.name;
      if (old.description === old.importedDescription) old.description = entry.description;
      old.importedName = entry.name; old.importedDescription = entry.description;
      old.missing = false; old.scannedAt = stamp;
    } else {
      state.skills.push({id: uid(), name: entry.name, description: entry.description, categoryIds: [], tags: [], notes: '',
        favorite: false, sourceId, relativePath: entry.relativePath, location: `${sourceName}/${entry.relativePath}`,
        importedName: entry.name, importedDescription: entry.description,
        missing: false, createdAt: stamp, updatedAt: stamp, scannedAt: stamp});
    }
  }
  for (const old of byPath.values()) if (!seen.has(old.relativePath)) old.missing = true;
  return state;
}
export function filterSkills(state, filters = {}) {
  const query = clean(filters.query).toLocaleLowerCase();
  const category = filters.category || '';
  const selected = state.skills.filter(s => {
    if (category === 'uncategorized' ? s.categoryIds.length : category && !s.categoryIds.includes(category)) return false;
    if (filters.favorite && !s.favorite) return false;
    if (filters.source === 'manual' ? s.sourceId : filters.source && s.sourceId !== filters.source) return false;
    if (filters.missing && !s.missing) return false;
    if (filters.tag && !s.tags.includes(filters.tag)) return false;
    const text = filters.nameOnly ? s.name : [s.name, s.link || '', s.notes].join('\n');
    return !query || text.toLocaleLowerCase().includes(query);
  });
  const order = filters.sort || 'name';
  return selected.sort(order === 'name' ? (a,b) => a.name.localeCompare(b.name, 'zh-CN') :
    (a,b) => (order === 'updated' ? b.updatedAt.localeCompare(a.updatedAt) : b.createdAt.localeCompare(a.createdAt)) || a.name.localeCompare(b.name, 'zh-CN'));
}
export function parseTags(value) { return [...new Set(value.split(/[,，\n]/).map(clean).filter(Boolean))].slice(0,50).map(t => t.slice(0,80)); }

// Backups are untrusted input: bound sizes, strip extra fields and verify all references.
export function validateBackup(input) {
  const fail = () => { throw new Error('备份格式不正确或内容不完整，请选择本应用导出的备份文件。'); };
  const obj = input?.app === 'skill-vault' ? input.data : input;
  if (!obj || obj.version !== VERSION || !Array.isArray(obj.skills) || !Array.isArray(obj.categories) || !Array.isArray(obj.sources)) fail();
  if (obj.skills.length > 20000 || obj.categories.length > 500 || obj.sources.length > 500) fail();
  const str = (v, max, required = false) => { if (typeof v !== 'string' || v.length > max || (required && !v.trim())) fail(); return v; };
  const id = (v) => {if (typeof v !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(v)) fail(); return v;};
  const date = (v, nullable = false) => {if (nullable && v === null) return null; if (typeof v !== 'string' || !Number.isFinite(Date.parse(v))) fail(); return v;};
  const array = (v, max, convert) => {if (!Array.isArray(v) || v.length > max) fail(); return v.map(convert);};
  const unique = (list, get = x => x.id) => { if (new Set(list.map(get)).size !== list.length) fail(); return list; };
  const categories = unique(obj.categories.map(c => ({id:id(c.id), name:str(c.name,100,true), description:str(c.description,1000)})));
  if (new Set(categories.map(c => c.name.trim().toLocaleLowerCase())).size !== categories.length) fail();
  const sources = unique(obj.sources.map(s => ({id:id(s.id), name:str(s.name,200,true), scannedAt:date(s.scannedAt)})));
  const catIds = new Set(categories.map(c => c.id)), srcIds = new Set(sources.map(s => s.id));
  const paths = new Set();
  const skills = unique(obj.skills.map(s => {
    if (typeof s.favorite !== 'boolean' || typeof s.missing !== 'boolean') fail();
    const categoryIds = unique(array(s.categoryIds,500,id), x => x);
    if (categoryIds.some(c => !catIds.has(c)) || (s.sourceId !== null && !srcIds.has(s.sourceId))) fail();
    const skill = {id:id(s.id), name:str(s.name,200,true), description:str(s.description,8000), categoryIds,
      tags:unique(array(s.tags,50,t => str(t,80,true)),x => x), notes:str(s.notes,20000), favorite:s.favorite,
      sourceId:s.sourceId === null ? null : id(s.sourceId), relativePath:str(s.relativePath,2000), location:str(s.location,3000),
      importedName:str(s.importedName,200), importedDescription:str(s.importedDescription,8000), missing:s.missing,
      createdAt:date(s.createdAt), updatedAt:date(s.updatedAt), scannedAt:date(s.scannedAt,true)};
    skill.link = normalizeLink(str(s.link ?? '',3000));
    if (skill.sourceId) { const key = skill.sourceId + '/' + skill.relativePath; if (!skill.relativePath || paths.has(key)) fail(); paths.add(key); }
    return skill;
  }));
  if (obj.uiVersion === 2 && (categories.length !== CATEGORIES.length || categories.some(c => !CATEGORIES.some(f => f.id === c.id && f.name === c.name)) || skills.some(s => !s.categoryIds.length))) fail();
  return {version:VERSION, ...(obj.uiVersion === 2 ? {uiVersion:2} : {}), revision:0, skills, categories, sources, updatedAt:date(obj.updatedAt),
    settings:{lastExportAt:date(obj.settings?.lastExportAt ?? null,true)}};
}
