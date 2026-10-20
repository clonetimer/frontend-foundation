'use strict';
const $ = id => document.getElementById(id);
let selectedFile = null;
let active = null;
let activeInfo = null;
let page = 1;
let lastQuery = null;
let lastTotal = 0;
let toastTimer;

function showToast(message, error = false) {
  const e = $('toast'); e.textContent = message; e.classList.toggle('error', error); e.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { e.hidden = true; }, 4600);
}
async function request(path, options = {}) {
  const res = await fetch(path, options);
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try { const body = await res.json(); message = body.error || message; } catch (_) {}
    throw new Error(message);
  }
  return res;
}
function jsonPost(path, data) {
  return request(path, {method:'POST', headers:{'Content-Type':'application/json', 'X-Workbench-Request':'1'}, body:JSON.stringify(data)});
}
function prepareFile(f) {
  if (!f) return;
  selectedFile = f;
  $('file-label').textContent = f.name;
  $('import-btn').disabled = false;
}
$('dropzone').addEventListener('click', () => $('file').click());
$('dropzone').addEventListener('keydown', ev => {if (ev.key === 'Enter' || ev.key === ' ') {ev.preventDefault(); $('file').click();}});
$('file').addEventListener('change', ev => prepareFile(ev.target.files[0]));
$('dropzone').addEventListener('dragover', ev => {ev.preventDefault(); $('dropzone').classList.add('drag');});
$('dropzone').addEventListener('dragleave', () => $('dropzone').classList.remove('drag'));
$('dropzone').addEventListener('drop', ev => {ev.preventDefault(); $('dropzone').classList.remove('drag'); prepareFile(ev.dataTransfer.files[0]);});
$('import-btn').addEventListener('click', async () => {
  if (!selectedFile) return;
  const btn = $('import-btn'); btn.disabled = true; btn.textContent = '正在校验并导入…';
  const hint = $('import-result'); hint.hidden = true;
  try {
    const delim = $('delimiter').value === 'tab' ? '\t' : $('delimiter').value;
    const args = new URLSearchParams({filename:selectedFile.name, encoding:$('encoding').value, delimiter:delim});
    const res = await request('/api/import?' + args.toString(), {method:'POST', headers:{'Content-Type':'application/octet-stream','X-Workbench-Request':'1'},body:selectedFile});
    const info = await res.json();
    hint.classList.remove('error');
    hint.textContent = `导入成功：${info.row_count.toLocaleString()} 行，${info.columns.length} 列。数据库已保存。` + (info.warnings.length ? ' 提示：' + info.warnings.join('；') : '');
    hint.hidden = false;
    showToast('SQLite 数据库创建成功');
    await loadDatasets(); await selectDataset(info.id);
    $('database-panel').scrollIntoView({behavior:'smooth'});
  } catch (e) {
    hint.classList.add('error'); hint.textContent = e.message; hint.hidden = false; showToast(e.message,true);
  } finally { btn.disabled = false; btn.innerHTML = '导入并生成 SQLite <span>→</span>'; }
});

async function loadDatasets() {
  try {
    const {datasets} = await (await request('/api/datasets')).json();
    const root = $('datasets'); root.replaceChildren();
    if (!datasets.length) {const el=document.createElement('div');el.className='empty';el.textContent='尚无数据库。请先导入示例 CSV 或自己的数据文件。';root.append(el);return;}
    for (const d of datasets) {
      const card = document.createElement('div');card.className='dataset-card' + (d.id===active?' current':'');
      const label=document.createElement('div');label.className='db-label';
      const icon=document.createElement('span');icon.className='db-icon';icon.textContent='▦';
      const name=document.createElement('span');name.textContent=d.filename;
      label.append(icon,name);
      const meta=document.createElement('div');meta.className='db-meta';
      const count=document.createElement('span');count.textContent=`${d.row_count.toLocaleString()} 行`;
      const dt=document.createElement('span');dt.textContent=(d.imported_at||'').slice(0,19).replace('T',' ');
      meta.append(count,dt);
      const btn=document.createElement('button');btn.className='btn '+(d.id===active?'primary':'soft');btn.textContent=d.id===active?'已选中':'选择数据库 →';
      btn.addEventListener('click', () => selectDataset(d.id).catch(e=>showToast(e.message,true)));
      card.append(label,meta,btn);root.append(card);
    }
  } catch (e) {showToast(e.message,true);}
}
$('refresh-btn').addEventListener('click', loadDatasets);
function option(label,value) {const e = document.createElement('option'); e.textContent=label;e.value=value;return e;}

