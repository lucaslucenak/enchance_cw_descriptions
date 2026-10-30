# Documentação Técnica e de Arquitetura

> **Projeto:** `cardapio-web-enricher` (`melhorador_de_descricoes_cw`)  
> **Versão:** 1.0.0  
> **Ambiente de Execução:** Node.js (v18+ com suporte a ECMAScript Modules nativos)  
> **Público-alvo:** Desenvolvedores, Engenheiros de Software e Mantenedores do Sistema

---

## 1. Visão Geral e Arquitetura da Solução

### 1.1. Propósito do Sistema
O **`cardapio-web-enricher`** é um pipeline automatizado desenvolvido para resolver a inconsistência, falta de detalhes e ausência de padronização nas descrições de produtos cadastrados no ecossistema do **Cardápio Web**.

A ferramenta opera em lote através de integração direta com as APIs corporativas do Cardápio Web, consumindo a lista de produtos de cada categoria, enviando os metadados cadastrais a um modelo de Inteligência Artificial Generativa (**Google Gemini**) e atualizando o cardápio com descrições persuasivas, estruturadas para delivery e desprovidas de clichês ou "tells" comuns de IA.

### 1.2. Ciclo de Vida da Execução e Fluxograma Conceitual

O fluxo operacional é projetado para ser resiliente a falhas e idempotente, operando sequencialmente conforme o diagrama abaixo:

```text
+-----------------------------------------------------------------------------------+
|                            INICIALIZAÇÃO DO SISTEMA                              |
| 1. Validação de credenciais (.env: GEMINI_API_KEY, CARDAPIO_WEB_TOKEN/COMPANY_ID) |
| 2. Leitura do histórico local: produtos_processados.json                          |
+-----------------------------------------------------------------------------------+
                                          |
                                          v
+-----------------------------------------------------------------------------------+
|                     EXTRAÇÃO DE DADOS (CARDÁPIO WEB API)                          |
| GET /company/categories -> Lista todas as categorias cadastradas na loja          |
+-----------------------------------------------------------------------------------+
                                          |
                                          v
                           +------------------------------+
                      +--->| Para cada Categoria da Loja  |<------------------+
                      |    +------------------------------+                   |
                      |                   |                                   |
                      |                   v                                   |
                      |    +-----------------------------------------------+  |
                      |    | GET /company/category/{category_id}/items     |  |
                      |    | Obtém lista completa de itens com metadados   |  |
                      |    +-----------------------------------------------+  |
                      |                   |                                   |
                      |                   v                                   |
                      |    +------------------------------+                   |
                      |    |     Para cada Item da Lista  |                   |
                      |    +------------------------------+                   |
                      |                   |                                   |
                      |                   v                                   |
                      |    +------------------------------+                   |
                      |    | Item já existe no histórico  |                   |
                      |    |  produtos_processados.json?  |                   |
                      |    +------------------------------+                   |
                      |            /              \                           |
                      |      SIM  /                \  NÃO                     |
                      |          v                  v                         |
                      |   +------------+    +-------------------------------+ |
                      |   | Pula Item  |    | INFERÊNCIA COM IA (GEMINI)    | |
                      |   | (0 tokens) |    | Modelo econômico (Flash Lite) | |
                      |   +------------+    | temp: 0.2, maxTokens: 250     | |
                      |          |          +-------------------------------+ |
                      |          |                          |                 |
                      |          |                          v                 |
                      |          |          +-------------------------------+ |
                      |          |          | ATUALIZAÇÃO NO CARDÁPIO WEB   | |
                      |          |          | PUT multipart/form-data       | |
                      |          |          | Preserva campos cadastrais    | |
                      |          |          +-------------------------------+ |
                      |          |                          |                 |
                      |          |                          v                 |
                      |          |          +-------------------------------+ |
                      |          |          | PERSISTÊNCIA ATÔMICA          | |
                      |          |          | Grava em produtos_processados | |
                      |          |          | Loga em memória / sleep(1500) | |
                      |          |          +-------------------------------+ |
                      |          |                          |                 |
                      |          +--------------------------+                 |
                      |                     |                                 |
                      |      Próximo item   v                                 |
                      |      na categoria? (se sim, itera; se não, segue) ----+
                      |
        Próxima       |
      categoria? -----+
          |
         NÃO
          v
+-----------------------------------------------------------------------------------+
|                        SISTEMA DE AUDITORIA E LOGS                                |
| Gera arquivo CSV com prefixo UTF-8 BOM em: logs/descricoes_YYYY-MM-DD_HH-mm-ss.csv|
| Exibe relatório consolidado no terminal (atualizados, pulados, falhas)            |
+-----------------------------------------------------------------------------------+
```

---

## 2. Engenharia de Prompt e Regras de Copywriting (`prompt_template.mjs`)

