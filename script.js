/* ---------- WHO reference data (boys, 0-24 months), approximate, for general orientation ---------- */
const WHO_WEIGHT = { // months: [P3,P15,P50,P85,P97] kg
  0:[2.5,2.9,3.3,3.9,4.4], 1:[3.4,3.9,4.5,5.1,5.8], 2:[4.3,4.9,5.6,6.3,7.1],
  3:[5.0,5.7,6.4,7.2,8.0], 4:[5.6,6.2,7.0,7.8,8.7], 5:[6.0,6.7,7.5,8.4,9.3],
  6:[6.4,7.1,7.9,8.8,9.8], 9:[7.1,7.8,8.9,9.9,11.0], 12:[7.7,8.6,9.6,10.8,12.0],
  15:[8.3,9.2,10.3,11.5,12.8], 18:[8.8,9.8,10.9,12.2,13.7], 21:[9.2,10.3,11.5,12.9,14.5],
  24:[9.7,10.8,12.2,13.6,15.3]
};
const WHO_HEIGHT = {
  0:[46.1,47.9,49.9,51.8,53.7], 1:[50.8,52.7,54.7,56.7,58.6], 2:[54.4,56.4,58.4,60.4,62.4],
  3:[57.3,59.4,61.4,63.5,65.5], 4:[59.7,61.8,63.9,66.0,68.0], 5:[61.7,63.8,65.9,68.0,70.1],
  6:[63.3,65.5,67.6,69.8,72.0], 9:[67.0,69.3,71.6,73.9,76.2], 12:[71.0,73.4,75.7,78.1,80.5],
  15:[73.5,76.0,78.5,81.0,83.5], 18:[76.0,78.6,81.2,83.8,86.4], 21:[78.4,81.1,83.8,86.5,89.2],
  24:[80.5,83.4,86.2,89.0,91.8]
};
const MONTHS_KEYS = [0,1,2,3,4,5,6,9,12,15,18,21,24];
function interpolateWhoBand(table, ageMonths){
  const keys = MONTHS_KEYS;
  if(ageMonths <= keys[0]) return table[keys[0]];
  if(ageMonths >= keys[keys.length-1]) return table[keys[keys.length-1]];
  for(let i=0;i<keys.length-1;i++){
    if(ageMonths >= keys[i] && ageMonths <= keys[i+1]){
      const frac = (ageMonths-keys[i])/(keys[i+1]-keys[i]);
      return table[keys[i]].map((v,idx)=> v + frac*(table[keys[i+1]][idx]-v));
    }
  }
}
function estimatePercentile(value, band){
  const percentiles = [3,15,50,85,97];
  if(value <= band[0]) return '<3';
  if(value >= band[band.length-1]) return '>97';
  for(let i=0;i<band.length-1;i++){
    if(value >= band[i] && value <= band[i+1]){
      const frac = (value-band[i])/(band[i+1]-band[i]);
      return Math.round(percentiles[i] + frac*(percentiles[i+1]-percentiles[i]));
    }
  }
}
function growthPercentiles(entry){
  if(!SETTINGS.birth) return null;
  const ageMonths = ageDaysFrom(SETTINGS.birth, entry.date)/30.4375;
  if(ageMonths==null || ageMonths<0) return null;
  const result = {};
  if(entry.weight!=null) result.weight = estimatePercentile(entry.weight, interpolateWhoBand(WHO_WEIGHT, ageMonths));
  if(entry.height!=null) result.height = estimatePercentile(entry.height, interpolateWhoBand(WHO_HEIGHT, ageMonths));
  return result;
}

/* ---------- state ---------- */
let DATA = { events: [], growth: [], milestones: [] };
let SETTINGS = { name:"עידו", birth: null };
let ME = localStorage.getItem('ido_who') || "";
let growthMetric = 'weight';
let diaperTypeVal = 'pee';
let sleepPeriodVal = 'day';
let windowStatsRange = 7;
let timelineDate = nightWindowDateFor(new Date());
let windowsListDate = nightWindowDateFor(new Date());
let pendingGrowthPhoto = null;
let photoCache = {};
let gePhotoState = { changed:false, data:null };
let charts = {};

const $ = (id) => document.getElementById(id);

/* ---------- icon library ---------- */
const ICONS = {
  home: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v9a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1v-9"/><path d="M9.5 20v-6h5v6"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2 12h2M20 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"/>',
  moon: '<path d="M20 14.2A8.2 8.2 0 1 1 9.8 4a6.8 6.8 0 0 0 10.2 10.2Z"/>',
  bottle: '<path d="M9.5 2h5"/><path d="M10.2 2v3.3c0 .7-.3 1.3-.8 1.8-.8.8-1.4 2-1.4 3.4v8.3a2.7 2.7 0 0 0 2.7 2.7h2.6a2.7 2.7 0 0 0 2.7-2.7V10.5c0-1.4-.6-2.6-1.4-3.4-.5-.5-.8-1.1-.8-1.8V2"/><path d="M8.3 13.5h7.4"/>',
  diaper: '<path d="M4 5.5h16"/><path d="M5 5.5c0 7 2.2 13 7 13s7-6 7-13"/><path d="M9 5.5c0 4.3 1.1 7.5 3 7.5s3-3.2 3-7.5"/>',
  droplet: '<path d="M12 3.3s6.5 7 6.5 11.3a6.5 6.5 0 1 1-13 0c0-4.3 6.5-11.3 6.5-11.3Z"/>',
  poop: '<path d="M12 4.2c-.9 1.7-2.7 1.9-2.7 3.6a2.7 2.7 0 0 0 2.7 2.7c-1.6 0-3.2.9-3.2 2.9a2.9 2.9 0 0 0 2.9 2.9h6.6a2.9 2.9 0 0 0 2.9-2.9c0-2-1.6-2.9-3.2-2.9a2.7 2.7 0 0 0 2.7-2.7c0-1.7-1.8-1.9-2.7-3.6-.3-.5-.6-.8-.9-.8-.4 0-.7.4-1 .8s-.6.8-1.1.8-.8-.4-1.1-.8-.6-.8-1-.8c-.3 0-.6.3-.9.8Z"/>',
  star: '<path d="m12 3 2.7 5.9 6.3.6-4.8 4.3 1.4 6.2L12 16.9 6.4 20l1.4-6.2-4.8-4.3 6.3-.6L12 3Z"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M8 3v4M16 3v4M3.5 10h17"/>',
  trendUp: '<path d="M3 17 9 11l4 4 8-8"/><path d="M15 7h6v6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  camera: '<path d="M4 8h3l1.6-2.2h6.8L17 8h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z"/><circle cx="12" cy="14" r="3.3"/>',
  history: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  barChart: '<path d="M4 20V10"/><path d="M12 20V4"/><path d="M20 20v-7"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 13.5a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.9 2.9l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6V20a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.9-2.9l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H4a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.9-2.9l.1.1a1.7 1.7 0 0 0 1.9.3H10a1.7 1.7 0 0 0 1-1.6V4a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.9 2.9l-.1.1a1.7 1.7 0 0 0-.3 1.9V10a1.7 1.7 0 0 0 1.6 1H20a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.6 1z"/>',
  person: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20c0-3.9 3.1-7 7-7s7 3.1 7 7"/>',
  download: '<path d="M12 3v12m0 0 4-4m-4 4-4-4"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>',
  pencil: '<path d="M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17v3Z"/><path d="M13.5 7.5l3 3"/>',
  ruler: '<rect x="3" y="9" width="18" height="6" rx="1"/><path d="M7 9v2.2M11 9v3M15 9v2.2M19 9v3"/>',
  tooth: '<path d="M9 3c-2.8 0-4.5 2-4.5 4.5 0 1.8.7 2.8 1 4.5.3 2 .7 8 2.2 8 1.2 0 1-3.5 1.3-5.3.2-1.2.7-2 1-2s.8.8 1 2c.3 1.8.1 5.3 1.3 5.3 1.5 0 1.9-6 2.2-8 .3-1.7 1-2.7 1-4.5C15.5 5 13.8 3 11 3c-.6 0-1 .3-1.5.3S9.6 3 9 3Z"/>',
  footsteps: '<ellipse cx="7.5" cy="16" rx="2.3" ry="3.4" transform="rotate(-15 7.5 16)"/><circle cx="9.3" cy="12.2" r="1"/><ellipse cx="16.5" cy="8" rx="2.3" ry="3.4" transform="rotate(15 16.5 8)"/><circle cx="14.7" cy="4.7" r="1"/>',
  standing: '<circle cx="12" cy="4.5" r="2.3"/><path d="M12 7.5v7M9 11h6M9.5 20.5 12 14.5l2.5 6"/>',
  smile: '<circle cx="12" cy="12" r="9"/><circle cx="8.7" cy="10" r="1"/><circle cx="15.3" cy="10" r="1"/><path d="M8 14.5c1.1 1.4 2.5 2.1 4 2.1s2.9-.7 4-2.1"/>',
  laugh: '<circle cx="12" cy="12" r="9"/><circle cx="8.7" cy="10" r="1"/><circle cx="15.3" cy="10" r="1"/><path d="M7.5 13.5a4.5 2.6 0 0 0 9 0Z"/>',
  chat: '<path d="M4.5 5h15v10.5H9L4.5 19V5Z"/>',
  rotate: '<path d="M4 4.5v5h5"/><path d="M20 19.5v-5h-5"/><path d="M5.5 9.5A7 7 0 0 1 19 9M18.5 14.5A7 7 0 0 1 5 15"/>',
  chair: '<path d="M6.5 4v9a2.7 2.7 0 0 0 2.7 2.7h5.6A2.7 2.7 0 0 0 17.5 13V4"/><path d="M6.5 20v-3.3M17.5 20v-3.3"/><path d="M6.5 10h11"/>',
  turtle: '<ellipse cx="12" cy="12.5" rx="7" ry="5"/><path d="M8.5 8 6.5 5M15.5 8l2-3M8.5 17 6.5 20M15.5 17l2 3M5 12.5H2M22 12.5h-3"/>',
  sparkle: '<path d="M12 2.5v4M12 17.5v4M2.5 12h4M17.5 12h4M5.5 5.5l2.8 2.8M15.7 15.7l2.8 2.8M18.5 5.5l-2.8 2.8M8.3 15.7l-2.8 2.8"/>',
  flag: '<path d="M6 21V4"/><path d="M6 4h13l-3.2 4.2L19 12.4H6"/>',
  zap: '<path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z"/>',
  list: '<path d="M8 4h8a1 1 0 0 1 1 1v15l-5-3-5 3V5a1 1 0 0 1 1-1Z"/>',
  pill: '<rect x="3" y="9" width="18" height="6" rx="3" transform="rotate(-45 12 12)"/><line x1="9" y1="9" x2="9" y2="15" transform="rotate(-45 12 12)"/>'
};
function icon(name, cls){
  return `<svg class="ico${cls?(' '+cls):''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]||''}</svg>`;
}
function hydrateIcons(){
  document.querySelectorAll('[data-icon]').forEach(el=>{ el.innerHTML = icon(el.dataset.icon); });
}
hydrateIcons();

