// ============================================================
//  CONFIGURACIÓN FIREBASE — reemplaza con tus datos reales
// ============================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, collection, doc, addDoc, getDocs, setDoc, deleteDoc, query, where, orderBy, onSnapshot }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// 👇 PEGA AQUÍ TU CONFIG DE FIREBASE (ver guía de instalación)
const firebaseConfig = {
    apiKey: "AIzaSyDEOLsAXD5xG-PA1KBEqETrJXvBU2SLK3M",
    authDomain: "mis-finanzasnr.firebaseapp.com",
    projectId: "Mis-finanzasNR",
    storageBucket: "mis-finanzasnr.firebasestorage.app",
    messagingSenderId: "443527351811",
    appId: "1:443527351811:web:6d6f10b24877dad9718836",
    measurementId: "G-P73BMSF973"
};

const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

// ============================================================
//  CATEGORÍAS
// ============================================================
const CATS = [
  { id:'comida',         label:'Comida',      icon:'🍽', color:'#D85A30' },
  { id:'transporte',     label:'Transporte',  icon:'🚗', color:'#BA7517' },
  { id:'supermercado',   label:'Super',       icon:'🛒', color:'#378ADD' },
  { id:'salud',          label:'Salud',       icon:'🏥', color:'#E24B4A' },
  { id:'entretenimiento',label:'Ocio',        icon:'🎬', color:'#7F77DD' },
  { id:'servicios',      label:'Servicios',   icon:'💡', color:'#1D9E75' },
  { id:'ropa',           label:'Ropa',        icon:'👕', color:'#D4537E' },
  { id:'educacion',      label:'Educación',   icon:'📚', color:'#534AB7' },
  { id:'otros',          label:'Otros',       icon:'📦', color:'#888780' },
];

const DEFAULT_BUDGETS = {
  comida:8000, transporte:4000, supermercado:10000, salud:5000,
  entretenimiento:3000, servicios:3000, ropa:5000, educacion:3000, otros:2000
};

// ============================================================
//  ESTADO
// ============================================================
let currentUser  = null;
let movements    = [];
let budgets      = { ...DEFAULT_BUDGETS };
let cuentas      = [];
let inversiones  = [];
let selectedCat  = 'comida';
let selectedType = 'gasto';
let gastoFiltro  = 'mes';
let donutChart   = null;
let growthChart  = null;
let unsubMovs    = null;
let unsubCuentas = null;
let unsubInvs    = null;

// ============================================================
//  AUTH
// ============================================================
window.loginGoogle = async () => {
  try {
    document.getElementById('login-error').textContent = '';
    await signInWithPopup(auth, new GoogleAuthProvider());
  } catch(e) {
    document.getElementById('login-error').textContent = 'Error al iniciar sesión. Intenta de nuevo.';
  }
};

window.logout = async () => {
  if(unsubMovs)    unsubMovs();
  if(unsubCuentas) unsubCuentas();
  if(unsubInvs)    unsubInvs();
  await signOut(auth);
};

onAuthStateChanged(auth, user => {
  if(user) {
    currentUser = user;
    document.getElementById('login-screen').style.display  = 'none';
    document.getElementById('main-app').style.display      = 'flex';
    initAvatar(user);
    subscribeAll();
  } else {
    currentUser = null;
    document.getElementById('login-screen').style.display  = 'flex';
    document.getElementById('main-app').style.display      = 'none';
  }
});

function initAvatar(user) {
  const av = document.getElementById('user-avatar');
  if(user.photoURL) {
    av.innerHTML = `<img src="${user.photoURL}" alt="">`;
  } else {
    av.textContent = (user.displayName||user.email||'U')[0].toUpperCase();
  }
}

// ============================================================
//  FIREBASE — SUSCRIPCIONES EN TIEMPO REAL
// ============================================================
function subscribeAll() {
  const uid = currentUser.uid;

  // movimientos
  unsubMovs = onSnapshot(
    query(collection(db, `users/${uid}/movimientos`), orderBy('fecha','desc')),
    snap => {
      movements = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      renderAll();
    }
  );

  // presupuestos
  const budgetRef = doc(db, `users/${uid}/config/budgets`);
  onSnapshot(budgetRef, snap => {
    if(snap.exists()) budgets = { ...DEFAULT_BUDGETS, ...snap.data() };
    renderBudget();
  });

  // cuentas
  unsubCuentas = onSnapshot(
    collection(db, `users/${uid}/cuentas`),
    snap => {
      cuentas = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      renderCuentas();
    }
  );

  // inversiones
  unsubInvs = onSnapshot(
    collection(db, `users/${uid}/inversiones`),
    snap => {
      inversiones = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      renderInversiones();
      renderGrowthChart();
    }
  );
}

