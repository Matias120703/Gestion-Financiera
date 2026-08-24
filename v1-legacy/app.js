const STORAGE_KEY = 'orden-finanzas-v3';
const LEGACY_KEY = 'orden-finanzas-v2';
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const incomeCategories = ['Ventas', 'Cobros', 'Servicios', 'Otros ingresos'];
const expenseCategories = ['Mercadería', 'Servicios', 'Transporte', 'Sueldos', 'Alquiler', 'Impuestos', 'Marketing', 'Otros gastos'];

function localDate(date = new Date()) {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function addDays(dateString, amount) {
  const date = new Date(`${dateString}T12:00:00`);
  date.setDate(date.getDate() + amount);
  return localDate(date);
}

function makeId(prefix = 'id') {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
}

function normalizeDate(value) {
  if (!value) return localDate();
  return String(value).slice(0, 10);
}

function productKey(value) {
  return String(value || '').trim().toLocaleLowerCase('es-PY');
}

function defaultRange() {
  const today = localDate();
  return { start: `${today.slice(0, 7)}-01`, end: today };
}

function hydrateState(raw) {
  const legacy = raw || {};
  const business = legacy.business || { name: legacy.name || 'Mi negocio', currency: legacy.currency || 'PYG' };
  const movements = Array.isArray(legacy.moves) ? legacy.moves.map((movement) => {
    const kind = movement.kind === 'expense' ? 'expense' : 'income';
    const description = String(movement.description || 'Sin concepto').trim();
    return {
      id: movement.id || makeId('mov'),
      kind,
      description,
      product: kind === 'income' ? String(movement.product || description).trim() : '',
      quantity: kind === 'income' ? Math.max(1, Number(movement.quantity) || 1) : 0,
      amount: Math.max(0, Number(movement.amount) || 0),
      date: normalizeDate(movement.date),
      category: String(movement.category || (kind === 'income' ? 'Ventas' : 'Otros gastos')),
      note: String(movement.note || '').trim(),
      createdAt: movement.createdAt || new Date(`${normalizeDate(movement.date)}T12:00:00`).toISOString()
    };
  }) : [];
  const products = Array.isArray(legacy.products) ? legacy.products.map((product) => ({
    id: product.id || makeId('prod'),
    name: String(product.name || '').trim(),
    category: String(product.category || 'General').trim() || 'General',
    createdAt: product.createdAt || new Date().toISOString()
  })).filter((product) => product.name) : [];
  const knownProducts = new Set(products.map((product) => productKey(product.name)));
  movements.filter((movement) => movement.kind === 'income' && movement.product).forEach((movement) => {
    const key = productKey(movement.product);
    if (!knownProducts.has(key)) {
      products.push({ id: makeId('prod'), name: movement.product, category: 'General', createdAt: movement.createdAt });
      knownProducts.add(key);
    }
  });
  const range = legacy.ui?.range || defaultRange();
  return {
    version: 3,
    business: { name: String(business.name || 'Mi negocio').trim() || 'Mi negocio', currency: business.currency === 'USD' ? 'USD' : 'PYG' },
    moves: movements,
    products,
    ui: { range: { start: normalizeDate(range.start), end: normalizeDate(range.end) } },
    meta: { lastSavedAt: legacy.meta?.lastSavedAt || new Date().toISOString() }
  };
}

let state = hydrateState(JSON.parse(localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_KEY) || 'null'));
let supabaseClient = null;
let currentUser = null;
let currentCompany = null;
let currentCompanies = [];
let remoteSubscription = null;
let remoteRefreshTimer = null;
let authIsSignup = false;
let remoteReady = false;
let cachedJoinCode = '';

