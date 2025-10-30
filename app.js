// ========= UTILITÁRIAS ==========
function toNumber(txt = "") {
  const n = String(txt).replace(/\./g, '').replace(',', '.').match(/[\d.]+/g);
  return n ? parseFloat(n.join('')) : 0;
}
function extractPlaca(dispositivoTxt = "") {
  const m = String(dispositivoTxt).toUpperCase().match(/[A-Z0-9]{7}/);
  return m ? m[0] : "—";
}
function textOfCellRow(doc, label) {
  const ths = [...doc.querySelectorAll('th')];
  const th = ths.find(t => t.textContent.trim().toLowerCase() === label.toLowerCase());
  return th ? (th.nextElementSibling?.textContent?.trim() || "") : "";
}
function getByLabelContains(doc, labelStart) {
  const ths = [...doc.querySelectorAll('th')];
  const th = ths.find(t => t.textContent.trim().toLowerCase().startsWith(labelStart.toLowerCase()));
  return th ? (th.nextElementSibling?.textContent?.trim() || "") : "";
}

// ========= BANCO LOCAL ==========
const STORAGE_KEY = "controleFrete_viagens";

function carregarStorage() {
  return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
}
function salvarStorage(dados) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(dados));
}
function adicionarViagens(novas) {
  const atual = carregarStorage();
  for (const item of novas) {
    if (!item.placa) continue;
    atual[item.placa] = atual[item.placa] || [];
    atual[item.placa].push(item);
  }
  salvarStorage(atual);
  return atual;
}
function excluirViagem(placa, indexViagem) {
  const db = carregarStorage();
  if (!db[placa]) return false;
  if (indexViagem < 0 || indexViagem >= db[placa].length) return false;
  db[placa].splice(indexViagem, 1);
  if (!db[placa].length) delete db[placa];
  salvarStorage(db);
  return true;
}
function limparTudo() {
  localStorage.removeItem(STORAGE_KEY);
}

// ========= PARSER HTML ==========
async function parseHtmlFile(file) {
  const text = await file.text();
  const parser = new DOMParser();
  const doc = parser.parseFromString(text, "text/html");

  const dispositivo = textOfCellRow(doc, "Dispositivo:") || getByLabelContains(doc, "Dispositivo");
  const placa = extractPlaca(dispositivo);
  const distanciaTxt = getByLabelContains(doc, "Distância do percurso");
  const kmPercurso = toNumber(distanciaTxt);
  const odometroTxt = getByLabelContains(doc, "Odômetro"); // guardo se precisar futuramente
  const odometro = toNumber(odometroTxt);
  const inicio = getByLabelContains(doc, "Início da rota") || getByLabelContains(doc, "Início");
  const fim = getByLabelContains(doc, "Final da rota") || getByLabelContains(doc, "Final");

  return { placa, dispositivo, kmPercurso, inicio, fim, odometro, dataUpload: new Date().toISOString() };
}

// ========= ESTADO E RENDER ==========
let registros = [];              // o que está sendo mostrado na tela (pode ser filtrado)
let chart;
const placaSelect = document.getElementById("placaSelect");
const viagemSelect = document.getElementById("viagemSelect");
const statusInfo = document.getElementById("statusInfo");

function getTodosRegistros() {
  const db = carregarStorage();
  const out = [];
  Object.keys(db).forEach(placa => {
    db[placa].forEach((v, i) => out.push({ ...v, numero: i + 1 }));
  });
  return out;
}

function popularSelectPlacas() {
  const db = carregarStorage();
  const placas = Object.keys(db);
  placaSelect.innerHTML = "";
  if (!placas.length) {
    placaSelect.innerHTML = `<option value="">—</option>`;
    viagemSelect.innerHTML = `<option value="">—</option>`;
    return;
  }
  placas.forEach(p => {
    const opt = document.createElement("option");
    opt.value = p;
    opt.textContent = p;
    placaSelect.appendChild(opt);
  });
  popularSelectViagens();
}