// ============================================================
//  HELPERS
// ============================================================
const fmt = n => 'RD$ ' + Math.round(n).toLocaleString('es-DO');
const getCat = id => CATS.find(c => c.id === id) || CATS[CATS.length - 1];

function nowMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
}

function movsFiltered() {
  const now  = new Date();
  const week = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
  const ym   = nowMonth();
  return movements.filter(m => {
    if(gastoFiltro === 'mes')    return m.fecha && m.fecha.startsWith(ym);
    if(gastoFiltro === 'semana') return m.fecha >= week.toISOString().slice(0,10);
    return true;
  });
}

// ============================================================
//  RENDER — DASHBOARD
// ============================================================
function renderDashboard() {
  const ym = nowMonth();
  const mes = movements.filter(m => m.fecha && m.fecha.startsWith(ym));
  const gastos   = mes.filter(m => m.type === 'gasto').reduce((s,m)   => s + m.monto, 0);
  const ingresos = mes.filter(m => m.type === 'ingreso').reduce((s,m) => s + m.monto, 0);
  const totalAhorros    = cuentas.reduce((s,c)    => s + (c.saldo||0), 0);
  const totalInversiones = inversiones.reduce((s,i) => s + (i.monto||0), 0);

  document.getElementById('d-saldo').textContent      = fmt(ingresos - gastos);
  document.getElementById('d-gastos').textContent     = fmt(gastos);
  document.getElementById('d-ingresos').textContent   = fmt(ingresos);
  document.getElementById('d-ahorros').textContent    = fmt(totalAhorros);
  document.getElementById('d-inversiones').textContent = fmt(totalInversiones);

  const now  = new Date();
  const mName = now.toLocaleDateString('es-DO', { month: 'long', year: 'numeric' });
  document.getElementById('screen-period').textContent = mName.charAt(0).toUpperCase() + mName.slice(1);

  // cat summary
  const mesGastos = mes.filter(m => m.type === 'gasto');
  const totCat = {};
  mesGastos.forEach(m => { totCat[m.cat] = (totCat[m.cat]||0) + m.monto; });
  const sorted = Object.entries(totCat).sort((a,b) => b[1]-a[1]).slice(0,5);
  const total  = sorted.reduce((s,e) => s+e[1], 0);

  if(sorted.length === 0) {
    document.getElementById('cat-summary-list').innerHTML = '<div class="empty-state">Agrega tu primer gasto ↓</div>';
  } else {
    document.getElementById('cat-summary-list').innerHTML = sorted.map(([id, val]) => {
      const c = getCat(id);
      const pct = total ? Math.round(val/total*100) : 0;
      return `<div class="card-row" style="flex-direction:column;align-items:stretch;gap:6px;">
        <div style="display:flex;align-items:center;gap:10px;">
          <div class="icon-circle" style="background:${c.color}22;">${c.icon}</div>
          <div class="card-info"><div class="name">${c.label}</div></div>
          <div class="amount neg">${fmt(val)}</div>
        </div>
        <div class="progress-bar"><div class="fill" style="width:${pct}%;background:${c.color};"></div></div>
      </div>`;
    }).join('');
  }

  // recent
  const recent = [...movements].slice(0,5);
  if(recent.length === 0) {
    document.getElementById('recent-list').innerHTML = '<div class="empty-state">Sin movimientos aún</div>';
  } else {
    document.getElementById('recent-list').innerHTML = recent.map(m => {
      const c = getCat(m.cat);
      return `<div class="card-row">
        <div class="icon-circle" style="background:${c.color}22;">${c.icon}</div>
        <div class="card-info"><div class="name">${m.desc}</div><div class="detail">${m.fecha} · ${c.label}</div></div>
        <div class="amount ${m.type==='gasto'?'neg':'pos'}">${m.type==='gasto'?'−':'+'}${fmt(m.monto)}</div>
      </div>`;
    }).join('');
  }
}

