document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll(".code-block .copy-button").forEach((button) => {
    button.addEventListener("click", async () => {
      const code = button.parentElement.querySelector("code");
      if (!code) return;
      try {
        await navigator.clipboard.writeText(code.textContent);
        const old = button.textContent;
        button.textContent = "COPIED!";
        window.setTimeout(() => {
          button.textContent = old;
        }, 900);
      } catch {
        button.textContent = "FAILED";
        window.setTimeout(() => {
          button.textContent = "copy";
        }, 900);
      }
    });
  });
});
