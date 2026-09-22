/**
 * Extração do texto de arquivos enviados pelo cliente (TXT, RTF, PDF, DOC, DOCX).
 * Tudo acontece no navegador; as bibliotecas pesadas carregam sob demanda.
 */

export const ACCEPTED_DOC_TYPES = ".txt,.rtf,.pdf,.doc,.docx,text/plain,application/pdf";

const decodeTexto = async (file: File) => (await file.text()).replace(/\u0000/g, "");

/** RTF: remove grupos de controle e mantém só o texto legível. */
function rtfParaTexto(rtf: string) {
  return rtf
    .replace(/\\'([0-9a-fA-F]{2})/g, (_m, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\par[d]?/g, "\n")
    .replace(/\{\\\*[^{}]*\}/g, "")
    .replace(/\\[a-zA-Z]+-?\d*\s?/g, "")
    .replace(/[{}]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** DOC antigo (binário): leitura aproximada, mantendo apenas trechos legíveis. */
async function docBinarioParaTexto(file: File) {
  const buffer = new Uint8Array(await file.arrayBuffer());
  let texto = "";
  let atual = "";
  for (const byte of buffer) {
    const ok = byte === 10 || byte === 13 || byte === 9 || (byte >= 32 && byte <= 126) || byte >= 160;
    if (ok) atual += String.fromCharCode(byte);
    else {
      if (atual.trim().length >= 4) texto += `${atual.trim()} `;
      atual = "";
    }
  }
  if (atual.trim().length >= 4) texto += atual.trim();
  return texto.replace(/\s{2,}/g, " ").trim();
}

async function pdfParaTexto(file: File) {
  const pdfjs = await import("pdfjs-dist");
  const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const paginas: string[] = [];
  for (let i = 1; i <= doc.numPages; i += 1) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const linha = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ")
      .replace(/\s{2,}/g, " ")
      .trim();
    if (linha) paginas.push(linha);
  }
  return paginas.join("\n\n");
}

async function docxParaTexto(file: File) {
  const mammoth = await import("mammoth");
  const { value } = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
  return value.replace(/\n{3,}/g, "\n\n").trim();
}

/** Devolve o texto do arquivo ou lança um erro em linguagem simples. */
export async function extrairTextoDoArquivo(file: File): Promise<string> {
  const nome = file.name.toLowerCase();
  const extensao = nome.slice(nome.lastIndexOf(".") + 1);

  let texto = "";
  try {
    if (extensao === "txt" || file.type.startsWith("text/plain")) texto = await decodeTexto(file);
    else if (extensao === "rtf") texto = rtfParaTexto(await decodeTexto(file));
    else if (extensao === "pdf") texto = await pdfParaTexto(file);
    else if (extensao === "docx") texto = await docxParaTexto(file);
    else if (extensao === "doc") texto = await docBinarioParaTexto(file);
    else throw new Error("formato");
  } catch {
    throw new Error(
      "Não conseguimos ler este arquivo. Tente enviar em TXT, PDF ou DOCX, ou cole o texto do roteiro no campo acima.",
    );
  }

  const limpo = texto.replace(/\u0000/g, "").trim();
  if (limpo.length < 20) {
    throw new Error("Esse arquivo parece não ter texto legível. Cole o roteiro no campo acima para continuar.");
  }
  return limpo;
}