// ============================================================
//  RENDER — GASTOS
// ============================================================
function renderGastos() {
  const list = movsFiltered();
  if(list.length === 0) {
    document.getElementById('all-mov-list').innerHTML = '<div class="empty-state">Sin movimientos en este período</div>';
  } else {
    document.getElementById('all-mov-list').innerHTML = list.map(m => {
      const c = getCat(m.cat);
      return `<div class="card-row">
        <div class="icon-circle" style="background:${c.color}22;">${c.icon}</div>
        <div class="card-info">
          <div class="name">${m.desc}</div>
          <div class="detail">${m.fecha}${m.notas ? ' · ' + m.notas : ''}</div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;">
          <div class="amount ${m.type==='gasto'?'neg':'pos'}">${m.type==='gasto'?'−':'+'}${fmt(m.monto)}</div>
          <button onclick="deleteMovement('${m.id}')" style="background:none;border:none;cursor:pointer;font-size:11px;color:#aaa;">🗑</button>
        </div>
      </div>`;
    }).join('');
  }
  renderDonutChart();
}

function renderDonutChart() {
  const gastos = movsFiltered().filter(m => m.type === 'gasto');
  const totCat = {};
  gastos.forEach(m => { totCat[m.cat] = (totCat[m.cat]||0) + m.monto; });
  const labels = [], data = [], colors = [];
  Object.entries(totCat).sort((a,b) => b[1]-a[1]).forEach(([id,v]) => {
    const c = getCat(id);
    labels.push(c.label); data.push(v); colors.push(c.color);
  });
  if(donutChart) donutChart.destroy();
  if(data.length === 0) return;
  const ctx = document.getElementById('chart-donut');
  if(!ctx) return;
  donutChart = new Chart(ctx, {
    type: 'doughnut',
    data: { labels, datasets:[{ data, backgroundColor: colors, borderWidth: 0 }] },
    options: { responsive:true, maintainAspectRatio:false, plugins:{ legend:{ position:'right', labels:{ font:{size:11}, boxWidth:10, padding:10 } } } }
  });
}

// ============================================================
//  RENDER — PRESUPUESTO
// ============================================================
function renderBudget() {
  const ym = nowMonth();
  const mesGastos = movements.filter(m => m.fecha && m.fecha.startsWith(ym) && m.type === 'gasto');
  const totCat = {};
  mesGastos.forEach(m => { totCat[m.cat] = (totCat[m.cat]||0) + m.monto; });

  const totalGastado = mesGastos.reduce((s,m) => s+m.monto, 0);
  const totalBudget  = Object.values(budgets).reduce((s,v) => s+v, 0);

  document.getElementById('p-gastado').textContent   = fmt(totalGastado);
  document.getElementById('p-disponible').textContent = fmt(Math.max(0, totalBudget - totalGastado));

  document.getElementById('budget-list').innerHTML = CATS.map(c => {
    const spent  = totCat[c.id] || 0;
    const budget = budgets[c.id] || 0;
    const pct    = budget ? Math.min(100, Math.round(spent/budget*100)) : 0;
    const cls    = pct >= 90 ? 'danger' : pct >= 70 ? 'warn' : 'ok';
    return `<div class="card-row" style="flex-direction:column;align-items:stretch;gap:6px;">
      <div style="display:flex;align-items:center;gap:10px;">
        <div class="icon-circle" style="background:${c.color}22;">${c.icon}</div>
        <div class="card-info"><div class="name">${c.label}</div></div>
        <span class="badge ${cls}">${pct}%</span>
        <div style="font-size:12px;color:#888;">${fmt(spent)}/${fmt(budget)}</div>
      </div>
      <div class="progress-bar"><div class="fill" style="width:${pct}%;background:${c.color};"></div></div>
    </div>`;
  }).join('');
}