/* ---------- theme ---------- */
let CHART_GRID = '#F0E8D8';
function applyChartTheme(){
  const styles = getComputedStyle(document.documentElement);
  CHART_GRID = styles.getPropertyValue('--line').trim();
  Chart.defaults.color = styles.getPropertyValue('--ink-soft').trim();
  Chart.defaults.borderColor = styles.getPropertyValue('--line').trim();
}
function setTheme(theme){
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('ido_theme', theme);
  $('themeToggle').innerHTML = theme==='dark' ? icon('sun') : icon('moon');
  applyChartTheme();
  if(document.getElementById('view-growth').classList.contains('active')) renderGrowthChart();
  if(document.getElementById('view-stats').classList.contains('active')) renderStats();
}
$('themeToggle').addEventListener('click', ()=>{
  const current = document.documentElement.getAttribute('data-theme');
  setTheme(current==='dark' ? 'light' : 'dark');
});

function uid(){ return Date.now().toString(36)+Math.random().toString(36).slice(2,7); }
function toast(msg){
  const t = $('toast'); t.textContent = msg; t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'), 1800);
}
function nowLocalInput(){
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0,16);
}
function suggestPeriod(dateTimeStr){
  const h = new Date(dateTimeStr).getHours();
  return (h>=6 && h<19) ? 'day' : 'night';
}
function resizeImageFile(file, maxDim, quality){
  maxDim = maxDim || 800; quality = quality || 0.75;
  return new Promise((resolve, reject)=>{
    const reader = new FileReader();
    reader.onload = (e)=>{
      const img = new Image();
      img.onload = ()=>{
        let w = img.width, h = img.height;
        if(w>h){ if(w>maxDim){ h = Math.round(h*maxDim/w); w = maxDim; } }
        else{ if(h>maxDim){ w = Math.round(w*maxDim/h); h = maxDim; } }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = ()=>reject(new Error('image load failed'));
      img.src = e.target.result;
    };
    reader.onerror = ()=>reject(new Error('file read failed'));
    reader.readAsDataURL(file);
  });
}
function fmtTime(iso){
  const d = new Date(iso);
  return d.toLocaleTimeString('he-IL', {hour:'2-digit', minute:'2-digit'});
}
function avgTimeOfDay(isoTimes){
  if(!isoTimes || isoTimes.length===0) return null;
  const totalMinutes = isoTimes.reduce((sum, iso)=>{
    const d = new Date(iso);
    return sum + d.getHours()*60 + d.getMinutes();
  }, 0);
  const avgMin = Math.round(totalMinutes / isoTimes.length);
  const h = Math.floor(avgMin/60), m = avgMin%60;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
}
function fmtDateTime(iso){
  const d = new Date(iso);
  return d.toLocaleDateString('he-IL', {day:'2-digit', month:'2-digit'}) + ' · ' + fmtTime(iso);
}
function isToday(iso){
  const d = new Date(iso), t = new Date();
  return d.toDateString() === t.toDateString();
}
function isOnDate(iso, dateStr){
  const d = new Date(iso);
  const localStr = d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  return localStr === dateStr;
}
function nightWindowDateFor(iso){
  const d = new Date(iso);
  if(d.getHours() >= 19) d.setDate(d.getDate()+1);
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}
function crossDayNote(iso, windowLabel){
  const d = new Date(iso);
  const actualDate = d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  if(actualDate === windowLabel) return '';
  return ' (' + d.toLocaleDateString('he-IL', {day:'2-digit', month:'2-digit'}) + ')';
}
function splitIntoDayPortions(startISO, endISO){
  const start = new Date(startISO), end = new Date(endISO);
  const portions = [];
  let cur = start;
  while(cur < end){
    const nextMidnight = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate()+1, 0,0,0,0);
    const segEnd = nextMidnight < end ? nextMidnight : end;
    const dateKey = cur.getFullYear()+'-'+String(cur.getMonth()+1).padStart(2,'0')+'-'+String(cur.getDate()).padStart(2,'0');
    portions.push({ dateKey, hours:(segEnd-cur)/3600000 });
    cur = segEnd;
  }
  return portions;
}
function daysAgo(iso, n){
  const d = new Date(iso), t = new Date();
  t.setHours(0,0,0,0);
  const cmp = new Date(d); cmp.setHours(0,0,0,0);
  const diff = Math.round((t - cmp)/86400000);
  return diff === n;
}

/* ---------- storage (Firebase Firestore, real-time) ---------- */
const firebaseConfig = {
  apiKey: "AIzaSyCK9Z3Qm2AOsI03df98eWLgsqNxyxo8mDc",
  authDomain: "kids-tracking-4aba8.firebaseapp.com",
  projectId: "kids-tracking-4aba8",
  storageBucket: "kids-tracking-4aba8.firebasestorage.app",
  messagingSenderId: "40764754443",
  appId: "1:40764754443:web:c2bd607ddcdda9cfa5d50e"
};
let db = null, dataDocRef = null, settingsDocRef = null, fbReady = false;
try{
  if(typeof firebase === 'undefined') throw new Error('Firebase SDK did not load');
  firebase.initializeApp(firebaseConfig);
  db = firebase.firestore();
  dataDocRef = db.collection('ido').doc('data');
  settingsDocRef = db.collection('ido').doc('settings');
  fbReady = true;
}catch(e){
  console.error('Firebase init failed:', e);
}

function initRealtimeSync(){
  if(!fbReady){ toast('לא הצלחנו להתחבר למסד הנתונים — בדקו חיבור לאינטרנט ורעננו'); return; }
  try{
    dataDocRef.onSnapshot((snap)=>{
      const d = snap.exists ? snap.data() : {};
      DATA = { events: d.events||[], growth: d.growth||[], milestones: d.milestones||[] };
      refreshAll();
    }, (err)=>{ console.error(err); toast('בעיה בחיבור למסד הנתונים'); });

    settingsDocRef.onSnapshot((snap)=>{
      if(snap.exists){ SETTINGS = snap.data(); }
      $('setName').value = SETTINGS.name || 'עידו';
      $('setBirth').value = SETTINGS.birth || '';
      updateGAgeShow();
      refreshHeader();
      renderGrowthHistory();
      renderMilestoneList();
    }, (err)=>{ console.error(err); toast('בעיה בחיבור למסד הנתונים'); });
  }catch(e){
    console.error('Realtime sync setup failed:', e);
    toast('בעיה בהתחברות למסד הנתונים');
  }
}
async function saveData(){
  if(!fbReady){ toast('אין חיבור למסד הנתונים'); return; }
  try{ await dataDocRef.set(DATA); }
  catch(e){ toast('שגיאה בשמירה — נסו שוב'); }
}
async function saveSettings(){
  if(!fbReady){ toast('אין חיבור למסד הנתונים'); return; }
  try{ await settingsDocRef.set(SETTINGS); }
  catch(e){ toast('שגיאה בשמירה'); }
}

/* ---------- who am I ---------- */
function refreshWho(){
  $('whoName').textContent = ME || 'מי אני?';
  $('whoAvatar').textContent = ME ? ME.trim()[0] : '?';
  $('whoInput').value = ME;
}
$('whoBtn').addEventListener('click', ()=>{ switchView('settings'); });
$('whoForm').addEventListener('submit', (e)=>{
  e.preventDefault();
  ME = $('whoInput').value.trim() || 'לא ידוע';
  localStorage.setItem('ido_who', ME);
  refreshWho();
  toast('נשמר, שלום ' + ME);
});

/* ---------- navigation ---------- */
function switchView(name){
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  document.querySelectorAll('nav.tabbar button').forEach(b=>b.classList.remove('active'));
  $('view-'+name).classList.add('active');
  document.querySelector(`nav.tabbar button[data-view="${name}"]`).classList.add('active');
  if(name==='growth') renderGrowthChart();
  if(name==='stats') renderStats();
  if(name==='milestones') renderMilestoneList();
}
document.querySelectorAll('nav.tabbar button').forEach(b=>{
  b.addEventListener('click', ()=>switchView(b.dataset.view));
});

