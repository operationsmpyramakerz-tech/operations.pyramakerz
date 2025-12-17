/* Logistics – Orders Grouped + Modal Full/Partial Receiving + Submit inside modal */

(function () {

  // ---------- Helpers ----------
  const $  = (s,r=document)=>r.querySelector(s);
  const $$ = (s,r=document)=>Array.from(r.querySelectorAll(s));
  const N  = (v)=>Number.isFinite(+v)?+v:0;
  const esc = s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));

  const grid        = $("#assigned-grid");
  const searchBox   = $("#logisticsSearch");
  const tabMissing  = $("#tab-missing");
  const tabReceived = $("#tab-received");

  const modal       = $("#orderModal");
  const modalTitle  = $("#orderModalTitle");
  const modalBody   = $("#modalItems");
  const modalClose  = $("#closeModalBtn");

  const receiverSelect = $("#receiverUser");
  const receiverPass   = $("#receiverPass");
  const submitBtn      = $("#submitOrderBtn");

  let allItems = [];
  let activeTab = "missing";
  let currentOrderReason = null;
  let receiversCache = null;

  // ---------- Small helper: POST JSON ----------
  async function postJSON(url, body) {
    const res = await fetch(url, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {})
    });
    let data = {};
    try { data = await res.json(); } catch { data = {}; }
    if (!res.ok) {
      const msg = data.error || data.message || res.statusText || "Request failed";
      throw new Error(msg);
    }
    return data;
  }

  // ---------- Load Receivers (once) ----------
  async function ensureReceiversLoaded() {
    if (receiversCache !== null) return receiversCache;
    try {
      const res = await fetch("/api/logistics/receivers", { credentials: "same-origin" });
      const data = await res.json();
      const users = Array.isArray(data.users) ? data.users : [];
      receiversCache = users;
    } catch (e) {
      console.error("Failed to load receivers:", e);
      receiversCache = [];
    }
    return receiversCache;
  }

  // ---------- Normalize ----------
  function normalize(it){
    const req = N(it.requested ?? it.req);
    const rec = N(it.quantityReceivedByOperations ?? it.rec ?? 0);
    return {
      id: it.id,
      pageId: it.pageId || it.page_id || it.notionPageId || it.id,
      reason: it.reason || "No Reason",
      productName: it.productName ?? "Unnamed",
      requested: req,
      rec: rec,
      remaining: Math.max(0, req - rec),
      created: it.createdTime || it.created || ""
    };
  }

  // ---------- Fetch ----------
  async function fetchAssigned(){
    const res = await fetch("/api/orders/assigned",{credentials:"same-origin"});
    if(!res.ok) throw new Error("Failed");
    const data = await res.json();
    return Array.isArray(data)?data.map(normalize):[];
  }

  // ---------- Local Save (Full / Partial) ----------
  function setLocalReceive(itemId, quantity){
    const item = allItems.find(x=>x.id == itemId);
    if(!item) return;
    item.rec = quantity;
    item.remaining = Math.max(0, item.requested - quantity);

    // نعيد فتح نفس المودال
    if (currentOrderReason) openOrderModal(currentOrderReason);
  }

  // ---------- Group by Order ----------
  function groupOrders(list){
    const map = new Map();
    for(const it of list){
      if(!map.has(it.reason)) map.set(it.reason,[]);
      map.get(it.reason).push(it);
    }
    return [...map.entries()].map(([reason, items])=>({reason, items}));
  }

  // ---------- Render ----------
  function render(){
    if(!grid) return;
    grid.innerHTML = "";

    const search = (searchBox?.value || "").trim().toLowerCase();

    const filtered = allItems.filter(it => {
      if (activeTab === "missing" && it.remaining <= 0) return false;
      if (activeTab === "received" && it.remaining > 0) return false;
      if (search && !it.productName.toLowerCase().includes(search) && !it.reason.toLowerCase().includes(search)) return false;
      return true;
    });

    const groups = groupOrders(filtered);

    if (!groups.length) {
      const empty = document.createElement("p");
      empty.className = "empty muted";
      empty.textContent = "No items found.";
      grid.appendChild(empty);
      return;
    }

    groups.forEach(({reason, items}, index) => {
      const card = document.createElement("div");
      card.className = "order-card";
      card.style.animationDelay = `${index * 0.1}s`; // أنيميشن متتالي

      const header = document.createElement("div");
      header.className = "order-header";
      header.innerHTML = `<span class="order-reason">${esc(reason)}</span> <span class="muted" style="font-size:0.85rem;">(${items.length} items)</span>`;
      card.appendChild(header);

      items.forEach(it => {
        const itemEl = document.createElement("div");
        itemEl.className = "order-item";
        itemEl.innerHTML = `
          <span class="item-name">${esc(it.productName)}</span>
          <span class="item-qty">Req: ${it.requested} | Rec: ${it.rec}</span>
        `;
        card.appendChild(itemEl);
      });

      const btn = document.createElement("button");
      btn.className = "order-btn";
      btn.dataset.reason = reason;
      btn.innerHTML = `<i data-feather="truck"></i> Receive Items`;
      card.appendChild(btn);

      grid.appendChild(card);
    });

    feather.replace();
    wireOrderButtons();
  }

  // ---------- Open Modal ----------
  async function openOrderModal(reason){
    currentOrderReason = reason;

    if (modalTitle) modalTitle.textContent = `Receive Items for: ${esc(reason)}`;
    if (modalBody) modalBody.innerHTML = "";

    const items = allItems.filter(it => it.reason === reason);

    if (receiverSelect && !receiverSelect.options.length) {
      const users = await ensureReceiversLoaded();
      users.forEach(u => {
        const opt = document.createElement("option");
        opt.value = u.id;
        opt.textContent = u.name;
        receiverSelect.appendChild(opt);
      });
    }

    items.forEach(it => {
      const div = document.createElement("div");
      div.className = "modal-item";
      div.innerHTML = `
        <div class="item-details">
          <span>${esc(it.productName)}</span>
          <span>Req: ${it.requested} | Rec: ${it.rec} | Remaining: ${it.remaining}</span>
        </div>
        <div class="item-actions" style="display:flex; gap:8px; margin-top:8px;">
          <button class="btn btn-full" data-act="full" data-id="${it.id}">Full Receive</button>
          <button class="btn btn-partial" data-act="partial" data-id="${it.id}">Partial</button>
        </div>
        <div id="pbox-${it.id}" class="partial-box" style="display:none;">
          <input id="pinput-${it.id}" type="number" min="1" max="${it.requested}" placeholder="Quantity" style="width:100%; margin-bottom:6px;"/>
          <button class="btn btn-save" data-act="save" data-id="${it.id}">Save Partial</button>
        </div>
      `;
      modalBody.appendChild(div);
    });

    modal.style.display = "flex";
    wireModalButtons();
  }

  // ---------- Submit ----------
  async function submitCurrentOrder(){
    const userId = receiverSelect?.value || "";
    const password = (receiverPass?.value || "").trim();

    if (!userId) {
      alert("اختر اسم المستلم من القائمة.");
      return;
    }
    if (!password) {
      alert("من فضلك أدخل كلمة السر.");
      return;
    }

    try {
      // 1) Verify user password
      const verify = await postJSON("/api/logistics/verify-user", { userId, password });
      if (!verify.ok) {
        alert(verify.error || "Incorrect password");
        return;
      }

      // 2) جهّز الـ itemIds و الـ recMap و statusById
      const items = allItems.filter(it => it.reason === currentOrderReason);

      const itemIds    = [];
      const statusById = {};
      const recMap     = {};

      for (const it of items) {
        const rec = N(it.rec);
        if (rec > 0) {
          const id = it.pageId;
          itemIds.push(id);
          recMap[id] = rec;
          statusById[id] = (rec >= it.requested)
            ? "Received by operations"
            : "Partially received by operations";
        }
      }

      if (!itemIds.length) {
        alert("لا يوجد أي عنصر تم إدخال كمية استلام له في هذا الطلب.");
        return;
      }

      // 3) إرسال
      await postJSON("/api/logistics/mark-received", {
        itemIds,
        statusById,
        recMap
      });

      alert("تم حفظ استلام الطلب بنجاح.");
      modal.style.display = "none";
      render();
    } catch (e) {
      console.error("Submit order error:", e);
      alert(e.message || "فشل حفظ البيانات، حاول مرة أخرى.");
    }
  }

  // ---------- Button Wiring ----------
  function wireOrderButtons(){
    $$(".order-btn").forEach(btn=>{
      btn.onclick = ()=> openOrderModal(btn.dataset.reason);
    });
  }

  function wireModalButtons(){

    // Full
    $$(".btn-full").forEach(btn=>{
      btn.onclick = ()=>{
        const id = btn.dataset.id;
        const item = allItems.find(x=>x.id == id);
        if(item) setLocalReceive(id, item.requested);
      };
    });

    // Partial toggle
    $$(".btn-partial").forEach(btn=>{
      btn.onclick = ()=>{
        const box = $("#pbox-"+btn.dataset.id);
        if (!box) return;
        box.style.display = box.style.display==="none"?"block":"none";
      };
    });

    // Partial Save
    $$(".btn-save").forEach(btn=>{
      btn.onclick = ()=>{
        const id = btn.dataset.id;
        const val = N($("#pinput-"+id)?.value);
        const item = allItems.find(x=>x.id == id);
        if(!item) return;
        if(val<=0)        return alert("Enter valid quantity");
        if(val > item.requested) return alert("Cannot exceed requested");
        setLocalReceive(id, val);
      };
    });

    // Submit inside modal
    if (submitBtn) {
      submitBtn.onclick = submitCurrentOrder;
    }

    // Close
    if (modalClose) {
      modalClose.onclick = ()=> modal.style.display="none";
    }
  }

  // ---------- Tabs ----------
  function setActiveTab(tab){
    activeTab = tab;
    tabMissing.classList.toggle("active", tab==="missing");
    tabReceived.classList.toggle("active", tab==="received");
    render();
  }

  // ---------- Init ----------
  async function init(){
    try {
      allItems = await fetchAssigned();
      setActiveTab("missing");
    } catch (e) {
      console.error("init logistics error:", e);
      if (grid) grid.innerHTML = `<p class="empty">Failed to load items.</p>`;
    }
  }

  if(searchBox) searchBox.addEventListener("input", render);
  tabMissing.addEventListener("click", ()=>setActiveTab("missing"));
  tabReceived.addEventListener("click", ()=>setActiveTab("received"));

  init();

})();