// ============================================================
//  RENDER — CUENTAS
// ============================================================
function renderCuentas() {
  const tipoIcon = { ahorro:'🏦', corriente:'🏛', tarjeta:'💳' };
  const tipoLabel = { ahorro:'Cuenta de ahorro', corriente:'Cuenta corriente', tarjeta:'Tarjeta de crédito' };
  if(cuentas.length === 0) {
    document.getElementById('cuentas-list').innerHTML = '<div class="empty-state">Agrega tus cuentas y tarjetas</div>';
    return;
  }
  document.getElementById('cuentas-list').innerHTML = cuentas.map(c => {
    const icon = tipoIcon[c.tipo] || '💳';
    const label = tipoLabel[c.tipo] || c.tipo;
    let extra = '';
    if(c.tipo === 'tarjeta' && c.limite) {
      const pct = Math.min(100, Math.round(c.saldo/c.limite*100));
      extra = `<div style="padding:0 14px 12px;">
        <div style="display:flex;justify-content:space-between;font-size:11px;color:#888;margin-bottom:4px;">
          <span>Usado ${pct}%</span><span>Límite ${fmt(c.limite)}</span>
        </div>
        <div class="progress-bar"><div class="fill" style="width:${pct}%;background:#378ADD;"></div></div>
      </div>`;
    }
    return `<div>
      <div class="card-row">
        <div class="icon-circle" style="background:#E6F1FB;">${icon}</div>
        <div class="card-info"><div class="name">${c.nombre}</div><div class="detail">${label}</div></div>
        <div style="text-align:right;">
          <div class="amount ${c.tipo==='tarjeta'?'neg':'pos'}">${fmt(c.saldo)}</div>
          <button onclick="deleteCuenta('${c.id}')" style="background:none;border:none;cursor:pointer;font-size:11px;color:#aaa;">🗑</button>
        </div>
      </div>
      ${extra}
    </div>`;
  }).join('');
}

function renderInversiones() {
  if(inversiones.length === 0) {
    document.getElementById('inversiones-list').innerHTML = '<div class="empty-state">Agrega tus inversiones</div>';
    return;
  }
  const tipoIcon = { fondo:'📈', certificado:'🏛', acciones:'📊', crypto:'₿', otro:'💎' };
  document.getElementById('inversiones-list').innerHTML = inversiones.map(i => {
    const icon = tipoIcon[i.tipo] || '📈';
    return `<div class="card-row">
      <div class="icon-circle" style="background:#EEEDFE;">${icon}</div>
      <div class="card-info"><div class="name">${i.nombre}</div><div class="detail">${i.rendimiento||0}% anual est.</div></div>
      <div style="text-align:right;">
        <div class="amount pos">${fmt(i.monto)}</div>
        <button onclick="deleteInversion('${i.id}')" style="background:none;border:none;cursor:pointer;font-size:11px;color:#aaa;">🗑</button>
      </div>
    </div>`;
  }).join('');
}

function renderGrowthChart() {
  const ctx = document.getElementById('chart-growth');
  if(!ctx) return;
  const months = [];
  const aData = [], iData = [];
  for(let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    months.push(d.toLocaleDateString('es-DO',{month:'short'}));
    aData.push(cuentas.reduce((s,c) => s+(c.saldo||0), 0));
    iData.push(inversiones.reduce((s,inv) => s+(inv.monto||0), 0));
  }
  if(growthChart) growthChart.destroy();
  growthChart = new Chart(ctx, {
    type: 'line',
    data: { labels: months, datasets: [
      { label:'Ahorros',     data: aData, borderColor:'#1D9E75', backgroundColor:'rgba(29,158,117,0.08)', tension:.3, fill:true, pointRadius:3 },
      { label:'Inversiones', data: iData, borderColor:'#7F77DD', backgroundColor:'rgba(127,119,221,0.08)', tension:.3, fill:true, pointRadius:3 },
    ]},
    options: { responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{ labels:{ font:{size:11}, boxWidth:10 } } },
      scales: {
        y: { ticks:{ callback: v => v>=1000?(v/1000).toFixed(0)+'k':v, font:{size:10} }, grid:{ color:'rgba(128,128,128,0.1)' } },
        x: { grid:{ display:false }, ticks:{ font:{size:10} } }
      }
    }
  });
}

// ============================================================
//  RENDER ALL
// ============================================================
function renderAll() {
  renderDashboard();
  renderGastos();
  renderBudget();
}

// ============================================================
//  MODAL MOVIMIENTO
// ============================================================
window.openModal = () => {
  document.getElementById('modal-bg').classList.add('open');
  document.getElementById('m-fecha').value = new Date().toISOString().slice(0,10);
  selectedType = 'gasto';
  selectedCat  = 'comida';
  document.getElementById('type-gasto').classList.add('active');
  document.getElementById('type-ingreso').classList.remove('active');
  renderCatGrid();
};

window.closeModal = id => document.getElementById(id).classList.remove('open');

window.setType = (t, btn) => {
  selectedType = t;
  document.getElementById('type-gasto').classList.toggle('active',   t === 'gasto');
  document.getElementById('type-ingreso').classList.toggle('active', t === 'ingreso');
};

