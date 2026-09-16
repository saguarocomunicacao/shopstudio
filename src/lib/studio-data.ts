export type Profile = {
  id: string;
  name: string;
  niche: string;
  initials: string;
  followers: number;
  status: "Ativo" | "Pausado";
};

export type JobStatus =
  | "Novo"
  | "Produto escolhido"
  | "Roteiro pronto"
  | "Gerando vídeo"
  | "Vídeo pronto"
  | "Rascunho enviado"
  | "Publicado";

export const profiles: Profile[] = [
  { id: "moda", name: "Moda e Acessórios", niche: "Looks & tendências", initials: "MA", followers: 128400, status: "Ativo" },
  { id: "beleza", name: "Beleza", niche: "Skincare & make", initials: "BZ", followers: 94200, status: "Ativo" },
  { id: "casa", name: "Casa e Decoração", niche: "Casa prática", initials: "CD", followers: 76300, status: "Ativo" },
  { id: "eletronicos", name: "Eletrônicos", niche: "Tecnologia acessível", initials: "EL", followers: 63800, status: "Pausado" },
  { id: "hobby", name: "Hobby/Gadgets", niche: "Achados criativos", initials: "HG", followers: 51700, status: "Ativo" },
];

export const jobs = [
  { id: 1, profileId: "moda", title: "Bolsa mini transversal", product: "Bolsa Vitta", status: "Gerando vídeo" as JobStatus, time: "há 8 min" },
  { id: 2, profileId: "beleza", title: "Sérum de vitamina C", product: "Glow C10", status: "Rascunho enviado" as JobStatus, time: "há 26 min" },
  { id: 3, profileId: "casa", title: "Organizador modular", product: "Kit Organiza+", status: "Roteiro pronto" as JobStatus, time: "há 1 h" },
  { id: 4, profileId: "hobby", title: "Mini impressora térmica", product: "Print Pocket", status: "Publicado" as JobStatus, time: "há 2 h" },
  { id: 5, profileId: "moda", title: "Tênis casual nuvem", product: "Cloud Step", status: "Produto escolhido" as JobStatus, time: "há 3 h" },
  { id: 6, profileId: "eletronicos", title: "Microfone sem fio", product: "Mic Go Duo", status: "Novo" as JobStatus, time: "há 4 h" },
  { id: 7, profileId: "beleza", title: "Escova secadora", product: "Air Brush Pro", status: "Vídeo pronto" as JobStatus, time: "ontem" },
];

export const products = [
  { id: 1, profileId: "moda", name: "Bolsa Vitta", niche: "Moda", price: 89.9, commission: 18, hype: 96 },
  { id: 2, profileId: "beleza", name: "Glow C10", niche: "Beleza", price: 64.9, commission: 22, hype: 93 },
  { id: 3, profileId: "casa", name: "Kit Organiza+", niche: "Casa", price: 119.9, commission: 16, hype: 91 },
  { id: 4, profileId: "hobby", name: "Print Pocket", niche: "Gadgets", price: 149.9, commission: 20, hype: 89 },
  { id: 5, profileId: "eletronicos", name: "Mic Go Duo", niche: "Eletrônicos", price: 179.9, commission: 14, hype: 86 },
  { id: 6, profileId: "moda", name: "Cloud Step", niche: "Calçados", price: 139.9, commission: 17, hype: 84 },
];

export const videos = [
  { id: 1, profileId: "moda", title: "3 formas de usar a bolsa Vitta", date: "16 set", status: "Publicado", product: "Bolsa Vitta", tone: "cyan" },
  { id: 2, profileId: "beleza", title: "Pele iluminada em 15 segundos", date: "16 set", status: "Em revisão", product: "Glow C10", tone: "pink" },
  { id: 3, profileId: "casa", title: "A gaveta que se organiza sozinha", date: "15 set", status: "Publicado", product: "Kit Organiza+", tone: "lime" },
  { id: 4, profileId: "hobby", title: "Imprima qualquer ideia no bolso", date: "15 set", status: "Publicado", product: "Print Pocket", tone: "violet" },
  { id: 5, profileId: "eletronicos", title: "Áudio profissional sem complicação", date: "14 set", status: "Rascunho", product: "Mic Go Duo", tone: "blue" },
  { id: 6, profileId: "moda", title: "O tênis que combina com tudo", date: "14 set", status: "Em revisão", product: "Cloud Step", tone: "orange" },
];

export const users = [
  { name: "Lauffer", initials: "LA", role: "Admin", access: profiles.map((profile) => profile.id) },
  { name: "Marina Costa", initials: "MC", role: "Criador", access: ["moda", "beleza"] },
  { name: "Rafael Lima", initials: "RL", role: "Editor", access: ["casa", "eletronicos"] },
  { name: "Bia Santos", initials: "BS", role: "Criador", access: ["hobby", "moda"] },
];

export const stages: JobStatus[] = ["Novo", "Produto escolhido", "Roteiro pronto", "Gerando vídeo", "Vídeo pronto", "Rascunho enviado", "Publicado"];

export const formatFollowers = (value: number) => `${(value / 1000).toFixed(value >= 100000 ? 0 : 1).replace(".", ",")} mil`;