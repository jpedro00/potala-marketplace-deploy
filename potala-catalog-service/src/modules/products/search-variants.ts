/**
 * Helper pequeno e DETERMINÍSTICO para a busca pública do catálogo (bug de
 * produção, 05/10: buscar "cristal" não encontrava o produto/categoria
 * "Cristais"). Isto NÃO é um stemmer e NÃO é uma regra morfológica
 * genérica de plural em português (ex.: -al/-ais) -- de propósito: a
 * apresentação é iminente e queremos risco mínimo, então cobrimos apenas o
 * par comprovado em produção via uma lista explícita, nunca uma regra que
 * se aplicaria a qualquer palavra terminada em "-al"/"-ais" do catálogo
 * (o que poderia introduzir falsos positivos não previstos).
 *
 * Qualquer termo fora da lista passa intacto (apenas normalizado/trimado),
 * sem gerar nenhuma variante artificial -- por exemplo "livro" nunca gera
 * "livros" aqui.
 *
 * Se no futuro surgirem outros pares confirmados (outro singular/plural
 * que algum cliente comprovadamente busca e não encontra), adicionar aqui
 * de forma explícita, par a par. Generalizar para uma regra morfológica
 * ampla é uma decisão de produto separada, fora do escopo deste hotfix.
 */
const KNOWN_SEARCH_VARIANTS: Readonly<Record<string, readonly string[]>> = {
  cristal: ['cristal', 'cristais'],
  cristais: ['cristais', 'cristal'],
};

/**
 * Recebe o termo de busca já validado pelo DTO (string, <= MAX_PRODUCT_TITLE_LENGTH)
 * e retorna a lista de termos a pesquisar via OR. Para um termo sem par
 * conhecido, retorna só ele mesmo (normalizado/trimado) -- ou seja, o
 * comportamento de busca por substring continua idêntico ao atual para
 * todo o resto do catálogo.
 */
export function buildSearchVariants(rawTerm: string): string[] {
  const term = rawTerm.trim().toLowerCase();
  if (term.length === 0) {
    return [];
  }

  const known = KNOWN_SEARCH_VARIANTS[term];
  return known ? [...known] : [term];
}