function renderCatGrid() {
  document.getElementById('cat-grid').innerHTML = CATS.map(c =>
    `<button class="cat-btn${c.id===selectedCat?' sel':''}" onclick="selCat('${c.id}',this)">${c.icon}<br>${c.label}</button>`
  ).join('');
}

window.selCat = (id, el) => {
  selectedCat = id;
  document.querySelectorAll('#cat-grid .cat-btn').forEach(b => b.classList.remove('sel'));
  el.classList.add('sel');
};

window.saveMovement = async () => {
  const monto = parseFloat(document.getElementById('m-monto').value);
  const desc  = document.getElementById('m-desc').value.trim();
  const fecha = document.getElementById('m-fecha').value;
  const notas = document.getElementById('m-notas').value.trim();
  if(!monto || !desc || !fecha) { alert('Completa monto, descripción y fecha.'); return; }
  await addDoc(collection(db, `users/${currentUser.uid}/movimientos`), {
    type: selectedType, monto, desc, cat: selectedCat, fecha, notas,
    createdAt: new Date().toISOString()
  });
  document.getElementById('m-monto').value = '';
  document.getElementById('m-desc').value  = '';
  document.getElementById('m-notas').value = '';
  closeModal('modal-bg');
};

window.deleteMovement = async id => {
  if(!confirm('¿Eliminar este movimiento?')) return;
  await deleteDoc(doc(db, `users/${currentUser.uid}/movimientos/${id}`));
};

// ============================================================
//  MODAL PRESUPUESTO
// ============================================================
window.openBudgetModal = () => {
  document.getElementById('budget-form').innerHTML = CATS.map(c =>
    `<div class="budget-input-row">
      <span>${c.icon} ${c.label}</span>
      <input type="number" id="b-${c.id}" value="${budgets[c.id]||0}" inputmode="numeric">
    </div>`
  ).join('');
  document.getElementById('budget-modal-bg').classList.add('open');
};

window.saveBudgets = async () => {
  const newBudgets = {};
  CATS.forEach(c => {
    const v = parseFloat(document.getElementById('b-'+c.id)?.value || 0);
    newBudgets[c.id] = v;
  });
  await setDoc(doc(db, `users/${currentUser.uid}/config/budgets`), newBudgets);
  closeModal('budget-modal-bg');
};

// ============================================================
//  MODAL CUENTA
// ============================================================
window.openCuentaModal = () => {
  document.getElementById('cuenta-modal-bg').classList.add('open');
  document.getElementById('c-tipo').addEventListener('change', e => {
    document.getElementById('c-limite-row').style.display = e.target.value === 'tarjeta' ? 'block' : 'none';
  });
  document.getElementById('c-limite-row').style.display = 'none';
};

window.saveCuenta = async () => {
  const nombre = document.getElementById('c-nombre').value.trim();
  const tipo   = document.getElementById('c-tipo').value;
  const saldo  = parseFloat(document.getElementById('c-saldo').value || 0);
  const limite = parseFloat(document.getElementById('c-limite').value || 0);
  if(!nombre) { alert('Ingresa el nombre de la cuenta.'); return; }
  const data = { nombre, tipo, saldo, createdAt: new Date().toISOString() };
  if(tipo === 'tarjeta') data.limite = limite;
  await addDoc(collection(db, `users/${currentUser.uid}/cuentas`), data);
  document.getElementById('c-nombre').value = '';
  document.getElementById('c-saldo').value  = '';
  document.getElementById('c-limite').value = '';
  closeModal('cuenta-modal-bg');
};

window.deleteCuenta = async id => {
  if(!confirm('¿Eliminar esta cuenta?')) return;
  await deleteDoc(doc(db, `users/${currentUser.uid}/cuentas/${id}`));
};

// ============================================================
//  MODAL INVERSIÓN
// ============================================================
window.openInversionModal = () => document.getElementById('inversion-modal-bg').classList.add('open');

window.saveInversion = async () => {
  const nombre      = document.getElementById('i-nombre').value.trim();
  const tipo        = document.getElementById('i-tipo').value;
  const monto       = parseFloat(document.getElementById('i-monto').value || 0);
  const rendimiento = parseFloat(document.getElementById('i-rendimiento').value || 0);
  if(!nombre || !monto) { alert('Completa nombre y monto.'); return; }
  await addDoc(collection(db, `users/${currentUser.uid}/inversiones`), {
    nombre, tipo, monto, rendimiento, createdAt: new Date().toISOString()
  });
  document.getElementById('i-nombre').value      = '';
  document.getElementById('i-monto').value       = '';
  document.getElementById('i-rendimiento').value = '';
  closeModal('inversion-modal-bg');
};

