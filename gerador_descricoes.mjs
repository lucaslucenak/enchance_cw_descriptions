import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { construirPromptDescricao } from './prompt_template.mjs';

dotenv.config();

// ==========================================
// CONFIGURAÇÕES E CREDENCIAIS
// ==========================================
const CARDAPIO_WEB_BASE = 'https://api.cardapioweb.com/api/v1';
const COMPANY_ID = process.env.CARDAPIO_WEB_COMPANY_ID || '61766';
const CW_TOKEN = process.argv[2] || process.env.CARDAPIO_WEB_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const ARQUIVO_PROCESSADOS = path.resolve('produtos_processados.json');

if (!CW_TOKEN) {
  console.error('\n❌ Erro: Informe o token do Cardápio Web!');
  console.log('Execute: node gerador_descricoes.mjs "SEU_TOKEN_AQUI"\n');
  process.exit(1);
}

if (!GEMINI_API_KEY) {
  console.error('\n❌ Erro: Configure GEMINI_API_KEY no arquivo .env.');
  process.exit(1);
}

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const headersCW = {
  'accept': 'application/json, text/plain, */*',
  'authorization': CW_TOKEN.trim(),
  'companyid': String(COMPANY_ID),
  'origin': 'https://portal.cardapioweb.com',
  'referer': 'https://portal.cardapioweb.com/',
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
};

// ==========================================
// 1. GERENCIAMENTO DO HISTÓRICO DE PROCESSADOS
// ==========================================
function carregarProdutosProcessados() {
  if (!fs.existsSync(ARQUIVO_PROCESSADOS)) {
    return {};
  }
  try {
    const raw = fs.readFileSync(ARQUIVO_PROCESSADOS, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function salvarProdutoProcessado(mapa, item, novaDescricao) {
  mapa[String(item.id)] = {
    id: item.id,
    name: item.name,
    category_id: item.category_id,
    custom_code: item.custom_code || item.pdv_code || null,
    atualizado_em: new Date().toISOString()
  };

  fs.writeFileSync(ARQUIVO_PROCESSADOS, JSON.stringify(mapa, null, 2), 'utf-8');
}

// ==========================================
// 2. GERAÇÃO DE DESCRIÇÃO COM IA (BAIXO CUSTO)
// ==========================================
async function gerarDescricaoPadronizada(nomeProduto, nomeCategoria, descricaoAtual) {
  const prompt = construirPromptDescricao(nomeProduto, nomeCategoria, descricaoAtual);
  const modelosEconomicos = ['gemini-flash-lite-latest', 'gemini-2.5-flash-lite', 'gemini-2.5-flash'];

  for (const nomeModelo of modelosEconomicos) {
    try {
      const model = genAI.getGenerativeModel({
        model: nomeModelo,
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 250
        }
      });

      const result = await model.generateContent(prompt);
      const response = await result.response;
      return response.text().trim();
    } catch (err) {
      if (err.message.includes('404') || err.message.includes('not found')) {
        continue;
      }
      throw new Error(`Falha no Gemini (${nomeModelo}): ${err.message}`);
    }
  }

  throw new Error('Nenhum dos modelos econômicos respondeu.');
}

// ==========================================
// 3. ATUALIZAÇÃO NO CARDÁPIO WEB VIA MULTIPART
// ==========================================
async function salvarDescricaoNoCW(itemCompleto, novaDescricao) {
  const url = `${CARDAPIO_WEB_BASE}/company/category/${itemCompleto.category_id}/items/${itemCompleto.id}`;

  const formData = new FormData();
  formData.append('category_id', String(itemCompleto.category_id));
  formData.append('name', String(itemCompleto.name));
  formData.append('custom_code', String(itemCompleto.custom_code || ''));
  formData.append('description', novaDescricao);
  formData.append('price', String(itemCompleto.price ?? 0));
  formData.append('cost_price', String(itemCompleto.cost_price ?? ''));
  formData.append('status', String(itemCompleto.status || 'ACTIVE'));
  formData.append('unit_type', String(itemCompleto.unit_type || 'UN'));
  formData.append('highlighted', String(itemCompleto.highlighted ?? false));
  formData.append('hide_observation_field', String(itemCompleto.hide_observation_field ?? false));
  formData.append('hide_quantity_buttons', String(itemCompleto.hide_quantity_buttons ?? false));
  formData.append('adults_only', String(itemCompleto.adults_only ?? false));
  formData.append('service_fee_waived', String(itemCompleto.service_fee_waived ?? false));
  formData.append('promotional_price_active', String(itemCompleto.promotional_price_active ?? false));
  formData.append('promotional_price', String(itemCompleto.promotional_price ?? ''));
  formData.append('available_order_timings', '[]');
  formData.append('available_order_types', '[]');
  formData.append('kind', 'regular_item');
  formData.append('auto_calculate_cost_price', 'false');

  if (itemCompleto.print_area_id) {
    formData.append('print_area_id', String(itemCompleto.print_area_id));
  }

  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      'accept': 'application/json, text/plain, */*',
      'authorization': CW_TOKEN.trim(),
      'companyid': String(COMPANY_ID),
      'origin': 'https://portal.cardapioweb.com',
      'referer': 'https://portal.cardapioweb.com/',
      'user-agent': 'Mozilla/5.0'
    },
    body: formData
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`HTTP ${res.status}: ${err}`);
  }

  return await res.json();
}