/* ---------- day navigation (timeline) ---------- */
function shiftDate(dateStr, days){
  const d = new Date(dateStr+'T12:00:00');
  d.setDate(d.getDate()+days);
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}
$('timelineDate').addEventListener('change', ()=>{
  timelineDate = $('timelineDate').value || nightWindowDateFor(new Date());
  renderTodayTimeline();
});
$('prevDayBtn').addEventListener('click', ()=>{
  timelineDate = shiftDate(timelineDate, -1);
  $('timelineDate').value = timelineDate;
  renderTodayTimeline();
});
$('nextDayBtn').addEventListener('click', ()=>{
  timelineDate = shiftDate(timelineDate, 1);
  $('timelineDate').value = timelineDate;
  renderTodayTimeline();
});
$('todayJumpBtn').addEventListener('click', ()=>{
  timelineDate = nightWindowDateFor(new Date());
  $('timelineDate').value = timelineDate;
  renderTodayTimeline();
});

/* ---------- modals ---------- */
function openModal(id){ $(id).classList.add('open'); }
function closeModal(id){ $(id).classList.remove('open'); }
document.querySelectorAll('[data-close]').forEach(b=>{
  b.addEventListener('click', ()=>closeModal(b.dataset.close));
});
document.querySelectorAll('.modal-overlay').forEach(ov=>{
  ov.addEventListener('click', (e)=>{ if(e.target===ov) ov.classList.remove('open'); });
});

function openPhotoLightbox(src){
  if(!src) return;
  $('photoLightboxImg').src = src;
  openModal('photoLightbox');
}
$('gPhotoPreview').addEventListener('click', ()=>openPhotoLightbox($('gPhotoPreview').src));
$('gePhotoPreview').addEventListener('click', ()=>openPhotoLightbox($('gePhotoPreview').src));

/* ---------- age / header ---------- */
function ageStringFrom(birth, atDate){
  if(!birth) return null;
  const b = new Date(birth); const now = atDate ? new Date(atDate) : new Date();
  let months = (now.getFullYear()-b.getFullYear())*12 + (now.getMonth()-b.getMonth());
  if(now.getDate() < b.getDate()) months--;
  const days = Math.floor((now - b)/86400000);
  if(months < 1) return `בן ${days} ימים`;
  const remDays = Math.floor((now - new Date(b.getFullYear(), b.getMonth()+months, b.getDate()))/86400000);
  return `בן ${months} חודשים${remDays>0 ? ' ו-'+remDays+' ימים' : ''}`;
}
function ageDaysFrom(birth, atDate){
  if(!birth) return null;
  const b = new Date(birth); const now = atDate ? new Date(atDate) : new Date();
  return Math.floor((now-b)/86400000);
}
function refreshHeader(){
  $('babyName').textContent = SETTINGS.name || 'עידו';
  $('ageLine').textContent = SETTINGS.birth ? ageStringFrom(SETTINGS.birth) : 'הוסיפו תאריך לידה בהגדרות';
}