function popularSelectViagens() {
  const placa = placaSelect.value;
  const db = carregarStorage();
  viagemSelect.innerHTML = "";
  if (!placa || !db[placa] || !db[placa].length) {
    viagemSelect.innerHTML = `<option value="">—</option>`;
    return;
  }
  db[placa].forEach((_, idx) => {
    const opt = document.createElement("option");
    opt.value = String(idx); // index
    opt.textContent = `Viagem ${idx + 1}`;
    viagemSelect.appendChild(opt);
  });
}

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
      <td>${r.kmPercurso.toFixed(2)} km</td> <!-- coluna TROCADA: antes mostrava odômetro -->
      <td>Viagem ${r.numero || "—"}</td>
    `;
    tbody.appendChild(tr);
  }
}

function renderCards() {
  const totalKm = registros.reduce((s, r) => s + (r.kmPercurso || 0), 0);
  const placas = new Set(registros.map(r => r.placa));
  document.getElementById("totalKm").textContent = `${totalKm.toFixed(2)} km`;
  document.getElementById("totalPlacas").textContent = String(placas.size);

  // mantém o card "Odômetro (último arquivo)" como estava: mostra último odômetro se existir
  const ultimoComOdo = [...registros].reverse().find(r => r.odometro);
  document.getElementById("odometro").textContent = ultimoComOdo
    ? ultimoComOdo.odometro.toLocaleString('pt-BR')
    : "—";
}

function renderGrafico() {
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
    data: { labels, datasets: [{ label: "KM rodado", data }] },
    options: { responsive: true, scales: { y: { beginAtZero: true } } }
  });
}

function renderTudo(placasDoUltimoRelatorio = null) {
  // Carrega tudo do storage e monta a visão atual
  registros = getTodosRegistros();
  renderTabela();
  renderGrafico();

  // --- Total de Placas ---
  if (placasDoUltimoRelatorio && placasDoUltimoRelatorio.length) {
    // mostra a quantidade de placas únicas do LOTE recém-importado
    document.getElementById("totalPlacas").textContent = String(placasDoUltimoRelatorio.length);
  } else {
    // fallback: conta placas únicas do que está salvo no sistema
    const placas = new Set(registros.map(r => r.placa));
    document.getElementById("totalPlacas").textContent = String(placas.size);
  }

  // --- Total KM Rodado (do que está visível/salvo) ---
  const totalKm = registros.reduce((s, r) => s + (r.kmPercurso || 0), 0);
  document.getElementById("totalKm").textContent = `${totalKm.toFixed(2)} km`;

  // --- Odômetro (último arquivo que tiver odômetro) ---
  const ultimoComOdo = [...registros].reverse().find(r => r.odometro);
  document.getElementById("odometro").textContent = ultimoComOdo
    ? ultimoComOdo.odometro.toLocaleString('pt-BR')
    : "—";

  // --- Mensagem de status + selects ---
  const db = carregarStorage();
  const temDados = Object.keys(db).length > 0;
  statusInfo.textContent = temDados
    ? "Selecione Placa e Viagem para carregar ou excluir. Você também pode importar novos relatórios."
    : "Nenhuma viagem salva ainda.";
  popularSelectPlacas();
}


// ========= EVENTOS ==========
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

  // salva no storage
  adicionarViagens(lidos);

  // placas únicas do RELATÓRIO recém-importado
  const placasDoRelatorio = [...new Set(lidos.map(v => v.placa).filter(Boolean))];

  // re-render com foco no lote atual (total de placas = do relatório)
  renderTudo(placasDoRelatorio);
});


// Filtro dinâmico de viagens
placaSelect?.addEventListener("change", () => {
  popularSelectViagens();
});

// Botão: Carregar viagem (filtra a tela para mostrar APENAS aquela viagem)
document.getElementById("btnCarregar")?.addEventListener("click", () => {
  const placa = placaSelect.value;
  const idx = Number(viagemSelect.value);
  const db = carregarStorage();

  if (!placa || !db[placa] || Number.isNaN(idx)) {
    statusInfo.textContent = "Selecione uma placa e uma viagem válidas.";
    return;
  }
  const v = db[placa][idx];
  if (!v) {
    statusInfo.textContent = "Viagem não encontrada.";
    return;
  }
  registros = [{ ...v, numero: idx + 1 }];
  renderTabela();
  renderCards();
  renderGrafico();
  statusInfo.textContent = `Exibindo ${placa} – Viagem ${idx + 1}.`;
});

// Botão: Excluir viagem
document.getElementById("btnExcluir")?.addEventListener("click", () => {
  const placa = placaSelect.value;
  const idx = Number(viagemSelect.value);
  if (!placa || Number.isNaN(idx)) {
    statusInfo.textContent = "Selecione placa e viagem para excluir.";
    return;
  }
  const ok = excluirViagem(placa, idx);
  if (ok) {
    statusInfo.textContent = `Viagem ${idx + 1} da placa ${placa} excluída.`;
    renderTudo();
  } else {
    statusInfo.textContent = "Não foi possível excluir. Verifique a seleção.";
  }
});

// Botão: Limpar TUDO
document.getElementById("btnLimpar")?.addEventListener("click", () => {
  if (!confirm("Tem certeza que deseja apagar TUDO?")) return;
  limparTudo();
  renderTudo();
  statusInfo.textContent = "Histórico totalmente limpo.";
});

// inicializa
renderTudo();
