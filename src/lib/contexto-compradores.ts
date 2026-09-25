/** Contexto dos compradores pendente: preenchido pelo "Usar no roteiro" e consumido ao criar o próximo job. */
const CHAVE = "shopstudio:contexto_compradores";

export function guardarContextoPendente(texto: string) {
  try {
    sessionStorage.setItem(CHAVE, texto);
  } catch {
    // Sem armazenamento: o usuário ainda pode colar no job.
  }
}
export function lerContextoPendente(): string | null {
  try {
    return sessionStorage.getItem(CHAVE);
  } catch {
    return null;
  }
}
export function limparContextoPendente() {
  try {
    sessionStorage.removeItem(CHAVE);
  } catch {
    // ignora
  }
}