/* ---------- status strip ---------- */
function lastSleepEvent(){
  const sleepEvents = DATA.events.filter(e=>e.type==='sleep'||e.type==='wake').sort((a,b)=>new Date(b.time)-new Date(a.time));
  return sleepEvents[0] || null;
}
function isAsleep(){
  const last = lastSleepEvent();
  return last && last.type==='sleep';
}
function lastFeed(){
  const f = DATA.events.filter(e=>e.type==='feed').sort((a,b)=>new Date(b.time)-new Date(a.time));
  return f[0] || null;
}
function lastDiaper(){
  const d = DATA.events.filter(e=>e.type==='diaper').sort((a,b)=>new Date(b.time)-new Date(a.time));
  return d[0] || null;
}
const TRACKING_START = new Date('2026-07-12T00:00:00');
function afterTrackingStart(isoTime){
  return new Date(isoTime) >= TRACKING_START;
}
function computeSleepWakeAverages(cutoffDate){
  const events = [...DATA.events].filter(e=>e.type==='sleep'||e.type==='wake').sort((a,b)=>new Date(a.time)-new Date(b.time));
  const nightSleeps = [], wakes = [];
  for(let i=0;i<events.length;i++){
    const ev = events[i];
    if(new Date(ev.time) < cutoffDate) continue;
    if(!afterTrackingStart(ev.time)) continue;
    const prev = i>0 ? events[i-1] : null;
    const evPeriod = ev.period || suggestPeriod(ev.time);
    const prevPeriod = prev ? (prev.period || suggestPeriod(prev.time)) : null;
    if(ev.type==='sleep' && evPeriod==='night'){
      if(!(prev && prev.type==='wake' && prevPeriod==='night')) nightSleeps.push(ev.time);
    }
    if(ev.type==='wake' && evPeriod==='day'){
      if(prev && prev.type==='sleep' && prevPeriod==='night') wakes.push(ev.time);
    }
  }
  return { nightSleeps, wakes };
}
function renderStatusStrip(){
  const strip = $('statusStrip');
  const asleep = isAsleep();
  const lastSW = lastSleepEvent();
  const lf = lastFeed();
  const ld = lastDiaper();
  const lastW = [...DATA.growth].sort((a,b)=>new Date(b.date)-new Date(a.date))[0];
  const statusTime = lastSW ? fmtTime(lastSW.time) : '';

  const cutoff = new Date(); cutoff.setDate(cutoff.getDate()-14);
  const { nightSleeps, wakes } = computeSleepWakeAverages(cutoff);
  const avgNightSleep = avgTimeOfDay(nightSleeps);
  const avgWakeTime = avgTimeOfDay(wakes);

  const recentWindows = computeWindows().filter(w=> new Date(w.start) >= cutoff);
  const avgDailySleepDay = avgDailyTotalHours(recentWindows, 'sleep', 'day');
  const avgDailySleepNight = avgDailyTotalHours(recentWindows, 'sleep', 'night');
  const avgSleepDayDuration = avgDailySleepDay!=null ? formatHM(avgDailySleepDay) : null;
  const avgSleepNightDuration = avgDailySleepNight!=null ? formatHM(avgDailySleepNight) : null;

  const feedWindowStart = new Date();
  feedWindowStart.setHours(6,0,0,0);
  if(new Date() < feedWindowStart){ feedWindowStart.setDate(feedWindowStart.getDate()-1); }
  const totalFeedToday = DATA.events
    .filter(e=>e.type==='feed' && new Date(e.time) >= feedWindowStart)
    .reduce((s,e)=>s+(e.ml||0),0);

  const chipsHtml = `
    <div class="chip"><div class="label">משקל אחרון</div><div class="val">${lastW?lastW.weight+' ק"ג':'—'}</div></div>
    <div class="chip"><div class="label">${icon('moon')} משך שינה ממוצע בלילה</div><div class="val">${avgSleepNightDuration||'—'}</div></div>
    <div class="chip"><div class="label">${icon('sun')} משך שינה ממוצע ביום</div><div class="val">${avgSleepDayDuration||'—'}</div></div>
    <div class="chip"><div class="label">${icon('sun')} שעת קימה ממוצעת</div><div class="val">${avgWakeTime||'—'}</div></div>
    <div class="chip"><div class="label">${icon('moon')} שעת הרדמות ממוצעת בלילה</div><div class="val">${avgNightSleep||'—'}</div></div>
    <div class="chip"><div class="label">${icon('bottle')} סה"כ אכילה היום</div><div class="val">${totalFeedToday} מ"ל</div><div class="label" style="margin-top:1px;">מ-6:00</div></div>
    <div class="chip"><div class="label">החתלה אחרונה</div><div class="val">${ld?fmtTime(ld.time):'—'}</div>${ld?`<div class="label" style="margin-top:1px;">${ld.kind==='pee'?'פיפי':ld.kind==='poop'?'קקי':'פיפי + קקי'}</div>`:''}</div>
    <div class="chip"><div class="label">האכלה אחרונה</div><div class="val">${lf?fmtTime(lf.time):'—'}</div>${lf?`<div class="label" style="margin-top:1px;">${lf.ml} מ"ל</div>`:''}</div>
    <div class="chip"><div class="label">מצב</div><div class="val">${asleep?icon('moon')+' ישן':icon('sun')+' ער'}</div>${statusTime?`<div class="label" style="margin-top:1px;">מ-${statusTime}</div>`:''}</div>
  `;
  strip.innerHTML = `<div class="status-strip-track">${chipsHtml}${chipsHtml}</div>`;
  if(!msInitialized){
    const track = strip.querySelector('.status-strip-track');
    const singleWidth = track.scrollWidth/2;
    msOffset = Math.min(0, -(singleWidth - strip.clientWidth));
    msInitialized = true;
  }
  msApplyOffset();
}

/* ---------- status strip (drag to scroll, no auto-motion) ---------- */
let msOffset = 0;
let msInitialized = false;
let msDragging = false;
let msDragStartX = 0;
let msDragStartOffset = 0;

function msWrap(v, w){
  if(w<=0) return 0;
  v = v % w;
  if(v > 0) v -= w;
  return v;
}
function msApplyOffset(){
  const track = $('statusStrip').querySelector('.status-strip-track');
  if(track) track.style.transform = `translateX(${msOffset}px)`;
}

const statusStripEl = $('statusStrip');
statusStripEl.addEventListener('pointerdown', (e)=>{
  msDragging = true;
  msDragStartX = e.clientX;
  msDragStartOffset = msOffset;
  statusStripEl.classList.add('dragging');
  statusStripEl.setPointerCapture(e.pointerId);
});
statusStripEl.addEventListener('pointermove', (e)=>{
  if(!msDragging) return;
  const dx = e.clientX - msDragStartX;
  const track = statusStripEl.querySelector('.status-strip-track');
  const singleWidth = track ? track.scrollWidth/2 : 0;
  msOffset = msWrap(msDragStartOffset + dx, singleWidth);
  msApplyOffset();
});
function msEndDrag(){
  msDragging = false;
  statusStripEl.classList.remove('dragging');
}
statusStripEl.addEventListener('pointerup', msEndDrag);
statusStripEl.addEventListener('pointercancel', msEndDrag);

/* ---------- sleep toggle ---------- */
function refreshSleepBtn(){
  const btn = $('sleepBtn');
  const asleep = isAsleep();
  btn.classList.toggle('on', asleep);
  $('sleepTitle').textContent = asleep ? 'התעורר' : 'נרדם';
  $('sleepSub').textContent = asleep ? 'לחצו כשעידו קם' : 'לחצו כשעידו נרדם';
}

/* ---------- supplements ---------- */
function openSupplementsModal(editId){
  if(editId){
    const ev = DATA.events.find(e=>e.id===editId);
    if(!ev) return;
    $('supplementsModalTitle').innerHTML = icon('pill')+' עריכת תוספים';
    $('supplementsEditId').value = editId;
    $('ironCheck').checked = !!ev.iron;
    $('vitaminDCheck').checked = !!ev.vitaminD;
    const d = new Date(ev.time); d.setMinutes(d.getMinutes()-d.getTimezoneOffset());
    $('supplementsTime').value = d.toISOString().slice(0,16);
    $('supplementsDeleteBtn').style.display = 'block';
  } else {
    $('supplementsModalTitle').innerHTML = icon('pill')+' תוספים';
    $('supplementsEditId').value = '';
    $('ironCheck').checked = false;
    $('vitaminDCheck').checked = false;
    $('supplementsTime').value = nowLocalInput();
    $('supplementsDeleteBtn').style.display = 'none';
  }
  openModal('supplementsModal');
}
$('supplementsForm').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const editId = $('supplementsEditId').value;
  const iron = $('ironCheck').checked;
  const vitaminD = $('vitaminDCheck').checked;
  if(!iron && !vitaminD){ toast('צריך לסמן לפחות תוסף אחד'); return; }
  const time = new Date($('supplementsTime').value).toISOString();
  if(editId){
    const ev = DATA.events.find(x=>x.id===editId);
    if(ev){ ev.iron = iron; ev.vitaminD = vitaminD; ev.time = time; ev.editedBy = ME||''; }
  } else {
    DATA.events.push({ id: uid(), type:'supplement', iron, vitaminD, time, by: ME||'' });
  }
  await saveData();
  closeModal('supplementsModal');
  toast(editId ? 'התוספים עודכנו' : 'התוספים נשמרו');
  refreshAll();
});
$('supplementsDeleteBtn').addEventListener('click', async ()=>{
  const editId = $('supplementsEditId').value;
  if(!editId) return;
  if(!confirm('למחוק את הרשומה הזו?')) return;
  DATA.events = DATA.events.filter(x=>x.id!==editId);
  await saveData();
  closeModal('supplementsModal');
  toast('הרשומה נמחקה');
  refreshAll();
});
$('sleepBtn').addEventListener('click', ()=>{
  const asleep = isAsleep();
  openSleepModal(null, asleep ? 'wake' : 'sleep');
});

function setSleepTypeSeg(val){
  document.querySelectorAll('#sleepTypeSeg button').forEach(b=>b.classList.toggle('active', b.dataset.val===val));
}
document.querySelectorAll('#sleepTypeSeg button').forEach(b=>{
  b.addEventListener('click', ()=>setSleepTypeSeg(b.dataset.val));
});
function setSleepPeriodSeg(val){
  sleepPeriodVal = val;
  document.querySelectorAll('#sleepPeriodSeg button').forEach(b=>b.classList.toggle('active', b.dataset.val===val));
}
document.querySelectorAll('#sleepPeriodSeg button').forEach(b=>{
  b.addEventListener('click', ()=>setSleepPeriodSeg(b.dataset.val));
});
$('sleepTime').addEventListener('change', ()=>{
  setSleepPeriodSeg(suggestPeriod($('sleepTime').value));
});
function openSleepModal(editId, defaultType){
  if(editId){
    const ev = DATA.events.find(e=>e.id===editId);
    if(!ev) return;
    $('sleepModalTitle').innerHTML = ev.type==='sleep' ? icon('moon')+' עריכת הירדמות' : icon('sun')+' עריכת התעוררות';
    $('sleepEditId').value = editId;
    setSleepTypeSeg(ev.type);
    const d = new Date(ev.time); d.setMinutes(d.getMinutes()-d.getTimezoneOffset());
    $('sleepTime').value = d.toISOString().slice(0,16);
    setSleepPeriodSeg(ev.period || suggestPeriod(ev.time));
    $('sleepDeleteBtn').style.display = 'block';
  } else {
    $('sleepModalTitle').innerHTML = icon('moon')+' שינה';
    $('sleepEditId').value = '';
    setSleepTypeSeg(defaultType || 'sleep');
    $('sleepTime').value = nowLocalInput();
    setSleepPeriodSeg(suggestPeriod($('sleepTime').value));
    $('sleepDeleteBtn').style.display = 'none';
  }
  openModal('sleepModal');
}
$('sleepForm').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const editId = $('sleepEditId').value;
  const type = document.querySelector('#sleepTypeSeg button.active')?.dataset.val || 'sleep';
  const period = document.querySelector('#sleepPeriodSeg button.active')?.dataset.val || 'day';
  const time = new Date($('sleepTime').value).toISOString();
  if(editId){
    const ev = DATA.events.find(x=>x.id===editId);
    if(ev){ ev.type = type; ev.time = time; ev.period = period; ev.editedBy = ME||''; }
  } else {
    DATA.events.push({ id:uid(), type, time, period, by:ME||'' });
  }
  await saveData();
  closeModal('sleepModal');
  toast(editId ? 'הרשומה עודכנה' : (type==='wake' ? 'בוקר טוב!' : 'לילה טוב'));
  refreshAll();
});
$('sleepDeleteBtn').addEventListener('click', async ()=>{
  const editId = $('sleepEditId').value;
  if(!editId) return;
  if(!confirm('למחוק את הרשומה הזו?')) return;
  DATA.events = DATA.events.filter(x=>x.id!==editId);
  await saveData();
  closeModal('sleepModal');
  toast('הרשומה נמחקה');
  refreshAll();
});

/* ---------- feed ---------- */
$('feedBtn').addEventListener('click', ()=>openFeedModal(null));
function openFeedModal(editId){
  if(editId){
    const ev = DATA.events.find(e=>e.id===editId);
    if(!ev) return;
    $('feedModalTitle').innerHTML = icon('bottle')+' עריכת האכלה';
    $('feedEditId').value = editId;
    $('feedMl').value = ev.ml;
    const d = new Date(ev.time); d.setMinutes(d.getMinutes()-d.getTimezoneOffset());
    $('feedTime').value = d.toISOString().slice(0,16);
    $('feedDeleteBtn').style.display = 'block';
  } else {
    $('feedModalTitle').innerHTML = icon('bottle')+' האכלה';
    $('feedEditId').value = '';
    $('feedTime').value = nowLocalInput();
    $('feedMl').value = '';
    $('feedDeleteBtn').style.display = 'none';
  }
  openModal('feedModal');
}
$('feedForm').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const editId = $('feedEditId').value;
  const ml = Number($('feedMl').value);
  const time = new Date($('feedTime').value).toISOString();
  if(editId){
    const ev = DATA.events.find(x=>x.id===editId);
    if(ev){ ev.ml = ml; ev.time = time; ev.editedBy = ME||''; }
  } else {
    DATA.events.push({ id:uid(), type:'feed', ml, time, by:ME||'' });
  }
  await saveData();
  closeModal('feedModal');
  toast(editId ? 'ההאכלה עודכנה' : 'האכלה נשמרה');
  refreshAll();
});
$('feedDeleteBtn').addEventListener('click', async ()=>{
  const editId = $('feedEditId').value;
  if(!editId) return;
  if(!confirm('למחוק את ההאכלה הזו?')) return;
  DATA.events = DATA.events.filter(x=>x.id!==editId);
  await saveData();
  closeModal('feedModal');
  toast('ההאכלה נמחקה');
  refreshAll();
});

/* ---------- diaper ---------- */
$('diaperBtn').addEventListener('click', ()=>openDiaperModal(null));
document.querySelectorAll('#diaperType button').forEach(b=>{
  b.addEventListener('click', ()=>{
    diaperTypeVal = b.dataset.val;
    document.querySelectorAll('#diaperType button').forEach(x=>x.classList.remove('active'));
    b.classList.add('active');
    $('consistencyField').style.display = (diaperTypeVal==='pee') ? 'none' : 'block';
  });
});
function openDiaperModal(editId){
  if(editId){
    const ev = DATA.events.find(e=>e.id===editId);
    if(!ev) return;
    $('diaperModalTitle').innerHTML = icon('diaper')+' עריכת החתלה';
    $('diaperEditId').value = editId;
    diaperTypeVal = ev.kind;
    document.querySelectorAll('#diaperType button').forEach(b=>b.classList.toggle('active', b.dataset.val===ev.kind));
    $('consistencyField').style.display = (ev.kind==='pee') ? 'none' : 'block';
    if(ev.consistency) $('poopConsistency').value = ev.consistency;
    const d = new Date(ev.time); d.setMinutes(d.getMinutes()-d.getTimezoneOffset());
    $('diaperTime').value = d.toISOString().slice(0,16);
    $('diaperDeleteBtn').style.display = 'block';
  } else {
    $('diaperModalTitle').innerHTML = icon('diaper')+' החתלה';
    $('diaperEditId').value = '';
    $('diaperTime').value = nowLocalInput();
    diaperTypeVal = 'pee';
    document.querySelectorAll('#diaperType button').forEach(b=>b.classList.toggle('active', b.dataset.val==='pee'));
    $('consistencyField').style.display = 'none';
    $('diaperDeleteBtn').style.display = 'none';
  }
  openModal('diaperModal');
}
$('diaperForm').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const editId = $('diaperEditId').value;
  const kind = diaperTypeVal;
  const consistency = kind!=='pee' ? $('poopConsistency').value : null;
  const time = new Date($('diaperTime').value).toISOString();
  if(editId){
    const ev = DATA.events.find(x=>x.id===editId);
    if(ev){ ev.kind = kind; ev.consistency = consistency; ev.time = time; ev.editedBy = ME||''; }
  } else {
    DATA.events.push({ id:uid(), type:'diaper', kind, consistency, time, by:ME||'' });
  }
  await saveData();
  closeModal('diaperModal');
  toast(editId ? 'ההחתלה עודכנה' : 'החתלה נשמרה');
  refreshAll();
});
$('diaperDeleteBtn').addEventListener('click', async ()=>{
  const editId = $('diaperEditId').value;
  if(!editId) return;
  if(!confirm('למחוק את ההחתלה הזו?')) return;
  DATA.events = DATA.events.filter(x=>x.id!==editId);
  await saveData();
  closeModal('diaperModal');
  toast('ההחתלה נמחקה');
  refreshAll();
});


/* ---------- milestones ---------- */
const MILESTONE_PRESETS = [
  'התהפך מהבטן לגב', 'התהפך מהגב לבטן', 'ישב לבד', 'זחל', 'עמד לבד (פעם ראשונה)',
  'צעד ראשון', 'חיוך ראשון', 'צחוק ראשון', 'מילה ראשונה', 'שן ראשונה'
];
function renderMilestonePresets(){
  $('milestonePresets').innerHTML = MILESTONE_PRESETS.map(p=>`<div class="m-chip" data-p="${p}">${p}</div>`).join('');
  document.querySelectorAll('#milestonePresets .m-chip').forEach(c=>{
    c.addEventListener('click', ()=>{
      $('mTitle').value = c.dataset.p;
      document.querySelectorAll('#milestonePresets .m-chip').forEach(x=>x.classList.remove('selected'));
      c.classList.add('selected');
    });
  });
}
$('milestoneQuickBtn').addEventListener('click', ()=>openMilestoneModal());
$('supplementsQuickBtn').addEventListener('click', ()=>openSupplementsModal());
$('openMilestoneBtn').addEventListener('click', ()=>openMilestoneModal());
function openMilestoneModal(editId){
  document.querySelectorAll('#milestonePresets .m-chip').forEach(x=>x.classList.remove('selected'));
  if(editId){
    const m = DATA.milestones.find(x=>x.id===editId);
    if(!m) return;
    $('milestoneModalTitle').innerHTML = icon('star')+' עריכת אבן דרך';
    $('mEditId').value = editId;
    $('mTitle').value = m.title;
    $('mDetails').value = m.details||'';
    const d = new Date(m.time); d.setMinutes(d.getMinutes()-d.getTimezoneOffset());
    $('mTime').value = d.toISOString().slice(0,16);
    $('mDeleteBtn').style.display = 'block';
  } else {
    $('milestoneModalTitle').innerHTML = icon('star')+' אבן דרך חדשה';
    $('mEditId').value = '';
    $('mTime').value = nowLocalInput();
    $('mTitle').value = '';
    $('mDetails').value = '';
    $('mDeleteBtn').style.display = 'none';
  }
  openModal('milestoneModal');
}
$('milestoneForm').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const editId = $('mEditId').value;
  const title = $('mTitle').value.trim();
  const details = $('mDetails').value.trim();
  const time = new Date($('mTime').value).toISOString();
  if(editId){
    const m = DATA.milestones.find(x=>x.id===editId);
    if(m){ m.title = title; m.details = details; m.time = time; m.editedBy = ME||''; }
  } else {
    DATA.milestones.push({ id:uid(), title, details, time, by:ME||'' });
  }
  await saveData();
  closeModal('milestoneModal');
  toast(editId ? 'אבן הדרך עודכנה' : 'אבן דרך נשמרה');
  refreshAll();
});
$('mDeleteBtn').addEventListener('click', async ()=>{
  const editId = $('mEditId').value;
  if(!editId) return;
  if(!confirm('למחוק את אבן הדרך הזו?')) return;
  DATA.milestones = DATA.milestones.filter(x=>x.id!==editId);
  await saveData();
  closeModal('milestoneModal');
  toast('אבן הדרך נמחקה');
  refreshAll();
});
function milestoneIcon(title){
  if(title.includes('שן')) return icon('tooth');
  if(title.includes('צעד')||title.includes('הלך')) return icon('footsteps');
  if(title.includes('עמד')) return icon('standing');
  if(title.includes('חיוך')) return icon('smile');
  if(title.includes('צחוק')) return icon('laugh');
  if(title.includes('מילה')) return icon('chat');
  if(title.includes('התהפך')) return icon('rotate');
  if(title.includes('ישב')) return icon('chair');
  if(title.includes('זחל')) return icon('turtle');
  return icon('star');
}
function renderMilestoneList(){
  const list = [...DATA.milestones].sort((a,b)=>new Date(b.time)-new Date(a.time));
  if(list.length===0){ $('milestoneList').innerHTML = `<div class="empty-hint">עוד לא נרשמו אבני דרך — הראשונה תמיד הכי מרגשת ${icon('sparkle')}</div>`; return; }
  $('milestoneList').innerHTML = list.map(m=>{
    const age = SETTINGS.birth ? ageStringFrom(SETTINGS.birth, m.time) : null;
    return `
    <div class="milestone-log-item editable" data-edit-id="${m.id}">
      <div class="m-badge">${milestoneIcon(m.title)}</div>
      <div class="tl-body">
        <div class="tl-title">${m.title}</div>
        ${m.details?`<div class="tl-meta">${m.details}</div>`:''}
        <div class="tl-meta">${fmtDateTime(m.time)}${age?` · ${age}`:''}${m.by?` · <span class="who-badge">${m.by}</span>`:''}</div>
      </div>
      <div class="tl-edit-hint">עריכה ${icon('pencil')}</div>
    </div>
  `;}).join('');
  document.querySelectorAll('#milestoneList .milestone-log-item.editable').forEach(el=>{
    el.addEventListener('click', ()=>openMilestoneModal(el.dataset.editId));
  });
}

/* ---------- today timeline ---------- */
function timelineIconClass(ev){
  if(ev.type==='sleep') return 'sleep';
  if(ev.type==='wake') return 'wake';
  if(ev.type==='feed') return 'feed';
  if(ev.type==='diaper') return ev.kind==='pee' ? 'pee' : 'poop';
  if(ev.type==='supplement') return 'supplement';
  return 'milestone';
}
function timelineIcon(ev){
  if(ev.type==='sleep') return icon('moon');
  if(ev.type==='wake') return icon('sun');
  if(ev.type==='feed') return icon('bottle');
  if(ev.type==='diaper') return ev.kind==='pee' ? icon('droplet') : (ev.kind==='both' ? icon('diaper') : icon('poop'));
  if(ev.type==='supplement') return icon('pill');
  return icon('star');
}
function timelineTitle(ev){
  if(ev.type==='sleep') return `נרדם${ev.period?(ev.period==='night'?' '+icon('moon'):' '+icon('sun')):''}`;
  if(ev.type==='wake') return `התעורר${ev.period?(ev.period==='night'?' '+icon('moon'):' '+icon('sun')):''}`;
  if(ev.type==='feed') return `האכלה — ${ev.ml} מ"ל`;
  if(ev.type==='diaper'){
    if(ev.kind==='pee') return 'פיפי';
    if(ev.kind==='poop') return `קקי${ev.consistency?' — '+ev.consistency:''}`;
    return `פיפי + קקי${ev.consistency?' — '+ev.consistency:''}`;
  }
  if(ev.type==='supplement') return 'תוספים';
  return ev.title;
}
function supplementDetailText(ev){
  const parts = [];
  if(ev.iron) parts.push('ברזל');
  if(ev.vitaminD) parts.push('ויטמין D');
  return parts.join(', ');
}
function updateTimelineTitle(){
  const todayStr = nightWindowDateFor(new Date());
  if(timelineDate === todayStr){
    $('timelineTitle').innerHTML = icon('calendar')+' היום';
  } else {
    const d = new Date(timelineDate+'T12:00:00');
    $('timelineTitle').innerHTML = icon('calendar')+' ' + d.toLocaleDateString('he-IL', {weekday:'long', day:'2-digit', month:'2-digit'});
  }
}
function renderTodayTimeline(){
  updateTimelineTitle();
  const dayEvents = DATA.events.filter(e=>nightWindowDateFor(e.time)===timelineDate).map(e=>({...e, _kind:'event'}));
  const dayMilestones = DATA.milestones.filter(m=>nightWindowDateFor(m.time)===timelineDate).map(m=>({...m, type:'milestone', _kind:'milestone'}));
  const all = [...dayEvents, ...dayMilestones].sort((a,b)=>new Date(b.time)-new Date(a.time));
  if(all.length===0){ $('todayTimeline').innerHTML = '<div class="tl-empty">לא נרשם כלום בטווח הזה</div>'; return; }
  $('todayTimeline').innerHTML = all.map(ev=>{
    const isEditable = (ev.type==='sleep'||ev.type==='wake'||ev.type==='feed'||ev.type==='diaper'||ev.type==='supplement'||ev.type==='milestone');
    return `
    <div class="tl-item${isEditable?' editable':''}" ${isEditable?`data-edit-id="${ev.id}" data-edit-type="${ev.type}"`:''}>
      <div class="tl-icon ${timelineIconClass(ev)}">${timelineIcon(ev)}</div>
      <div class="tl-body">
        <div class="tl-title">${timelineTitle(ev)}</div>
        ${ev.type==='supplement'?`<div class="tl-meta">${supplementDetailText(ev)}</div>`:''}
        <div class="tl-meta">${fmtTime(ev.time)}${crossDayNote(ev.time, timelineDate)}${ev.by?` · <span class="who-badge">${ev.by}</span>`:''}</div>
      </div>
      ${isEditable?`<div class="tl-edit-hint">עריכה ${icon('pencil')}</div>`:''}
    </div>
  `;}).join('');
  document.querySelectorAll('#todayTimeline .tl-item.editable').forEach(el=>{
    el.addEventListener('click', ()=>{
      const type = el.dataset.editType;
      const id = el.dataset.editId;
      if(type==='sleep'||type==='wake') openSleepModal(id);
      else if(type==='feed') openFeedModal(id);
      else if(type==='diaper') openDiaperModal(id);
      else if(type==='supplement') openSupplementsModal(id);
      else if(type==='milestone') openMilestoneModal(id);
    });
  });
}