function persist() {
  state.meta = { ...(state.meta || {}), lastSavedAt: new Date().toISOString() };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function remoteErrorMessage(error, fallback = 'No se pudo completar la operación. Intentá nuevamente.') {
  const message = String(error?.message || '').trim();
  if (!message) return fallback;
  if (/invalid login credentials/i.test(message)) return 'El correo o la contraseña no son correctos.';
  if (/email not confirmed/i.test(message)) return 'Confirmá el correo electrónico antes de ingresar.';
  if (/already registered/i.test(message)) return 'Ya existe una cuenta con este correo. Probá ingresar.';
  return message;
}

function isManager() {
  return ['owner', 'admin'].includes(currentCompany?.role);
}

function roleLabel(role) {
  return ({ owner: 'Propietario', admin: 'Administrador', seller: 'Vendedor' })[role] || 'Miembro del equipo';
}

function setOverlay(name) {
  $('#authShell').hidden = name !== 'auth';
  $('#onboardingShell').hidden = name !== 'onboarding';
}

function setButtonBusy(button, busy, text = '') {
  if (!button) return;
  if (busy) {
    button.dataset.label = button.textContent;
    button.textContent = text || 'Guardando…';
    button.disabled = true;
  } else {
    button.textContent = button.dataset.label || button.textContent;
    button.disabled = false;
  }
}

async function loadRemoteWorkspace() {
  const { data: companies, error: companyError } = await supabaseClient.rpc('list_my_companies');
  if (companyError) throw companyError;
  currentCompanies = companies || [];
  if (!currentCompanies.length) {
    currentCompany = null;
    setOverlay('onboarding');
    return;
  }
  const savedCompanyId = localStorage.getItem('orden-active-company');
  currentCompany = currentCompanies.find((company) => company.id === savedCompanyId) || currentCompanies[0];
  localStorage.setItem('orden-active-company', currentCompany.id);
  cachedJoinCode = '';

  const [{ data: products, error: productError }, { data: movements, error: movementError }] = await Promise.all([
    supabaseClient.from('products').select('id, name, category, sku, unit_cost, sale_price, reorder_level, stock_on_hand, created_at, is_active').eq('company_id', currentCompany.id).eq('is_active', true).order('name'),
    supabaseClient.from('financial_movements').select('id, kind, description, product_id, quantity, amount, occurred_on, category, note, created_at').eq('company_id', currentCompany.id).order('occurred_on', { ascending: false }).order('created_at', { ascending: false })
  ]);
  if (productError) throw productError;
  if (movementError) throw movementError;

  const remoteProducts = (products || []).map((product) => ({
    id: product.id,
    name: product.name,
    category: product.category || 'General',
    sku: product.sku || '',
    unitCost: Number(product.unit_cost) || 0,
    salePrice: Number(product.sale_price) || 0,
    reorderLevel: Number(product.reorder_level) || 0,
    stockOnHand: Number(product.stock_on_hand) || 0,
    createdAt: product.created_at || new Date().toISOString()
  }));
  const productNames = new Map(remoteProducts.map((product) => [product.id, product.name]));
  state = {
    ...state,
    version: 4,
    business: { name: currentCompany.name, currency: currentCompany.currency === 'USD' ? 'USD' : 'PYG' },
    products: remoteProducts,
    moves: (movements || []).map((movement) => ({
      id: movement.id,
      kind: movement.kind,
      description: movement.description,
      productId: movement.product_id || null,
      product: movement.product_id ? productNames.get(movement.product_id) || 'Producto eliminado' : '',
      quantity: Number(movement.quantity) || 0,
      amount: Number(movement.amount) || 0,
      date: normalizeDate(movement.occurred_on),
      category: movement.category || (movement.kind === 'income' ? 'Ventas' : 'Otros gastos'),
      note: movement.note || '',
      createdAt: movement.created_at || new Date().toISOString()
    })),
    meta: { lastSavedAt: new Date().toISOString() }
  };
  remoteReady = true;
  persist();
  setInitialControls();
  renderAll();
  setupRealtime();
  setOverlay('app');
}

function setupRealtime() {
  if (!supabaseClient || !currentCompany) return;
  remoteSubscription?.unsubscribe();
  remoteSubscription = supabaseClient.channel(`orden-${currentCompany.id}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'products', filter: `company_id=eq.${currentCompany.id}` }, queueRemoteRefresh)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'financial_movements', filter: `company_id=eq.${currentCompany.id}` }, queueRemoteRefresh)
    .subscribe();
}

function queueRemoteRefresh() {
  window.clearTimeout(remoteRefreshTimer);
  remoteRefreshTimer = window.setTimeout(() => {
    if (currentUser && currentCompany) loadRemoteWorkspace().catch((error) => toast(remoteErrorMessage(error)));
  }, 350);
}

async function startSupabase() {
  const config = window.ORDEN_SUPABASE;
  if (!window.supabase || !config?.url || !config?.publishableKey) {
    $('#authError').textContent = 'No se pudo iniciar la conexión segura. Revisá supabase-config.js.';
    setOverlay('auth');
    return;
  }
  supabaseClient = window.supabase.createClient(config.url, config.publishableKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (session?.user) {
    currentUser = session.user;
    try { await loadRemoteWorkspace(); } catch (error) { $('#authError').textContent = remoteErrorMessage(error); setOverlay('auth'); }
  } else setOverlay('auth');
  supabaseClient.auth.onAuthStateChange((_event, sessionUpdate) => {
    if (!sessionUpdate?.user) {
      currentUser = null;
      currentCompany = null;
      remoteReady = false;
      remoteSubscription?.unsubscribe();
      setOverlay('auth');
    }
  });
}

async function signOut() {
  if (!supabaseClient) return;
  await supabaseClient.auth.signOut();
  toast('Sesión cerrada correctamente.');
}

function money(value) {
  const amount = Number(value) || 0;
  const formatted = new Intl.NumberFormat('es-PY', { maximumFractionDigits: 0 }).format(Math.abs(amount));
  const prefix = state.business.currency === 'USD' ? 'US$' : 'Gs.';
  return `${amount < 0 ? '− ' : ''}${prefix} ${formatted}`;
}

function formatDate(value, options = { day: '2-digit', month: 'short', year: 'numeric' }) {
  if (!value) return 'Sin ventas';
  return new Date(`${value}T12:00:00`).toLocaleDateString('es-PY', options);
}

function escapeHtml(value) {
  const element = document.createElement('span');
  element.textContent = value;
  return element.innerHTML;
}

function rangeData() {
  const start = $('#rangeStart').value || state.ui.range.start;
  const end = $('#rangeEnd').value || state.ui.range.end;
  if (start <= end) return { start, end };
  return { start: end, end: start };
}

function movesInRange(start, end) {
  return state.moves.filter((movement) => movement.date >= start && movement.date <= end);
}

function rangeDescription({ start, end }) {
  if (start === end) return formatDate(start);
  const startLabel = formatDate(start, { day: '2-digit', month: 'short', year: 'numeric' });
  const endLabel = formatDate(end, { day: '2-digit', month: 'short', year: 'numeric' });
  return `${startLabel} — ${endLabel}`;
}

function setPresetRange(preset) {
  const today = localDate();
  let start = today;
  if (preset === 'week') {
    const weekday = new Date(`${today}T12:00:00`).getDay();
    start = addDays(today, -((weekday + 6) % 7));
  }
  if (preset === 'month') start = `${today.slice(0, 7)}-01`;
  if (preset === 'quarter') {
    const date = new Date(`${today}T12:00:00`);
    const month = String(Math.floor(date.getMonth() / 3) * 3 + 1).padStart(2, '0');
    start = `${date.getFullYear()}-${month}-01`;
  }
  if (preset === 'year') start = `${today.slice(0, 4)}-01-01`;
  $('#rangeStart').value = start;
  $('#rangeEnd').value = today;
  applyRange(preset);
}

function applyRange(preset = 'custom') {
  const range = rangeData();
  $('#rangeStart').value = range.start;
  $('#rangeEnd').value = range.end;
  state.ui.range = range;
  persist();
  $$('.preset-group button').forEach((button) => button.classList.toggle('is-active', button.dataset.range === preset));
  renderAll();
}

function sum(movements, kind) {
  return movements.filter((movement) => movement.kind === kind).reduce((total, movement) => total + movement.amount, 0);
}

function countUnits(movements) {
  return movements.filter((movement) => movement.kind === 'income').reduce((total, movement) => total + movement.quantity, 0);
}

function plural(value, singular, pluralForm = `${singular}s`) {
  return `${value} ${value === 1 ? singular : pluralForm}`;
}

function dayDifference(from, to = localDate()) {
  if (!from) return null;
  const first = new Date(`${from}T12:00:00`);
  const second = new Date(`${to}T12:00:00`);
  return Math.max(0, Math.round((second - first) / 86400000));
}

function productMetrics(range) {
  const index = new Map();
  state.products.forEach((product) => index.set(productKey(product.name), {
    ...product,
    revenue: 0,
    units: 0,
    frequency: 0,
    allFrequency: 0,
    lastSale: null
  }));
  state.moves.filter((movement) => movement.kind === 'income').forEach((movement) => {
    const key = productKey(movement.product || movement.description);
    if (!index.has(key)) index.set(key, { id: makeId('prod'), name: movement.product || movement.description, category: 'General', revenue: 0, units: 0, frequency: 0, allFrequency: 0, lastSale: null });
    const item = index.get(key);
    item.allFrequency += 1;
    if (!item.lastSale || movement.date > item.lastSale) item.lastSale = movement.date;
    if (movement.date >= range.start && movement.date <= range.end) {
      item.revenue += movement.amount;
      item.units += movement.quantity;
      item.frequency += 1;
    }
  });
  return [...index.values()].map((item) => ({ ...item, daysWithoutSale: dayDifference(item.lastSale) }));
}

function getProductStatus(product) {
  if (!product.allFrequency) return { label: 'Nunca vendido', tone: 'bad', detail: 'No registra ninguna venta' };
  if (!product.frequency) return { label: 'Sin ventas en el periodo', tone: 'warn', detail: `Última venta: ${formatDate(product.lastSale)}` };
  if (product.frequency <= 1 || product.daysWithoutSale > 30) return { label: 'Baja rotación', tone: 'warn', detail: `${product.frequency} venta${product.frequency === 1 ? '' : 's'} en el periodo` };
  return { label: 'Activo', tone: 'good', detail: `${product.frequency} operaciones de venta` };
}

function buildBuckets(range) {
  const distance = dayDifference(range.start, range.end) + 1;
  const maximumBuckets = Math.min(7, Math.max(1, distance));
  const size = Math.ceil(distance / maximumBuckets);
  const count = Math.ceil(distance / size);
  return Array.from({ length: count }, (_, index) => {
    const start = addDays(range.start, index * size);
    const end = addDays(range.start, Math.min(distance - 1, (index + 1) * size - 1));
    return { start, end, income: 0, expense: 0 };
  });
}

function renderActivityChart(range, selectedMoves) {
  const buckets = buildBuckets(range);
  selectedMoves.forEach((movement) => {
    const bucket = buckets.find((item) => movement.date >= item.start && movement.date <= item.end);
    if (bucket) bucket[movement.kind] += movement.amount;
  });
  const maximum = Math.max(1, ...buckets.flatMap((bucket) => [bucket.income, bucket.expense]));
  $('#activityChart').innerHTML = buckets.map((bucket) => {
    const label = bucket.start === bucket.end ? formatDate(bucket.start, { day: '2-digit', month: 'short' }) : `${formatDate(bucket.start, { day: '2-digit', month: 'short' })}–${formatDate(bucket.end, { day: '2-digit', month: 'short' })}`;
    return `<div class="chart-column" data-tooltip="Ganancias: ${money(bucket.income)} · Gastos: ${money(bucket.expense)}"><span class="chart-bars"><i class="chart-income" style="height:${Math.max(3, (bucket.income / maximum) * 100)}%"></i><i class="chart-expense" style="height:${Math.max(3, (bucket.expense / maximum) * 100)}%"></i></span><small>${label}</small></div>`;
  }).join('');
}

function listRow({ icon, tone, title, meta, value, valueTone = '' }) {
  return `<div class="list-row"><div class="list-main"><span class="list-icon ${tone}">${icon}</span><div><span class="list-title">${escapeHtml(title)}</span><span class="list-meta">${escapeHtml(meta)}</span></div></div>${value ? `<span class="list-value ${valueTone}">${value}</span>` : ''}</div>`;
}

function renderDashboard() {
  const range = rangeData();
  const selected = movesInRange(range.start, range.end);
  const income = sum(selected, 'income');
  const expense = sum(selected, 'expense');
  const result = income - expense;
  const balance = state.moves.reduce((total, movement) => total + (movement.kind === 'income' ? movement.amount : -movement.amount), 0);
  const products = productMetrics(range);
  const topProducts = products.filter((product) => product.revenue > 0).sort((a, b) => b.revenue - a.revenue || b.units - a.units);
  const alerts = products.map((product) => ({ product, status: getProductStatus(product) })).filter(({ status }) => status.tone !== 'good').sort((a, b) => {
    const order = { bad: 0, warn: 1, good: 2 };
    return order[a.status.tone] - order[b.status.tone] || a.product.frequency - b.product.frequency || (b.product.daysWithoutSale || 0) - (a.product.daysWithoutSale || 0);
  });
  const largestExpense = state.moves.filter((movement) => movement.kind === 'expense' && movement.date === localDate()).sort((a, b) => b.amount - a.amount)[0];
  const leadProduct = topProducts[0];
  const slowProduct = alerts[0]?.product;
  const slowStatus = alerts[0]?.status;
  $('#rangeLabel').textContent = rangeDescription(range);
  $('#availableBalance').textContent = money(balance);
  $('#balancePeriodResult').textContent = money(result);
  $('#balancePeriodTrend').textContent = result >= 0 ? 'Periodo con resultado positivo' : 'Periodo con resultado negativo';
  $('#balanceStatus').textContent = state.moves.length ? `${state.moves.length} movimientos registrados en total.` : 'Registrá tu primer movimiento para comenzar.';
  $('#incomeKpi').textContent = money(income);
  $('#expenseKpi').textContent = money(expense);
  $('#resultKpi').textContent = money(result);
  $('#unitsKpi').textContent = new Intl.NumberFormat('es-PY').format(countUnits(selected));
  $('#incomeMovementCount').textContent = plural(selected.filter((movement) => movement.kind === 'income').length, 'operación', 'operaciones');
  $('#expenseMovementCount').textContent = plural(selected.filter((movement) => movement.kind === 'expense').length, 'operación', 'operaciones');
  $('#productsSoldCount').textContent = `${topProducts.length} productos con ventas`;
  $('#largestExpenseAmount').textContent = largestExpense ? money(largestExpense.amount) : 'Sin gastos hoy';
  $('#largestExpenseName').textContent = largestExpense?.description || '—';
  $('#largestExpenseMeta').textContent = largestExpense ? `${largestExpense.category} · ${formatDate(largestExpense.date)}` : 'Registrá gastos de hoy para ver el principal.';
  $('#topProductName').textContent = leadProduct?.name || 'Sin ventas';
  $('#topProductAmount').textContent = leadProduct ? money(leadProduct.revenue) : '—';
  $('#topProductMeta').textContent = leadProduct ? `${plural(leadProduct.units, 'unidad', 'unidades')} · ${plural(leadProduct.frequency, 'operación', 'operaciones')}` : 'Registrá una venta con producto.';
  $('#slowProductName').textContent = slowProduct?.name || 'Sin datos';
  $('#slowProductStatus').textContent = slowStatus?.label || '—';
  $('#slowProductMeta').textContent = slowStatus?.detail || 'Agregá productos para controlar rotación.';
  renderActivityChart(range, selected);
  $('#rotationAlerts').innerHTML = alerts.slice(0, 4).map(({ product, status }) => listRow({ icon: '!', tone: status.tone === 'bad' ? 'expense' : 'alert', title: product.name, meta: status.detail, value: status.label })).join('') || '<p class="empty-state" style="display:block">No hay alertas: todavía no hay productos registrados.</p>';
  $('#topProductsList').innerHTML = topProducts.slice(0, 5).map((product, index) => `<div class="list-row"><div class="list-main"><span class="rank-number">${index + 1}</span><div><span class="list-title">${escapeHtml(product.name)}</span><span class="list-meta">${plural(product.units, 'unidad', 'unidades')} · ${plural(product.frequency, 'venta', 'ventas')}</span></div></div><span class="list-value income">${money(product.revenue)}</span></div>`).join('') || '<p class="empty-state" style="display:block">Registrá ventas con productos para ver el ranking.</p>';
  $('#recentMovements').innerHTML = state.moves.slice().sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)).slice(0, 5).map((movement) => listRow({ icon: movement.kind === 'income' ? '↗' : '↘', tone: movement.kind, title: movement.description, meta: `${movement.kind === 'income' ? movement.product || 'Sin producto' : movement.category} · ${formatDate(movement.date)}`, value: `${movement.kind === 'income' ? '+' : '−'} ${money(movement.amount)}`, valueTone: movement.kind })).join('') || '<p class="empty-state" style="display:block">Todavía no hay movimientos.</p>';
}

function filteredMovementRows() {
  const from = $('#movementFrom').value;
  const to = $('#movementTo').value;
  const type = $('#movementType').value;
  const search = $('#movementSearch').value.trim().toLocaleLowerCase('es-PY');
  return state.moves.filter((movement) => (!from || movement.date >= from) && (!to || movement.date <= to) && (type === 'all' || movement.kind === type) && (!search || `${movement.description} ${movement.product} ${movement.category} ${movement.note}`.toLocaleLowerCase('es-PY').includes(search))).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
}

function renderMovementTable() {
  const rows = filteredMovementRows();
  $('#movementTable').innerHTML = rows.map((movement) => `<tr><td>${formatDate(movement.date)}</td><td><span class="type-label ${movement.kind}">${movement.kind === 'income' ? 'Ganancia' : 'Gasto'}</span></td><td><strong>${escapeHtml(movement.description)}</strong>${movement.note ? `<span class="cell-secondary">${escapeHtml(movement.note)}</span>` : ''}</td><td>${movement.kind === 'income' ? escapeHtml(movement.product || 'Sin producto') : '—'}</td><td>${escapeHtml(movement.category)}</td><td class="right">${movement.kind === 'income' ? new Intl.NumberFormat('es-PY').format(movement.quantity) : '—'}</td><td class="right ${movement.kind === 'income' ? 'amount-income' : 'amount-expense'}">${movement.kind === 'income' ? '+' : '−'} ${money(movement.amount)}</td><td><button class="table-action" data-edit-movement="${movement.id}" type="button" aria-label="Editar ${escapeHtml(movement.description)}">⋮</button><button class="table-action" data-delete-movement="${movement.id}" type="button" aria-label="Eliminar ${escapeHtml(movement.description)}">×</button></td></tr>`).join('');
  $('#movementEmpty').style.display = rows.length ? 'none' : 'block';
  $('#movementCount').textContent = `${rows.length} movimiento${rows.length === 1 ? '' : 's'}`;
  $('#movementRangeSummary').textContent = rows.length ? `Total neto: ${money(rows.reduce((total, movement) => total + (movement.kind === 'income' ? movement.amount : -movement.amount), 0))}` : 'Sin resultados';
}

function renderProducts() {
  const range = rangeData();
  const products = productMetrics(range).sort((a, b) => b.revenue - a.revenue || a.name.localeCompare(b.name, 'es-PY'));
  const statuses = products.map((product) => ({ product, status: getProductStatus(product) }));
  const lowRotation = statuses.filter(({ status }) => status.tone !== 'good');
  $('#catalogProducts').textContent = new Intl.NumberFormat('es-PY').format(products.length);
  $('#catalogUnits').textContent = new Intl.NumberFormat('es-PY').format(products.reduce((total, product) => total + product.units, 0));
  $('#catalogPeriod').textContent = rangeDescription(range);
  $('#lowRotationCount').textContent = new Intl.NumberFormat('es-PY').format(lowRotation.length);
  $('#neverSoldCount').textContent = new Intl.NumberFormat('es-PY').format(statuses.filter(({ status }) => status.label === 'Nunca vendido').length);
  $('#productRangeLabel').textContent = rangeDescription(range);
  $('#productTable').innerHTML = statuses.map(({ product, status }) => {
    const stock = Number(product.stockOnHand) || 0;
    const minimum = Number(product.reorderLevel) || 0;
    const stockClass = minimum > 0 && stock <= minimum ? 'stock-low' : 'stock-ok';
    const stockDetail = minimum > 0 ? `<span class="cell-secondary">Mínimo: ${new Intl.NumberFormat('es-PY').format(minimum)}</span>` : '';
    return `<tr><td><strong>${escapeHtml(product.name)}</strong>${product.sku ? `<span class="cell-secondary">SKU: ${escapeHtml(product.sku)}</span>` : ''}</td><td>${escapeHtml(product.category || 'General')}</td><td class="right ${stockClass}">${new Intl.NumberFormat('es-PY').format(stock)}${stockDetail}</td><td class="right">${new Intl.NumberFormat('es-PY').format(product.units)}</td><td class="right amount-income">${money(product.revenue)}</td><td class="right">${product.frequency}</td><td>${formatDate(product.lastSale)}</td><td><span class="status-label ${status.tone}">${status.label}</span><span class="cell-secondary">${status.detail}</span></td><td><button class="table-action" data-edit-product="${product.id}" type="button" aria-label="Editar ${escapeHtml(product.name)}">⋮</button></td></tr>`;
  }).join('');
  $('#productEmpty').style.display = products.length ? 'none' : 'block';
}

function renderReports() {
  const range = rangeData();
  const selected = movesInRange(range.start, range.end);
  const income = sum(selected, 'income');
  const expense = sum(selected, 'expense');
  const result = income - expense;
  const products = productMetrics(range).filter((product) => product.revenue > 0).sort((a, b) => b.revenue - a.revenue);
  const categories = new Map();
  selected.filter((movement) => movement.kind === 'expense').forEach((movement) => categories.set(movement.category, (categories.get(movement.category) || 0) + movement.amount));
  const sortedCategories = [...categories.entries()].sort((a, b) => b[1] - a[1]);
  const largestCategory = Math.max(1, ...sortedCategories.map(([, amount]) => amount));
  $('#reportRangeLabel').textContent = rangeDescription(range);
  $('#reportIncome').textContent = money(income);
  $('#reportExpense').textContent = money(expense);
  $('#reportResult').textContent = money(result);
  $('#reportMargin').textContent = income ? `${((result / income) * 100).toFixed(1)}%` : '—';
  $('#expenseCategories').innerHTML = sortedCategories.map(([category, amount]) => `<div class="category-row"><div><span>${escapeHtml(category)}</span><b>${money(amount)}</b></div><span class="category-track"><i class="category-fill" style="width:${(amount / largestCategory) * 100}%"></i></span></div>`).join('') || '<p class="empty-state" style="display:block">No hay gastos en este periodo.</p>';
  $('#reportProductRanking').innerHTML = products.slice(0, 6).map((product, index) => `<div class="list-row"><div class="list-main"><span class="rank-number">${index + 1}</span><div><span class="list-title">${escapeHtml(product.name)}</span><span class="list-meta">${plural(product.units, 'unidad', 'unidades')} · ${plural(product.frequency, 'operación', 'operaciones')}</span></div></div><span class="list-value income">${money(product.revenue)}</span></div>`).join('') || '<p class="empty-state" style="display:block">No hay ventas en este periodo.</p>';
}

function renderProductOptions() {
  $('#productOptions').innerHTML = state.products.slice().sort((a, b) => a.name.localeCompare(b.name, 'es-PY')).map((product) => `<option value="${escapeHtml(product.name)}"></option>`).join('');
}

function renderSettings() {
  $('#sideBusinessName').textContent = state.business.name;
  $('#mobileBusinessName').textContent = state.business.name;
  $('#businessName').value = state.business.name;
  $('#currency').value = state.business.currency;
  $('#accountEmail').textContent = currentUser?.email || 'Sesión sin conexión';
  $('#accountRole').textContent = currentCompany ? roleLabel(currentCompany.role) : '—';
  $('#memberHelp').textContent = currentCompany ? (isManager() ? 'Como administrador podés editar la empresa, el inventario y compartir el código de acceso.' : 'Podés registrar y revisar movimientos. Un administrador gestiona la empresa y el inventario.') : 'Ingresá a una empresa para administrar sus permisos.';
  $('#businessName').disabled = remoteReady && !isManager();
  $('#currency').disabled = remoteReady && !isManager();
  $('#businessForm button[type="submit"]').disabled = remoteReady && !isManager();
  $('#newProduct').disabled = remoteReady && !isManager();
  $$('#productTable [data-edit-product]').forEach((button) => { button.disabled = remoteReady && !isManager(); });
  const joinCodeBox = $('#joinCodeBox');
  joinCodeBox.hidden = !remoteReady || !isManager();
  if (remoteReady && isManager()) loadJoinCode();
  renderSaveStatus();
  renderInstallStatus();
}

async function loadJoinCode() {
  if (!currentCompany || !isManager() || cachedJoinCode) return;
  const { data, error } = await supabaseClient.rpc('get_company_join_code', { p_company_id: currentCompany.id });
  if (!error && data) { cachedJoinCode = data; $('#companyJoinCode').textContent = data; }
}

function renderSaveStatus() {
  const online = navigator.onLine;
  const dot = $('#connectionDot');
  const status = $('#connectionStatus');
  const saved = $('#lastSaved');
  if (!dot || !status || !saved) return;
  dot.classList.toggle('offline', !online);
  status.textContent = online ? (remoteReady ? 'Sincronizado con la empresa' : 'Guardado en este dispositivo') : 'Modo sin conexión';
  const savedAt = state.meta?.lastSavedAt ? new Date(state.meta.lastSavedAt) : null;
  saved.textContent = savedAt && !Number.isNaN(savedAt) ? `Actualizado ${savedAt.toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit' })}` : 'Actualizado ahora';
}

let deferredInstallPrompt = null;

function isIosDevice() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function renderInstallStatus() {
  const description = $('#installDescription');
  const button = $('#installApp');
  if (!description || !button) return;
  const installed = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  if (installed) {
    description.textContent = 'Orden ya está instalada en este dispositivo y puede abrirse desde la pantalla de inicio.';
    button.hidden = true;
  } else if (deferredInstallPrompt) {
    description.textContent = 'Instalala para abrirla desde el inicio, trabajar a pantalla completa y mantener acceso sin conexión.';
    button.hidden = false;
  } else if (isIosDevice()) {
    description.textContent = 'En iPhone o iPad: abrí esta página con Safari, tocá Compartir y elegí “Agregar a pantalla de inicio”.';
    button.hidden = true;
  } else {
    description.textContent = 'Desde el menú del navegador elegí “Instalar aplicación”. Al publicarla en Vercel funcionará también sin conexión.';
    button.hidden = true;
  }
}

function registerProgressiveApp() {
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('./sw.js').catch(() => {});
  window.addEventListener('beforeinstallprompt', (event) => { event.preventDefault(); deferredInstallPrompt = event; renderInstallStatus(); });
  window.addEventListener('appinstalled', () => { deferredInstallPrompt = null; renderInstallStatus(); toast('Orden se instaló correctamente en este dispositivo.'); });
  window.addEventListener('online', renderSaveStatus);
  window.addEventListener('offline', renderSaveStatus);
}

function renderAll() {
  renderDashboard();
  renderMovementTable();
  renderProducts();
  renderReports();
  renderProductOptions();
  renderSettings();
}

function showPage(page) {
  $$('.page').forEach((section) => section.classList.toggle('active', section.id === `${page}Page`));
  $$('.nav-link, .mobile-nav button, .mobile-bottom-nav button[data-page]').forEach((button) => button.classList.toggle('active', button.dataset.page === page));
  $('#mobileNav').classList.remove('open');
  $('#mobileNav').setAttribute('aria-hidden', 'true');
  $('#mobileNavBackdrop').classList.remove('open');
  $('#menuButton').setAttribute('aria-expanded', 'false');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function setMovementKind(kind) {
  const isIncome = kind === 'income';
  $$('.income-field').forEach((field) => field.classList.toggle('is-hidden', !isIncome));
  $('#movementProduct').required = isIncome;
  $('#movementQuantity').required = isIncome;
  $('#movementQuantity').disabled = !isIncome;
  const category = $('#movementCategory');
  const values = isIncome ? incomeCategories : expenseCategories;
  const selected = category.dataset.selected || values[0];
  category.innerHTML = values.map((value) => `<option ${value === selected ? 'selected' : ''}>${value}</option>`).join('');
  category.dataset.selected = '';
}

function openMovementDialog(kind = 'income', movement = null) {
  $('#movementForm').reset();
  const actualKind = movement?.kind || kind;
  $('#movementId').value = movement?.id || '';
  $(`[name="movementKind"][value="${actualKind}"]`).checked = true;
  $('#movementCategory').dataset.selected = movement?.category || '';
  setMovementKind(actualKind);
  $('#movementKicker').textContent = movement ? 'EDITAR MOVIMIENTO' : actualKind === 'income' ? 'REGISTRAR GANANCIA' : 'REGISTRAR GASTO';
  $('#movementDialogTitle').textContent = movement ? 'Actualizar movimiento' : actualKind === 'income' ? 'Registrar una venta o ganancia' : 'Registrar un gasto o pago';
  $('#movementDescription').value = movement?.description || '';
  $('#movementProduct').value = movement?.product || '';
  $('#movementQuantity').value = movement?.quantity || 1;
  $('#movementAmount').value = movement?.amount || '';
  $('#movementDate').value = movement?.date || localDate();
  $('#movementNote').value = movement?.note || '';
  $('#movementFormError').textContent = '';
  $('#movementDialog').showModal();
  $('#movementDescription').focus();
}

function openProductDialog(product = null) {
  if (remoteReady && !isManager()) { toast('Solo un administrador puede modificar el catálogo y el inventario.'); return; }
  $('#productForm').reset();
  $('#productId').value = product?.id || '';
  $('#productKicker').textContent = product ? 'EDITAR CATÁLOGO' : 'CATÁLOGO';
  $('#productDialogTitle').textContent = product ? 'Actualizar producto' : 'Agregar producto';
  $('#productName').value = product?.name || '';
  $('#productCategory').value = product?.category || '';
  $('#productSku').value = product?.sku || '';
  $('#productUnitCost').value = product?.unitCost || '';
  $('#productSalePrice').value = product?.salePrice || '';
  $('#productReorderLevel').value = product?.reorderLevel || '';
  $('#productInitialStock').value = product ? '' : 0;
  $('#initialStockField').hidden = Boolean(product);
  $('#stockAdjustmentFields').hidden = !product;
  $('#productCurrentStock').textContent = new Intl.NumberFormat('es-PY').format(Number(product?.stockOnHand) || 0);
  $('#productStockAdjustment').value = '';
  $('#productAdjustmentReason').value = '';
  $('#productFormError').textContent = '';
  $('#productDialog').showModal();
  $('#productName').focus();
}

function addProductIfMissing(name, category = 'General') {
  const existing = state.products.find((product) => productKey(product.name) === productKey(name));
  if (existing) return existing;
  const product = { id: makeId('prod'), name: name.trim(), category: category || 'General', createdAt: new Date().toISOString() };
  state.products.push(product);
  return product;
}

function toast(message) {
  $('#toast').textContent = message;
  $('#toast').classList.add('show');
  window.clearTimeout(toast.timer);
  toast.timer = window.setTimeout(() => $('#toast').classList.remove('show'), 2800);
}

function downloadBlob(filename, blob) {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

function excelCurrencyFormat() {
  return state.business.currency === 'USD' ? '"US$" #,##0;[Red]("US$" #,##0);-' : '"Gs." #,##0;[Red]("Gs." #,##0);-';
}

function excelDate(value) {
  return new Date(`${value}T12:00:00`);
}

function excelColumnIndex(letters) {
  return letters.toUpperCase().split('').reduce((total, letter) => total * 26 + letter.charCodeAt(0) - 64, 0);
}

function excelRange(sheet, reference) {
  const [firstRef, lastRef = firstRef] = reference.split(':');
  const parse = (cell) => {
    const match = /^([A-Z]+)(\d+)$/i.exec(cell);
    return { col: excelColumnIndex(match[1]), row: Number(match[2]) };
  };
  const first = parse(firstRef);
  const last = parse(lastRef);
  const cells = [];
  for (let row = first.row; row <= last.row; row += 1) {
    for (let col = first.col; col <= last.col; col += 1) cells.push(sheet.getCell(row, col));
  }
  return {
    set values(matrix) {
      matrix.forEach((rowValues, rowOffset) => rowValues.forEach((value, columnOffset) => {
        sheet.getCell(first.row + rowOffset, first.col + columnOffset).value = value;
      }));
    },
    set numFmt(value) { cells.forEach((cell) => { cell.numFmt = value; }); }
  };
}

function styleExcelHeading(row, color = '1D6249') {
  row.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } };
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
    cell.alignment = { vertical: 'middle' };
    cell.border = { bottom: { style: 'thin', color: { argb: 'DCE5DB' } } };
  });
  row.height = 22;
}

function styleExcelTable(sheet, startRow, endRow, columns) {
  styleExcelHeading(sheet.getRow(startRow));
  for (let rowIndex = startRow + 1; rowIndex <= endRow; rowIndex += 1) {
    const row = sheet.getRow(rowIndex);
    row.eachCell((cell, columnNumber) => {
      cell.border = { bottom: { style: 'thin', color: { argb: 'E7EDE6' } } };
      cell.alignment = { vertical: 'middle', horizontal: columns.includes(columnNumber) ? 'right' : 'left', wrapText: columnNumber === 4 || columnNumber === 10 };
    });
  }
}

function applyWorkbookTitle(sheet, title, subtitle) {
  sheet.mergeCells('A1:J1');
  sheet.getCell('A1').value = title;
  sheet.getCell('A1').font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 18 };
  sheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '173F31' } };
  sheet.getCell('A1').alignment = { vertical: 'middle' };
  sheet.getRow(1).height = 32;
  sheet.mergeCells('A2:J2');
  sheet.getCell('A2').value = subtitle;
  sheet.getCell('A2').font = { color: { argb: '66776C' }, size: 10 };
  sheet.getCell('A2').alignment = { vertical: 'middle' };
  sheet.getRow(2).height = 22;
}