// ==========================================
// 4. PERSISTÊNCIA DE LOGS EM CSV
// ==========================================
function salvarArquivoLog(registrosLog) {
  const logsDir = path.resolve('logs');
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }

  const agora = new Date();
  const timestamp = agora.toISOString().replace(/T/, '_').replace(/:/g, '-').split('.')[0];
  const arquivoLog = path.join(logsDir, `descricoes_${timestamp}.csv`);

  const cabecalho = 'ID Item;Nome do Produto;Categoria;Custom Code;Status;Nova Descricao;Detalhes\n';

  const linhas = registrosLog.map(r => {
    const idItem = `"${r.id || '-'}"`;
    const nome = `"${(r.nome || '-').replace(/"/g, '""')}"`;
    const categoria = `"${(r.categoria || '-').replace(/"/g, '""')}"`;
    const customCode = `"${(r.customCode || '-').replace(/"/g, '""')}"`;
    const status = `"${r.status || '-'}"`;
    const novaDescricao = `"${(r.novaDescricao || '-').replace(/"/g, '""')}"`;
    const detalhes = `"${(r.detalhes || '').replace(/"/g, '""')}"`;

    return `${idItem};${nome};${categoria};${customCode};${status};${novaDescricao};${detalhes}`;
  }).join('\n');

  fs.writeFileSync(arquivoLog, '\uFEFF' + cabecalho + linhas, 'utf-8');
  console.log(`\n📁 Log da operação gravado em: ${arquivoLog}`);
}

// ==========================================
// 5. FLUXO PRINCIPAL
// ==========================================
async function executar() {
  console.log('=== PADRONIZAÇÃO DE DESCRIÇÕES COM PERSISTÊNCIA DE ESTADO ===\n');

  const produtosProcessados = carregarProdutosProcessados();
  const totalJaSalvos = Object.keys(produtosProcessados).length;
  console.log(`💾 Histórico: ${totalJaSalvos} produtos já registrados em "produtos_processados.json".\n`);

  const registrosLog = [];

  try {
    const resCat = await fetch(`${CARDAPIO_WEB_BASE}/company/categories`, {
      method: 'GET',
      headers: headersCW
    });

    if (!resCat.ok) throw new Error(`Falha ao obter categorias: HTTP ${resCat.status}`);
    const categorias = await resCat.json();
    console.log(`✅ ${categorias.length} categorias encontradas na loja.\n`);

    let atualizados = 0;
    let puladosHistorico = 0;
    let falhas = 0;

    for (const cat of categorias) {
      console.log(`📂 Processando Categoria: "${cat.name}" (ID: ${cat.id})`);

      const resItens = await fetch(`${CARDAPIO_WEB_BASE}/company/category/${cat.id}/items`, {
        method: 'GET',
        headers: headersCW
      });

      if (!resItens.ok) {
        console.log(`   ⚠️ Erro ao listar itens da categoria ${cat.id}`);
        continue;
      }

      const itens = await resItens.json();
      const listaItens = Array.isArray(itens) ? itens : (itens.data || itens.items || []);

      for (let i = 0; i < listaItens.length; i++) {
        const item = listaItens[i];
        item.category_id = cat.id;

        const idStr = String(item.id);
        const descAtual = (item.description || '').trim();
        const customCode = item.custom_code || item.pdv_code || '-';

        // 1. CHECAGEM NO ARQUIVO DE HISTÓRICO: Se já foi atualizado em execuções anteriores, pula
        if (produtosProcessados[idStr]) {
          console.log(`   ⏩ [${i + 1}/${listaItens.length}] "${item.name}" (ID: ${item.id}) já consta no arquivo histórico. Pulando.`);
          puladosHistorico++;
          continue;
        }

        process.stdout.write(`   🔍 [${i + 1}/${listaItens.length}] Gerando copy para: "${item.name}"... `);

        try {
          const novaDescricao = await gerarDescricaoPadronizada(item.name, cat.name, descAtual);

          if (!novaDescricao) {
            throw new Error('Modelo retornou texto vazio.');
          }

          await salvarDescricaoNoCW(item, novaDescricao);

          // Salva imediatamente no arquivo JSON local
          salvarProdutoProcessado(produtosProcessados, item, novaDescricao);

          console.log(`✅ Atualizado e registrado!`);
          atualizados++;

          registrosLog.push({
            id: item.id,
            nome: item.name,
            categoria: cat.name,
            customCode: customCode,
            status: 'SUCESSO',
            novaDescricao: novaDescricao,
            detalhes: 'Descrição atualizada e salva no histórico'
          });

          await sleep(1500);

        } catch (errItem) {
          console.log(`❌ Falha: ${errItem.message}`);
          falhas++;

          registrosLog.push({
            id: item.id,
            nome: item.name,
            categoria: cat.name,
            customCode: customCode,
            status: 'FALHA',
            novaDescricao: '-',
            detalhes: errItem.message
          });
        }
      }
      console.log('');
    }

    console.log('=== RELATÓRIO DA EXECUÇÃO ===');
    console.log(`Produtos com descrição atualizada nesta rodada: ${atualizados}`);
    console.log(`Produtos ignorados por estarem no arquivo histórico: ${puladosHistorico}`);
    console.log(`Falhas operacionais: ${falhas}`);

    if (registrosLog.length > 0) {
      salvarArquivoLog(registrosLog);
    }

  } catch (errCritico) {
    console.error('\n❌ Erro crítico no processo:', errCritico.message);
    if (registrosLog.length > 0) {
      salvarArquivoLog(registrosLog);
    }
  }
}

executar();