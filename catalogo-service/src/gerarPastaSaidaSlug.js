/**
 * Gera o slug de pasta de saida usado pelo importador para paginas e ambientes.
 * Mesma regra de: nomeCatalogo.toLowerCase().replace(/[^a-z0-9]/g, '_')
 *
 * @param {string} nomeCatalogo - Nome do catalogo sem extensao .pdf
 * @returns {string}
 */
export function gerarPastaSaidaSlug(nomeCatalogo = '') {
  return String(nomeCatalogo).toLowerCase().replace(/[^a-z0-9]/g, '_');
}
