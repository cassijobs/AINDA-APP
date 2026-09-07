const $ = seletor => document.querySelector(seletor);
const esperar = tempo => new Promise(resolve => setTimeout(resolve, tempo));
const aguardarPintura = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
const CHAVE_SESSAO = "ainda_sessao_usuario";
const CHAVE_CODIGO = "ainda_ultimo_codigo";
const parametrosUrl = new URLSearchParams(location.search);
const modoPreview = parametrosUrl.get("preview") === "motivo";
const origemEntrada = parametrosUrl.get("origem") === "pingente" ? "pingente" : "caneca";
let modoCadastro = false;
let sessaoAtual = null;

function configuracaoSupabase() {
  const config = window.AINDA_CONFIG || {};
  return { url: String(config.supabaseUrl || "").replace(/\/$/, ""), chave: String(config.supabasePublishableKey || "") };
}

async function lerResposta(resposta) {
  const dados = await resposta.json().catch(() => ({}));
  if (!resposta.ok) throw new Error(dados.message || dados.error_description || dados.msg || "Não foi possível continuar.");
  return dados;
}

function guardarSessao(sessao) {
  sessaoAtual = sessao;
  localStorage.setItem(CHAVE_SESSAO, JSON.stringify({ access_token: sessao.access_token, refresh_token: sessao.refresh_token, expires_at: sessao.expires_at || Math.floor(Date.now() / 1000) + (sessao.expires_in || 3600) }));
}

function recuperarSessao() { try { return JSON.parse(localStorage.getItem(CHAVE_SESSAO)); } catch { return null; } }

async function renovarSessao() {
  const armazenada = recuperarSessao();
  if (!armazenada?.refresh_token) throw new Error("Entre novamente para continuar.");
  const { url, chave } = configuracaoSupabase();
  const resposta = await fetch(`${url}/auth/v1/token?grant_type=refresh_token`, { method: "POST", headers: { apikey: chave, "Content-Type": "application/json" }, body: JSON.stringify({ refresh_token: armazenada.refresh_token }) });
  const dados = await lerResposta(resposta); guardarSessao(dados); return dados.access_token;
}

