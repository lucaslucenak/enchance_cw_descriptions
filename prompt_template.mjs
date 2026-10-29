/**
 * Prompt enxuto para gastar o mínimo de tokens de entrada e saída.
 */
export function construirPromptDescricao(nomeProduto, nomeCategoria, descricaoAtual) {
  return `Crie uma descrição direta para delivery do produto abaixo.

Item: "${nomeProduto}"
Categoria: "${nomeCategoria}"
Info atual: "${descricaoAtual || 'N/A'}"

Regras:
- Sem clichês de IA (evite "descubra o poder", "no mundo de hoje", exclamações).
- Retorne EXATAMENTE nesta estrutura:
[1 parágrafo curto de 2 linhas explicando o que é e função principal]

*Destaques:* [1 frase com benefício principal]
*Uso recomendado:* [Modo de uso/consumo ou preparo]
*Especificações:* [Peso/quantidade, se é sem glúten/lactose/açúcar quando aplicável]

_Aviso Legal:_ (apenas se for suplemento com restrição de idade/gestante ou se contiver alergênicos)
* [Restrição objetiva se aplicável]

Sem introduções ou conclusões. Retorne apenas o texto final.`;
}