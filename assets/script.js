// !! تنظیمات مهم: قبل از انتشار، آیدی ربات تلگرام خود را اینجا جایگزین کنید !!
const TELEGRAM_BOT_USERNAME = "divaradsenderbot"; // بدون @ بنویسید

document.addEventListener("DOMContentLoaded", () => {
  const overlay = document.getElementById("wizardOverlay");
  const closeBtn = document.getElementById("wizardClose");
  const openTriggers = [
    document.getElementById("openWizardTop"),
    document.getElementById("openWizardHero"),
    ...document.querySelectorAll(".open-wizard"),
  ].filter(Boolean);

  const steps = Array.from(document.querySelectorAll(".wizard-step"));
  const dots = Array.from(document.querySelectorAll(".wp-dot"));
  let currentStep = 1;

  function showStep(n) {
    currentStep = n;
    steps.forEach((s) => s.classList.toggle("active", Number(s.dataset.step) === n));
    dots.forEach((d) => d.classList.toggle("active", Number(d.dataset.step) <= n));
  }

  function openWizard() {
    overlay.classList.add("open");
    showStep(1);
    document.body.style.overflow = "hidden";
  }

  function closeWizard() {
    overlay.classList.remove("open");
    document.body.style.overflow = "";
  }

  openTriggers.forEach((btn) => btn.addEventListener("click", openWizard));
  closeBtn.addEventListener("click", closeWizard);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeWizard();
  });

  document.querySelectorAll(".wizard-next").forEach((btn) => {
    btn.addEventListener("click", () => showStep(Math.min(currentStep + 1, steps.length)));
  });
  document.querySelectorAll(".wizard-back").forEach((btn) => {
    btn.addEventListener("click", () => showStep(Math.max(currentStep - 1, 1)));
  });

  document.getElementById("wizardSubmit").addEventListener("click", () => {
    const platforms = Array.from(document.querySelectorAll('.check-card input:checked'))
      .map((el) => el.value)
      .join("، ");
    const channelName = document.getElementById("channelName").value.trim();
    const adminUsername = document.getElementById("adminUsername").value.trim();
    const phone = document.getElementById("phone").value.trim();
    const plan = document.querySelector('input[name="plan"]:checked').value;

    // Encode a short payload for the Telegram bot's /start deep link.
    // The bot should parse this payload and forward it to the admin for approval.
    const payload = [channelName, adminUsername, phone, platforms, plan]
      .map((v) => (v || "-").replace(/[^a-zA-Z0-9آ-ی@۰-۹0-9 ]/g, ""))
      .join("_")
      .slice(0, 500);

    const url = `https://t.me/${TELEGRAM_BOT_USERNAME}?start=${encodeURIComponent(payload)}`;
    window.open(url, "_blank");
  });
});