/* ---------- growth ---------- */
$('gDate').addEventListener('change', updateGAgeShow);
function updateGAgeShow(){
  if(SETTINGS.birth && $('gDate').value){
    const days = ageDaysFrom(SETTINGS.birth, $('gDate').value);
    $('gAgeShow').value = days!==null ? days + ' ימים' : '';
  }
}
$('gPhotoTriggerBtn').addEventListener('click', ()=>$('gPhotoInput').click());
$('gPhotoInput').addEventListener('change', async (e)=>{
  const file = e.target.files[0];
  if(!file) return;
  try{
    toast('מעבד תמונה…');
    pendingGrowthPhoto = await resizeImageFile(file);
    $('gPhotoPreview').src = pendingGrowthPhoto;
    $('gPhotoPreviewWrap').style.display = 'block';
  }catch(err){
    console.error(err);
    toast('שגיאה בטעינת התמונה');
  }
});
$('gPhotoRemoveBtn').addEventListener('click', ()=>{
  pendingGrowthPhoto = null;
  $('gPhotoInput').value = '';
  $('gPhotoPreviewWrap').style.display = 'none';
});
$('growthForm').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const w = $('gWeight').value ? Number($('gWeight').value) : null;
  const h = $('gHeight').value ? Number($('gHeight').value) : null;
  if(w===null && h===null){ toast('הזינו משקל או גובה'); return; }
  const entryId = uid();
  const hasPhoto = !!pendingGrowthPhoto;
  DATA.growth.push({ id:entryId, date:$('gDate').value, weight:w, height:h, by:ME||'', photo:hasPhoto });
  await saveData();
  if(hasPhoto && fbReady){
    try{
      await db.collection('ido_photos').doc(entryId).set({ data: pendingGrowthPhoto });
      photoCache[entryId] = pendingGrowthPhoto;
    }catch(err){
      console.error(err);
      toast('המדידה נשמרה אך התמונה לא הועלתה');
    }
  }
  toast('מדידה נשמרה');
  $('growthForm').reset();
  $('gDate').value = new Date().toISOString().slice(0,10);
  pendingGrowthPhoto = null;
  $('gPhotoPreviewWrap').style.display = 'none';
  updateGAgeShow();
  refreshAll();
});
function renderGrowthHistory(){
  const list = [...DATA.growth].sort((a,b)=>new Date(b.date)-new Date(a.date));
  if(list.length===0){ $('growthHistory').innerHTML = '<div class="empty-hint">עוד אין מדידות</div>'; return; }
  $('growthHistory').innerHTML = list.map(g=>{
    const pct = growthPercentiles(g);
    const pctParts = [];
    if(pct){
      if(pct.weight!=null) pctParts.push(`משקל: אחוזון ${pct.weight}`);
      if(pct.height!=null) pctParts.push(`גובה: אחוזון ${pct.height}`);
    }
    return `
    <div class="tl-item editable" data-edit-id="${g.id}">
      <div class="tl-icon milestone">${g.photo?icon('camera'):icon('ruler')}</div>
      <div class="tl-body">
        <div class="tl-title">${g.weight?g.weight+' ק"ג':''}${g.weight&&g.height?' · ':''}${g.height?g.height+' ס"מ':''}</div>
        <div class="tl-meta">${new Date(g.date).toLocaleDateString('he-IL')}${g.by?` · <span class="who-badge">${g.by}</span>`:''}</div>
        ${pctParts.length?`<div class="tl-meta">${pctParts.join(' · ')}</div>`:''}
      </div>
      <div class="tl-edit-hint">עריכה ${icon('pencil')}</div>
    </div>
  `;}).join('');
  document.querySelectorAll('#growthHistory .tl-item.editable').forEach(el=>{
    el.addEventListener('click', ()=>openGrowthEditModal(el.dataset.editId));
  });
}

