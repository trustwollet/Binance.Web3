import "./styles.css";

const app = document.querySelector("#app");
if (app) {
  app.innerHTML = `
    <div class="container">
      <h1>USDT Transfer</h1>
      <p class="subtitle">Send USDT on TRON (TRC-20)</p>
      <div id="connect-view"></div>
    </div>
  `;
}