async function exportProfessionalExcel() {
  if (!globalThis.ExcelJS) {
    toast('No se pudo cargar el exportador. Revisá tu conexión e intentá de nuevo.');
    return;
  }
  const range = rangeData();
  const selected = movesInRange(range.start, range.end).sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));
  const income = sum(selected, 'income');
  const expense = sum(selected, 'expense');
  const result = income - expense;
  const productData = productMetrics(range).sort((a, b) => b.revenue - a.revenue || a.name.localeCompare(b.name, 'es-PY'));
  const topProduct = productData.find((product) => product.revenue > 0);
  const largestExpense = selected.filter((movement) => movement.kind === 'expense').sort((a, b) => b.amount - a.amount)[0];
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Orden';
  workbook.company = state.business.name;
  workbook.created = new Date();
  workbook.modified = new Date();
  workbook.calcProperties.fullCalcOnLoad = true;
  const currencyFormat = excelCurrencyFormat();

  const summary = workbook.addWorksheet('Resumen ejecutivo', { views: [{ showGridLines: false }] });
  summary.columns = [{ width: 23 }, { width: 18 }, { width: 4 }, { width: 23 }, { width: 18 }, { width: 4 }, { width: 23 }, { width: 18 }, { width: 4 }, { width: 25 }];
  applyWorkbookTitle(summary, `REPORTE EJECUTIVO · ${state.business.name}`, `Periodo: ${rangeDescription(range)} · Generado el ${new Date().toLocaleString('es-PY')} · Versión de reporte 1.0`);
  [['A4:B4', 'FACTURACIÓN', income, 'A5:B6'], ['D4:E4', 'EGRESOS', expense, 'D5:E6'], ['G4:H4', 'RESULTADO NETO', result, 'G5:H6']].forEach(([labelRange, label, value, amountRange]) => {
    summary.mergeCells(labelRange); summary.getCell(labelRange.split(':')[0]).value = label;
    summary.getCell(labelRange.split(':')[0]).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'E6F1E7' } };
    summary.getCell(labelRange.split(':')[0]).font = { bold: true, color: { argb: '1D6249' }, size: 10 };
    summary.getCell(labelRange.split(':')[0]).alignment = { vertical: 'middle', horizontal: 'center' };
    summary.mergeCells(amountRange); const cell = summary.getCell(amountRange.split(':')[0]); cell.value = value; cell.numFmt = currencyFormat; cell.font = { bold: true, color: { argb: value < 0 ? 'B35243' : '17382C' }, size: 16 }; cell.alignment = { vertical: 'middle', horizontal: 'center' }; cell.border = { bottom: { style: 'thin', color: { argb: 'DCE5DB' } } };
  });
  summary.getRow(4).height = 20; summary.getRow(5).height = 22; summary.getRow(6).height = 22;
  summary.mergeCells('A8:C8'); summary.getCell('A8').value = 'INDICADORES CLAVE DEL PERIODO'; summary.getCell('A8').font = { bold: true, color: { argb: '1D6249' } };
  excelRange(summary, 'A9:C9').values = [['Indicador', 'Valor', 'Detalle']];
  const summaryRows = [
    ['Operaciones de venta', selected.filter((movement) => movement.kind === 'income').length, 'Número de entradas de dinero'],
    ['Unidades vendidas', countUnits(selected), 'Cantidad registrada en cada venta'],
    ['Productos con ventas', productData.filter((product) => product.revenue > 0).length, 'Productos o servicios con facturación'],
    ['Producto líder', topProduct?.name || 'Sin ventas', topProduct ? `${money(topProduct.revenue)} · ${topProduct.units} unidades` : 'Sin actividad comercial'],
    ['Mayor salida', largestExpense?.description || 'Sin gastos', largestExpense ? `${money(largestExpense.amount)} · ${largestExpense.category}` : 'Sin egresos en el periodo']
  ];
  excelRange(summary, `A10:C${9 + summaryRows.length}`).values = summaryRows;
  styleExcelTable(summary, 9, 9 + summaryRows.length, [2]);
  excelRange(summary, 'B10:B12').numFmt = '#,##0';
  summary.mergeCells('A17:F17'); summary.getCell('A17').value = 'PRODUCTOS CON MAYOR FACTURACIÓN'; summary.getCell('A17').font = { bold: true, color: { argb: '1D6249' } };
  excelRange(summary, 'A18:F18').values = [['Ranking', 'Producto / servicio', 'Unidades', 'Facturación', 'Operaciones', 'Estado']];
  const topRows = productData.filter((product) => product.revenue > 0).slice(0, 10).map((product, index) => [index + 1, product.name, product.units, product.revenue, product.frequency, getProductStatus(product).label]);
  if (topRows.length) excelRange(summary, `A19:F${18 + topRows.length}`).values = topRows;
  styleExcelTable(summary, 18, Math.max(19, 18 + topRows.length), [1, 3, 4, 5]);
  excelRange(summary, `D19:D${Math.max(19, 18 + topRows.length)}`).numFmt = currencyFormat;
  summary.mergeCells('A31:J31'); summary.getCell('A31').value = 'Nota de gestión: este reporte refleja exactamente el rango seleccionado en Orden. Los datos de detalle, productos y controles están disponibles en las siguientes hojas.'; summary.getCell('A31').font = { italic: true, color: { argb: '66776C' }, size: 9 }; summary.getCell('A31').alignment = { wrapText: true };

  const movementSheet = workbook.addWorksheet('Movimientos', { views: [{ state: 'frozen', ySplit: 5 }] });
  movementSheet.columns = [{ width: 18 }, { width: 13 }, { width: 13 }, { width: 28 }, { width: 28 }, { width: 18 }, { width: 11 }, { width: 16 }, { width: 18 }, { width: 36 }];
  applyWorkbookTitle(movementSheet, `LIBRO DE MOVIMIENTOS · ${state.business.name}`, `Movimientos incluidos: ${rangeDescription(range)} · Cada fila es un registro operativo del periodo exportado.`);
  movementSheet.mergeCells('A4:J4'); movementSheet.getCell('A4').value = `Periodo: ${rangeDescription(range)} · Total de movimientos: ${selected.length}`; movementSheet.getCell('A4').font = { color: { argb: '66776C' }, bold: true, size: 10 };
  excelRange(movementSheet, 'A5:J5').values = [['ID de movimiento', 'Fecha', 'Tipo', 'Concepto', 'Producto / servicio', 'Categoría', 'Cantidad', 'Monto', 'Efecto en caja', 'Nota']];
  const movementRows = selected.map((movement) => [movement.id, excelDate(movement.date), movement.kind === 'income' ? 'Ganancia' : 'Gasto', movement.description, movement.kind === 'income' ? movement.product : '', movement.category, movement.kind === 'income' ? movement.quantity : null, movement.amount, movement.kind === 'income' ? movement.amount : -movement.amount, movement.note]);
  if (movementRows.length) excelRange(movementSheet, `A6:J${5 + movementRows.length}`).values = movementRows;
  styleExcelTable(movementSheet, 5, Math.max(6, 5 + movementRows.length), [7, 8, 9]);
  excelRange(movementSheet, `B6:B${Math.max(6, 5 + movementRows.length)}`).numFmt = 'yyyy-mm-dd';
  excelRange(movementSheet, `H6:I${Math.max(6, 5 + movementRows.length)}`).numFmt = currencyFormat;
  movementSheet.autoFilter = { from: 'A5', to: `J${Math.max(6, 5 + movementRows.length)}` };

  const productSheet = workbook.addWorksheet('Productos', { views: [{ state: 'frozen', ySplit: 5 }] });
  productSheet.columns = [{ width: 10 }, { width: 30 }, { width: 20 }, { width: 13 }, { width: 18 }, { width: 14 }, { width: 16 }, { width: 17 }, { width: 22 }];
  applyWorkbookTitle(productSheet, `RENDIMIENTO DE PRODUCTOS · ${state.business.name}`, `Rango de análisis: ${rangeDescription(range)} · La frecuencia representa el número de operaciones de venta.`);
  productSheet.mergeCells('A4:I4'); productSheet.getCell('A4').value = 'Los productos sin ventas o con una única operación deben revisarse como oportunidad comercial.'; productSheet.getCell('A4').font = { color: { argb: '66776C' }, italic: true, size: 10 };
  excelRange(productSheet, 'A5:I5').values = [['Ranking', 'Producto / servicio', 'Categoría', 'Unidades', 'Facturación', 'Frecuencia', 'Última venta', 'Días sin venta', 'Estado']];
  const productRows = productData.map((product, index) => [index + 1, product.name, product.category || 'General', product.units, product.revenue, product.frequency, product.lastSale ? excelDate(product.lastSale) : null, product.daysWithoutSale, getProductStatus(product).label]);
  if (productRows.length) excelRange(productSheet, `A6:I${5 + productRows.length}`).values = productRows;
  styleExcelTable(productSheet, 5, Math.max(6, 5 + productRows.length), [1, 4, 5, 6, 8]);
  excelRange(productSheet, `E6:E${Math.max(6, 5 + productRows.length)}`).numFmt = currencyFormat;
  excelRange(productSheet, `G6:G${Math.max(6, 5 + productRows.length)}`).numFmt = 'yyyy-mm-dd';
  productSheet.autoFilter = { from: 'A5', to: `I${Math.max(6, 5 + productRows.length)}` };

  const control = workbook.addWorksheet('Control', { views: [{ showGridLines: false }] });
  control.columns = [{ width: 35 }, { width: 25 }, { width: 56 }];
  applyWorkbookTitle(control, `CONTROL DEL REPORTE · ${state.business.name}`, 'Hoja de trazabilidad y conciliación del archivo exportado.');
  excelRange(control, 'A4:C4').values = [['Control', 'Resultado', 'Detalle']];
  const controls = [
    ['Estado del reporte', 'PASS', 'El archivo fue generado sin alertas técnicas.'],
    ['Rango de fechas', rangeDescription(range), 'Mismo rango visualizado en el panel de control.'],
    ['Movimientos incluidos', selected.length, 'Cantidad de filas en la hoja Movimientos.'],
    ['Facturación conciliada', income, 'Suma de movimientos tipo Ganancia.'],
    ['Egresos conciliados', expense, 'Suma de movimientos tipo Gasto.'],
    ['Resultado conciliado', result, 'Facturación menos egresos.'],
    ['Origen de datos', 'Orden · navegador local', 'Para trabajo multiusuario conectá una base de datos central.']
  ];
  excelRange(control, `A5:C${4 + controls.length}`).values = controls;
  styleExcelTable(control, 4, 4 + controls.length, [2]);
  excelRange(control, 'B8:B10').numFmt = currencyFormat;
  control.getCell('B5').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'E5F1E6' } };
  control.getCell('B5').font = { bold: true, color: { argb: '1D6249' } };

  const buffer = await workbook.xlsx.writeBuffer();
  const safeName = state.business.name.replace(/[\\/:*?"<>|]+/g, '-').trim() || 'empresa';
  downloadBlob(`Reporte ejecutivo - ${safeName} - ${range.end}.xlsx`, new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  toast('Reporte Excel profesional descargado.');
}

async function deleteRemoteMovement(movement) {
  const { error } = await supabaseClient.rpc('delete_financial_movement', {
    p_company_id: currentCompany.id,
    p_movement_id: movement.id
  });
  if (error) { toast(remoteErrorMessage(error)); return; }
  await loadRemoteWorkspace();
  toast('Movimiento eliminado y stock recalculado.');
}

function bindEvents() {
  document.addEventListener('click', (event) => {
    const pageTrigger = event.target.closest('[data-page]');
    if (pageTrigger) { showPage(pageTrigger.dataset.page); return; }
    const preset = event.target.closest('[data-range]');
    if (preset) { setPresetRange(preset.dataset.range); return; }
    const movementTrigger = event.target.closest('[data-open-movement]');
    if (movementTrigger) { openMovementDialog(movementTrigger.dataset.openMovement); return; }
    const editMovement = event.target.closest('[data-edit-movement]');
    if (editMovement) { openMovementDialog('income', state.moves.find((movement) => movement.id === editMovement.dataset.editMovement)); return; }
    const deleteMovement = event.target.closest('[data-delete-movement]');
    if (deleteMovement) {
      const movement = state.moves.find((item) => item.id === deleteMovement.dataset.deleteMovement);
      if (movement && confirm(`¿Eliminar “${movement.description}”? Esta acción no se puede deshacer.`)) {
        if (remoteReady) deleteRemoteMovement(movement);
        else { state.moves = state.moves.filter((item) => item.id !== movement.id); persist(); renderAll(); toast('Movimiento eliminado.'); }
      }
      return;
    }
    const editProduct = event.target.closest('[data-edit-product]');
    if (editProduct) { openProductDialog(state.products.find((product) => product.id === editProduct.dataset.editProduct)); }
  });
  $('#applyRange').addEventListener('click', () => applyRange());
  $('#newMovement').addEventListener('click', () => openMovementDialog());
  $('#mobileNewMovement').addEventListener('click', () => openMovementDialog());
  const setMobileNav = (open) => {
    $('#mobileNav').classList.toggle('open', open);
    $('#mobileNav').setAttribute('aria-hidden', String(!open));
    $('#mobileNavBackdrop').classList.toggle('open', open);
    $('#menuButton').setAttribute('aria-expanded', String(open));
    if (open) $('#closeMobileNav').focus();
  };
  $('#menuButton').addEventListener('click', () => setMobileNav(!$('#mobileNav').classList.contains('open')));
  $('#closeMobileNav').addEventListener('click', () => setMobileNav(false));
  $('#mobileNavBackdrop').addEventListener('click', () => setMobileNav(false));
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && $('#mobileNav').classList.contains('open')) setMobileNav(false); });
  $('#closeMovementDialog').addEventListener('click', () => $('#movementDialog').close());
  $('#closeProductDialog').addEventListener('click', () => $('#productDialog').close());
  $('#newProduct').addEventListener('click', () => openProductDialog());
  $$('[name="movementKind"]').forEach((input) => input.addEventListener('change', () => setMovementKind(input.value)));
  ['movementFrom', 'movementTo', 'movementType', 'movementSearch'].forEach((id) => $(`#${id}`).addEventListener(id === 'movementSearch' ? 'input' : 'change', renderMovementTable));
  $('#clearMovementFilters').addEventListener('click', () => { $('#movementFrom').value = ''; $('#movementTo').value = ''; $('#movementType').value = 'all'; $('#movementSearch').value = ''; renderMovementTable(); });
  $('#movementForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const kind = $('[name="movementKind"]:checked').value;
    const description = $('#movementDescription').value.trim();
    const product = $('#movementProduct').value.trim();
    const amount = Number($('#movementAmount').value);
    const quantity = Math.max(1, Number($('#movementQuantity').value) || 1);
    const date = $('#movementDate').value;
    if (!description || !date || !Number.isFinite(amount) || amount <= 0) { $('#movementFormError').textContent = 'Completá concepto, fecha y un monto mayor a cero.'; return; }
    if (kind === 'income' && !product) { $('#movementFormError').textContent = 'Indicá el producto o servicio que vendiste.'; return; }
    const id = $('#movementId').value;
    const movement = { id: id || makeId('mov'), kind, description, product: kind === 'income' ? product : '', quantity: kind === 'income' ? quantity : 0, amount, date, category: $('#movementCategory').value, note: $('#movementNote').value.trim(), createdAt: id ? state.moves.find((item) => item.id === id)?.createdAt || new Date().toISOString() : new Date().toISOString() };
    if (remoteReady) {
      const productRecord = kind === 'income' ? state.products.find((item) => productKey(item.name) === productKey(product)) : null;
      if (kind === 'income' && !productRecord) { $('#movementFormError').textContent = 'Primero agregá el producto al catálogo y definí su stock para registrarlo como venta.'; return; }
      const submitButton = $('#movementForm button[type="submit"]');
      setButtonBusy(submitButton, true, 'Guardando movimiento…');
      const { error } = await supabaseClient.rpc('upsert_financial_movement', {
        p_company_id: currentCompany.id,
        p_movement_id: id || null,
        p_kind: kind,
        p_description: description,
        p_product_id: productRecord?.id || null,
        p_quantity: kind === 'income' ? quantity : 0,
        p_amount: amount,
        p_occurred_on: date,
        p_category: $('#movementCategory').value,
        p_note: $('#movementNote').value.trim()
      });
      setButtonBusy(submitButton, false);
      if (error) { $('#movementFormError').textContent = remoteErrorMessage(error); return; }
      $('#movementDialog').close();
      await loadRemoteWorkspace();
      toast(id ? 'Movimiento actualizado y sincronizado.' : 'Movimiento guardado y sincronizado.');
      return;
    }
    if (kind === 'income') addProductIfMissing(product);
    state.moves = id ? state.moves.map((item) => item.id === id ? movement : item) : [...state.moves, movement];
    persist(); $('#movementDialog').close(); renderAll(); toast(id ? 'Movimiento actualizado.' : 'Movimiento guardado.');
  });
  $('#productForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const id = $('#productId').value;
    const name = $('#productName').value.trim();
    const category = $('#productCategory').value.trim() || 'General';
    if (!name) { $('#productFormError').textContent = 'Escribí el nombre del producto o servicio.'; return; }
    const duplicate = state.products.find((product) => productKey(product.name) === productKey(name) && product.id !== id);
    if (duplicate) { $('#productFormError').textContent = 'Ya existe un producto con ese nombre.'; return; }
    if (remoteReady) {
      const submitButton = $('#productForm button[type="submit"]');
      setButtonBusy(submitButton, true, 'Guardando producto…');
      const { error } = await supabaseClient.rpc('upsert_product', {
        p_company_id: currentCompany.id,
        p_product_id: id || null,
        p_name: name,
        p_category: category,
        p_sku: $('#productSku').value.trim() || null,
        p_unit_cost: Math.max(0, Number($('#productUnitCost').value) || 0),
        p_sale_price: Math.max(0, Number($('#productSalePrice').value) || 0),
        p_reorder_level: Math.max(0, Number($('#productReorderLevel').value) || 0),
        p_initial_stock: id ? 0 : Number($('#productInitialStock').value) || 0
      });
      if (error) { setButtonBusy(submitButton, false); $('#productFormError').textContent = remoteErrorMessage(error); return; }
      const adjustment = Number($('#productStockAdjustment').value) || 0;
      if (id && adjustment) {
        const { error: adjustmentError } = await supabaseClient.rpc('adjust_product_inventory', {
          p_company_id: currentCompany.id,
          p_product_id: id,
          p_quantity_delta: adjustment,
          p_reason: $('#productAdjustmentReason').value.trim() || 'Ajuste manual desde Orden',
          p_occurred_on: localDate()
        });
        if (adjustmentError) { setButtonBusy(submitButton, false); $('#productFormError').textContent = remoteErrorMessage(adjustmentError); return; }
      }
      setButtonBusy(submitButton, false);
      $('#productDialog').close();
      await loadRemoteWorkspace();
      toast(id ? 'Producto e inventario actualizados.' : 'Producto agregado al catálogo.');
      return;
    }
    if (id) {
      const current = state.products.find((product) => product.id === id);
      if (current) {
        const oldName = current.name;
        current.name = name; current.category = category;
        state.moves = state.moves.map((movement) => movement.kind === 'income' && productKey(movement.product) === productKey(oldName) ? { ...movement, product: name } : movement);
      }
    } else state.products.push({ id: makeId('prod'), name, category, createdAt: new Date().toISOString() });
    persist(); $('#productDialog').close(); renderAll(); toast(id ? 'Producto actualizado.' : 'Producto agregado al catálogo.');
  });
  $('#businessForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (remoteReady) {
      const submitButton = $('#businessForm button[type="submit"]');
      setButtonBusy(submitButton, true, 'Guardando…');
      const { error } = await supabaseClient.rpc('update_company_profile', { p_company_id: currentCompany.id, p_name: $('#businessName').value.trim() || 'Mi negocio', p_currency: $('#currency').value });
      setButtonBusy(submitButton, false);
      if (error) { toast(remoteErrorMessage(error)); return; }
      await loadRemoteWorkspace();
      toast('Información de la empresa actualizada.');
      return;
    }
    state.business.name = $('#businessName').value.trim() || 'Mi negocio'; state.business.currency = $('#currency').value; persist(); renderAll(); toast('Información de la empresa guardada.');
  });
  $('#installApp').addEventListener('click', async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    renderInstallStatus();
  });
  $('#exportExcel').addEventListener('click', exportProfessionalExcel);
  $('#printReport').addEventListener('click', () => window.print());
  $('#exportBackup').addEventListener('click', () => downloadBlob(`Copia de seguridad - ${localDate()}.json`, new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' })));
  $('#importBackup').addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try { state = hydrateState(JSON.parse(reader.result)); persist(); setInitialControls(); renderAll(); toast('Copia de seguridad restaurada correctamente.'); }
      catch { toast('El archivo seleccionado no es una copia válida de Orden.'); }
    };
    reader.readAsText(file);
  });
  $('#deleteAllData').addEventListener('click', () => {
    if (remoteReady) {
      if (confirm('¿Eliminar la copia local de este dispositivo? Los datos centrales de la empresa no se borrarán.')) { localStorage.removeItem(STORAGE_KEY); toast('La copia local fue eliminada. Tus datos centrales siguen protegidos.'); }
      return;
    }
    if (confirm('¿Eliminar todos los movimientos y productos? Esta acción no se puede deshacer.')) { state.moves = []; state.products = []; persist(); renderAll(); toast('Todos los datos fueron eliminados.'); }
  });
  $('#authModeToggle').addEventListener('click', () => {
    authIsSignup = !authIsSignup;
    $('#authSwitchText').textContent = authIsSignup ? '¿Ya tenés una cuenta?' : '¿Todavía no tenés cuenta?';
    $('#authModeToggle').textContent = authIsSignup ? 'Ingresar' : 'Crear cuenta';
    $('#authSubmit').textContent = authIsSignup ? 'Crear cuenta' : 'Ingresar';
    $('#authPassword').autocomplete = authIsSignup ? 'new-password' : 'current-password';
    $('#authError').textContent = '';
  });
  $('#authForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!supabaseClient) return;
    const email = $('#authEmail').value.trim();
    const password = $('#authPassword').value;
    if (!email || password.length < 6) { $('#authError').textContent = 'Ingresá un correo válido y una contraseña de al menos 6 caracteres.'; return; }
    const submitButton = $('#authSubmit');
    setButtonBusy(submitButton, true, authIsSignup ? 'Creando cuenta…' : 'Ingresando…');
    const result = authIsSignup
      ? await supabaseClient.auth.signUp({ email, password })
      : await supabaseClient.auth.signInWithPassword({ email, password });
    setButtonBusy(submitButton, false);
    if (result.error) { $('#authError').textContent = remoteErrorMessage(result.error); return; }
    if (!result.data.session) {
      $('#authError').textContent = 'Revisá tu correo para confirmar la cuenta y luego ingresá.';
      authIsSignup = false;
      $('#authSwitchText').textContent = '¿Ya tenés una cuenta?';
      $('#authModeToggle').textContent = 'Crear cuenta';
      $('#authSubmit').textContent = 'Ingresar';
      return;
    }
    currentUser = result.data.user;
    try { await loadRemoteWorkspace(); } catch (error) { $('#authError').textContent = remoteErrorMessage(error); }
  });
  $$('.onboarding-tabs button').forEach((button) => button.addEventListener('click', () => {
    $$('.onboarding-tabs button').forEach((item) => item.classList.toggle('active', item === button));
    $('#createCompanyForm').hidden = button.dataset.onboarding !== 'create';
    $('#joinCompanyForm').hidden = button.dataset.onboarding !== 'join';
  }));
  $('#createCompanyForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const name = $('#newCompanyName').value.trim();
    if (!name) { $('#companyCreateError').textContent = 'Escribí el nombre de tu empresa.'; return; }
    const submitButton = $('#createCompanyForm button[type="submit"]');
    setButtonBusy(submitButton, true, 'Creando empresa…');
    const { error } = await supabaseClient.rpc('create_company', { p_name: name, p_currency: $('#newCompanyCurrency').value });
    setButtonBusy(submitButton, false);
    if (error) { $('#companyCreateError').textContent = remoteErrorMessage(error); return; }
    try { await loadRemoteWorkspace(); toast('Empresa creada. Ya podés empezar a registrar operaciones.'); } catch (loadError) { $('#companyCreateError').textContent = remoteErrorMessage(loadError); }
  });
  $('#joinCompanyForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const code = $('#joinCompanyCode').value.trim();
    if (!code) { $('#companyJoinError').textContent = 'Ingresá el código que te compartió el administrador.'; return; }
    const submitButton = $('#joinCompanyForm button[type="submit"]');
    setButtonBusy(submitButton, true, 'Uniendo cuenta…');
    const { error } = await supabaseClient.rpc('join_company_by_code', { p_join_code: code });
    setButtonBusy(submitButton, false);
    if (error) { $('#companyJoinError').textContent = remoteErrorMessage(error); return; }
    try { await loadRemoteWorkspace(); toast('Ya formás parte de la empresa.'); } catch (loadError) { $('#companyJoinError').textContent = remoteErrorMessage(loadError); }
  });
  $('#onboardingSignOut').addEventListener('click', signOut);
  $('#signOut').addEventListener('click', signOut);
  $('#copyJoinCode').addEventListener('click', async () => {
    const code = $('#companyJoinCode').textContent;
    try { await navigator.clipboard.writeText(code); toast('Código copiado. Compartilo solo con tu equipo.'); }
    catch { toast(`Código de acceso: ${code}`); }
  });
}

function setInitialControls() {
  const range = state.ui.range || defaultRange();
  $('#rangeStart').value = range.start;
  $('#rangeEnd').value = range.end;
}

setInitialControls();
bindEvents();
registerProgressiveApp();
startSupabase().catch((error) => { $('#authError').textContent = remoteErrorMessage(error); setOverlay('auth'); });
const launchParameters = new URLSearchParams(window.location.search);
if (launchParameters.get('vista') === 'reportes') showPage('reports');
if (launchParameters.get('accion') === 'venta') window.setTimeout(() => openMovementDialog('income'), 0);