async function openGrowthEditModal(entryId){
  const entry = DATA.growth.find(g=>g.id===entryId);
  if(!entry) return;
  $('geEditId').value = entryId;
  $('geDate').value = entry.date;
  $('geWeight').value = entry.weight!=null ? entry.weight : '';
  $('geHeight').value = entry.height!=null ? entry.height : '';
  gePhotoState = { changed:false, data:null };
  $('gePhotoInput').value = '';
  $('gePhotoPreviewWrap').style.display = 'none';
  $('gePhotoLoading').style.display = 'none';
  openModal('growthEditModal');
  if(entry.photo){
    if(photoCache[entryId]){
      $('gePhotoPreview').src = photoCache[entryId];
      $('gePhotoPreviewWrap').style.display = 'block';
    } else if(fbReady){
      $('gePhotoLoading').style.display = 'block';
      try{
        const doc = await db.collection('ido_photos').doc(entryId).get();
        if(doc.exists){
          photoCache[entryId] = doc.data().data;
          $('gePhotoPreview').src = photoCache[entryId];
          $('gePhotoPreviewWrap').style.display = 'block';
        }
      }catch(err){ console.error(err); }
      $('gePhotoLoading').style.display = 'none';
    }
  }
}
$('gePhotoTriggerBtn').addEventListener('click', ()=>$('gePhotoInput').click());
$('gePhotoInput').addEventListener('change', async (e)=>{
  const file = e.target.files[0];
  if(!file) return;
  try{
    toast('מעבד תמונה…');
    const resized = await resizeImageFile(file);
    gePhotoState = { changed:true, data: resized };
    $('gePhotoPreview').src = resized;
    $('gePhotoPreviewWrap').style.display = 'block';
  }catch(err){
    console.error(err);
    toast('שגיאה בטעינת התמונה');
  }
});
$('gePhotoRemoveBtn').addEventListener('click', ()=>{
  gePhotoState = { changed:true, data:null };
  $('gePhotoInput').value = '';
  $('gePhotoPreviewWrap').style.display = 'none';
});
$('growthEditForm').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const entryId = $('geEditId').value;
  const entry = DATA.growth.find(g=>g.id===entryId);
  if(!entry) return;
  const w = $('geWeight').value ? Number($('geWeight').value) : null;
  const h = $('geHeight').value ? Number($('geHeight').value) : null;
  if(w===null && h===null){ toast('הזינו משקל או גובה'); return; }
  entry.date = $('geDate').value;
  entry.weight = w;
  entry.height = h;
  entry.editedBy = ME||'';
  if(gePhotoState.changed){
    if(gePhotoState.data){
      entry.photo = true;
      if(fbReady){
        try{ await db.collection('ido_photos').doc(entryId).set({ data: gePhotoState.data }); photoCache[entryId] = gePhotoState.data; }
        catch(err){ console.error(err); toast('שגיאה בשמירת התמונה'); }
      }
    } else {
      entry.photo = false;
      if(fbReady){
        try{ await db.collection('ido_photos').doc(entryId).delete(); }catch(err){ console.error(err); }
      }
      delete photoCache[entryId];
    }
  }
  await saveData();
  closeModal('growthEditModal');
  toast('המדידה עודכנה');
  refreshAll();
});
$('geDeleteBtn').addEventListener('click', async ()=>{
  const entryId = $('geEditId').value;
  if(!entryId) return;
  if(!confirm('למחוק את המדידה הזו?')) return;
  DATA.growth = DATA.growth.filter(g=>g.id!==entryId);
  if(fbReady){
    try{ await db.collection('ido_photos').doc(entryId).delete(); }catch(err){}
  }
  delete photoCache[entryId];
  await saveData();
  closeModal('growthEditModal');
  toast('המדידה נמחקה');
  refreshAll();
});
document.querySelectorAll('#view-growth .growth-tabs button').forEach(b=>{
  b.addEventListener('click', ()=>{
    document.querySelectorAll('#view-growth .growth-tabs button').forEach(x=>x.classList.remove('active'));
    b.classList.add('active');
    growthMetric = b.dataset.metric;
    renderGrowthChart();
  });
});
function renderGrowthChart(){
  const ctx = $('growthChart');
  const who = growthMetric==='weight' ? WHO_WEIGHT : WHO_HEIGHT;
  const toPts = (idx)=> MONTHS_KEYS.map(m=>({x:m, y:who[m][idx]}));
  const p3 = toPts(0), p15 = toPts(1), p50 = toPts(2), p85 = toPts(3), p97 = toPts(4);

  let childPoints = [];
  if(SETTINGS.birth){
    childPoints = DATA.growth
      .filter(g=> growthMetric==='weight' ? g.weight!=null : g.height!=null)
      .map(g=>({ x: ageDaysFrom(SETTINGS.birth, g.date)/30.4375, y: growthMetric==='weight'?g.weight:g.height }))
      .sort((a,b)=>a.x-b.x);
  }

  if(charts.growth) charts.growth.destroy();
  charts.growth = new Chart(ctx, {
    type:'line',
    data:{
      datasets:[
        { label:'97', data:p97, borderColor:'#C9A15C', borderWidth:1.5, borderDash:[4,3], pointRadius:0, fill:false, tension:0.35, parsing:false },
        { label:'85', data:p85, borderColor:'#B9862F', borderWidth:1.5, pointRadius:0, fill:'+2', backgroundColor:'rgba(199,127,58,0.09)', tension:0.35, parsing:false },
        { label:'50 (חציון)', data:p50, borderColor:'#9A5A1A', borderWidth:3, pointRadius:0, fill:false, tension:0.35, parsing:false },
        { label:'15', data:p15, borderColor:'#B9862F', borderWidth:1.5, pointRadius:0, fill:false, tension:0.35, parsing:false },
        { label:'3', data:p3, borderColor:'#C9A15C', borderWidth:1.5, borderDash:[4,3], pointRadius:0, fill:false, tension:0.35, parsing:false },
        { label:'עידו', data: childPoints, borderColor:'#345C40', backgroundColor:'#345C40', showLine:true,
          borderWidth:3, pointRadius:5, pointBackgroundColor:'#345C40', pointBorderColor:'#fff', pointBorderWidth:1.5, tension:0.2, parsing:false, order:0 }
      ]
    },
    options:{
      responsive:true, maintainAspectRatio:false,
      interaction:{ mode:'nearest', intersect:false },
      scales:{
        x:{ type:'linear', min:0, max:24, ticks:{stepSize:3}, title:{display:true, text:'גיל (חודשים)'}, grid:{color:CHART_GRID} },
        y:{ title:{display:true, text: growthMetric==='weight' ? 'ק"ג' : 'ס"מ'}, grid:{color:CHART_GRID} }
      },
      plugins:{ legend:{ position:'bottom', labels:{ boxWidth:12, font:{size:10} } } }
    }
  });
}