async function selectDataset(id) {
  const info=await (await request('/api/datasets/'+id)).json();
  active=id;activeInfo=info;page=1;lastQuery=null;lastTotal=0;
  $('query-locked').hidden=true;$('query-controls').hidden=false;
  $('active-label').textContent=info.filename;
  const sort=$('sort-column');sort.replaceChildren(option('导入顺序',''));
  for(const c of info.columns)sort.append(option(c.name + (c.type==='number'?' · 数值':''),c.id));
  $('filters').replaceChildren();$('results-count').textContent='等待查询';$('result-head').replaceChildren();$('result-body').replaceChildren();
  addFilter();await loadDatasets();await query();
}
function addFilter() {
  if (!activeInfo) return;
  if ($('filters').children.length>=8) {showToast('最多添加 8 个筛选条件',true);return;}
  const row=document.createElement('div');row.className='filter-row';
  const col=document.createElement('select');col.setAttribute('aria-label','筛选字段');
  for(const c of activeInfo.columns)col.append(option(c.name,c.id));
  const op=document.createElement('select');op.setAttribute('aria-label','条件运算符');
  const v1=document.createElement('input');v1.placeholder='条件值';v1.setAttribute('aria-label','条件值');
  const v2=document.createElement('input');v2.className='second-value';v2.placeholder='区间结束值';v2.setAttribute('aria-label','区间结束值');
  const del=document.createElement('button');del.textContent='×';del.setAttribute('aria-label','移除筛选条件');del.addEventListener('click',()=>row.remove());
  function refreshOps() {
    const c=activeInfo.columns.find(x=>x.id===col.value);
    const old=op.value; op.replaceChildren();
    for(const [label,code] of [['等于','eq'],['包含','contains'],['前缀匹配','starts_with']])op.append(option(label,code));
    if(c.type==='number')for(const [label,code] of [['大于','gt'],['大于等于','gte'],['小于','lt'],['小于等于','lte'],['区间','between']])op.append(option(label,code));
    if([...op.options].some(x=>x.value===old))op.value=old;
    refreshBetween();
  }
  function refreshBetween(){row.classList.toggle('between',op.value==='between');}
  col.addEventListener('change',refreshOps);op.addEventListener('change',refreshBetween);
  row.append(col,op,v1,v2,del);$('filters').append(row);refreshOps();
}
$('add-filter').addEventListener('click',addFilter);
function makeSpec() {
  const filters=[];
  for(const row of $('filters').children){
    const [col,op,v1,v2]=row.children;
    if(!v1.value.trim())continue;
    const entry={column:col.value,operator:op.value,value:v1.value};
    if(op.value==='between') {if(!v2.value.trim())throw new Error('区间筛选需要填写结束值');entry.value2=v2.value;}
    filters.push(entry);
  }
  return {filters,sort:{column:$('sort-column').value,direction:$('sort-direction').value},page,page_size:50};
}
async function query(){
  if(!active)return;
  try{
    const spec=makeSpec(); const result=await (await jsonPost('/api/datasets/'+active+'/query',spec)).json();
    lastQuery=spec;lastTotal=result.total;page=result.page;
    $('results-count').textContent=`找到 ${result.total.toLocaleString()} 条匹配记录`;
    $('results-sub').textContent=`显示本页 ${result.rows.length} 条 · 导出包含全部匹配行`;
    const thead=$('result-head');thead.replaceChildren();const hdr=document.createElement('tr');
    for(const label of ['#',...result.columns.map(c=>c.name)]){const th=document.createElement('th');th.textContent=label;hdr.append(th);}thead.append(hdr);
    const tbody=$('result-body');tbody.replaceChildren();
    if(!result.rows.length){const tr=document.createElement('tr');const td=document.createElement('td');td.className='empty';td.colSpan=1+result.columns.length;td.textContent='未找到匹配记录';tr.append(td);tbody.append(tr);}
    for(const item of result.rows){const tr=document.createElement('tr');const rn=document.createElement('td');rn.textContent=item.row_number;tr.append(rn);for(const c of result.columns){const td=document.createElement('td');td.textContent=item.values[c.id]??'';tr.append(td);}tbody.append(tr);}
    $('page-status').textContent=`第 ${page} / ${Math.max(1,Math.ceil(result.total/50))} 页`;
    $('prev-btn').disabled=page===1;$('next-btn').disabled=page*50>=result.total;
  }catch(e){showToast(e.message,true);}
}
$('query-btn').addEventListener('click',()=>{page=1;query();});
$('clear-btn').addEventListener('click',()=>{$('filters').replaceChildren();$('sort-column').value='';$('sort-direction').value='asc';page=1;query();});
$('prev-btn').addEventListener('click',()=>{if(page>1){page--;query();}});
$('next-btn').addEventListener('click',()=>{if(page*50<lastTotal){page++;query();}});
$('export-btn').addEventListener('click',async()=>{
  if(!active)return;
  try{
    const spec=makeSpec();
    const current={filters:spec.filters,sort:spec.sort};
    const executed=lastQuery && {filters:lastQuery.filters,sort:lastQuery.sort};
    if (!executed || JSON.stringify(current)!==JSON.stringify(executed))
      throw new Error('条件已修改，请先执行检索再导出');
    const res=await jsonPost('/api/datasets/'+active+'/export',lastQuery);
    const blob=await res.blob();download(blob,`dataset-${active}-results.csv`);showToast('已导出全部匹配记录（CSV）');
  }catch(e){showToast(e.message,true);}
});
$('download-db-btn').addEventListener('click',async()=>{
  if(!active)return;
  try{const res=await request('/api/datasets/'+active+'/download');download(await res.blob(),`dataset-${active}.sqlite3`);showToast('SQLite 数据库下载成功');}catch(e){showToast(e.message,true);}
});
function download(blob,name){const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
loadDatasets();
