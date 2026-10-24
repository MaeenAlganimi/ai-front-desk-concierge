(function () {
  "use strict";
  if (window.__noorConcierge) return;
  window.__noorConcierge = true;
  var script = document.currentScript;
  var base = new URL(script ? script.src : "/widget.js", location.href).origin;
  var business = (script && script.dataset.business) || "noor";
  var key = "qudra-concierge:" + business;
  var state = { conversationId: "", phone: "", messages: [], pending: null };
  try {
    var saved = JSON.parse(localStorage.getItem(key) || "{}");
    if (saved && typeof saved === "object") {
      state.conversationId =
        typeof saved.conversationId === "string" ? saved.conversationId : "";
      state.phone = typeof saved.phone === "string" ? saved.phone : "";
      state.messages = Array.isArray(saved.messages)
        ? saved.messages.slice(-40)
        : [];
      state.pending =
        saved.pending && Array.isArray(saved.pending.calls)
          ? saved.pending
          : null;
    }
  } catch (_) {}
  var lang = document.documentElement.lang === "ar" ? "ar" : "en";
  var busy = false,
    queued = "",
    opener = null;
  function tr(en, ar) {
    return lang === "ar" ? ar : en;
  }
  function persist() {
    try {
      localStorage.setItem(key, JSON.stringify(state));
    } catch (_) {}
  }
  var host = document.createElement("div");
  host.id = "qudra-concierge";
  document.body.appendChild(host);
  var root = host.attachShadow({ mode: "open" });
  root.innerHTML =
    '<style>\n:host{all:initial;font-family:Inter,Arial,sans-serif;position:fixed;inset-inline-end:26px;bottom:24px;z-index:2147483000;color:#203f36;font-size:14px}*{box-sizing:border-box}button,input{font:inherit}button{cursor:pointer}button:disabled{opacity:.55;cursor:wait}button:focus-visible,input:focus-visible{outline:3px solid #b9d7c8;outline-offset:3px}.launcher{border:0;border-radius:40px;background:#204f40;color:#fff;padding:17px 23px;box-shadow:0 8px 35px #173b3438;display:flex;gap:11px;align-items:center;font-weight:600}.launcher svg{width:21px;height:21px}.online{width:7px;height:7px;background:#b8dfae;border-radius:100%;display:inline-block}.panel{width:390px;height:620px;max-height:calc(100dvh - 108px);max-width:calc(100vw - 28px);background:#fcfcf8;border-radius:20px;box-shadow:0 18px 80px #162f3440;overflow:hidden;display:flex;flex-direction:column;margin-bottom:14px;border:1px solid #d5e0d7}.panel[hidden]{display:none}.head{display:flex;align-items:center;gap:12px;padding:21px;background:#204f40;color:white}.mark{font-size:25px;letter-spacing:-2px;border:1px solid #ffffff35;border-radius:12px;width:42px;height:42px;display:grid;place-items:center}.head strong{font-size:15px;font-weight:600}.head p{font-size:11px;color:#d1e0d6;margin:5px 0 0}.head button{margin-inline-start:auto;background:transparent;color:white;border:0;padding:8px;font-size:18px}.intro{font-size:10px;text-align:center;padding:10px;color:#78867b;background:#eff2eb;letter-spacing:.2px}.messages{flex:1;overflow:auto;padding:20px 16px;overscroll-behavior:contain}.bubble{padding:12px 14px;border-radius:14px;line-height:1.7;font-size:13px;white-space:pre-wrap;overflow-wrap:anywhere;max-width:92%;margin-bottom:13px;background:#edf1e9;color:#29473c;width:fit-content}.bubble.user{background:#245844;color:white;margin-inline-start:auto;border-end-end-radius:4px}.bubble.assistant{border-end-start-radius:4px}.bubble.error{background:#fff0e8;color:#8f432e}.sender{font-size:9px;color:#8b958a;margin:2px 0 7px;letter-spacing:1px}.chips{display:flex;gap:6px;flex-wrap:wrap;padding:0 16px 14px}.chips button{border:1px solid #d8e1d5;border-radius:20px;padding:8px 11px;background:#fff;color:#3d5b4d;font-size:11px}.pending{background:#f0f4e8;border:1px solid #d5dfc9;border-radius:12px;padding:13px;margin:0 16px 14px}.pending p{font-size:12px;margin:0 0 10px;line-height:1.6}.pending div{display:flex;gap:8px}.pending button{border:0;border-radius:7px;padding:9px 15px;font-size:12px;background:#245844;color:#fff}.pending button.cancel{background:#e2e9db;color:#476044}.pending[hidden]{display:none}.form{padding:13px 16px;background:#fff;border-top:1px solid #e8ece3;display:flex;gap:8px;align-items:center}.form input{min-width:0;flex:1;border:1px solid #dbe3d7;border-radius:9px;padding:13px 11px;background:#fafbf7;color:#29473c;font-size:12px}.form button{border:0;border-radius:9px;background:#204f40;color:white;width:42px;height:42px;font-size:18px;display:grid;place-items:center}.form button svg{width:17px;height:17px}.powered{font-size:9px;text-align:center;background:#fff;color:#929a91;padding:0 10px 12px}.powered b{color:#52715d}.typing{font-size:12px;color:#7d8c7d;padding:0 18px 12px}.typing[hidden]{display:none}@media(max-width:480px){:host{inset-inline-end:14px;bottom:14px}.panel{height:calc(100dvh - 108px)}.launcher{padding:14px 18px}}\n</style><section class="panel" hidden role="dialog" aria-modal="false" aria-label="Noor concierge"><header class="head"><span class="mark">n</span><div><strong>Noor concierge</strong><p><span class="online"></span> <span class="head-status"></span></p></div><button class="close" aria-label="Close chat">×</button></header><div class="intro"></div><div class="messages" role="log" aria-live="polite" aria-relevant="additions"></div><div class="typing" hidden role="status"></div><div class="chips"></div><div class="pending" hidden><p></p><div><button class="confirm"></button><button class="cancel"></button></div></div><form class="form"><input autocomplete="tel" maxlength="4000" required/><button type="submit" aria-label="Send message"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg></button></form><div class="powered"></div></section><button class="launcher" aria-expanded="false"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z"/></svg><span></span><i class="online"></i></button>';
  var panel = root.querySelector(".panel"),
    launcher = root.querySelector(".launcher"),
    input = root.querySelector("input"),
    messages = root.querySelector(".messages"),
    pending = root.querySelector(".pending");
  function updateLabels() {
    panel.dir = lang === "ar" ? "rtl" : "ltr";
    launcher.querySelector("span").textContent = tr(
      "A little help?",
      "نساعدك؟",
    );
    launcher.setAttribute(
      "aria-label",
      tr("Open Noor concierge", "افتح مساعد نور"),
    );
    root.querySelector(".head-status").textContent = tr(
      "Here for your next little moment",
      "هنا من أجل لحظتك القادمة",
    );
    root.querySelector(".intro").textContent = tr(
      "FICTIONAL STUDIO · ALL TIMES UTC · CONFIRM BEFORE CHANGES",
      "استوديو خيالي · الأوقات UTC · كل تغيير يحتاج تأكيدك",
    );
    root.querySelector(".typing").textContent = tr(
      "Noor is working on it…",
      "نور يجهز طلبك…",
    );
    root.querySelector(".confirm").textContent = tr(
      "Confirm change",
      "تأكيد التغيير",
    );
    root.querySelector(".cancel").textContent = tr("Dismiss", "تجاهل");
    input.type = state.phone ? "text" : "tel";
    input.autocomplete = state.phone ? "off" : "tel";
    input.placeholder = state.phone
      ? tr("How can we help?", "كيف نساعدك؟")
      : tr("Your phone number, just once…", "رقم هاتفك، مرة واحدة…");
    input.setAttribute(
      "aria-label",
      state.phone
        ? tr("Your message", "رسالتك")
        : tr("Your phone number", "رقم الهاتف"),
    );
    root.querySelector(".powered").textContent = tr(
      "Powered by Qudra · Demo reminders do not send SMS",
      "بواسطة قدرة · التذكيرات تجريبية دون رسائل نصية",
    );
    renderChips();
  }
  function bubble(role, content, save) {
    if (save) {
      state.messages.push({ role: role, content: content });
      state.messages = state.messages.slice(-40);
      persist();
    }
    var node = document.createElement("div");
    node.className = "bubble " + role;
    node.dir = "auto";
    node.textContent = content;
    messages.appendChild(node);
    messages.scrollTop = messages.scrollHeight;
  }
  function renderChips() {
    var chips = root.querySelector(".chips");
    chips.textContent = "";
    if (state.pending || busy) return;
    [
      tr("Book a cleaning", "احجز تنظيف أسنان"),
      tr("Prices & services", "الأسعار والخدمات"),
      tr("Talk to the team", "التواصل مع الفريق"),
    ].forEach(function (text) {
      var b = document.createElement("button");
      b.type = "button";
      b.textContent = text;
      b.onclick = function () {
        if (!state.phone) {
          queued = text;
          bubble(
            "assistant",
            tr(
              "Before we start, what phone number should I use? It helps me find your appointments.",
              "قبل أن نبدأ، ما رقم هاتفك للعثور على مواعيدك؟",
            ),
            true,
          );
          input.focus();
        } else send(text, false);
      };
      chips.appendChild(b);
    });
  }
  function renderPending() {
    pending.hidden = !state.pending;
    pending.querySelector("p").textContent = state.pending
      ? state.pending.summary
      : "";
    renderChips();
  }
  function toggle(open) {
    panel.hidden = !open;
    launcher.setAttribute("aria-expanded", String(open));
    if (open) {
      opener = document.activeElement;
      if (!state.messages.length) {
        bubble(
          "assistant",
          state.phone
            ? tr(
                "Welcome to Noor. What would you like to arrange?",
                "أهلاً بك في نور. كيف أساعدك؟",
              )
            : tr(
                "A warm welcome to Noor. What phone number should I use for your appointments?",
                "أهلاً بك في نور. ما رقم هاتفك للعثور على مواعيدك؟",
              ),
          true,
        );
      }
      input.focus();
      messages.scrollTop = messages.scrollHeight;
    } else if (opener && opener.focus) opener.focus();
  }
  async function send(text, confirm) {
    if (busy) return;
    if (/[\u0600-\u06ff]/.test(text)) lang = "ar";
    busy = true;
    updateLabels();
    bubble("user", text, true);
    input.value = "";
    input.disabled = true;
    root.querySelector(".typing").hidden = false;
    root
      .querySelectorAll(".confirm,.cancel,.form button")
      .forEach(function (b) {
        b.disabled = true;
      });
    var controller = new AbortController();
    var timeout = setTimeout(function () {
      controller.abort();
    }, 60000);
    try {
      var payload = {
        message: text,
        customerPhone: state.phone,
        confirm: !!confirm,
      };
      if (state.conversationId) payload.conversationId = state.conversationId;
      var response = await fetch(base + "/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      if (response.status === 404 && state.conversationId) {
        state.conversationId = "";
        state.pending = null;
        persist();
        delete payload.conversationId;
        response = await fetch(base + "/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
      }
      var data = await response.json();
      if (!response.ok) throw new Error(data.error || "Request failed");
      state.conversationId = data.conversationId;
      state.pending = data.pendingAction || null;
      bubble("assistant", data.reply, true);
      persist();
    } catch (_) {
      bubble(
        "error",
        tr(
          "We couldn’t reach the studio. Please try again. Your last confirmed change is safe.",
          "تعذر الاتصال بالاستوديو. يرجى المحاولة مجدداً.",
        ),
        false,
      );
    } finally {
      clearTimeout(timeout);
      busy = false;
      input.disabled = false;
      root.querySelector(".typing").hidden = true;
      root
        .querySelectorAll(".confirm,.cancel,.form button")
        .forEach(function (b) {
          b.disabled = false;
        });
      renderPending();
      input.focus();
    }
  }
  root.querySelector("form").onsubmit = function (event) {
    event.preventDefault();
    var text = input.value.trim();
    if (!text || busy) return;
    if (!state.phone) {
      var phone = text.replace(/[\s()-]/g, "");
      if (!/^\+?\d{7,15}$/.test(phone)) {
        bubble(
          "error",
          tr(
            "Please enter a phone number with 7–15 digits.",
            "يرجى إدخال رقم هاتف من 7 إلى 15 رقماً.",
          ),
          false,
        );
        return;
      }
      state.phone = phone;
      persist();
      input.value = "";
      updateLabels();
      bubble(
        "assistant",
        tr(
          "Thank you. What would you like to arrange?",
          "شكراً لك. كيف أساعدك؟",
        ),
        true,
      );
      if (queued) {
        var q = queued;
        queued = "";
        send(q, false);
      }
      return;
    }
    send(text, false);
  };
  launcher.onclick = function () {
    toggle(panel.hidden);
  };
  root.querySelector(".close").onclick = function () {
    toggle(false);
  };
  root.querySelector(".confirm").onclick = function () {
    send(tr("Yes", "نعم"), true);
  };
  root.querySelector(".cancel").onclick = function () {
    send(tr("No", "لا"), false);
  };
  root.addEventListener("keydown", function (event) {
    if (event.key === "Escape") {
      toggle(false);
      launcher.focus();
    }
  });
  window.addEventListener("noor:open", function (event) {
    toggle(true);
    var text = event.detail && event.detail.message;
    if (text) {
      if (state.phone) send(text, false);
      else queued = text;
    }
  });
  window.addEventListener("noor:language", function (event) {
    lang = event.detail === "ar" ? "ar" : "en";
    updateLabels();
  });
  state.messages.forEach(function (m) {
    if (m && typeof m.content === "string")
      bubble(m.role === "user" ? "user" : "assistant", m.content, false);
  });
  updateLabels();
  renderPending();
})();
