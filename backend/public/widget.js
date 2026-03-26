(function () {
  const API = document.currentScript ? new URL(document.currentScript.src).origin : '';
  const STRIPE_PK = 'pk_test_51RjeKVGbumWSK3aP0UWdNrtqd4wf8RkDD8u9UzaIFpzaqdei1LBUc1817WfvXi2ubPOilY6SAFDnV1J4Np3SDy4f00xgYoVAWR';

  // Lazy-load Stripe.js
  function loadStripe() {
    return new Promise((resolve) => {
      if (window.Stripe) return resolve(window.Stripe(STRIPE_PK));
      const s = document.createElement('script');
      s.src = 'https://js.stripe.com/v3/';
      s.onload = () => resolve(window.Stripe(STRIPE_PK));
      document.head.appendChild(s);
    });
  }

  function injectStyles() {
    const css = `
      .cb-widget * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
      .cb-widget { max-width: 520px; margin: 0 auto; padding: 20px; background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; }
      .cb-widget h3 { text-align: center; margin: 0 0 16px; font-size: 1.2rem; color: #111; }
      .cb-step { display: none; } .cb-step.cb-active { display: block; }
      .cb-field { margin-bottom: 14px; }
      .cb-field label { display: block; font-size: 0.8rem; font-weight: 600; color: #374151; margin-bottom: 4px; text-align: center; }
      .cb-field input, .cb-field select { width: 100%; padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 0.95rem; outline: none; }
      .cb-field input:focus, .cb-field select:focus { border-color: #2563eb; box-shadow: 0 0 0 3px rgba(37,99,235,0.15); }
      .cb-btn { display: inline-block; padding: 11px 22px; background: #2563eb; color: #fff; border: none; border-radius: 8px; font-size: 0.95rem; font-weight: 600; cursor: pointer; width: 100%; margin-top: 8px; }
      .cb-btn:hover { background: #1d4ed8; } .cb-btn:disabled { background: #9ca3af; cursor: not-allowed; }
      .cb-btn-outline { background: transparent; color: #2563eb; border: 1px solid #2563eb; margin-top: 8px; }
      .cb-pitch-card { border: 1px solid #e5e7eb; border-radius: 8px; padding: 14px; margin-bottom: 10px; cursor: pointer; transition: border-color 0.15s; }
      .cb-pitch-card:hover { border-color: #2563eb; } .cb-pitch-card.cb-selected { border-color: #2563eb; background: #eff6ff; }
      .cb-pitch-name { font-weight: 700; font-size: 1rem; } .cb-pitch-price { color: #2563eb; font-weight: 600; }
      .cb-pitch-meta { font-size: 0.82rem; color: #6b7280; margin-top: 4px; }
      .cb-extras { margin-bottom: 14px; }
      .cb-extra-row { display: flex; align-items: center; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #f3f4f6; }
      .cb-extra-row:last-child { border-bottom: none; }
      .cb-extra-name { font-size: 0.9rem; } .cb-extra-price { font-size: 0.85rem; color: #6b7280; }
      .cb-stepper { display: flex; align-items: center; gap: 8px; }
      .cb-stepper button { width: 28px; height: 28px; border: 1px solid #d1d5db; border-radius: 50%; background: #fff; cursor: pointer; font-size: 1rem; line-height: 1; }
      .cb-stepper span { min-width: 20px; text-align: center; font-weight: 600; }
      .cb-summary { background: #f9fafb; border-radius: 8px; padding: 14px; margin-bottom: 14px; font-size: 0.9rem; }
      .cb-summary-row { display: flex; justify-content: space-between; margin-bottom: 6px; }
      .cb-summary-total { font-weight: 700; font-size: 1rem; border-top: 1px solid #e5e7eb; padding-top: 8px; margin-top: 4px; }
      .cb-error { background: #fef2f2; color: #dc2626; padding: 10px 14px; border-radius: 8px; font-size: 0.88rem; margin-bottom: 12px; }
      .cb-success { text-align: center; padding: 20px 0; }
      .cb-success .cb-ref { font-size: 2rem; font-weight: 700; color: #2563eb; letter-spacing: 2px; }
      .cb-loader { text-align: center; color: #6b7280; padding: 20px; }
      .cb-progress { display: flex; gap: 4px; margin-bottom: 20px; }
      .cb-progress-dot { flex: 1; height: 4px; background: #e5e7eb; border-radius: 2px; }
      .cb-progress-dot.cb-done { background: #2563eb; }
    `;
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
  }

  function fmt(pence) { return '£' + (pence / 100).toFixed(2); }

  function Widget(container, tenantSlug) {
    this.container = container;
    this.tenantSlug = tenantSlug;
    this.state = { step: 1, arrival: '', departure: '', nights: 0, pitchType: null, extras: {}, guest: {} };
    this.tenant = null;
    this.availability = null;
    this.render();
  }

  Widget.prototype.render = function () {
    this.container.innerHTML = '<div class="cb-widget"><div class="cb-loader">Loading...</div></div>';
    fetch(`${API}/api/tenants/${this.tenantSlug}`)
      .then(r => r.json())
      .then(t => { this.tenant = t; this.renderStep1(); })
      .catch(() => { this.container.querySelector('.cb-widget').innerHTML = '<p style="color:#dc2626">Failed to load booking form.</p>'; });
  };

  Widget.prototype.progress = function (step) {
    return `<div class="cb-progress">${[1,2,3,4,5].map(i => `<div class="cb-progress-dot ${i <= step ? 'cb-done' : ''}"></div>`).join('')}</div>`;
  };

  Widget.prototype.renderStep1 = function () {
    const w = this.container.querySelector('.cb-widget');
    w.innerHTML = `
      ${this.progress(1)}
      <h3>Book your stay at ${this.tenant.name}</h3>
      <div class="cb-step cb-active">
        <div class="cb-field"><label>Arrival date</label><input type="date" id="cb-arrival" min="${new Date().toISOString().slice(0,10)}" value="${this.state.arrival}"></div>
        <div class="cb-field"><label>Departure date</label><input type="date" id="cb-departure" value="${this.state.departure}"></div>
        <div id="cb-step1-error"></div>
        <button class="cb-btn" id="cb-step1-next">Check Availability →</button>
      </div>`;

    w.querySelector('#cb-step1-next').onclick = () => {
      const arr = w.querySelector('#cb-arrival').value;
      const dep = w.querySelector('#cb-departure').value;
      const errEl = w.querySelector('#cb-step1-error');
      if (!arr || !dep) { errEl.innerHTML = '<div class="cb-error">Please select both dates.</div>'; return; }
      const nights = Math.round((new Date(dep) - new Date(arr)) / 86400000);
      if (nights < 1) { errEl.innerHTML = '<div class="cb-error">Departure must be after arrival.</div>'; return; }
      this.state.arrival = arr; this.state.departure = dep; this.state.nights = nights;
      this.loadAvailability();
    };
  };

  Widget.prototype.loadAvailability = function () {
    const w = this.container.querySelector('.cb-widget');
    w.innerHTML = `${this.progress(2)}<div class="cb-loader">Checking availability...</div>`;
    fetch(`${API}/api/availability?tenant=${this.tenantSlug}&arrival=${this.state.arrival}&departure=${this.state.departure}`)
      .then(r => r.json())
      .then(data => { this.availability = data; this.renderStep2(); })
      .catch(() => { w.innerHTML += '<div class="cb-error">Failed to check availability.</div>'; });
  };

  Widget.prototype.renderStep2 = function () {
    const w = this.container.querySelector('.cb-widget');
    const { available, nights } = this.availability;
    w.innerHTML = `${this.progress(2)}<h3>Choose your pitch — ${nights} night${nights>1?'s':''}</h3>`;
    if (!available.length) {
      w.innerHTML += '<div class="cb-error">No pitches available for those dates. Please try different dates.</div>';
      w.innerHTML += `<button class="cb-btn cb-btn-outline" id="cb-back">← Back</button>`;
      w.querySelector('#cb-back').onclick = () => this.renderStep1();
      return;
    }
    available.forEach(pt => {
      const card = document.createElement('div');
      card.className = 'cb-pitch-card';
      card.innerHTML = `
        <div class="cb-pitch-name">${pt.name}</div>
        <div class="cb-pitch-price">${fmt(pt.totalPrice)} total · ${fmt(pt.avgPricePerNight)}/night avg</div>
        <div class="cb-pitch-meta">Max ${pt.maxOccupancy} guests · ${pt.maxVehicles} vehicle${pt.maxVehicles>1?'s':''} · ${pt.ehuIncluded ? 'EHU included' : 'EHU not included'}${pt.minStayNights > 1 ? ' · Min '+pt.minStayNights+' nights' : ''}</div>
        ${pt.description ? `<div class="cb-pitch-meta" style="margin-top:6px">${pt.description}</div>` : ''}
      `;
      card.onclick = () => { this.state.pitchType = pt; this.renderStep3(); };
      w.appendChild(card);
    });
    const back = document.createElement('button');
    back.className = 'cb-btn cb-btn-outline'; back.textContent = '← Back';
    back.onclick = () => this.renderStep1();
    w.appendChild(back);
  };

  Widget.prototype.renderStep3 = function () {
    const w = this.container.querySelector('.cb-widget');
    const g = this.state.guest;
    w.innerHTML = `
      ${this.progress(3)}<h3>Your details</h3>
      <div class="cb-field"><label>Full name</label><input type="text" id="cb-name" value="${g.name||''}"></div>
      <div class="cb-field"><label>Email</label><input type="email" id="cb-email" value="${g.email||''}"></div>
      <div class="cb-field"><label>Phone</label><input type="tel" id="cb-phone" value="${g.phone||''}"></div>
      <div class="cb-field"><label>Number of adults</label><select id="cb-adults">${[1,2,3,4,5,6].map(n=>`<option ${(g.adults||2)==n?'selected':''}>${n}</option>`).join('')}</select></div>
      <div class="cb-field"><label>Number of children</label><select id="cb-children">${[0,1,2,3,4,5].map(n=>`<option ${(g.children||0)==n?'selected':''}>${n}</option>`).join('')}</select></div>
      <div id="cb-step3-error"></div>
      <button class="cb-btn" id="cb-step3-next">Continue →</button>
      <button class="cb-btn cb-btn-outline" id="cb-back">← Back</button>`;
    w.querySelector('#cb-step3-next').onclick = () => {
      const name = w.querySelector('#cb-name').value.trim();
      const email = w.querySelector('#cb-email').value.trim();
      const phone = w.querySelector('#cb-phone').value.trim();
      const errEl = w.querySelector('#cb-step3-error');
      if (!name || !email) { errEl.innerHTML = '<div class="cb-error">Name and email are required.</div>'; return; }
      this.state.guest = { name, email, phone, adults: parseInt(w.querySelector('#cb-adults').value), children: parseInt(w.querySelector('#cb-children').value) };
      this.renderStep4();
    };
    w.querySelector('#cb-back').onclick = () => this.renderStep2();
  };

  Widget.prototype.renderStep4_extras = function () {
    const w = this.container.querySelector('.cb-widget');
    const extras = this.availability.extras || [];
    w.innerHTML = `${this.progress(4)}<h3>Add extras</h3><div class="cb-extras" id="cb-extras-list"></div><div id="cb-running-total"></div><button class="cb-btn" id="cb-step3-next">Continue →</button><button class="cb-btn cb-btn-outline" id="cb-back">← Back</button>`;

    const list = w.querySelector('#cb-extras-list');
    if (!extras.length) { list.innerHTML = '<p style="color:#6b7280;font-size:0.9rem">No extras available for this campsite.</p>'; }
    extras.forEach(ex => {
      const row = document.createElement('div');
      row.className = 'cb-extra-row';
      const priceStr = ex.pricePerNight ? `${fmt(ex.pricePerNight)}/night` : (ex.priceFlat ? `${fmt(ex.priceFlat)} flat` : '');
      if (ex.perUnit) {
        row.innerHTML = `<div><div class="cb-extra-name">${ex.name}</div><div class="cb-extra-price">${priceStr}</div></div><div class="cb-stepper"><button data-id="${ex.id}" data-dir="-1">−</button><span id="cb-qty-${ex.id}">${this.state.extras[ex.id] || 0}</span><button data-id="${ex.id}" data-dir="1">+</button></div>`;
        row.querySelectorAll('button').forEach(btn => {
          btn.onclick = () => {
            const cur = this.state.extras[ex.id] || 0;
            const next = Math.max(0, Math.min(ex.maxUnits || 99, cur + parseInt(btn.dataset.dir)));
            this.state.extras[ex.id] = next;
            row.querySelector(`#cb-qty-${ex.id}`).textContent = next;
            this.updateTotal(w, extras);
          };
        });
      } else {
        const checked = !!this.state.extras[ex.id];
        row.innerHTML = `<div><div class="cb-extra-name">${ex.name}</div><div class="cb-extra-price">${priceStr}</div></div><input type="checkbox" ${checked ? 'checked' : ''} id="cb-chk-${ex.id}" style="width:20px;height:20px;cursor:pointer">`;
        row.querySelector(`#cb-chk-${ex.id}`).onchange = (e) => { this.state.extras[ex.id] = e.target.checked ? 1 : 0; this.updateTotal(w, extras); };
      }
      list.appendChild(row);
    });
    this.updateTotal(w, extras);
    w.querySelector('#cb-step3-next').onclick = () => this.renderStep5();
    w.querySelector('#cb-back').onclick = () => this.renderStep3();
  };

  Widget.prototype.updateTotal = function (w, extras) {
    const pt = this.state.pitchType;
    let total = pt.totalPrice;
    extras.forEach(ex => {
      const qty = this.state.extras[ex.id] || 0;
      if (!qty) return;
      if (ex.pricePerNight) total += ex.pricePerNight * this.state.nights * qty;
      else if (ex.priceFlat) total += ex.priceFlat * qty;
    });
    const el = w.querySelector('#cb-running-total');
    if (el) el.innerHTML = `<div class="cb-summary"><div class="cb-summary-row cb-summary-total"><span>Estimated total</span><span>${fmt(total)}</span></div></div>`;
    this._currentTotal = total;
  };

  Widget.prototype.renderStep4 = function () {
    this.renderStep4_extras();
  };

  Widget.prototype.renderStep5 = function () {
    const w = this.container.querySelector('.cb-widget');
    const { pitchType, guest, nights, arrival, departure } = this.state;
    const total = this._currentTotal || pitchType.totalPrice;
    w.innerHTML = `
      ${this.progress(5)}<h3>Confirm & Pay</h3>
      <div class="cb-summary">
        <div class="cb-summary-row"><span>Campsite</span><span>${this.tenant.name}</span></div>
        <div class="cb-summary-row"><span>Pitch</span><span>${pitchType.name}</span></div>
        <div class="cb-summary-row"><span>Dates</span><span>${arrival} → ${departure}</span></div>
        <div class="cb-summary-row"><span>Nights</span><span>${nights}</span></div>
        <div class="cb-summary-row"><span>Guests</span><span>${guest.adults} adults${guest.children ? ', '+guest.children+' children' : ''}</span></div>
        <div class="cb-summary-row cb-summary-total"><span>Total</span><span>${fmt(total)}</span></div>
      </div>
      <div style="margin-bottom:6px;font-size:0.82rem;color:#6b7280">🔒 Test mode — use card <strong>4242 4242 4242 4242</strong>, any expiry, any CVC</div>
      <div id="cb-card-element" style="padding:12px;border:1px solid #d1d5db;border-radius:8px;margin-bottom:14px;min-height:44px;background:#fff"></div>
      <div id="cb-step5-error"></div>
      <button class="cb-btn" id="cb-pay-btn">Pay ${fmt(total)} & Confirm</button>
      <button class="cb-btn cb-btn-outline" id="cb-back">← Back</button>`;

    w.querySelector('#cb-back').onclick = () => this.renderStep4();

    const self = this;
    loadStripe().then(stripe => {
      const elements = stripe.elements({ locale: 'en-GB' });
      const card = elements.create('card', {
        hidePostalCode: true,
        style: {
          base: { fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', fontSize: '15px', color: '#111827', '::placeholder': { color: '#9ca3af' } },
          invalid: { color: '#dc2626' }
        }
      });
      card.mount('#cb-card-element');

      w.querySelector('#cb-pay-btn').onclick = async () => {
        const btn = w.querySelector('#cb-pay-btn');
        btn.disabled = true; btn.textContent = 'Processing...';
        const errEl = w.querySelector('#cb-step5-error');
        errEl.innerHTML = '';

        const { paymentMethod, error } = await stripe.createPaymentMethod({ type: 'card', card, billing_details: { name: guest.name, email: guest.email } });
        if (error) {
          btn.disabled = false; btn.textContent = `Pay ${fmt(total)} & Confirm`;
          errEl.innerHTML = `<div class="cb-error">${error.message}</div>`; return;
        }

        const body = {
          tenantSlug: self.tenantSlug, pitchTypeId: pitchType.id,
          arrivalDate: arrival, departureDate: departure,
          numAdults: guest.adults, numChildren: guest.children,
          selectedExtras: Object.entries(self.state.extras).filter(([,q])=>q>0).map(([id,quantity])=>({id,quantity})),
          guestName: guest.name, guestEmail: guest.email, guestPhone: guest.phone,
          paymentMethodId: paymentMethod.id,
        };
        fetch(`${API}/api/bookings`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body) })
          .then(r => r.json())
          .then(data => {
            if (data.bookingRef) self.renderSuccess(data.bookingRef);
            else { btn.disabled = false; btn.textContent = `Pay ${fmt(total)} & Confirm`; errEl.innerHTML = `<div class="cb-error">${data.message || 'Payment failed. Please try again.'}</div>`; }
          })
          .catch(() => { btn.disabled = false; btn.textContent = `Pay ${fmt(total)} & Confirm`; errEl.innerHTML = '<div class="cb-error">Network error. Please try again.</div>'; });
      };
    });
  };

  Widget.prototype.renderSuccess = function (ref) {
    const w = this.container.querySelector('.cb-widget');
    w.innerHTML = `
      <div class="cb-success">
        <div style="font-size:2.5rem;margin-bottom:12px">🏕️</div>
        <h3 style="color:#16a34a">Booking Confirmed!</h3>
        <p>Your booking reference is:</p>
        <div class="cb-ref">${ref}</div>
        <p style="color:#6b7280;font-size:0.9rem;margin-top:12px">A confirmation email has been sent to ${this.state.guest.email}</p>
      </div>`;
  };

  // ── Auto-init ────────────────────────────────────────────────────────────────
  function init() {
    injectStyles();
    document.querySelectorAll('[data-campbook-tenant]').forEach(el => {
      new Widget(el, el.dataset.campbookTenant);
    });
    // Legacy support
    const legacy = document.getElementById('campbook-widget');
    if (legacy && legacy.dataset.tenant && !legacy.dataset.campbookTenant) {
      new Widget(legacy, legacy.dataset.tenant);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  window.CampBook = { Widget };
})();