/* ---------- stats ---------- */
function renderStats(){
  const days = [];
  for(let i=6;i>=0;i--){
    const d = new Date(); d.setDate(d.getDate()-i);
    days.push(d);
  }
  const dayLabels = days.map(d=>d.toLocaleDateString('he-IL',{weekday:'short', day:'2-digit'}));

  const validDays = days.filter(d=>d >= TRACKING_START).length || 1;

  // sleep hours per day: split any sleep spanning midnight across both days
  const sleepEvents = [...DATA.events].filter(e=>(e.type==='sleep'||e.type==='wake') && afterTrackingStart(e.time)).sort((a,b)=>new Date(a.time)-new Date(b.time));
  const sleepByDay = days.map(()=>0);
  for(let i=0;i<sleepEvents.length-1;i++){
    if(sleepEvents[i].type==='sleep' && sleepEvents[i+1].type==='wake'){
      splitIntoDayPortions(sleepEvents[i].time, sleepEvents[i+1].time).forEach(portion=>{
        days.forEach((d, idx)=>{
          const dKey = d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
          if(portion.dateKey===dKey) sleepByDay[idx]+=portion.hours;
        });
      });
    }
  }

  const feedByDay = days.map(d=>{
    return DATA.events.filter(e=>e.type==='feed' && afterTrackingStart(e.time) && new Date(e.time).toDateString()===d.toDateString())
      .reduce((s,e)=>s+(e.ml||0),0);
  });
  const diaperByDay = days.map(d=>{
    return DATA.events.filter(e=>e.type==='diaper' && afterTrackingStart(e.time) && new Date(e.time).toDateString()===d.toDateString()).length;
  });

  const avgSleep = (sleepByDay.reduce((a,b)=>a+b,0)/validDays).toFixed(1);
  const avgFeed = Math.round(feedByDay.reduce((a,b)=>a+b,0)/validDays);
  const avgDiaper = (diaperByDay.reduce((a,b)=>a+b,0)/validDays).toFixed(1);
  const totalMilestones = DATA.milestones.length;

  $('statCards').innerHTML = `
    <div class="stat-card"><div class="n num">${avgSleep}</div><div class="l">שעות שינה, ממוצע יומי</div></div>
    <div class="stat-card"><div class="n num">${avgFeed}</div><div class="l">מ"ל אכילה, ממוצע יומי</div></div>
    <div class="stat-card"><div class="n num">${avgDiaper}</div><div class="l">החתלות ליום, ממוצע</div></div>
    <div class="stat-card"><div class="n num">${totalMilestones}</div><div class="l">אבני דרך עד כה</div></div>
  `;

  if(charts.sleepStat) charts.sleepStat.destroy();
  charts.sleepStat = new Chart($('sleepStatChart'), {
    type:'bar',
    data:{ labels: dayLabels, datasets:[{ data: sleepByDay.map(v=>+v.toFixed(1)), backgroundColor:'#7C9885', borderRadius:6 }] },
    options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{ y:{ title:{display:true,text:'שעות'}, grid:{color:CHART_GRID} }, x:{ grid:{display:false} } } }
  });
  if(charts.feedStat) charts.feedStat.destroy();
  charts.feedStat = new Chart($('feedStatChart'), {
    type:'bar',
    data:{ labels: dayLabels, datasets:[{ data: feedByDay, backgroundColor:'#E0A458', borderRadius:6 }] },
    options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{ y:{ title:{display:true,text:'מ"ל'}, grid:{color:CHART_GRID} }, x:{ grid:{display:false} } } }
  });
  if(charts.diaperStat) charts.diaperStat.destroy();
  charts.diaperStat = new Chart($('diaperStatChart'), {
    type:'bar',
    data:{ labels: dayLabels, datasets:[{ data: diaperByDay, backgroundColor:'#D98E86', borderRadius:6 }] },
    options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{ y:{ title:{display:true,text:'מספר'}, grid:{color:CHART_GRID} }, x:{ grid:{display:false} } } }
  });
  renderWindowStats(windowStatsRange);
}

