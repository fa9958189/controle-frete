// Utilidades de parsing (robustas para formatos com "Km", vírgulas, etc.)
function toNumber(txt = "") {
  const n = String(txt).replace(/\./g, '').replace(',', '.').match(/[\d.]+/g);
  return n ? parseFloat(n.join('')) : 0;
}
function extractPlaca(dispositivoTxt = "") {
  // tenta placa Mercosul (7 chars alfanuméricos). Mantemos simples e prático.
  const m = String(dispositivoTxt).toUpperCase().match(/[A-Z0-9]{7}/);
  return m ? m[0] : "—";
}
function textOfCellRow(doc, label) {
  const ths = [...doc.querySelectorAll('th')];
  const th = ths.find(t => t.textContent.trim().toLowerCase() === label.toLowerCase());
  return th ? (th.nextElementSibling?.textContent?.trim() || "") : "";
}
function getByLabelContains(doc, labelStart) {
  // caso o HTML venha com rótulos como "Distância do percurso:", "Odômetro:" etc.
  const ths = [...doc.querySelectorAll('th')];
  const th = ths.find(t => t.textContent.trim().toLowerCase().startsWith(labelStart.toLowerCase()));
  return th ? (th.nextElementSibling?.textContent?.trim() || "") : "";
}

// Lê um arquivo .html e retorna um objeto com os dados
async function parseHtmlFile(file) {
  const text = await file.text();
  const parser = new DOMParser();
  const doc = parser.parseFromString(text, "text/html");

  // Campos presentes no seu relatório de exemplo (GPSG1): "Dispositivo", "Distância do percurso", "Odômetro", "Início da rota", "Final da rota"
  const dispositivo = textOfCellRow(doc, "Dispositivo:") || getByLabelContains(doc, "Dispositivo");
  const placa = extractPlaca(dispositivo);
  const distanciaTxt = getByLabelContains(doc, "Distância do percurso");
  const kmPercurso = toNumber(distanciaTxt); // ex.: "1354.47 Km" -> 1354.47
  const odometroTxt = getByLabelContains(doc, "Odômetro");
  const odometro = toNumber(odometroTxt);
  const inicio = getByLabelContains(doc, "Início da rota") || getByLabelContains(doc, "Início");
  const fim = getByLabelContains(doc, "Final da rota") || getByLabelContains(doc, "Final");

  return { placa, dispositivo, kmPercurso, inicio, fim, odometro };
}

// Estado
let registros = [];
let chart;

// Renderização
function renderTabela() {
  const tbody = document.querySelector("#tabela tbody");
  tbody.innerHTML = "";
  for (const r of registros) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${r.placa}</td>
      <td>${r.dispositivo}</td>
      <td>${r.kmPercurso.toFixed(2)} km</td>
      <td>${r.inicio || "—"} → ${r.fim || "—"}</td>
      <td>${r.odometro ? r.odometro.toLocaleString('pt-BR') : "—"}</td>
    `;
    tbody.appendChild(tr);
  }
}
function renderCards() {
  const totalKm = registros.reduce((s, r) => s + (r.kmPercurso || 0), 0);
  const placas = new Set(registros.map(r => r.placa));
  document.getElementById("totalKm").textContent = `${totalKm.toFixed(2)} km`;
  document.getElementById("totalPlacas").textContent = String(placas.size);
  document.getElementById("odometro").textContent =
    registros.length ? (registros.at(-1).odometro?.toLocaleString('pt-BR') || "—") : "—";
}
function renderGrafico() {
  // agrega por placa
  const porPlaca = {};
  for (const r of registros) {
    porPlaca[r.placa] = (porPlaca[r.placa] || 0) + (r.kmPercurso || 0);
  }
  const labels = Object.keys(porPlaca);
  const data = Object.values(porPlaca).map(v => Number(v.toFixed(2)));

  const ctx = document.getElementById("kmChart");
  if (chart) chart.destroy();
  chart = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [{ label: "KM rodado", data }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: true }
      },
      scales: {
        y: { beginAtZero: true, ticks: { callback: v => v + " km" } }
      }
    }
  });
}

function renderTudo() {
  renderTabela();
  renderCards();
  renderGrafico();
}

// Input de arquivos
document.getElementById("fileInput").addEventListener("change", async (ev) => {
  const files = [...ev.target.files];
  if (!files.length) return;

  const lidos = [];
  for (const f of files) {
    try {
      const dados = await parseHtmlFile(f);
      lidos.push(dados);
    } catch (e) {
      console.error("Erro lendo", f.name, e);
    }
  }
  // junta com os já existentes, permitindo importar em lotes
  registros = registros.concat(lidos).filter(r => r.kmPercurso || r.dispositivo);
  renderTudo();
});