window.deleteInversion = async id => {
  if(!confirm('¿Eliminar esta inversión?')) return;
  await deleteDoc(doc(db, `users/${currentUser.uid}/inversiones/${id}`));
};

// ============================================================
//  NAVEGACIÓN
// ============================================================
window.goTo = (id, btn, title) => {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('s-'+id).classList.add('active');
  document.querySelectorAll('.nav button').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('screen-title').textContent = title;
  if(id === 'gastos')    setTimeout(renderDonutChart, 80);
  if(id === 'cuentas')   setTimeout(renderGrowthChart, 80);
};

window.setGastoFiltro = (f, btn) => {
  gastoFiltro = f;
  document.querySelectorAll('.tabs button').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderGastos();
};

// ============================================================
//  IA — ANÁLISIS
// ============================================================
window.getAIInsight = async () => {
  const card = document.getElementById('ai-insight-card');
  const txt  = document.getElementById('ai-insight-text');
  card.style.display = 'block';
  txt.className = 'ai-text loading';
  txt.textContent = 'Analizando tus finanzas…';

  const ym = nowMonth();
  const mes = movements.filter(m => m.fecha && m.fecha.startsWith(ym));
  const totCat = {};
  mes.filter(m => m.type === 'gasto').forEach(m => { totCat[m.cat] = (totCat[m.cat]||0) + m.monto; });
  const resumen = Object.entries(totCat).map(([k,v]) => `${getCat(k).label}: RD$${Math.round(v).toLocaleString()}`).join(', ');
  const ingresos = mes.filter(m => m.type === 'ingreso').reduce((s,m) => s+m.monto, 0);

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514', max_tokens: 1000,
        messages: [{ role:'user', content:
          `Soy dominicano. Mis gastos este mes por categoría: ${resumen||'Sin gastos aún'}. Ingresos este mes: RD$${Math.round(ingresos).toLocaleString()}. Total ahorros: RD$${cuentas.reduce((s,c)=>s+(c.saldo||0),0).toLocaleString()}. Dame un análisis breve y amigable (3-4 oraciones) con UNA recomendación concreta para alguien en República Dominicana. Responde en español.`
        }]
      })
    });
    const d = await r.json();
    txt.className = 'ai-text';
    txt.textContent = d.content[0].text;
  } catch(e) {
    txt.className = 'ai-text';
    txt.textContent = 'No se pudo conectar con el análisis IA. Intenta de nuevo.';
  }
};

window.getAIBudgetTip = async () => {
  const card = document.getElementById('ai-budget-card');
  const txt  = document.getElementById('ai-budget-text');
  card.style.display = 'block';
  txt.className = 'ai-text loading';
  txt.textContent = 'Generando sugerencias…';

  const ym = nowMonth();
  const mes = movements.filter(m => m.fecha && m.fecha.startsWith(ym) && m.type === 'gasto');
  const totCat = {};
  mes.forEach(m => { totCat[m.cat] = (totCat[m.cat]||0) + m.monto; });
  const over = CATS.filter(c => (totCat[c.id]||0) > (budgets[c.id]||0))
    .map(c => `${c.label} (gastado ${fmt(totCat[c.id]||0)}, límite ${fmt(budgets[c.id]||0)})`).join(', ');

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514', max_tokens: 1000,
        messages: [{ role:'user', content:
          `Soy dominicano. Categorías que excedieron presupuesto este mes: ${over||'ninguna, ¡excelente!'}. Dame 3 sugerencias prácticas y específicas para controlar gastos en República Dominicana. Español, tono amigable, breve.`
        }]
      })
    });
    const d = await r.json();
    txt.className = 'ai-text';
    txt.textContent = d.content[0].text;
  } catch(e) {
    txt.className = 'ai-text';
    txt.textContent = 'No se pudo conectar. Intenta de nuevo.';
  }
};

// cerrar modal tocando el fondo
document.querySelectorAll('.modal-bg').forEach(bg => {
  bg.addEventListener('click', e => { if(e.target === bg) bg.classList.remove('open'); });
});