async function chamarRpc(nome, corpo, repetir = true) {
  const { url, chave } = configuracaoSupabase();
  let token = sessaoAtual?.access_token || recuperarSessao()?.access_token;
  if (!token) throw new Error("Entre na sua conta para continuar.");
  const enviar = valor => fetch(`${url}/rest/v1/rpc/${nome}`, { method: "POST", headers: { apikey: chave, Authorization: `Bearer ${valor}`, "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
  let resposta = await enviar(token);
  if (resposta.status === 401 && repetir) { token = await renovarSessao(); resposta = await enviar(token); }
  return lerResposta(resposta);
}

function mostrarTela(id) {
  ["telaAcesso", "telaAtivacao", "telaEncontro"].forEach(tela => { $(`#${tela}`).hidden = tela !== id; });
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function codigoDaEntrada() { return (parametrosUrl.get("codigo") || localStorage.getItem(CHAVE_CODIGO) || "").trim().toUpperCase(); }

const ETAPAS = {
  encontro: { etiqueta: "PRIMEIRO MOMENTO — PERCEBER", chamadas: ["Hoje pode começar de um jeito mais leve.", "Há algo pequeno para perceber hoje.", "Este momento pode ser um começo."], continuidades: ["Seu pingente será companhia e apoio ao longo da sua jornada.", "Leve esta ideia com você e volte quando fizer sentido.", "Deixe este encontro acompanhar um pedaço do seu dia."] },
  reencontro: { etiqueta: "SEGUNDO MOMENTO — APROFUNDAR", chamadas: ["Que bom reencontrar você.", "Uma pausa para olhar um pouco mais de perto.", "Talvez esta ideia tenha algo mais para mostrar."], continuidades: ["Não tenha pressa para continuar. Deixe esta ideia encontrar espaço durante o seu dia.", "Fique com o que fizer sentido para você agora.", "Você pode deixar esta reflexão amadurecer no seu tempo."] },
  gesto: { etiqueta: "TERCEIRO MOMENTO — EXPERIMENTAR", chamadas: ["Uma pequena possibilidade para hoje.", "Um gesto simples pode dar vida a esta ideia.", "Você pode experimentar no seu ritmo."], continuidades: ["Viva este gesto no seu tempo. Quando voltar, uma ponte para amanhã espera por você.", "Faça apenas o que couber no seu dia.", "Não precisa ser perfeito. Um pequeno gesto já tem seu lugar."] },
  amanha: { etiqueta: "QUARTO MOMENTO — CONTINUAR", chamadas: ["Hoje pode transformar seu amanhã.", "Algo de hoje pode seguir com você.", "Amanhã pode abrir outra possibilidade."], continuidades: ["Por hoje, basta. Permita-se descansar.", "Guarde o que fez sentido e descanse no seu tempo.", "Você pode encerrar por aqui e voltar amanhã."] }
};

function mensagensDoEncontro(dados) {
  const etapa = ETAPAS[dados.etapa];
  const valor = Number(dados.motivo_atual);
  const dia = Number.isInteger(valor) && valor > 0 ? valor - 1 : 0;
  const indiceEtapa = Object.keys(ETAPAS).indexOf(dados.etapa);
  let chamada = etapa.chamadas[dia % etapa.chamadas.length];
  const continuidade = etapa.continuidades[dia % etapa.continuidades.length];
  const nome = typeof dados.nome_preferido === "string" ? dados.nome_preferido.trim() : "";
  // Uma única etapa a cada dois motivos; estável ao recarregar a página.
  if (nome && !dados.ativado_agora && dia % 2 === 1 && indiceEtapa === Math.floor(dia / 2) % 4) {
    chamada = nome + ", " + chamada.charAt(0).toLocaleLowerCase("pt-BR") + chamada.slice(1);
  }
  const progresso = dados.ativado_agora
    ? (nome ? nome + ", este é o seu primeiro encontro." : "Este é o seu primeiro encontro.")
    : dados.liberado_agora ? "Um novo motivo foi revelado para você hoje." : "Este é o seu motivo de hoje. Cada etapa acompanha o mesmo dia.";
  return { chamada, continuidade, progresso };
}

function preencherEncontro(dados) {
  if (!dados || !Object.hasOwn(ETAPAS, dados.etapa)) throw new Error("Não foi possível reconhecer a etapa do encontro. Tente novamente mais tarde.");
  const etapa = ETAPAS[dados.etapa];
  const mensagens = mensagensDoEncontro(dados);
  const numero = String(dados.motivo_atual || 1).padStart(2, "0");
  $("#numeroDia").textContent = numero; $("#numeroMotivo").textContent = numero;
  $("#barraProgresso").style.width = `${Math.min(100, Math.max(.274, (Number(dados.motivo_atual || 1) / 365) * 100))}%`;
  $("#etiquetaEtapa").textContent = etapa.etiqueta;
  $("#chamadaEncontro").textContent = mensagens.chamada;
  $("#tituloMotivo").textContent = dados.titulo || "Seu motivo de hoje";
  const disponivel = typeof dados.texto_encontro === "string" && dados.texto_encontro.trim().length > 0;
  $("#textoMotivo").textContent = disponivel ? dados.texto_encontro : "O conteúdo deste encontro ainda não está disponível. Volte mais tarde.";
  $("#textoContinuidade").textContent = disponivel ? mensagens.continuidade : "";
  $("#textoProgresso").textContent = mensagens.progresso;
  mostrarTela("telaEncontro");
}

async function abrirEncontro(codigo, ativacao = {}) {
  const dados = await chamarRpc("ainda_abrir_encontro_em_etapas", { p_codigo: codigo, p_origem: origemEntrada });
  const encontro = Array.isArray(dados) ? dados[0] : dados;
  if (!encontro?.codigo) throw new Error("Não foi possível carregar o encontro. Tente novamente mais tarde.");
  preencherEncontro({ ...encontro, ativado_agora: ativacao.ativado_agora });
  localStorage.setItem(CHAVE_CODIGO, encontro.codigo);
}
async function depoisDoLogin() {
  const codigo = codigoDaEntrada();
  if (codigo) {
    return abrirEncontro(codigo);
  }
  $("#codigoConjunto").value = codigo; mostrarTela("telaAtivacao");
}

function colorirDesenho(canvas, caminho, cor) {
  return new Promise((resolve, reject) => { const imagem = new Image(); imagem.onload = () => { canvas.width = imagem.naturalWidth; canvas.height = imagem.naturalHeight; const contexto = canvas.getContext("2d", { willReadFrequently: true }); contexto.drawImage(imagem, 0, 0); const quadro = contexto.getImageData(0, 0, canvas.width, canvas.height), [r, g, b] = cor; for (let i = 0; i < quadro.data.length; i += 4) { const luminosidade = (quadro.data[i] + quadro.data[i + 1] + quadro.data[i + 2]) / 3, tinta = Math.max(0, 255 - luminosidade); quadro.data[i] = r; quadro.data[i + 1] = g; quadro.data[i + 2] = b; quadro.data[i + 3] = Math.round(tinta * (quadro.data[i + 3] / 255)); } contexto.putImageData(quadro, 0, 0); resolve(); }; imagem.onerror = reject; imagem.src = caminho; });
}

async function executarAbertura() {
  const abertura = $("#abertura"), primeira = $("#cenaAinda"), segunda = $("#cenaFrase"); let pulada = false;
  const encerrar = () => { pulada = true; abertura.classList.add("encerrada"); };
  $("#pularAbertura").addEventListener("click", encerrar, { once: true });
  try { await Promise.all([colorirDesenho($("#imagemAinda"), "./assets/abertura-ainda.png", [112, 93, 190]), colorirDesenho($("#imagemFrase"), "./assets/abertura-frase.png", [239, 126, 105])]); await aguardarPintura(); primeira.classList.add("visivel"); await esperar(4000); if (pulada) return; primeira.classList.add("saindo"); await esperar(1800); if (pulada) return; primeira.classList.remove("visivel"); segunda.classList.add("visivel"); await esperar(8000); if (pulada) return; segunda.classList.add("saindo"); await esperar(1800); encerrar(); } catch { encerrar(); }
}

$("#criarConta").addEventListener("click", () => {
  modoCadastro = !modoCadastro;
  $("#tituloAcesso").textContent = modoCadastro ? "Vamos criar seu começo." : "Que bom ter você aqui.";
  $("#textoAcesso").textContent = modoCadastro ? "Crie sua conta para proteger sua caminhada." : "Use a conta vinculada à sua caneca e ao seu pingente.";
  $("#enviarAcesso").textContent = modoCadastro ? "Criar minha conta" : "Continuar";
  $("#criarConta").textContent = modoCadastro ? "Já tenho uma conta" : "É meu primeiro acesso";
  $("#reenviarConfirmacao").hidden = true;
  $("#mensagem").textContent = "";
});

$("#formAcesso").addEventListener("submit", async evento => {
  evento.preventDefault(); const mensagem = $("#mensagem"), botao = $("#enviarAcesso"), { url, chave } = configuracaoSupabase();
  if (!url.startsWith("https://") || !chave) return mensagem.textContent = "O aplicativo ainda não foi configurado.";
  mensagem.textContent = modoCadastro ? "Criando sua conta…" : "Entrando…"; botao.disabled = true;
  try { const destino = modoCadastro ? `${url}/auth/v1/signup` : `${url}/auth/v1/token?grant_type=password`; const resposta = await fetch(destino, { method: "POST", headers: { apikey: chave, "Content-Type": "application/json" }, body: JSON.stringify({ email: $("#email").value.trim(), password: $("#senha").value }) }); const dados = await lerResposta(resposta); if (!dados.access_token) { mensagem.textContent = "Conta criada. Confirme o e-mail recebido e depois volte para entrar."; $("#reenviarConfirmacao").hidden = false; return; } guardarSessao(dados); await depoisDoLogin(); } catch (erro) { mensagem.textContent = erro.message; } finally { botao.disabled = false; }
});

$("#reenviarConfirmacao").addEventListener("click", async () => {
  const botao = $("#reenviarConfirmacao"), mensagem = $("#mensagem"), email = $("#email").value.trim(), { url, chave } = configuracaoSupabase();
  if (!email) { mensagem.textContent = "Digite o e-mail usado no cadastro."; $("#email").focus(); return; }
  botao.disabled = true; mensagem.textContent = "Reenviando a confirmação…";
  try {
    const resposta = await fetch(`${url}/auth/v1/resend`, { method: "POST", headers: { apikey: chave, "Content-Type": "application/json" }, body: JSON.stringify({ type: "signup", email }) });
    await lerResposta(resposta); mensagem.textContent = "E-mail reenviado. Confira também as pastas Spam e Lixo eletrônico.";
    let segundos = 30; botao.textContent = `Reenviar novamente em ${segundos}s`;
    const intervalo = setInterval(() => { segundos -= 1; if (segundos <= 0) { clearInterval(intervalo); botao.disabled = false; botao.textContent = "Reenviar e-mail de confirmação"; } else botao.textContent = `Reenviar novamente em ${segundos}s`; }, 1000);
  } catch (erro) { mensagem.textContent = erro.message; botao.disabled = false; }
});

$("#codigoConjunto").addEventListener("input", evento => { evento.target.value = evento.target.value.toUpperCase(); });
$("#chaveConjunto").addEventListener("input", evento => { evento.target.value = evento.target.value.toUpperCase(); });

$("#formAtivacao").addEventListener("submit", async evento => {
  evento.preventDefault(); const mensagem = $("#mensagemAtivacao"), botao = $("#ativarConjunto"); mensagem.textContent = "Reconhecendo seu conjunto…"; botao.disabled = true;
  try { const codigo = $("#codigoConjunto").value.trim().toUpperCase(); const dados = await chamarRpc("ainda_ativar_conjunto", { p_codigo: codigo, p_chave: $("#chaveConjunto").value.trim().toUpperCase(), p_nome_preferido: $("#nomePreferido").value.trim() }); const ativacao = Array.isArray(dados) ? dados[0] : dados; if (!ativacao?.codigo) throw new Error("Não foi possível confirmar o conjunto."); localStorage.setItem(CHAVE_CODIGO, ativacao.codigo); await abrirEncontro(ativacao.codigo, ativacao); } catch (erro) { mensagem.textContent = erro.message; } finally { botao.disabled = false; }
});


async function iniciar() {
  executarAbertura();
  if (modoPreview) return preencherEncontro({ etapa: Object.hasOwn(ETAPAS, parametrosUrl.get("etapa")) ? parametrosUrl.get("etapa") : "encontro", titulo: "Prévia do encontro", texto_encontro: "Este texto demonstra a apresentação da etapa. O conteúdo do seu motivo será carregado ao entrar na sua conta." });
  sessaoAtual = recuperarSessao();
  if (!sessaoAtual?.access_token) return mostrarTela("telaAcesso");
  try { await depoisDoLogin(); } catch { localStorage.removeItem(CHAVE_SESSAO); sessaoAtual = null; mostrarTela("telaAcesso"); }
}

iniciar();