### 2.1. Papel e Responsabilidade do Módulo Isolado
O arquivo [`prompt_template.mjs`](file:///e:/melhorador_de_descrições_cw/prompt_template.mjs) centraliza toda a lógica de engenharia de prompt da solução. Sua separação do script de orquestração garante:
- **Testabilidade e Manutenibilidade:** Ajustes no tom de voz, no layout dos textos ou na gramática não afetam o código de integração de rede ou persistência.
- **Minimização de Tokens:** O template foi redigido de forma enxuta e declarativa para gastar o mínimo possível de tokens de contexto na entrada (*input tokens*).

### 2.2. Padrão Estrutural Imposto ao Modelo
O modelo deve retornar **rigorosamente** a estrutura delimitada abaixo, sem introduções explicativas ("Aqui está a descrição...") nem considerações finais:

```text
[1 parágrafo curto de 2 linhas explicando o que é e função principal]

*Destaques:* [1 frase com benefício principal]
*Uso recomendado:* [Modo de uso/consumo ou preparo]
*Especificações:* [Peso/quantidade, se é sem glúten/lactose/açúcar quando aplicável]

_Aviso Legal:_ (apenas se for suplemento com restrição de idade/gestante ou se contiver alergênicos)
* [Restrição objetiva se aplicável]
```

#### Sintaxe de Formatação Suportada
O Cardápio Web renderiza estilização leve baseada em Markdown:
- `*texto*`: Renderiza como **negrito** (utilizado nos rótulos de seção e tópicos).
- `_texto_`: Renderiza como *itálico* (utilizado no cabeçalho de aviso legal e advertências).

### 2.3. Diretrizes de Copywriting e Eliminação de Clichês de IA
O prompt impõe diretrizes estritas para suprimir os vícios típicos de modelos de linguagem:
1. **Supressão de Frases Feitas:** Proibição explícita de bordões como *"descubra o poder"*, *"no mundo moderno de hoje"*, *"perfeito para você"*, *"transforme sua rotina"*.
2. **Tom Direto e Funcional:** A copy deve focar em atributos concretos do produto (ingredientes, peso, método de preparo ou ingestão).
3. **Restrição de Pontuação Sensacionalista:** Proibição de excesso de exclamações (`!`), conferindo credibilidade e sofisticação profissional ao catálogo.

---

## 3. Integração com a API do Google Gemini

### 3.1. Mecanismo de Seleção e Fallback de Modelos
A integração utiliza o pacote oficial `@google/generative-ai` ([`gerador_descricoes.mjs`](file:///e:/melhorador_de_descrições_cw/gerador_descricoes.mjs#L72-L98)). Para garantir resiliência contra indisponibilidade de modelos em chaves específicas ou atualizações de versão, implementa-se um array de modelos ordenado por custo e prioridade:

```javascript
const modelosEconomicos = [
  'gemini-flash-lite-latest',
  'gemini-2.5-flash-lite',
  'gemini-2.5-flash'
];
```

- A função itera sobre a lista em cascata.
- Caso receba um erro `404` ou `not found` (indicando que a versão específica não está habilitada para a conta ou foi descontinuada), ela captura a exceção e tenta imediatamente o próximo modelo do array.
- Apenas erros não recuperáveis (como credencial inválida ou cota esgotada) interrompem a iteração imediatamente.

### 3.2. Hiperparâmetros de Inferência e Otimização Orçamentária
No método `getGenerativeModel`, as opções de inferência são configuradas de modo a limitar a verbosidade e assegurar determinismo:

```javascript
generationConfig: {
  temperature: 0.2,
  maxOutputTokens: 250
}
```

- **`temperature: 0.2`:** Reduz a entropia e variabilidade das respostas, forçando o modelo a seguir rigidamente a estrutura solicitada e as informações reais do produto.
- **`maxOutputTokens: 250`:** Trava a geração na extensão exata necessária para um cartão de delivery, prevenindo alucinações longas e reduzindo os custos de faturamento e consumo de quota por requisição.

### 3.3. Gestão de Cotas (Free Tier) e Estratégia de Delay
O nível gratuito da API do Google Gemini impõe limites por minuto e dia:
- **Limite por Minuto (RPM):** 15 requisições/minuto.
- **Limite Diário (RPD):** 1.500 requisições/dia.

Para manter a taxa dentro do teto seguro de 15 RPM sem estourar `HTTP 429 Too Many Requests`:
- Cada ciclo de processamento de item bem-sucedido executa `await sleep(1500)`.
- Somando o tempo de ida e volta da rede do Gemini (~1,5 a 2,5s) + o delay de 1,5s + o tempo de envio ao Cardápio Web (~0,5s), o ciclo total por item é de ~3,5 a 4,5 segundos, resultando em uma taxa média de 13 a 17 requisições/minuto, operando no ponto ideal de produtividade sem sobrecarregar a API.

---

## 4. Comunicação com o Backend do Cardápio Web

### 4.1. Formato de Autenticação e Cabeçalhos Obrigatórios
A comunicação com o endpoint corporativo `https://api.cardapioweb.com/api/v1` exige um conjunto rigoroso de cabeçalhos HTTP que emulam a sessão administrativa autenticada via navegador:

| Cabeçalho | Descrição / Valor |
| :--- | :--- |
| `authorization` | Token JWT corporativo de sessão gerado no portal administrativo |
| `companyid` | ID numérico da empresa/loja (ex: `61766`), configurável via `.env` |
| `origin` | `https://portal.cardapioweb.com` (validação de CORS do servidor) |
| `referer` | `https://portal.cardapioweb.com/` |
| `user-agent` | Identificação de browser cliente (evita bloqueios de WAF/Cloudflare) |
| `accept` | `application/json, text/plain, */*` |

### 4.2. Rota e Protocolo de Atualização
A atualização do cadastro de itens não aceita JSON padrão; ela exige uma requisição com corpo codificado como `multipart/form-data`:

- **Método HTTP:** `PUT`
- **URI:** `https://api.cardapioweb.com/api/v1/company/category/{category_id}/items/{item_id}`
- **Payload:** Instância nativa de `FormData` populada com os pares chave/valor convertidos para string.

### 4.3. Preservação de Campos Nativos e Integridade Cadastral
O endpoint `PUT` do Cardápio Web sobrescreve o registro integralmente. Para impedir que campos sensíveis do item (como preços, disponibilidade ou configurações de impressão) sejam apagados, o script desempacota o payload original obtido no `GET` e repassa todos os campos obrigatórios:

```javascript
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
```

---

## 5. Mecanismo de Persistência e Idempotência (`produtos_processados.json`)

### 5.1. Estrutura de Dados do Cache Local
A persistência do progresso é gerenciada por um arquivo JSON indexado pela chave única primária do item (convertida em string):

```json
{
  "1623813": {
    "id": 1623813,
    "name": "Barra de Choc. Dark 70% Cacau - Vitao (70g)",
    "category_id": 191993,
    "custom_code": null,
    "atualizado_em": "2026-10-30T15:56:05.359Z"
  }
}
```

### 5.2. Prevenção de Reprocessamento e Desperdício
Antes de disparar qualquer requisição para a IA ou para o Cardápio Web, o script realiza um lookup em `O(1)` na tabela de hash em memória:

```javascript
if (produtosProcessados[idStr]) {
  console.log(`   ⏩ [${i + 1}/${listaItens.length}] "${item.name}" (ID: ${item.id}) já consta no arquivo histórico. Pulando.`);
  puladosHistorico++;
  continue;
}
```

Isso garante **idempotência estrita**: se o script for interrompido e reiniciado dezenas de vezes, ele retomará exatamente a partir do primeiro item não enriquecido, sem gastar tokens com produtos já processados.

### 5.3. Persistência Imediata e Atômica por Item
Ao contrário de pipelines que mantêm os dados em memória e só gravam no final da rotina, a função `salvarProdutoProcessado()` executa um `fs.writeFileSync()` síncrono imediatamente após o sucesso de cada item. Caso ocorra queda de energia, encerramento forçado do processo (`Ctrl+C`) ou erro de rede fatal, nenhum progresso já concluído é perdido.

---

## 6. Sistema de Auditoria e Logs (`logs/`)

### 6.1. Criação de Diretório e Nomenclatura Timestamped
Ao término do lote (ou em caso de erro crítico no laço principal), o sistema aciona a função `salvarArquivoLog()`.
- Verifica e cria a pasta `logs/` via `fs.mkdirSync(logsDir, { recursive: true })`.
- Gera um nome de arquivo exclusivo baseado no instante da execução:  
  `descricoes_YYYY-MM-DD_HH-mm-ss.csv` (ex: `descricoes_2026-10-30_16-04-09.csv`).

### 6.2. Estrutura de Colunas e Tratamento de Caracteres Especiais
As colunas do arquivo CSV são padronizadas da seguinte forma:

```csv
ID Item;Nome do Produto;Categoria;Custom Code;Status;Nova Descricao;Detalhes
```

Todas as colunas textuais são encapsuladas entre aspas duplas, e as aspas internas existentes nos textos gerados são escapadas duplicando-as (`replace(/"/g, '""')`), garantindo que quebras de linha ou caracteres delimitadores não corrompam as linhas do relatório.

### 6.3. Compatibilidade com Microsoft Excel (UTF-8 BOM)
No ecossistema Windows, o Microsoft Excel frequentemente corrompe caracteres acentuados (como `ç`, `ã`, `é`) em arquivos CSV caso estejam em UTF-8 puro sem identificador de codificação.

Para contornar esse problema nativamente, o arquivo é gravado com o prefixo **UTF-8 Byte Order Mark (`\uFEFF`)**:

```javascript
fs.writeFileSync(arquivoLog, '\uFEFF' + cabecalho + linhas, 'utf-8');
```

Além disso, utiliza-se o ponto e vírgula (`;`) como separador de campos, que é o padrão regional para separação de planilhas no Brasil e na América Latina.

