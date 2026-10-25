/* PayeeGuard badge: drop-in for any website. Shows whether the payee wallet on the page is safe to pay.
 *   <div data-payeeguard data-payee="Saigon Coffee Co." data-address="<wallet>" data-amount="0.05"></div>
 *   <script src="https://YOUR-PAYEEGUARD-URL/payeeguard.js" async></script>
 */
(function () {
  var script = document.currentScript;
  var origin = script && script.src ? new URL(script.src).origin : window.location.origin;
  var STYLE = {
    PAY: ["#eaf7f0", "#0b7a51", "✓ Verified payee"],
    HOLD: ["#fff6e2", "#8a5a00", "⏸ Unverified payee: confirm before paying"],
    BLOCK: ["#fdedea", "#c2361f", "⛔ Possible fraud: do not pay"],
  };
  function render(el) {
    var body = {
      payeeName: el.getAttribute("data-payee") || undefined,
      address: el.getAttribute("data-address") || "",
      amountUsdc: Number(el.getAttribute("data-amount") || "0.01"),
      messageText: el.getAttribute("data-context") || undefined,
    };
    el.textContent = "🛡 PayeeGuard: checking payee…";
    el.style.cssText = "display:inline-flex;gap:8px;align-items:center;font:600 13px system-ui,sans-serif;padding:8px 12px;border-radius:4px;border:1px solid #161616;background:#fff;color:#161616";
    fetch(origin + "/api/guard/check", { method: "POST", headers: { "content-type": "application/json", "x-payeeguard-source": "plugin" }, body: JSON.stringify(body) })
      .then(function (r) { return r.json(); })
      .then(function (res) {
        var s = STYLE[res.verdict];
        if (!s) throw new Error((res.error && res.error.message) || "check failed");
        el.style.background = s[0];
        el.style.color = s[1];
        el.style.borderColor = s[1];
        el.innerHTML = "";
        var a = document.createElement("a");
        a.href = res.receipt ? res.receipt.url : origin;
        a.target = "_blank";
        a.rel = "noopener";
        a.style.color = "inherit";
        a.textContent = "🛡 PayeeGuard · " + s[2] + " · risk " + res.score + "/100";
        el.appendChild(a);
      })
      .catch(function (e) { el.textContent = "🛡 PayeeGuard unavailable: " + e.message; });
  }
  function run() { Array.prototype.forEach.call(document.querySelectorAll("[data-payeeguard]"), render); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", run); else run();
})();
