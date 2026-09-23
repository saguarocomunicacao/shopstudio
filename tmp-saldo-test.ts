import { assertSaldo, debitAction, getSaldos, needsVideoCompleto } from "@/lib/saldo.server";

const TENANT = "22222222-2222-4222-8222-222222222222";
const SAGUARO = "f7192d96-160f-4157-8599-eced5990bf8b";

const linha = (t: string, v: unknown) => console.log(`- ${t}:`, v);

async function main() {
  linha("saldo inicial", await getSaldos(TENANT));

  // 1) Bloqueio de vídeo completo que precisa de 3 cenas com saldo de 2.
  try {
    await assertSaldo(TENANT, needsVideoCompleto({ cenas: 3, comRoteiro: true }));
    linha("video 3 cenas", "NAO BLOQUEOU (erro)");
  } catch (e) {
    linha("video 3 cenas bloqueado", (e as Error).message);
  }

  // 2) Débito atômico: 5 chamadas simultâneas com saldo 2.
  const results = await Promise.all([1, 2, 3, 4, 5].map(() => debitAction(TENANT, "cena")));
  linha("movimentos concedidos", results.filter(Boolean).length);
  linha("saldo apos paralelo", await getSaldos(TENANT));

  // 3) Próxima cena deve bloquear.
  try {
    await assertSaldo(TENANT, { cena: 1 });
    linha("3a cena", "NAO BLOQUEOU (erro)");
  } catch (e) {
    linha("3a cena bloqueada", (e as Error).message);
  }

  // 4) Plano com preço zero = ilimitado.
  await assertSaldo(SAGUARO, needsVideoCompleto({ cenas: 50, comRoteiro: true, comNarracao: true }));
  linha("plano preco zero", "liberado sem travar");
  linha("debito em plano gratuito (deve ser null)", await debitAction(SAGUARO, "cena"));
}

main().then(() => process.exit(0));