/* ---------- sleep/awake windows ---------- */
function computeWindows(){
  const events = [...DATA.events].filter(e=>(e.type==='sleep'||e.type==='wake') && afterTrackingStart(e.time)).sort((a,b)=>new Date(a.time)-new Date(b.time));
  const windows = [];
  for(let i=0;i<events.length-1;i++){
    const cur = events[i], next = events[i+1];
    const hours = (new Date(next.time)-new Date(cur.time))/3600000;
    if(hours<0 || hours>20) continue;
    if(cur.type==='sleep' && next.type==='wake'){
      windows.push({ kind:'sleep', start:cur.time, end:next.time, hours, period: cur.period || suggestPeriod(cur.time) });
    } else if(cur.type==='wake' && next.type==='sleep'){
      windows.push({ kind:'awake', start:cur.time, end:next.time, hours, period: cur.period || suggestPeriod(cur.time) });
    }
  }
  return windows;
}
document.querySelectorAll('#windowRangeSeg button').forEach(b=>{
  b.addEventListener('click', ()=>{
    document.querySelectorAll('#windowRangeSeg button').forEach(x=>x.classList.remove('active'));
    b.classList.add('active');
    windowStatsRange = Number(b.dataset.range);
    renderWindowStats(windowStatsRange);
  });
});
function formatHM(hours){
  const h = Math.floor(hours), m = Math.round((hours-h)*60);
  return `${h}:${String(m).padStart(2,'0')}`;
}
function dayGroupKey(time, period){
  const d = new Date(time);
  if(period==='night' && d.getHours() < 12){ d.setDate(d.getDate()-1); }
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}
function avgDailyTotalHours(windows, kind, period){
  const totalsByDay = {};
  windows.filter(w=>w.kind===kind && w.period===period).forEach(w=>{
    const key = dayGroupKey(w.start, period);
    totalsByDay[key] = (totalsByDay[key]||0) + w.hours;
  });
  const trackingStartKey = TRACKING_START.getFullYear()+'-'+String(TRACKING_START.getMonth()+1).padStart(2,'0')+'-'+String(TRACKING_START.getDate()).padStart(2,'0');
  const dailyTotals = Object.entries(totalsByDay).filter(([key])=>key >= trackingStartKey).map(([,hours])=>hours);
  if(dailyTotals.length===0) return null;
  return dailyTotals.reduce((a,b)=>a+b,0)/dailyTotals.length;
}
function renderWindowStats(rangeDays){
  const windows = computeWindows();
  const todayLabel = nightWindowDateFor(new Date());
  const cutoff = new Date(todayLabel+'T19:00:00'); cutoff.setDate(cutoff.getDate()-rangeDays);
  const inRange = windows.filter(w=> new Date(w.start) >= cutoff);
  const buckets = { awake_day:[], awake_night:[], sleep_day:[], sleep_night:[] };
  inRange.forEach(w=>{
    const key = `${w.kind}_${w.period}`;
    if(buckets[key]) buckets[key].push(w.hours);
  });
  const fmt = (arr)=>{
    if(arr.length===0) return '—';
    const avg = arr.reduce((a,b)=>a+b,0)/arr.length;
    return formatHM(avg);
  };
  $('windowStatCards').innerHTML = `
    <div class="stat-card"><div class="n num">${fmt(buckets.awake_day)}</div><div class="l">חלון ערות ביום, ממוצע (${buckets.awake_day.length})</div></div>
    <div class="stat-card"><div class="n num">${fmt(buckets.awake_night)}</div><div class="l">חלון ערות בלילה, ממוצע (${buckets.awake_night.length})</div></div>
    <div class="stat-card"><div class="n num">${fmt(buckets.sleep_day)}</div><div class="l">חלון שינה ביום, ממוצע (${buckets.sleep_day.length})</div></div>
    <div class="stat-card"><div class="n num">${fmt(buckets.sleep_night)}</div><div class="l">חלון שינה בלילה, ממוצע (${buckets.sleep_night.length})</div></div>
  `;
  $('windowStatsNote').textContent = `מבוסס על ${inRange.length} חלונות שהושלמו ב-${rangeDays} הימים האחרונים (שעות:דקות). המספר בסוגריים הוא כמות החלונות בכל קטגוריה.`;
  renderWindowTrendCharts(inRange, rangeDays);
  renderWindowsDayDetail();
}
function renderWindowsDayDetail(){
  const dayWindows = computeWindows().filter(w=>nightWindowDateFor(w.start)===windowsListDate);
  renderWindowsList(dayWindows, windowsListDate);
}
$('windowsListDateInput').addEventListener('change', ()=>{
  windowsListDate = $('windowsListDateInput').value || nightWindowDateFor(new Date());
  renderWindowsDayDetail();
});
$('windowsPrevDayBtn').addEventListener('click', ()=>{
  windowsListDate = shiftDate(windowsListDate, -1);
  $('windowsListDateInput').value = windowsListDate;
  renderWindowsDayDetail();
});
$('windowsNextDayBtn').addEventListener('click', ()=>{
  windowsListDate = shiftDate(windowsListDate, 1);
  $('windowsListDateInput').value = windowsListDate;
  renderWindowsDayDetail();
});
$('windowsTodayJumpBtn').addEventListener('click', ()=>{
  windowsListDate = nightWindowDateFor(new Date());
  $('windowsListDateInput').value = windowsListDate;
  renderWindowsDayDetail();
});
function renderWindowTrendCharts(inRange, rangeDays){
  const todayLabel = nightWindowDateFor(new Date());
  const days = [];
  for(let i=rangeDays-1;i>=0;i--){
    const d = new Date(todayLabel+'T12:00:00'); d.setDate(d.getDate()-i);
    days.push(d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'));
  }
  const dayLabels = days.map(key=>{
    const d = new Date(key+'T12:00:00');
    return rangeDays>7 ? d.toLocaleDateString('he-IL',{day:'2-digit', month:'2-digit'}) : d.toLocaleDateString('he-IL',{weekday:'short', day:'2-digit'});
  });
  function avgByDay(kind, period){
    return days.map(key=>{
      const vals = inRange.filter(w=>{
        return nightWindowDateFor(w.start)===key && w.kind===kind && w.period===period;
      }).map(w=>w.hours);
      if(vals.length===0) return null;
      return +( vals.reduce((a,b)=>a+b,0)/vals.length ).toFixed(2);
    });
  }
  const awakeDay = avgByDay('awake','day');
  const awakeNight = avgByDay('awake','night');
  const sleepDay = avgByDay('sleep','day');
  const sleepNight = avgByDay('sleep','night');

  function renderTrendChart(chartKey, canvasId, label, data, color){
    if(charts[chartKey]) charts[chartKey].destroy();
    charts[chartKey] = new Chart($(canvasId), {
      type:'line',
      data:{ labels: dayLabels, datasets:[
        { label, data, borderColor:color, backgroundColor:color, spanGaps:false, tension:0.3, pointRadius:3 }
      ]},
      options:{ responsive:true, maintainAspectRatio:false, scales:{ y:{ title:{display:true,text:'שעות'}, grid:{color:CHART_GRID} }, x:{ grid:{display:false} } }, plugins:{ legend:{ display:false } } }
    });
  }
  renderTrendChart('awakeDayTrend', 'awakeDayTrendChart', 'יום', awakeDay, '#C77F3A');
  renderTrendChart('awakeNightTrend', 'awakeNightTrendChart', 'לילה', awakeNight, '#3E5C82');
  renderTrendChart('sleepDayTrend', 'sleepDayTrendChart', 'יום', sleepDay, '#7C9885');
  renderTrendChart('sleepNightTrend', 'sleepNightTrendChart', 'לילה', sleepNight, '#345C40');
}
function renderWindowsList(windows, windowLabel){
  if(windows.length===0){ $('windowsList').innerHTML = '<div class="empty-hint">אין חלונות שהושלמו בטווח הזה</div>'; return; }
  const sorted = [...windows].sort((a,b)=>new Date(b.start)-new Date(a.start));
  const todayStr = nightWindowDateFor(new Date());
  const d = new Date(windowLabel+'T12:00:00');
  let label = d.toLocaleDateString('he-IL', {weekday:'long', day:'2-digit', month:'2-digit'});
  if(windowLabel===todayStr) label = 'היום · ' + label;
  const rows = sorted.map(w=>{
    const kindIcon = w.kind==='sleep' ? icon('moon') : icon('sun');
    const iconClass = w.kind==='sleep' ? 'sleep' : 'wake';
    const kindLabel = w.kind==='sleep' ? 'שינה' : 'ערות';
    const badgeClass = w.period==='night' ? 'night' : 'day';
    const badgeText = w.period==='night' ? icon('moon')+' לילה' : icon('sun')+' יום';
    return `
    <div class="tl-item">
      <div class="tl-icon ${iconClass}">${kindIcon}</div>
      <div class="tl-body">
        <div class="tl-title">${kindLabel} — ${formatHM(w.hours)} שעות<span class="window-row-meta-badge ${badgeClass}">${badgeText}</span></div>
        <div class="tl-meta">${fmtTime(w.start)}${crossDayNote(w.start, windowLabel)} → ${fmtTime(w.end)}${crossDayNote(w.end, windowLabel)}</div>
      </div>
    </div>`;
  }).join('');
  $('windowsList').innerHTML = `<div class="window-day-group"><div class="window-day-header">${label}</div>${rows}</div>`;
}

/* ---------- settings ---------- */
$('settingsForm').addEventListener('submit', async (e)=>{
  e.preventDefault();
  SETTINGS.name = $('setName').value.trim() || 'עידו';
  SETTINGS.birth = $('setBirth').value || null;
  await saveSettings();
  refreshHeader();
  toast('ההגדרות נשמרו');
  updateGAgeShow();
});
$('exportBtn').addEventListener('click', ()=>{
  const blob = new Blob([JSON.stringify({DATA, SETTINGS}, null, 2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'ido-data-export.json';
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
});
$('importBtn').addEventListener('click', ()=>{ $('importFile').value = ''; $('importFile').click(); });
$('importFile').addEventListener('change', async (e)=>{
  const file = e.target.files[0];
  if(!file) return;
  try{
    const text = await file.text();
    const parsed = JSON.parse(text);
    if(!parsed || !parsed.DATA){ toast('קובץ לא תקין'); return; }
    const summary = `${(parsed.DATA.events||[]).length} אירועים, ${(parsed.DATA.growth||[]).length} מדידות, ${(parsed.DATA.milestones||[]).length} אבני דרך`;
    if(!confirm(`לייבא ${summary}? זה יחליף את כל הנתונים המשותפים הנוכחיים לכולם.`)) return;
    DATA = {
      events: parsed.DATA.events || [],
      growth: parsed.DATA.growth || [],
      milestones: parsed.DATA.milestones || []
    };
    if(parsed.SETTINGS){ SETTINGS = parsed.SETTINGS; }
    await saveData();
    await saveSettings();
    $('setName').value = SETTINGS.name || 'עידו';
    $('setBirth').value = SETTINGS.birth || '';
    updateGAgeShow();
    refreshAll();
    toast('הנתונים יובאו בהצלחה');
  }catch(err){
    toast('שגיאה בקריאת הקובץ');
  }
});

/* ---------- refresh everything ---------- */
function refreshAll(){
  refreshHeader();
  renderStatusStrip();
  refreshSleepBtn();
  renderTodayTimeline();
  renderGrowthHistory();
  if(document.getElementById('view-growth').classList.contains('active')) renderGrowthChart();
  if(document.getElementById('view-stats').classList.contains('active')) renderStats();
  if(document.getElementById('view-milestones').classList.contains('active')) renderMilestoneList();
}

/* ---------- init ---------- */
function init(){
  const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
  $('themeToggle').innerHTML = currentTheme==='dark' ? icon('sun') : icon('moon');
  applyChartTheme();
  refreshWho();
  $('gDate').value = new Date().toISOString().slice(0,10);
  $('timelineDate').value = timelineDate;
  $('windowsListDateInput').value = windowsListDate;
  renderMilestonePresets();
  initRealtimeSync();
  if(!ME){ toast('ברוכים הבאים! ספרו לנו מי אתם בהגדרות'); }
}
init();
